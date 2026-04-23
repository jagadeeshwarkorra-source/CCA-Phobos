"""
Startup script for Azure App Service.
Seeds the database and scenarios file if missing, then starts the server.
Uses only stdlib so no numpy/pandas dependency at boot time.
"""
import os, csv, sqlite3, shutil

BASE        = os.path.dirname(os.path.abspath(__file__))
PERSIST_DIR = os.environ.get("PERSISTENT_DATA_DIR", os.path.join(BASE, "src", "data"))
os.makedirs(PERSIST_DIR, exist_ok=True)

DB_PATH  = os.path.join(PERSIST_DIR, "drp.db")
CSV_PATH = os.path.join(BASE, "src", "data", "mock_data.csv")
SC_PATH  = os.path.join(PERSIST_DIR, "scenarios.json")

CANONICAL = {
    'distributor':'Distributor','zrep':'ZREP','product':'ZREP','item':'ZREP',
    'year':'year','period':'period','rolling_period':'Rolling_Period','rolling':'Rolling_Period',
    'category':'category','demand segment':'Demand_segment','demand_segment':'Demand_segment',
    'planner_group':'Planner_group','planner group':'Planner_group',
    'sell_out_forecast_qty':'Sell_Out_forecast_Qty',
    'sell_out_forecast_qty_deimos':'Sell_Out_forecast_qty_deimos',
    'sell_out_actuals_qty':'Sell_Out_Actuals_Qty','sell_out_actuals':'Sell_Out_Actuals_Qty',
    'sell_out_forecast_value':'Sell_Out_forecast_value',
    'sell_in_actuals_qty':'Sell_In_Actuals_Qty',
    'sell_in_forecast_qty':'Sell_In_Forecast_Qty',
    'sell_in_forecast_value':'Sell_In_Forecast_value',
    'in_transit':'In_transit','beginning_inventory':'Beginning_inventory',
    'ending_inventory':'Ending_inventory','target_inventory':'Target_inventory',
    'woh_inventory_required':'WoH_Inventory_Required','price':'price','doh':'DOH',
    'period_val':'period_val',
}

NUMERIC = {
    'year','period','period_val','Sell_Out_forecast_Qty','Sell_Out_forecast_qty_deimos',
    'Sell_Out_Actuals_Qty','Sell_In_Actuals_Qty','Sell_In_Forecast_Qty','In_transit',
    'Beginning_inventory','Ending_inventory','Target_inventory','WoH_Inventory_Required',
    'price','DOH','Sell_Out_forecast_value','Sell_In_Forecast_value',
}

def _cast(col, val):
    if col in NUMERIC:
        try: return float(val) if str(val).strip() != '' else 0.0
        except: return 0.0
    return val

# ── Seed DB from CSV if missing ───────────────────────────────────────────────
if not os.path.exists(DB_PATH):
    print(">>> Seeding database from mock_data.csv...")
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise RuntimeError("mock_data.csv is empty")
    raw_cols   = list(rows[0].keys())
    canon_cols = [CANONICAL.get(c.lower().strip(), c) for c in raw_cols]
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS demand_data")
    col_defs = ", ".join(
        f'"{c}" REAL' if c in NUMERIC else f'"{c}" TEXT' for c in canon_cols
    )
    cur.execute(f"CREATE TABLE demand_data ({col_defs})")
    ph = ", ".join("?" for _ in raw_cols)
    for row in rows:
        cur.execute(
            f"INSERT INTO demand_data VALUES ({ph})",
            [_cast(canon_cols[i], row.get(c, "")) for i, c in enumerate(raw_cols)]
        )
    conn.commit(); conn.close()
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
os.execvp(gunicorn_path, [
    gunicorn_path,
    "-k", "uvicorn.workers.UvicornWorker",
    "-w", "2",
    "--bind", "0.0.0.0:8000",
    "--timeout", "120",
    "main:app"
])
