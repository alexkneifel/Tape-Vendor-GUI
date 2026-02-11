# backend/serial_comm.py

import serial
import time
from config import SERIAL_PORTS, MODE

BAUD_RATE = 115200

class GantrySerial:
    def __init__(self):
        self.port = SERIAL_PORTS[MODE]
        self.ser = None

    def connect(self):
        if self.ser and self.ser.is_open:
            return

        self.ser = serial.Serial(
            port=self.port,
            baudrate=BAUD_RATE,
            timeout=1
        )
        time.sleep(2)  # Arduino reset delay

    def send_byte(self, byte):
        if not self.ser or not self.ser.is_open:
            self.connect()

        self.ser.write(bytes([byte]))

    def read_line(self):
        if self.ser and self.ser.in_waiting:
            return self.ser.readline().decode().strip()
        return None

    def close(self):
        if self.ser:
            self.ser.close()

def even_parity(byte):
    return bin(byte).count("1") % 2 == 0

def encode_position(pos):
    if not 0 <= pos <= 39:
        raise ValueError("Position must be 0–39")

    byte = pos & 0b00111111  # lower 6 bits

    if not even_parity(byte):
        byte |= 0b10000000  # set parity bit

    return byte

def retrieve_from_shelf(pos):
    byte = encode_position(pos)
    gantry.send_byte(byte)

def home_gantry():
    gantry.send_byte(0b01000000)

def pause_or_cancel():
    gantry.send_byte(0b01100000)
