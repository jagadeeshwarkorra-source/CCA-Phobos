"""
Startup script for Azure App Service.
Seeds the database and scenarios file if missing, then starts the server.
Uses only stdlib for seeding so no numpy/pandas dependency at boot time.
"""
import os
import csv
import sqlite3
import shutil

BASE         = os.path.dirname(os.path.abspath(__file__))
PERSIST_DIR  = os.environ.get("PERSISTENT_DATA_DIR", os.path.join(BASE, "src", "data"))
os.makedirs(PERSIST_DIR, exist_ok=True)
DB_PATH  = os.path.join(PERSIST_DIR, "drp.db")
CSV_PATH = os.path.join(BASE, "src", "data", "mock_data.csv")
SC_PATH  = os.path.join(PERSIST_DIR, "scenarios.json")

# ── Seed DB from CSV if missing ───────────────────────────────────────────────
if not os.path.exists(DB_PATH):
    print(">>> Seeding database from mock_data.csv...")
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise RuntimeError("mock_data.csv is empty — cannot seed database")
    cols = list(rows[0].keys())
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS demand_data")
    cur.execute(
        "CREATE TABLE demand_data ("
        + ", ".join(f'"{c}" TEXT' for c in cols)
        + ")"
    )
    ph = ", ".join("?" for _ in cols)
    for row in rows:
        cur.execute(f"INSERT INTO demand_data VALUES ({ph})", [row.get(c, "") for c in cols])
    conn.commit()
    conn.close()
    print(f">>> Database ready: {len(rows)} rows.")
else:
    print(">>> Database already exists, skipping seed.")

# ── Create empty scenarios file if missing ───────────────────────────────────
if not os.path.exists(SC_PATH):
    print(">>> Creating empty scenarios.json...")
    with open(SC_PATH, "w") as f:
        f.write("[]")

# ── Start gunicorn ────────────────────────────────────────────────────────────
print(">>> Starting gunicorn...")
gunicorn_path = shutil.which("gunicorn") or os.path.join(BASE, "antenv", "bin", "gunicorn")
os.execvp(
    gunicorn_path,
    [gunicorn_path,
     "-k", "uvicorn.workers.UvicornWorker",
     "-w", "2",
     "--bind", "0.0.0.0:8000",
     "--timeout", "120",
     "main:app"]
)
