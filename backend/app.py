from flask import Flask, render_template, request, jsonify
import serial_comm
import db

app = Flask(__name__, template_folder="../frontend", static_folder="../frontend", static_url_path="")

# Hardware Command Map
COMMANDS = {
    "home": 0x01, "pickup": 0x02, "dropoff": 0x03, "goto": 0x04,
    "servo": 0x05, "offset": 0x07, "wait_sense": 0x08
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
@app.route("/api/move")
def move_hardware():
    action = request.args.get('action')
    x = request.args.get('x', '1')
    y = request.args.get('y', '1')
    
    if action in COMMANDS:
        serial_comm.send_byte(COMMANDS[action])
        if action in ["pickup", "dropoff", "goto"]:
            serial_comm.send_byte(int(x))
            serial_comm.send_byte(int(y))
        return jsonify(status=f"Executed {action}")
    return jsonify(status="Invalid Command"), 400

'''
Routes serial offset commands.
'''
@app.route("/api/offset")
def set_offset():
    try:
        val = float(request.args.get('val', '0.0'))
        serial_comm.send_byte(COMMANDS["offset"])
        serial_comm.send_float(val)
        return jsonify(status=f"Offset {val} set")
    except:
        return jsonify(status="Invalid decimal"), 400

'''
Returns JSON of all cassettes in database.
'''
@app.route("/api/tapes")
def get_tapes():
    return jsonify(db.get_all_cassettes())

'''
Sends move commands and count increment commands when a cassette is dispensed.
'''
@app.route("/api/dispense")
def dispense():
    tape_id = request.args.get('id')
    tape = db.get_tape_by_id(tape_id)
    if tape:
        # 1. Update DB: Mark as OUT and increment play count
        db.update_status(tape_id, 0)
        db.increment_listens(tape_id)  # <-- Added this
        
        # 2. Hardware: Send move commands
        serial_comm.send_byte(COMMANDS["home"])
        serial_comm.send_byte(COMMANDS["pickup"])
        serial_comm.send_byte(tape['slot_x'])
        serial_comm.send_byte(tape['slot_y'])
        
        return jsonify(status="Dispensing...")
    return jsonify(status="Tape not found"), 404

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
    slot = db.add_cassette(name, artist, target_slot)
    
    if not slot:
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
When a tape is returned, it changes it to present in database.
Option to send serial commands here since the tape is returned.
'''
@app.route("/api/return")
def return_tape():
    tape_id = request.args.get('id')
    tape = db.get_tape_by_id(tape_id)
    if tape:
        # 1. (Optional) Send hardware command to physical return mechanism
        # serial_comm.send_byte(COMMANDS["home"])
        # serial_comm.send_byte(COMMANDS["dropoff"])
        
        # 2. Update DB: Set in_machine to 1
        db.update_status(tape_id, 1) 
        return jsonify(status="Tape returned to machine")
    return jsonify(status="Tape not found"), 404

'''
Removes cassette from the database.
'''
@app.route("/api/remove", methods=["DELETE"])
def remove_cassette():
    tape_id = request.args.get('id')
    db.delete_cassette(tape_id)
    return jsonify(status="Removed")

if __name__ == "__main__":
    db.init_db()
    # threaded=True helps prevent request blocking
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)