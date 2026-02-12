import sqlite3
import os
import math
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "cassettes.db")

'''
Opens the DB file.
'''
def get_db_connection():
    # check_same_thread=False allows Flask to use the connection across threads
    # timeout=30 waits longer for locks to clear before crashing
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

'''
Creates the database if it was not done already.
id, Name, artist, listens, last_played, in_machine, slot_x, slot_y
'''
def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS cassettes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            artist TEXT,
            listens INTEGER DEFAULT 0,
            last_played TIMESTAMP,
            in_machine INTEGER DEFAULT 1,
            slot_x INTEGER,
            slot_y INTEGER
        )
    ''')
    conn.commit()
    conn.close()

'''
Returns all the cassettes, returns based on if it's in machine or not.
Can pass sort_by = "plays" to sort by the number of plays, otherwise it does it alphabetically.
'''
def get_all_cassettes(sort_by="alpha"):
    conn = get_db_connection()
    try:
        sort_sql = "name ASC"
        if sort_by == "plays":
            sort_sql = "listens DESC"
        query = f"SELECT * FROM cassettes ORDER BY in_machine ASC, {sort_sql}"
        tapes = conn.execute(query).fetchall()
        return [dict(t) for t in tapes]
    finally:
        conn.close()

'''
Increments the number of listens for that cassette.
'''
def increment_listens(tape_id):
    conn = get_db_connection()
    try:
        conn.execute("UPDATE cassettes SET listens = listens + 1 WHERE id = ?", (tape_id,))
        conn.commit()
    finally:
        conn.close()

'''
Checks all the slots that are taken, and returns the (x,y) for the closest slot
'''
def find_closest_empty_slot():
    conn = get_db_connection()
    try:
        # CHECK ALL TAPES (even those with in_machine=0) 
        # so we don't double-book a physical slot.
        rows = conn.execute("SELECT slot_x, slot_y FROM cassettes").fetchall()
        taken = {(r['slot_x'], r['slot_y']) for r in rows if r['slot_x'] and r['slot_y']}
        
        entrance = (3, 1) 
        best_slot = None
        min_dist = 9999
        
        for x in range(1, 6):
            for y in range(1, 12):
                if (x, y) not in taken:
                    dist = math.sqrt((x - entrance[0])**2 + (y - entrance[1])**2)
                    if dist < min_dist:
                        min_dist = dist
                        best_slot = (x, y)
        return best_slot
    finally:
        conn.close()

'''
Inserts a new cassette into the database.
'''
def add_cassette(name, artist, target_slot=None):
    conn = get_db_connection()
    try:
        slot = target_slot
            
        if not slot:
            return None
        
        # DEBUG PRINT: Watch your terminal when you click save
        print(f"SAVING TAPE: {name} TO SLOT: {slot[0]}, {slot[1]}")

        conn.execute(
            "INSERT INTO cassettes (name, artist, slot_x, slot_y, in_machine) VALUES (?, ?, ?, ?, 1)",
            (name, artist, slot[0], slot[1])
        )
        conn.commit()
        return slot
    except Exception as e:
        print(f"CRITICAL DB ERROR: {e}")
        return None
    finally:
        conn.close() # Now it is safe to close.

'''
Return cassette information based on its id
'''
def get_tape_by_id(tape_id):
    conn = get_db_connection()
    try:
        tape = conn.execute("SELECT * FROM cassettes WHERE id = ?", (tape_id,)).fetchone()
        return dict(tape) if tape else None
    finally:
        conn.close()

'''
Fetch whether the cassette is in the machine.
'''
def update_status(tape_id, in_machine):
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE cassettes SET in_machine = ?, last_played = ? WHERE id = ?",
            (in_machine, datetime.now(), tape_id)
        )
        conn.commit()
    finally:
        conn.close()

'''
Delete cassette from database.
'''
def delete_cassette(tape_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM cassettes WHERE id = ?", (tape_id,))
        conn.commit()
    finally:
        conn.close()
