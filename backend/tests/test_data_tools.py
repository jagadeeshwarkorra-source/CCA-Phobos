"""
Unit tests for src/tools/data_tools.py

Tests validate behaviour — not implementation details.
External dependencies (SQLite database) are mocked for load_data tests;
save_approved_data tests use a real SQLite DB in a temp directory.

Run with:  pytest backend/tests/ -v
"""

import os
import sqlite3
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_cache():
    """Clear the in-memory DataFrame cache before every test."""
    import src.tools.data_tools as dt
    dt._CACHED_DF  = None
    dt._LAST_MTIME = 0
    yield
    dt._CACHED_DF  = None
    dt._LAST_MTIME = 0


def _canonical_df() -> pd.DataFrame:
    """
    Return a small DataFrame with canonical column names, exactly as stored in
    the demand_data SQLite table (after the csv_to_sqlite migration).
    """
    return pd.DataFrame([
        {
            "Distributor": "DistA", "ZREP": "SKU-001", "year": 2026, "period": 3,
            "Rolling_Period": "P+0", "category": "CatX", "Demand_segment": "",
            "Planner_group": "PG1",
            "Sell_In_Actuals_Qty": 0.0,  "Sell_In_Forecast_Qty": 100.0,
            "Sell_Out_Actuals_Qty": 0.0, "Sell_Out_forecast_Qty": 80.0,
            "Sell_Out_forecast_qty_deimos": 0.0,
            "In_transit": 10.0, "Beginning_inventory": 200.0, "Ending_inventory": 230.0,
            "Target_inventory": 150.0, "WoH_Inventory_Required": 30.0,
            "price": 24.5, "DOH": 80.5,
        },
        {
            "Distributor": "DistA", "ZREP": "SKU-001", "year": 2026, "period": 4,
            "Rolling_Period": "P+1", "category": "CatX", "Demand_segment": "",
            "Planner_group": "PG1",
            "Sell_In_Actuals_Qty": 0.0,  "Sell_In_Forecast_Qty": 110.0,
            "Sell_Out_Actuals_Qty": 0.0, "Sell_Out_forecast_Qty": 85.0,
            "Sell_Out_forecast_qty_deimos": 0.0,
            "In_transit": 12.0, "Beginning_inventory": 230.0, "Ending_inventory": 257.0,
            "Target_inventory": 155.0, "WoH_Inventory_Required": 31.0,
            "price": 24.5, "DOH": 84.7,
        },
        {
            "Distributor": "DistB", "ZREP": "SKU-002", "year": 2026, "period": 1,
            "Rolling_Period": "P-2", "category": "CatY", "Demand_segment": "",
            "Planner_group": "PG2",
            "Sell_In_Actuals_Qty": 90.0, "Sell_In_Forecast_Qty": 90.0,
            "Sell_Out_Actuals_Qty": 75.0, "Sell_Out_forecast_Qty": 0.0,
            "Sell_Out_forecast_qty_deimos": 0.0,
            "In_transit": 5.0, "Beginning_inventory": 180.0, "Ending_inventory": 200.0,
            "Target_inventory": 140.0, "WoH_Inventory_Required": 28.0,
            "price": 30.0, "DOH": 74.7,
        },
    ])


