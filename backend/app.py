from flask import Flask, render_template, request, jsonify
import serial_comm
import os

app = Flask(__name__, 
            template_folder="../frontend", 
            static_folder="../frontend",
            static_url_path="") 

# Hardware Command Map
# REMOVE is gone as it's not a hardware action
COMMANDS = {
    "home": 0x01,
    "pickup": 0x02,
    "dropoff": 0x03,
    "goto": 0x04,
    "servo": 0x05,
    "offset": 0x07
}

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/move")
def move_hardware():
    action = request.args.get('action')
    x = request.args.get('x', '1')
    y = request.args.get('y', '1')
    
    if action in COMMANDS:
        cmd_byte = COMMANDS[action]
        
        # 1. Send Command Byte
        serial_comm.send_byte(cmd_byte)
        
        # 2. If it's a movement, send X and Y immediately after
        if action in ["pickup", "dropoff", "goto"]:
            serial_comm.send_byte(int(x))
            serial_comm.send_byte(int(y))
            status_msg = f"Sent {action} at X:{x}, Y:{y}"
        else:
            status_msg = f"Sent {action} command"
            
        return jsonify(status=status_msg)
    
    return jsonify(status="Action not mapped to hardware"), 400

@app.route("/api/offset")
def set_offset():
    val_str = request.args.get('val', '0.0')
    try:
        val = float(val_str)
        # 1. Send Offset Header
        serial_comm.send_byte(COMMANDS["offset"])
        # 2. Send 4-byte Float
        serial_comm.send_float(val)
        return jsonify(status=f"Offset {val} transmitted")
    except ValueError:
        return jsonify(status="Invalid decimal"), 400

@app.route("/api/tapes")
def get_tapes():
    return jsonify([{"id": 1, "name": "Awesome Mix Vol 1", "listens": 12, "in_machine": 1}])

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)