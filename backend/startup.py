"""
Startup script for Azure App Service.
Seeds the database and scenarios file if missing, then starts the server.
"""
import os
import subprocess
import sys

# Seed DB from CSV if not present
if not os.path.exists("src/data/drp.db"):
    print(">>> Initialising database from mock_data.csv...")
    subprocess.run([sys.executable, "scripts/csv_to_sqlite.py"], check=True)
    print(">>> Database ready.")

# Create empty scenarios file if not present
if not os.path.exists("src/data/scenarios.json"):
    print(">>> Creating empty scenarios.json...")
    with open("src/data/scenarios.json", "w") as f:
        f.write("[]")

# Start gunicorn (replaces current process)
print(">>> Starting gunicorn...")
import shutil
gunicorn_path = shutil.which("gunicorn") or "antenv/bin/gunicorn"
os.execvp(
    gunicorn_path,
    [gunicorn_path, "-k", "uvicorn.workers.UvicornWorker",
     "-w", "2", "--bind", "0.0.0.0:8000",
     "--timeout", "120",
     "main:app"]
)
