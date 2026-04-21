# CCA DRP Dashboard

A web-based **Demand & Replenishment Planning (DRP)** dashboard for CCA. Built with a React/TypeScript frontend and a Python FastAPI backend powered by a LangGraph agent architecture over a local SQLite database.

> **Engineering standard:** All code follows the internal engineering standards & best practices document — SOLID principles, centralised logging, typed interfaces, service layer, unit tests, error boundaries, and zero magic numbers.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Engineering Standards](#4-engineering-standards)
5. [Prerequisites](#5-prerequisites)
6. [Getting Started](#6-getting-started)
7. [Running Tests](#7-running-tests)
8. [Personas & Navigation](#8-personas--navigation)
9. [Feature Walkthrough](#9-feature-walkthrough)
10. [Business Logic & Calculations](#10-business-logic--calculations)
11. [Scenario Workflow (End-to-End)](#11-scenario-workflow-end-to-end)
12. [API Reference](#12-api-reference)
13. [Data Model](#13-data-model)
14. [Filters & Period Conventions](#14-filters--period-conventions)
15. [Extending the Application](#15-extending-the-application)
16. [Future: Databricks UC Integration](#16-future-databricks-uc-integration)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Project Overview

The CCA DRP Dashboard supports two user personas — **Demand Planner** and **Demand Lead** — across four views:

| View | Persona | Purpose |
|------|---------|---------|
| Overview | Both | Fixed-horizon KPI snapshot (P-20 → P+12) |
| Detailed View | Both | Period-level drill-down with full inventory columns |
| Scenario Builder | Demand Planner | Create & save demand scenarios with manual/bulk/Excel edits |
| Scenario Confirmation | Demand Lead | Review, adjust, and approve planner scenarios |

---

## 2. Tech Stack

### Backend
| Package | Version | Role |
|---------|---------|------|
| Python | 3.9+ | Runtime |
| FastAPI | 0.110.0 | REST API framework |
| Uvicorn | 0.27.1 | ASGI server |
| Pandas | 2.2.1 | Data manipulation |
| Pydantic | 2.6.3 | Request/response validation |
| LangGraph | 0.0.27 | Agent state-machine routing |

### Frontend
| Package | Role |
|---------|------|
| React 18 | UI framework |
| TypeScript (strict) | Full type safety — no implicit `any` |
| Vite | Dev server & bundler |
| Tailwind CSS | Utility-first styling |
| Recharts | Charts (ComposedChart, Bar, Line) |
| React Router v6 | Client-side routing |
| Lucide React | Icon library |

---

## 3. Project Structure

```
cca-drp-dashboard/
│
├── backend/
│   ├── scripts/
│   │   └── csv_to_sqlite.py       # ★ One-time migration: mock_data.csv → drp.db
│   ├── src/
│   │   ├── data/
│   │   │   ├── drp.db             # ★ SQLite database — demand_data table (41,676 rows, 7 MB)
│   │   │   ├── mock_data.csv      # Source CSV (kept for reference / re-migration)
│   │   │   └── scenarios.json     # Pending scenario store (one entry per saved scenario)
│   │   ├── agents/
│   │   │   ├── data_agent.py      # Handles read actions (overview, details, filter options)
│   │   │   └── scenario_agent.py  # Handles scenario CRUD and approval
│   │   ├── tools/
│   │   │   ├── data_tools.py      # ★ SQLite loader with in-memory cache (mtime-invalidated)
│   │   │   └── scenario_tools.py  # JSON read/write helpers for scenarios
│   │   ├── config.py              # ★ Centralised constants — all magic numbers & column maps
│   │   ├── logger.py              # ★ Structured JSON logger (stdout, named loggers)
│   │   ├── graph.py               # LangGraph StateGraph — routes actions to correct agent
│   │   └── state.py               # GraphState TypedDict shared across all nodes
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_data_tools.py     # ★ Unit tests for load_data(), save_approved_data()
│   │   └── test_scenario_tools.py # ★ Unit tests for scenario CRUD helpers
│   ├── main.py                    # FastAPI app — single POST /api/execute endpoint
│   └── requirements.txt
│
└── frontend/
    ├── public/
    └── src/
        ├── components/
        │   ├── MultiSelect.tsx    # Reusable multi-select filter (with Select All)
        │   └── ErrorBoundary.tsx  # ★ React error boundary — catches render-phase crashes
        ├── constants/
        │   ├── colors.ts          # ★ BRAND, CHART_COLORS, ACCURACY_COLORS, TABLE_COLORS
        │   ├── config.ts          # ★ API_BASE, ROWS_PER_PAGE, APP_BRAND, APP_TITLE
        │   └── periods.ts         # ★ Period horizon constants (CHART_MIN_PERIOD, LOCKED_PERIOD_MAX …)
        ├── context/
        │   └── AppContext.tsx     # Global state: persona, unit, filters — types from types/index.ts
        ├── hooks/
        │   └── useFilterOptions.ts # ★ Custom hook — fetches filter options once on mount
        ├── pages/
        │   ├── Overview.tsx           # KPI cards + Rolling Period chart + Bridge chart
        │   ├── DetailedView.tsx       # Full period table with all inventory columns
        │   ├── ScenarioBuilder.tsx    # Editable scenario grid (P+0→P+12, P0–P2 locked)
        │   ├── FreezeView.tsx         # Lead review: approve/reject with inline edits
        │   └── AccuracyComparison.tsx # Forecast accuracy comparison view
        ├── services/
        │   └── dashboardService.ts   # ★ All API calls — typed, no fetch() in pages
        ├── types/
        │   └── index.ts              # ★ Shared TypeScript interfaces (ByPeriodRow, DetailRow …)
        ├── utils/
        │   └── formatting.ts         # ★ fmtBig, fmtVal, fmt, fmtPct, calcDoh
        ├── api.ts                 # Thin re-export shim (backwards compatibility)
        ├── App.tsx                # Router, nav bar, persona switcher, global filters
        ├── index.css              # Tailwind directives
        └── main.tsx               # React entry point (wrapped in ErrorBoundary)
```

> ★ = added or significantly refactored as part of the engineering standards uplift

---

## 4. Engineering Standards

All code in this repository follows the **CCA Engineering Standards & Best Practices** document. The key practices implemented are:

### Backend

| Standard | Implementation |
|----------|----------------|
| **No magic numbers** | `backend/src/config.py` — all period thresholds, column names, file paths |
| **Structured logging** | `backend/src/logger.py` — JSON formatter, named loggers, no bare `print()` |
| **Docstrings on all public functions** | Every function has Args / Returns / Raises documented |
| **Specific exception handling** | `except (KeyError, ValueError)` — never bare `except:` |
| **Global error handler** | `main.py` — catches unhandled exceptions, returns clean 500 response |
| **SQLite data layer** | `drp.db` — indexed `demand_data` table; `sqlite3` stdlib + `pd.read_sql_query` |
| **Targeted SQL writes** | `save_approved_data()` uses `UPDATE … WHERE id = ?` — no full-table reload |
| **Unit tests (AAA pattern)** | `backend/tests/` — SQLite mocked, real tmp DB for write tests, cache isolation |
| **Separation of concerns** | agents read data; tools do I/O; config holds constants |
| **Cache invalidation** | `save_approved_data()` resets `_CACHED_DF` + `_LAST_MTIME` after writes |

### Frontend

| Standard | Implementation |
|----------|----------------|
| **TypeScript strict mode** | All types explicit; no implicit `any`; unused imports are errors |
| **Shared type definitions** | `src/types/index.ts` — single source of truth for all interfaces |
| **Service layer** | `src/services/dashboardService.ts` — all `fetch()` calls centralised |
| **Custom hooks** | `src/hooks/useFilterOptions.ts` — API side-effects out of components |
| **Constants modules** | `src/constants/` — colors, periods, and config separate from logic |
| **Shared formatting utilities** | `src/utils/formatting.ts` — `fmtBig`, `fmtVal`, `fmt`, `fmtPct`, `calcDoh` |
| **Error boundary** | `src/components/ErrorBoundary.tsx` — wraps entire app, graceful fallback UI |
| **Cancellable effects** | `useEffect` cleanup with `AbortController` — no stale fetch side-effects |
| **No hardcoded strings in logic** | All colours, periods, and config values imported from constants |

---

## 5. Prerequisites

| Requirement | Version |
|-------------|---------|
| Python | 3.9 or higher |
| Node.js | 18 or higher |
| npm | 8 or higher |

> **Python 3.14 note:** Use `pip install ... --prefer-binary` to avoid source compilation errors on packages that lack pre-built wheels for 3.14.

---

## 6. Getting Started

### Step 1 — Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

# Install dependencies (use --prefer-binary on Python 3.13+)
pip install -r requirements.txt --prefer-binary

# (First time only) Migrate mock_data.csv → drp.db
# Skip if drp.db already exists in backend/src/data/
python -m scripts.csv_to_sqlite

# Start the API server (port 8001, auto-reload on file changes)
python -m uvicorn main:app --reload --port 8001
```

Backend will be available at: **http://localhost:8001**
Interactive API docs: **http://localhost:8001/docs**

### Step 2 — Frontend

Open a **separate terminal**:

```bash
cd frontend

# Install Node dependencies (first time only)
npm install

# Start Vite dev server
npm run dev
```

Frontend will be available at: **http://localhost:5173**

### Both servers must be running for the dashboard to work.

---

## 7. Running Tests

### Backend unit tests

```bash
cd backend

# Activate virtualenv first
.\venv\Scripts\activate   # Windows
source venv/bin/activate  # macOS / Linux

# Run all tests with verbose output
pytest tests/ -v

# Run a specific test module
pytest tests/test_data_tools.py -v
pytest tests/test_scenario_tools.py -v
```

All external dependencies (SQLite connections, `pd.read_sql_query`) are mocked for `load_data` tests. `save_approved_data` tests use a real SQLite database created in a temporary directory — tests run without requiring `drp.db`.

### Frontend type checking & build

```bash
cd frontend

# Type-check only (fast)
npx tsc --noEmit

# Full production build (type-check + bundle)
npm run build
```

---

## 8. Personas & Navigation

Switch persona using the toggle in the top-right of the nav bar.

| Persona | Available Routes | Description |
|---------|-----------------|-------------|
| **Demand Planner** | `/` Overview, `/details` Detailed View, `/scenario` Scenario Builder | Creates and submits scenarios |
| **Demand Lead** | All of the above + `/freeze` Scenario Confirmation | Reviews and approves scenarios |

---

## 9. Feature Walkthrough

### Overview (`/`)
- **KPI Cards** — aggregated Sell-In, Sell-Out, End Inventory, and In-Transit totals across the visible horizon
- **Rolling Period Chart** — Sell-In CY/PY bars + Sell-Out CY/PY bars + dotted In-Transit line across P-20 → P+12
- **Actuals vs Forecast Bridge** — averaged Sell-In & Sell-Out for P-3→P-1 (actuals) vs P+0→P+2 (forecast), with % growth cards
- **Cases / GSV toggle** — all chart values switch between unit quantities and Gross Sales Value (`Σ volume × price`)
- **Filters**: Distributor and ZREP only (Year/Period hidden — overview is a fixed-horizon snapshot)

### Detailed View (`/details`)
- Full tabular view: Beg Inv, Sell Out, Sell In, In Transit, Target Inv, WoH Required, End Inv
- Horizons: P-15 → P+12
- All filters active (Distributor, ZREP, Year, Period)
- Color-coded rows: actuals (past), current period, forecast (future)
- Excel export via the export button (base64-decoded on the client)

### Scenario Builder (`/scenario`)
- Editable grid for P+0 → P+12
- **Locked periods**: P+0, P+1, P+2 are read-only (gray, disabled inputs)
- **Edit modes**:
  - Manual cell editing (Sell-In and In-Transit per row)
  - Bulk % or absolute adjustment across all visible rows
  - Excel upload (download template → fill → upload)
- **Cascade**: changing Sell-In or In-Transit on any editable row auto-recalculates `End Inv` for that row and propagates `Beg Inv → End Inv` downstream for all subsequent periods in the same Distributor/ZREP group
- **Save**: persists a named scenario with reason to `scenarios.json`

### Scenario Confirmation (`/freeze`) — Demand Lead only
- Lists all pending scenarios
- Selecting a scenario loads all future forecast rows for the affected Distributor/ZREP products
- Planner-modified rows highlighted in gold
- **Locked periods**: P+0, P+1, P+2 are read-only (same rule as Scenario Builder)
- Lead can edit **Sell-In (P)** and **In-Transit (P)** on P+3 and beyond before approving
- Full downstream cascade updates End Inv (P) for all subsequent rows when a value is changed
- **Approve & Apply**: writes approved values to `drp.db` via targeted SQL `UPDATE` statements with forward inventory cascade, removes scenario from `scenarios.json`, and invalidates the data cache

### Accuracy Comparison (`/accuracy`)
- Side-by-side forecast vs actuals accuracy view
- Colour-coded accuracy bands: Excellent ≥95%, Good ≥85%, Fair ≥75%, Poor ≥60%, Bad <60%
- Cases / GSV toggle supported

---

## 10. Business Logic & Calculations

### Inventory Equation
```
End_Inv = Beg_Inv + Sell_In - Sell_Out + In_Transit
```

### Weeks-on-Hand Required
```
WoH_Req = Target_Inv × (Next_Period_Sell_Out / 4)
```

### Days-on-Hand
```
DoH = (Ending_Inventory / Sell_Out) × 28
```

### Gross Sales Value (GSV)
```
GSV per row = volume × price
Total GSV = Σ(GSV per row)   -- summed before aggregation, not after
```

### Period Horizon Rules

| View | Data Range | Sell-Out Source |
|------|-----------|-----------------|
| Overview | P-20 → P+12 | `Sell_Out_Actuals_Qty` for period_val < 0; `Sell_Out_forecast_Qty` for period_val ≥ 0 |
| Detailed View | P-15 → P+12 | Same as above |
| Scenario Builder | P+0 → P+12 | `Sell_Out_forecast_Qty` only |

### Cascade Logic
When a Sell-In or In-Transit value is edited for a row at period P:
1. Recalculate `End_Inv[P] = Beg_Inv[P] + SI[P] - SellOut[P] + IT[P]`
2. Set `Beg_Inv[P+1] = End_Inv[P]`
3. Repeat forward for all subsequent periods in the same Distributor/ZREP group

### Locked Periods (P+0, P+1, P+2)
These three periods are frozen in both Scenario Builder and Scenario Confirmation — inputs are disabled and styled gray. No edits are accepted, and the cascade never starts from a locked period.

---

## 11. Scenario Workflow (End-to-End)

```
Demand Planner                          Demand Lead
─────────────────────────────────────   ──────────────────────────────────────
1. Open Scenario Builder (/scenario)
2. Apply edits (manual / bulk / Excel)
3. Cascade auto-updates End Inv
4. Enter scenario name + reason
5. Click Save
   → POST /api/execute {action: save_scenario}
   → Written to scenarios.json (UUID, status: pending)

                                        6. Open Scenario Confirmation (/freeze)
                                        7. Select pending scenario from list
                                           → POST /api/execute {action: get_scenario_details}
                                        8. Review planner changes (gold rows)
                                        9. Optionally edit SI/IT for P+3 and beyond
                                           → Cascade updates End Inv (P) in real time
                                       10. Click Approve & Apply
                                           → POST /api/execute {action: approve_scenario}
                                           → drp.db updated via targeted SQL UPDATE statements
                                           → Inventory cascade recalculated forward
                                           → Scenario removed from scenarios.json
                                           → Data cache invalidated

11. Overview / Detailed View now reflect approved changes immediately
```

---

## 12. API Reference

**Single endpoint:**
```
POST http://localhost:8001/api/execute
Content-Type: application/json
```

### Request Shape
```json
{
  "action": "<action_name>",
  "filters": {
    "distributor": ["DIST_A"],
    "zrep": ["SKU_001"],
    "year": [2025],
    "period": [1, 2, 3]
  },
  "scenario_id": "<uuid>",
  "modifications": { "<row_key>": { "sell_in": 1000, "in_transit": 200 } },
  "name": "Scenario Name",
  "reason": "Reason text"
}
```

### Actions

| Action | Agent | Description |
|--------|-------|-------------|
| `get_filter_options` | data | Returns unique Distributor, ZREP, Year, Period values |
| `get_overview` | data | Aggregated period-level data for Overview charts/KPIs |
| `get_details` | data | Full row-level data for Detailed View table |
| `get_scenario_details` | data | Full future rows for a given scenario's affected products |
| `get_accuracy_comparison` | data | Actuals vs forecast accuracy metrics |
| `export_to_excel` | data | Returns base64-encoded Excel of filtered detail data |
| `upload_scenario_excel` | data | Parses uploaded Excel and returns parsed modifications |
| `save_scenario` | scenario | Saves a new pending scenario to `scenarios.json` |
| `get_scenarios` | scenario | Lists all pending scenarios |
| `approve_scenario` | scenario | Writes approved values to `drp.db` via SQL UPDATE, clears scenario |
| `reset_scenarios` | scenario | Wipes all scenarios (dev/testing use) |

### Error Responses

All errors return a consistent shape — handled by the global exception handler in `main.py`:

```json
{ "detail": "Human-readable error message" }
```

HTTP status codes: `400` (bad request), `404` (not found), `500` (unexpected server error).

---

## 13. Data Model

### `drp.db` — SQLite database, `demand_data` table

The database is pre-populated by `scripts/csv_to_sqlite.py` and stores canonical column names directly (no renaming needed at query time). Indexed on `(Distributor, ZREP)`, `(year, period)`, and `(Distributor, ZREP, year, period)`.

| Column (canonical) | SQLite type | Description |
|--------------------|-------------|-------------|
| `id` | INTEGER PK | Auto-increment surrogate key (dropped on load) |
| `Distributor` | TEXT | Distributor code |
| `ZREP` | TEXT | SKU/product code |
| `year` | INTEGER | Calendar year |
| `period` | INTEGER | Period number within year (1–13) |
| `Rolling_Period` | TEXT | Display label e.g. "P+3" |
| `category` | TEXT | Product category |
| `Demand_segment` | TEXT | Demand segment |
| `Planner_group` | TEXT | Planner group code |
| `Sell_In_Actuals_Qty` | REAL | Actual sell-in quantity |
| `Sell_In_Forecast_Qty` | REAL | Planned sell-in quantity |
| `Sell_Out_Actuals_Qty` | REAL | Actual sell-out (populated for past periods) |
| `Sell_Out_forecast_Qty` | REAL | Forecast sell-out quantity |
| `Sell_Out_forecast_qty_deimos` | REAL | Deimos system forecast (reference) |
| `In_transit` | REAL | Inventory in transit |
| `Beginning_inventory` | REAL | Opening inventory for the period |
| `Ending_inventory` | REAL | Closing inventory for the period |
| `Target_inventory` | REAL | Target stock level |
| `WoH_Inventory_Required` | REAL | Weeks-on-hand required |
| `price` | REAL | Unit price (used for GSV calculation) |
| `DOH` | REAL | Days-on-hand |

> `mock_data.csv` is retained in `backend/src/data/` as the migration source. Re-run `python -m scripts.csv_to_sqlite` from `backend/` to rebuild `drp.db` from scratch.

### `scenarios.json` — pending scenario store

```json
[
  {
    "id": "<uuid>",
    "name": "Scenario Name",
    "reason": "Reason text",
    "created_at": "2025-01-01T00:00:00",
    "status": "pending",
    "modifications": [
      {
        "Distributor": "DIST_A",
        "ZREP": "SKU_001",
        "year": 2025,
        "period": 5,
        "modifications": {
          "Sell_In_Forecast_Qty_Proposed": 1000.0,
          "In_transit_Proposed": 200.0
        }
      }
    ]
  }
]
```

---

## 14. Filters & Period Conventions

### Active Filters by View

| Filter | Overview | Detailed View | Scenario Builder | Scenario Confirmation |
|--------|----------|---------------|------------------|----------------------|
| Distributor | Yes | Yes | Yes | — (from scenario) |
| ZREP | Yes | Yes | Yes | — (from scenario) |
| Year | No | Yes | Yes | — |
| Period | No | Yes | — | — |
| Category | No | Yes | — | — |
| Planner Group | No | Yes | — | — |

### `period_val` Convention

| `period_val` | Meaning | Data Source |
|-------------|---------|-------------|
| < 0 | Past periods | Actuals used for Sell-Out |
| 0 | Current period | Transition point |
| 1–2 | Near-future locked | Forecast; not editable in scenarios |
| 3–12 | Editable forecast | Subject to scenario edits |

---

## 15. Extending the Application

### Add a new page/tab
1. Create `frontend/src/pages/YourPage.tsx`
2. Add a typed service function to `frontend/src/services/dashboardService.ts`
3. Add any new interfaces to `frontend/src/types/index.ts`
4. Add a `<Route>` and nav link in `frontend/src/App.tsx`
5. Restrict by persona using the `persona` value from `useAppContext()` if needed

### Add a new API action
1. Add the action name to the allowed-actions set in `backend/src/agents/data_agent.py` or `scenario_agent.py`
2. Implement the handler logic in the relevant agent file
3. If new graph state fields are needed, add them to `backend/src/state.py`
4. Wire routing in `backend/src/graph.py` if a new node is required
5. Add unit tests in `backend/tests/`

### Add a new constant
- **Backend**: Add to `backend/src/config.py`
- **Frontend periods**: Add to `frontend/src/constants/periods.ts`
- **Frontend colours**: Add to `frontend/src/constants/colors.ts`
- **Frontend app config**: Add to `frontend/src/constants/config.ts`

### Add a new filter
1. Add the filter key to `GraphState` in `state.py`
2. Apply the filter in `data_agent.py` using `FILTER_KEY_MAP` from `config.py`
3. Add a `<MultiSelect>` to the filter bar in `App.tsx` and wire it to context

---

## 16. Future: Databricks UC Integration

The current app reads from a local SQLite database (`drp.db`) and a flat JSON file (`scenarios.json`). For production deployment, replace the data layer with Databricks Unity Catalog Delta tables. **The frontend requires zero changes** — only the backend data layer is affected.

### Required Changes

| Component | Change |
|-----------|--------|
| `backend/src/tools/data_tools.py` | Replace `sqlite3.connect(DB_PATH)` + `pd.read_sql_query()` with `pd.read_sql()` via `databricks-sql-connector` |
| `backend/src/tools/scenario_tools.py` | Replace JSON file reads/writes with Delta table queries (`INSERT`, `UPDATE`, `MERGE INTO`) |
| New: `backend/db.py` | Connection singleton using env-var credentials |
| New: `backend/.env` | `DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN` (never commit) |
| `backend/requirements.txt` | Add `databricks-sql-connector`, `python-dotenv` |

### UC Tables to Create

```sql
-- Demand data (replaces mock_data.csv)
CREATE TABLE catalog.drp.demand_data (
  Distributor STRING, ZREP STRING,
  year INT, period INT, rolling_period STRING, period_val INT,
  Sell_In_Forecast_Qty DOUBLE, Sell_Out_forecast_Qty DOUBLE,
  Sell_Out_Actuals_Qty DOUBLE, Beginning_inventory DOUBLE,
  Ending_inventory DOUBLE, In_transit DOUBLE,
  Target_inventory DOUBLE, WoH_Inventory_Required DOUBLE,
  price DOUBLE, doh DOUBLE
) USING DELTA PARTITIONED BY (year, period);

-- Scenarios (replaces scenarios.json)
CREATE TABLE catalog.drp.scenarios (
  id STRING, name STRING, created_by STRING, created_at TIMESTAMP,
  status STRING, modifications STRING,  -- JSON blob
  approved_by STRING, approved_at TIMESTAMP
) USING DELTA;
```

### Environment Variables (`.env`)
```
DATABRICKS_HOST=adb-xxxx.azuredatabricks.net
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/xxxx
DATABRICKS_TOKEN=dapi...
DATABRICKS_CATALOG=prod_catalog
DATABRICKS_SCHEMA=drp
```

### Authentication Options
| Option | Use Case |
|--------|---------|
| Personal Access Token (PAT) | Development / testing |
| Service Principal (OAuth M2M) | Production — recommended for Azure Databricks |
| Databricks Connect | If running compute inside Databricks |

---

## 17. Troubleshooting

### "Failed to fetch" in browser

The backend is not running. Start it first:
```bash
cd backend
.\venv\Scripts\activate         # Windows
python -m uvicorn main:app --reload --port 8001
```

### Backend fails to install packages (Python 3.13+)

Some packages attempt to compile from source and fail without a C compiler:
```bash
pip install -r requirements.txt --prefer-binary
```

### Port already in use

Kill the existing process and restart:
```bash
# Find process using port 8001 (Windows)
netstat -ano | findstr :8001
taskkill /PID <PID> /F

# Then restart the server
python -m uvicorn main:app --reload --port 8001
```

### uvicorn not picking up code changes (Windows)

The `--reload` flag can miss changes on Windows. Kill and restart the server:
```bash
# Kill all uvicorn processes
taskkill /IM python.exe /F

# Restart cleanly
python -m uvicorn main:app --reload --port 8001
```

### Scenario changes not reflected after approval

The data cache is invalidated on approval. If stale data appears, reload the page. If the issue persists, restart the backend to force a cold cache reset.

### `drp.db` not found — backend fails to start

The SQLite database must be created before starting the backend. Run the migration from the `backend/` directory:
```bash
cd backend
.\venv\Scripts\activate         # Windows
python -m scripts.csv_to_sqlite
```
This reads `backend/src/data/mock_data.csv` and creates `backend/src/data/drp.db` (7 MB, ~5 seconds).

### Rebuild the database after CSV changes

If `mock_data.csv` is updated, regenerate `drp.db` to keep them in sync:
```bash
cd backend
python -m scripts.csv_to_sqlite   # overwrites existing drp.db
```
The backend cache is automatically invalidated on next request (mtime change detected).

### GSV values showing zero in charts

This usually means the backend process was started before the latest `data_agent.py` was saved. Restart the backend to pick up the `gsv_*` field calculations:
```bash
taskkill /IM python.exe /F
python -m uvicorn main:app --reload --port 8001
```

### Tests failing with import errors

Make sure you are running pytest from the `backend/` directory, not the project root:
```bash
cd backend
pytest tests/ -v
```

---

## License

Internal tool — CCA / Antigravity. Not for public distribution.
