"""Apply schema v1 to a new SQLite/PostgreSQL database; no data seeding."""

from backend.db import Database

if __name__ == "__main__":
    db = Database()
    print("Schema v1 available; current data version:", db.read()[1])
