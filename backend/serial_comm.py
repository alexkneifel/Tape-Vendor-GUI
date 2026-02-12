import serial
import time
import struct

# Port for Raspberry Pi to Arduino
try:
    ser = serial.Serial('/dev/ttyACM0', 9600, timeout=1)
    time.sleep(2) # Wait for Arduino reset
except:
    print("UART Error: Could not connect to Arduino")
    ser = None

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