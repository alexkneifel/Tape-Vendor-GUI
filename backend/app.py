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

return_status = {}
dispense_status = {}  # { tape_id: "in_progress" | "done" | "timeout" }

# Hardware Command Map
COMMANDS = {
    "home": 0x01, "pickup": 0x02, "dropoff": 0x03, "goto": 0x04,
    "servo": 0x05, "offset": 0x06, "cancel": 0x07, "remove" : 0x08, 
    "entrance": 0x09, "dispense": 0x0A, "return": 0x0B, "switch": 0x0C
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
        # If position is valid is handled at Arduino side, so we just send whatever we get from the UI here.
        if action in ["pickup", "dropoff", "goto", "remove"]:
            serial_comm.send_byte(int(x))
            serial_comm.send_byte(int(y))
        elif action == "offset":
            try:
                offset_val = float(x_offset)*10
                serial_comm.send_byte(int(offset_val))
            except ValueError:
                return jsonify(status="Invalid offset value"), 400
        return jsonify(status=f"Executed {action}")
    return jsonify(status="Invalid Command"), 400


'''
Adds a new cassette to the database.
Checks if it's from the grid, then assigns it to database with the target slot.
It doesn't seem to assign a slot if I add it from list.
TODO: add should be doing the same thing as return, where it waits for the cassette to be physically inserted, then finds the closest slot and assigns it there.
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
    slot, tape_id = db.add_cassette(name, artist, target_slot, tags)

    tape_id_str = str(tape_id)
    
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

    return_status[tape_id_str] = "homing"

    serial_comm.send_byte(COMMANDS["return"])
    serial_comm.send_byte(slot[0])  # the actual X of the assigned slot
    serial_comm.send_byte(slot[1])  # the actual Y

    threading.Thread(target=handle_return, args=(tape_id, "add"), daemon=True).start()

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
    
    tape_id_str = str(tape_id)

    dispense_status[tape_id_str] = "in_progress"

    # Send command immediately
    serial_comm.send_byte(COMMANDS["dispense"])
    serial_comm.send_byte(tape['slot_x'])
    serial_comm.send_byte(tape['slot_y'])

    # Start background listener
    threading.Thread(target=handle_dispense, args=(tape_id,), daemon=True).start()

    return jsonify(status="started")


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

    tape_id_str = str(tape_id)
    
    return_status[tape_id_str] = "homing"

    serial_comm.send_byte(COMMANDS["return"])
    serial_comm.send_byte(tape['slot_x'])
    serial_comm.send_byte(tape['slot_y'])

    threading.Thread(target=handle_return, args=(tape_id, "return"), daemon=True).start()

    return jsonify(status="started")

def handle_return(tape_id, type):

    tape_id_str = str(tape_id)

    return_status[tape_id_str] = "homing"

    if not serial_comm.wait_for_arduino():
        return_status[tape_id_str] = "timeout"
        if type == "add":
            db.delete_cassette(tape_id)  # Remove the cassette entry if it was an add operation that failed
        return

    return_status[tape_id_str] = "waiting_for_insert"

    if not serial_comm.wait_for_arduino():
        return_status[tape_id_str] = "timeout"
        if type == "add":
            db.delete_cassette(tape_id)  
        return

    return_status[tape_id_str] = "returning"

    if not serial_comm.wait_for_arduino():
        return_status[tape_id_str] = "timeout"
        if type == "add":
            db.delete_cassette(tape_id)  
        return

    db.update_status(tape_id, 1)
    return_status[tape_id_str] = "done"


'''
Endpoint for UI to poll the return status of a tape.'''
@app.route("/api/return_status")
def return_status_endpoint():
    tape_id = request.args.get("id")
    tape_id_str = str(tape_id)
    status = return_status.get(tape_id_str, "unknown")
    return jsonify(status=status)

def handle_dispense(tape_id):
    tape_id_str = str(tape_id)

    dispense_status[tape_id_str] = "in_progress"

    if not serial_comm.wait_for_arduino():
        dispense_status[tape_id_str] = "timeout"
        return

    dispense_status[tape_id_str] = "ejecting"

    if not serial_comm.wait_for_arduino():
        dispense_status[tape_id_str] = "timeout"
        return

    db.update_status(tape_id, 0)
    dispense_status[tape_id_str] = "done"

@app.route("/api/dispense_status")
def dispense_status_endpoint():
    tape_id = request.args.get("id")
    tape_id_str = str(tape_id)
    status = dispense_status.get(tape_id_str, "unknown")
    return jsonify(status=status)

'''
Removes cassette from the database.
TODO: I might want this to dispense the cassette to the entrance.
'''
@app.route("/api/remove", methods=["DELETE"])
def remove_cassette():
    tape_id = request.args.get('id')
    tape = db.get_tape_by_id(tape_id)
    # dispense_status[tape_id] = "in_progress"

    # # Send command immediately
    # serial_comm.send_byte(COMMANDS["remove"])
    # serial_comm.send_byte(tape['slot_x'])
    # serial_comm.send_byte(tape['slot_y'])

    # # Start background listener
    # threading.Thread(target=handle_dispense, args=(tape_id,), daemon=True).start()

    db.delete_cassette(tape_id)

    return jsonify(status="Removed")

'''
Remove all cassettes from the database.
'''
@app.route("/api/remove_all", methods=["DELETE"])
def remove_all_cassettes():
    #assume person will remove cassettes by hand
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

auto_status = {
    "state": "idle",   # idle | running | done | timeout | error
    "total": 0,
    "current": 0
}

'''
Background thread to handle the auto-organize process.
TODO: make it properly choose positions for the cassettes
'''
@app.route("/api/auto_organize", methods=["POST"])
def auto_organize():
    data = request.get_json()
    moves = data.get("moves", [])

    if not moves:
        return jsonify(status="No moves provided"), 400

    if auto_status["state"] == "running":
        return jsonify(status="Already running"), 400

    auto_status["state"] = "running"
    auto_status["total"] = len(moves)
    auto_status["current"] = 0

    threading.Thread(
        target=handle_auto_organize,
        args=(moves,),
        daemon=True
    ).start()

    return jsonify(status="started")

def handle_auto_organize(moves):
    global auto_status

    for index, move in enumerate(moves):

        auto_status["current"] = index + 1

        # Send SWITCH command
        serial_comm.send_byte(COMMANDS["switch"])

        # Send FROM position
        serial_comm.send_byte(int(move["from"]["x"]))
        serial_comm.send_byte(int(move["from"]["y"]))

        # Send TO position
        serial_comm.send_byte(int(move["to"]["x"]))
        serial_comm.send_byte(int(move["to"]["y"]))

        # Wait for Arduino confirmation
        if not serial_comm.wait_for_arduino():
            auto_status["state"] = "timeout"
            return

        # ✅ Update DB AFTER hardware confirms
        db.update_tape_position(
            move["id"],
            move["to"]["x"],
            move["to"]["y"]
        )

    auto_status["state"] = "done"


@app.route("/api/auto_status")
def auto_status_endpoint():
    return jsonify(auto_status)


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

