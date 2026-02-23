import serial
import time
import struct
import serial.tools.list_ports

arduino_port = None

for port in serial.tools.list_ports.comports():
    print(port.device, port.description)
    if "usbmodem" in port.device:
        arduino_port = port.device
        break

if arduino_port:
    ser = serial.Serial(arduino_port, 9600, timeout=1)
    print("Connected to", arduino_port)
else:
    print("Arduino not found")

'''
send byte over serial port
'''

def send_byte(byte_value):
    if ser and ser.is_open:
        ser.write(bytes([byte_value]))
        print(f"UART SENT BYTE: {hex(byte_value)}")
    else:
        print(f"MOCK UART SENT BYTE: {hex(byte_value)}")

'''
send float over serial port
'''
def send_float(float_value):
    if ser and ser.is_open:
        # Pack float into 4 bytes (IEEE 754)
        ser.write(struct.pack('f', float_value))
        print(f"UART SENT FLOAT: {float_value}")
    else:
        print(f"MOCK UART SENT FLOAT: {float_value}")

'''
receive byte over serial
'''
def receive_byte():
    if ser and ser.is_open:
        if ser.in_waiting > 0:  # Check if data is sitting in the buffer
            incoming = ser.read(1)
            byte_value = ord(incoming)
            print(f"UART RECEIVED BYTE: {hex(byte_value)}")
            return byte_value
    return None

'''
wait for next process based on the arduino message.
'''
def wait_for_arduino(expected_byte=0x4B): # 0x4B is ASCII 'K' for OK
    print("Waiting for Arduino confirmation...")
    timeout = time.time() + 30  # 30 second timeout
    
    while time.time() < timeout:
        received = receive_byte()
        if received == expected_byte:
            return True
        time.sleep(0.1) # Don't hog the CPU
    return False