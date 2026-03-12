import serial
import time
import struct
import serial.tools.list_ports
import threading

# Create a lock object
serial_lock = threading.Lock()


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

def wait_for_arduino(expected_byte=0x4B):
    # Use the lock so other threads have to wait their turn
    with serial_lock:
        print(f"Waiting for byte: {hex(expected_byte)}...")
        timeout = time.time() + 35

        while time.time() < timeout:
            if ser and ser.is_open:
                if ser.in_waiting > 0:
                    incoming = ser.read(ser.in_waiting)

                    for b in incoming:
                        if b == expected_byte:
                            return True
            time.sleep(0.05)

        print("UART TIMEOUT: Arduino did not respond in time.")
    return False