def _create_test_db(db_path: str) -> None:
    """Create a minimal demand_data SQLite table populated with sample rows."""
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE demand_data (
            id                           INTEGER PRIMARY KEY AUTOINCREMENT,
            Distributor                  TEXT NOT NULL,
            ZREP                         TEXT NOT NULL,
            year                         INTEGER NOT NULL,
            period                       INTEGER NOT NULL,
            Rolling_Period               TEXT,
            category                     TEXT,
            Demand_segment               TEXT,
            Planner_group                TEXT,
            Sell_In_Actuals_Qty          REAL DEFAULT 0,
            Sell_In_Forecast_Qty         REAL DEFAULT 0,
            Sell_Out_Actuals_Qty         REAL DEFAULT 0,
            Sell_Out_forecast_Qty        REAL DEFAULT 0,
            Sell_Out_forecast_qty_deimos REAL DEFAULT 0,
            In_transit                   REAL DEFAULT 0,
            Beginning_inventory          REAL DEFAULT 0,
            Ending_inventory             REAL DEFAULT 0,
            Target_inventory             REAL DEFAULT 0,
            WoH_Inventory_Required       REAL DEFAULT 0,
            price                        REAL DEFAULT 0,
            DOH                          REAL DEFAULT 0
        )
    """)
    _canonical_df().to_sql("demand_data", conn, if_exists="append", index=False)
    conn.commit()
    conn.close()


# ── load_data ─────────────────────────────────────────────────────────────────

class TestLoadData:
    """Tests for load_data() — caching, canonical columns, filter application."""

    def test_returns_dataframe(self):
        """load_data() should always return a DataFrame."""
        with patch("src.tools.data_tools.pd.read_sql_query", return_value=_canonical_df()), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", return_value=1.0), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            df = load_data()
            assert isinstance(df, pd.DataFrame)
            assert len(df) > 0

    def test_canonical_columns_present(self):
        """Canonical column names must be present after load (DB stores them directly)."""
        with patch("src.tools.data_tools.pd.read_sql_query", return_value=_canonical_df()), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", return_value=1.0), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            df = load_data()
            for col in (
                "Distributor", "ZREP", "Sell_In_Forecast_Qty", "Sell_Out_forecast_Qty",
                "Sell_In_Actuals_Qty", "Sell_Out_Actuals_Qty", "Ending_inventory",
            ):
                assert col in df.columns, f"Missing canonical column: {col}"

    def test_proposed_columns_added(self):
        """load_data() must append Sell_In_Forecast_Qty_Proposed and In_transit_Proposed."""
        with patch("src.tools.data_tools.pd.read_sql_query", return_value=_canonical_df()), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", return_value=1.0), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            df = load_data()
            assert "Sell_In_Forecast_Qty_Proposed" in df.columns
            assert "In_transit_Proposed" in df.columns

    def test_filter_by_distributor(self):
        """Passing a Distributor filter should narrow rows accordingly."""
        with patch("src.tools.data_tools.pd.read_sql_query", return_value=_canonical_df()), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", return_value=1.0), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            df = load_data(filters={"Distributor": ["DistA"]})
            assert set(df["Distributor"].unique()) == {"DistA"}

    def test_cache_is_used_on_second_call(self):
        """Second call with same mtime must NOT re-query the database."""
        mock_read_sql = MagicMock(return_value=_canonical_df())
        with patch("src.tools.data_tools.pd.read_sql_query", mock_read_sql), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", return_value=1.0), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            load_data()
            load_data()
            assert mock_read_sql.call_count == 1, "DB should only be queried once when mtime is unchanged"

    def test_cache_invalidated_on_mtime_change(self):
        """When mtime changes the database must be re-queried."""
        mock_read_sql = MagicMock(return_value=_canonical_df())
        mtime_values = iter([1.0, 2.0])
        with patch("src.tools.data_tools.pd.read_sql_query", mock_read_sql), \
             patch("src.tools.data_tools.sqlite3.connect"), \
             patch("src.tools.data_tools.os.path.getmtime", side_effect=mtime_values), \
             patch("src.tools.data_tools.os.path.exists", return_value=True):
            from src.tools.data_tools import load_data
            load_data()
            load_data()
            assert mock_read_sql.call_count == 2, "DB must be re-queried when mtime changes"


# ── save_approved_data ────────────────────────────────────────────────────────

class TestSaveApprovedData:
    """Tests for save_approved_data() — modification application and cascade."""

    def test_sell_in_modification_applied(self, tmp_path):
        """save_approved_data should UPDATE Sell_In_Forecast_Qty for the matched row."""
        db_path = str(tmp_path / "drp.db")
        _create_test_db(db_path)

        modifications = [{
            "Distributor": "DistA",
            "ZREP": "SKU-001",
            "year": 2026,
            "period": 3,
            "modifications": {"Sell_In_Forecast_Qty_Proposed": 999.0},
        }]

        with patch("src.tools.data_tools.DB_PATH", db_path):
            from src.tools.data_tools import save_approved_data
            save_approved_data(modifications)

        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT Sell_In_Forecast_Qty FROM demand_data "
            "WHERE Distributor = 'DistA' AND ZREP = 'SKU-001' AND period = 3"
        ).fetchone()
        conn.close()

        assert row is not None
        assert float(row[0]) == 999.0

    def test_in_transit_modification_applied(self, tmp_path):
        """save_approved_data should UPDATE In_transit for the matched row."""
        db_path = str(tmp_path / "drp.db")
        _create_test_db(db_path)

        modifications = [{
            "Distributor": "DistB",
            "ZREP": "SKU-002",
            "year": 2026,
            "period": 1,
            "modifications": {"In_transit_Proposed": 50.0},
        }]

        with patch("src.tools.data_tools.DB_PATH", db_path):
            from src.tools.data_tools import save_approved_data
            save_approved_data(modifications)

        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT In_transit FROM demand_data "
            "WHERE Distributor = 'DistB' AND ZREP = 'SKU-002' AND period = 1"
        ).fetchone()
        conn.close()

        assert row is not None
        assert float(row[0]) == 50.0

    def test_inventory_cascade_after_sell_in_change(self, tmp_path):
        """
        After a Sell_In change at period 3, Ending_inventory for period 3
        and Beginning_inventory for period 4 must be recalculated.

        Cascade formula: End = Beg + SellIn - SellOut + InTransit
        Period 3 original: Beg=200, SellIn=100, SellOut=80, InTransit=10 → End=230
        Period 3 updated:  Beg=200, SellIn=999, SellOut=80, InTransit=10 → End=1129
        Period 4 cascade:  Beg=1129 (prev End), SellIn=110, SellOut=85, InTransit=12 → End=1166
        """
        db_path = str(tmp_path / "drp.db")
        _create_test_db(db_path)

        modifications = [{
            "Distributor": "DistA",
            "ZREP": "SKU-001",
            "year": 2026,
            "period": 3,
            "modifications": {"Sell_In_Forecast_Qty_Proposed": 999.0},
        }]

        with patch("src.tools.data_tools.DB_PATH", db_path):
            from src.tools.data_tools import save_approved_data
            save_approved_data(modifications)

        conn = sqlite3.connect(db_path)
        p3 = conn.execute(
            "SELECT Ending_inventory FROM demand_data "
            "WHERE Distributor = 'DistA' AND ZREP = 'SKU-001' AND period = 3"
        ).fetchone()
        p4 = conn.execute(
            "SELECT Beginning_inventory, Ending_inventory FROM demand_data "
            "WHERE Distributor = 'DistA' AND ZREP = 'SKU-001' AND period = 4"
        ).fetchone()
        conn.close()

        assert p3 is not None and float(p3[0]) == pytest.approx(1129.0)
        assert p4 is not None
        assert float(p4[0]) == pytest.approx(1129.0)  # Beginning_inventory cascaded
        assert float(p4[1]) == pytest.approx(1166.0)  # 1129 + 110 - 85 + 12

    def test_cache_invalidated_after_save(self, tmp_path):
        """save_approved_data must reset _CACHED_DF and _LAST_MTIME to force reload."""
        import src.tools.data_tools as dt

        db_path = str(tmp_path / "drp.db")
        _create_test_db(db_path)

        # Prime the cache with a sentinel value
        dt._CACHED_DF  = _canonical_df()
        dt._LAST_MTIME = 999.0

        modifications = [{
            "Distributor": "DistA",
            "ZREP": "SKU-001",
            "year": 2026,
            "period": 3,
            "modifications": {"Sell_In_Forecast_Qty_Proposed": 1.0},
        }]

        with patch("src.tools.data_tools.DB_PATH", db_path):
            from src.tools.data_tools import save_approved_data
            save_approved_data(modifications)

        assert dt._CACHED_DF is None
        assert dt._LAST_MTIME == 0
