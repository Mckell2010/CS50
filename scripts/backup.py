"""Online SQLite backup, refusing to overwrite existing destination files."""

import argparse, os, sqlite3
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("destination")
p.add_argument("--source", default="data/explorer.db")
a = p.parse_args()
source = Path(a.source).resolve()
target = Path(a.destination).resolve()
if not source.is_file():
    p.error("Source database does not exist")
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
try:
    with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src, sqlite3.connect(
        target
    ) as dst:
        src.backup(dst)
except Exception:
    target.unlink()
    raise
print("Consistent SQLite backup created:", target)
