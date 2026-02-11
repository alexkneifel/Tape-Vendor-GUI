import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "cassettes.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS cassettes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            artist TEXT,
            genre TEXT,
            listens INTEGER DEFAULT 0,
            last_played TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()