import serial
import time
import struct
import serial.tools.list_ports


try:
    ser = serial.Serial("/dev/serial0", 9600, timeout=35)
    print("Connected to Arduino on GPIO UART")
except serial.SerialException:
    ser = None
    print("Arduino not found on GPIO UART")

'''
send byte over serial port
'''

def send_byte(byte_value):
    if ser and ser.is_open:
        ser.write(bytes([byte_value]))
        print(f"UART SENT BYTE: {hex(byte_value)}")
    else:
        print(f"MOCK UART SENT BYTE: {hex(byte_value)}")


def clear_buffer():
    """Wipes out any stale 'ghost bytes' from previous operations."""
    if ser and ser.is_open:
        ser.reset_input_buffer()
        print("UART input buffer cleared.")

def wait_for_arduino(expected_byte=0x4B): # 0x4B is ASCII 'K' for OK
    print("Waiting for Arduino confirmation...")
    timeout = time.time() + 35  # 35 second timeout
    
    while time.time() < timeout:
        if ser and ser.is_open:
            if ser.in_waiting > 0:
                # Read ALL available bytes at once to clear traffic jams
                incoming = ser.read(ser.in_waiting)
                
                # Check if our expected byte is anywhere in that chunk
                for byte_value in incoming:
                    print(f"UART RECEIVED BYTE: {hex(byte_value)}")
                    if byte_value == expected_byte:
                        return True
                        
        time.sleep(0.05) # Sleep 50ms (checks 20 times a second)
        
    print("UART TIMEOUT: Arduino did not respond in time.")
    return False