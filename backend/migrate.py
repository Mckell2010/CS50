"""Create or upgrade SQLite/PostgreSQL to schema v2 without reseeding."""

from backend.db import Database

if __name__ == "__main__":
    db = Database()
    print("Schema v2 available; current data version:", db.read()[1])
