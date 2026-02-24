from flask import Flask, render_template, request, jsonify
import serial_comm
import db
import threading
import subprocess
import time
import shutil
import os

KIOSK_PROFILE = "/tmp/kiosk_profile"

app = Flask(__name__, template_folder="../frontend", static_folder="../frontend", static_url_path="")

# Hardware Command Map
COMMANDS = {
    "home": 0x01, "pickup": 0x02, "dropoff": 0x03, "goto": 0x04,
    "servo": 0x05, "offset": 0x06, "cancel": 0x07, "remove" : 0x08, 
    "entrance": 0x09, "dispense": 0x0A, "return": 0x0B
}

'''
Loads html page at the base IP address.
'''
@app.route("/")
def home():
    return render_template("index.html")

'''
Routes serial move commands.
'''
@app.route("/api/srl_cmd")
def send_cmd():
    action = request.args.get('action')
    x = request.args.get('x', '1')
    y = request.args.get('y', '1')
    x_offset = request.args.get('x_offset', '1')
    
    if action in COMMANDS:
        serial_comm.send_byte(COMMANDS[action])
        if action in ["pickup", "dropoff", "goto", "remove"]:
            if 0 < int(x) < 6 and 0 < int(y) < 12:
                serial_comm.send_byte(int(x))
                serial_comm.send_byte(int(y))
            else:
                return jsonify(status="Invalid slot coordinates"), 400
        elif action == "offset":
            try:
                offset_val = float(x_offset)*10
                if 0 < offset_val < 50: 
                    serial_comm.send_byte(int(offset_val))
                else:
                    return jsonify(status="Offset out of bounds"), 400
            except ValueError:
                return jsonify(status="Invalid offset value"), 400
        return jsonify(status=f"Executed {action}")
    return jsonify(status="Invalid Command"), 400


'''
Adds a new cassette to the database.
Checks if it's from the grid, then assigns it to database with the target slot.
It doesn't seem to assign a slot if I add it from list.
'''
@app.route("/api/add", methods=["POST"])
def add_tape():
    data = request.get_json()
    name = data.get("name")
    artist = data.get("artist")
    tags = data.get("tags")
    if not tags:
        tags = db.generate_tags(name, artist)
    
    target_slot = None
    if data.get("slotX") and data.get("slotY"):
        try:
            target_slot = (int(data.get("slotX")), int(data.get("slotY")))
        except ValueError:
            pass 

    # --- THE FIX ---
    # If no slot was chosen (List Mode), find the closest one automatically
    if target_slot is None:
        target_slot = db.find_closest_empty_slot()
    # ----------------

    if not target_slot:
        return jsonify(status="Machine Full"), 400

    if not name:
        return jsonify(status="Name required"), 400


    # Now we pass the found slot into the add_cassette function
    slot = db.add_cassette(name, artist, target_slot, tags)
    
    
    if slot:
        print(f"Added cassette '{name}' by '{artist}' at slot {slot} with tags {tags}")
    else:
        return jsonify(status="Slot Occupied or Machine Full"), 400

    # Fetch the newly inserted cassette to return to UI
    # We use a fresh connection here, which is fine now that db.py handles timeouts
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM cassettes WHERE name = ? AND slot_x = ? AND slot_y = ?",
        (name, slot[0], slot[1])
    )
    new_tape = c.fetchone()
    conn.close()

    if new_tape:
        return jsonify(dict(new_tape))
    else:
        return jsonify(status="Error retrieving cassette"), 500

'''
Returns JSON of all cassettes in database.
'''
@app.route("/api/tapes")
def get_tapes():
    return jsonify(db.get_all_cassettes())

'''
Sends move commands to hardware.
'''
@app.route("/api/dispense")
def dispense():
    tape_id = request.args.get('id')
    tape = db.get_tape_by_id(tape_id)
    if not tape:
        return jsonify(status="Tape not found"), 404

    # 1️⃣ Mark in DB immediately
    db.mark_dispensed(tape_id)

    serial_comm.send_byte(COMMANDS["dispense"])
    serial_comm.send_byte(tape['slot_x'])
    serial_comm.send_byte(tape['slot_y'])

    if not serial_comm.wait_for_arduino():
        return jsonify(status="Hardware timeout"), 500

    # ✅ All done
    return jsonify(status="done")

return_status = {}  # { tape_id: "waiting" | "in_progress" | "done" }

'''
When a tape is returned, it changes it to present in database.
Option to send serial commands here since the tape is returned.
'''
@app.route("/api/return")
def return_tape():
    tape_id = request.args.get('id')
    tape = db.get_tape_by_id(tape_id)
    if not tape:
        return jsonify(status="Tape not found"), 404
    
    return_status[tape_id] = "waiting_for_insert"

    # Optional: Send hardware commands for dropoff
    serial_comm.send_byte(COMMANDS["return"])
    serial_comm.send_byte(tape['slot_x'])
    serial_comm.send_byte(tape['slot_y'])
    #TODO UI should prompt for cassette to be inserted
    #once it's detected in the entrance, arduino returns screen can change to returning tape

    #wait once for cassette to be detected in the entrance
    if not serial_comm.wait_for_arduino():
        #this means cassette was never detected in entrance
        return_status[tape_id] = "timeout"
        return jsonify(status="Hardware timeout"), 500
    
    return_status[tape_id] = "returning"
    #how do i change the UI from please insert tape to returning tape? 
    if not serial_comm.wait_for_arduino():
        return_status[tape_id] = "timeout"
        #this means for some reason arduino never said it was done placing cassette on shelf
        return jsonify(status="Hardware timeout"), 500
    
    # Update DB: tape is back in machine
    db.update_status(tape_id, 1)
    return_status[tape_id] = "done"

    return jsonify(status="done")

'''
Endpoint for UI to poll the return status of a tape.'''
@app.route("/api/return_status")
def return_status_endpoint():
    tape_id = request.args.get("id")
    status = return_status.get(tape_id, "unknown")
    return jsonify(status=status)

'''
Removes cassette from the database.
'''
@app.route("/api/remove", methods=["DELETE"])
def remove_cassette():
    tape_id = request.args.get('id')
    db.delete_cassette(tape_id)
    return jsonify(status="Removed")

'''
Remove all cassettes from the database.
'''
@app.route("/api/remove_all", methods=["DELETE"])
def remove_all_cassettes():
    try:
        db.delete_all_cassettes()
        return jsonify(status="All cassettes removed")
    except Exception as e:
        return jsonify(status=f"Error: {str(e)}"), 500
    
'''
Returns the genre tags in the machine.
'''
@app.route("/api/tags")
def get_tags():
    tags = db.get_all_tags()
    return jsonify(tags)




if __name__ == "__main__":
    db.init_db()
    # threaded=True helps prevent request blocking
    def start_kiosk():
        # Remove old profile to force a fresh session
        if os.path.exists(KIOSK_PROFILE):
            shutil.rmtree(KIOSK_PROFILE)

        time.sleep(1)  # wait for server to start

        subprocess.Popen([
            "chromium",
            "--kiosk",
            "--incognito",
            "--noerrdialogs",
            "--disable-session-crashed-bubble",
            "--disable-infobars",
            "--disable-gpu",
            "--disable-software-rasterizer",
            f"--user-data-dir={KIOSK_PROFILE}",
            "http://127.0.0.1:5000"
        ])


    # Start Chromium in a separate thread
    threading.Thread(target=start_kiosk).start()
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)

