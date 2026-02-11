import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "cassettes.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    # This allows us to access columns by name like tape['name'] instead of tape[1]
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS cassettes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            artist TEXT,
            genre TEXT,
            listens INTEGER DEFAULT 0,
            last_played TIMESTAMP,
            in_machine INTEGER DEFAULT 1  -- 1 for IN, 0 for OUT
        )
    ''')
    conn.commit()
    conn.close()

# --- Functions for your Flask API ---

def get_all_cassettes(sort_by="name"):
    """Fetches all tapes, prioritizing 'OUT' tapes at the top."""
    conn = get_db_connection()
    
    # Map frontend sort values to SQL columns
    sort_options = {
        "alpha": "name ASC",
        "plays": "listens DESC",
        "recent": "last_played DESC"
    }
    order = sort_options.get(sort_by, "name ASC")
    
    # We order by in_machine ASC so that 0 (OUT) comes before 1 (IN)
    query = f"SELECT * FROM cassettes ORDER BY in_machine ASC, {order}"
    
    tapes = conn.execute(query).fetchall()
    conn.close()
    # Convert Row objects to dictionaries so Flask can jsonify them
    return [dict(t) for t in tapes]

def add_cassette(name, artist, genre):
    conn = get_db_connection()
    conn.execute('INSERT INTO cassettes (name, artist, genre) VALUES (?, ?, ?)',
                 (name, artist, genre))
    conn.commit()
    conn.close()

def mark_as_removed(tape_id):
    """Sets a tape status to OUT (0)"""
    conn = get_db_connection()
    conn.execute('UPDATE cassettes SET in_machine = 0 WHERE id = ?', (tape_id,))
    conn.commit()
    conn.close()

def increment_plays(tape_id):
    """Call this when a tape starts playing"""
    conn = get_db_connection()
    conn.execute('''
        UPDATE cassettes 
        SET listens = listens + 1, last_played = ? 
        WHERE id = ?
    ''', (datetime.now(), tape_id))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized with in_machine support.")