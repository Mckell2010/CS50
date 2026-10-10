"""Launch the local private demo. Select your workbook on first run."""

import argparse, hashlib, os, socket, subprocess, sys, time, urllib.request, webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--workbook")
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--no-browser", action="store_true")
args = parser.parse_args()
venv_python = (
    ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
)
if not venv_python.exists():
    subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True)
npm = "npm.cmd" if os.name == "nt" else "npm"
signature = hashlib.sha256(
    (ROOT / "requirements.lock").read_bytes()
    + (ROOT / "package-lock.json").read_bytes()
).hexdigest()
marker = ROOT / ".venv" / ".demo-dependencies"
if (
    not marker.exists()
    or marker.read_text() != signature
    or not (ROOT / "node_modules").exists()
):
    print("Installing the demo dependencies…", flush=True)
    subprocess.run(
        [str(venv_python), "-m", "pip", "install", "-r", "requirements.lock"],
        check=True,
    )
    subprocess.run([npm, "ci"], check=True)
    marker.write_text(signature)
print("Building the app…", flush=True)
subprocess.run([npm, "run", "build"], check=True)
database = ROOT / "data" / "private-demo.db"
if not database.exists():
    workbook = args.workbook
    if not workbook:
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            workbook = filedialog.askopenfilename(
                title="Select your organization chart workbook",
                filetypes=[("Excel workbook", "*.xlsx")],
            )
            root.destroy()
        except Exception:
            raise SystemExit(
                "Run again with --workbook followed by the path to your .xlsx file."
            )
    if not workbook:
        raise SystemExit("No workbook selected. Nothing was imported.")
    command = [
        str(venv_python),
        "scripts/prepare_demo.py",
        workbook,
        "--database",
        str(database),
    ]
    if (ROOT / "docs" / "leadership-mapping.csv").exists():
        command.append("--use-discovery")
    subprocess.run(command, check=True)
port = args.port
for candidate in range(port, port + 20):
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", candidate))
            port = candidate
            break
        except OSError:
            continue

else:
    raise SystemExit(
        "No free local port found. Stop an earlier demo or specify --port."
    )
env = dict(
    os.environ,
    DATABASE_URL="sqlite:///" + str(database),
    AUTH_MODE="development",
    APP_ENV="development",
    SEED_SAMPLE="false",
)
process = subprocess.Popen(
    [
        str(venv_python),
        "-m",
        "uvicorn",
        "backend.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ],
    env=env,
)
url = f"http://127.0.0.1:{port}"
try:
    for _ in range(100):
        if process.poll() is not None:
            raise SystemExit("The demo server could not start. Read the error above.")
        try:
            with urllib.request.urlopen(url + "/api/health", timeout=1):
                break
        except Exception:
            time.sleep(0.15)
    else:
        raise SystemExit("Demo server did not become ready.")
    print(
        f"\nDemo ready: {url}\nChoose Model settings to edit the organization.\nKeep this window open; press Ctrl+C to stop. Your edits persist in data/private-demo.db.\n",
        flush=True,
    )
    if not args.no_browser:
        webbrowser.open(url)
    process.wait()
except KeyboardInterrupt:
    pass
finally:
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
