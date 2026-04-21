"""
Unit tests for src/tools/scenario_tools.py

Tests validate behaviour of scenario CRUD operations against a temp file.

Run with:  pytest backend/tests/ -v
"""

import json
import os
from unittest.mock import patch

import pytest


@pytest.fixture
def scenarios_file(tmp_path):
    """Provide a temp scenarios.json path and patch the module constant."""
    path = str(tmp_path / "scenarios.json")
    with patch("src.tools.scenario_tools.SCENARIOS_PATH", path), \
         patch("src.tools.data_tools.SCENARIOS_PATH", path):
        yield path


class TestGetAllScenarios:
    """Tests for get_all_scenarios()."""

    def test_returns_empty_list_when_file_absent(self, tmp_path):
        """Should return [] gracefully when scenarios.json does not exist."""
        missing = str(tmp_path / "does_not_exist.json")
        with patch("src.tools.scenario_tools.SCENARIOS_PATH", missing):
            from src.tools.scenario_tools import get_all_scenarios
            assert get_all_scenarios() == []

    def test_returns_empty_list_on_corrupt_json(self, tmp_path):
        """Should return [] and not raise when file contains invalid JSON."""
        bad = tmp_path / "scenarios.json"
        bad.write_text("NOT JSON")
        with patch("src.tools.scenario_tools.SCENARIOS_PATH", str(bad)):
            from src.tools.scenario_tools import get_all_scenarios
            assert get_all_scenarios() == []

    def test_returns_saved_scenarios(self, scenarios_file):
        """Should return the list written to the file."""
        data = [{"id": "abc", "name": "Test", "reason": "R", "modifications": [], "status": "pending"}]
        with open(scenarios_file, "w") as f:
            json.dump(data, f)
        from src.tools.scenario_tools import get_all_scenarios
        result = get_all_scenarios()
        assert len(result) == 1
        assert result[0]["id"] == "abc"


class TestSaveScenario:
    """Tests for save_scenario()."""

    def test_returns_uuid_string(self, scenarios_file):
        """save_scenario() must return a non-empty UUID string."""
        from src.tools.scenario_tools import save_scenario
        sid = save_scenario("My Scenario", "Because", [])
        assert isinstance(sid, str)
        assert len(sid) > 0

    def test_scenario_persisted_to_file(self, scenarios_file):
        """Saved scenario must appear in the JSON file."""
        from src.tools.scenario_tools import save_scenario
        sid = save_scenario("Test", "Reason", [{"row": 1}])
        with open(scenarios_file) as f:
            data = json.load(f)
        assert any(s["id"] == sid for s in data)

    def test_multiple_scenarios_accumulate(self, scenarios_file):
        """Calling save_scenario twice should produce two records, not overwrite."""
        from src.tools.scenario_tools import save_scenario
        save_scenario("S1", "R1", [])
        save_scenario("S2", "R2", [])
        with open(scenarios_file) as f:
            data = json.load(f)
        assert len(data) == 2


class TestDeleteScenario:
    """Tests for delete_scenario()."""

    def test_removes_by_id(self, scenarios_file):
        """delete_scenario() should remove exactly the matching record."""
        from src.tools.scenario_tools import save_scenario, delete_scenario, get_all_scenarios
        sid = save_scenario("To Delete", "R", [])
        delete_scenario(sid)
        remaining = get_all_scenarios()
        assert all(s["id"] != sid for s in remaining)

    def test_returns_false_when_not_found(self, scenarios_file):
        """delete_scenario() with a non-existent ID should return False."""
        with open(scenarios_file, "w") as f:
            json.dump([], f)
        from src.tools.scenario_tools import delete_scenario
        result = delete_scenario("non-existent-id")
        assert result is False


class TestResetAllScenarios:
    """Tests for reset_all_scenarios()."""

    def test_clears_all_records(self, scenarios_file):
        """reset_all_scenarios() should leave an empty list in the file."""
        from src.tools.scenario_tools import save_scenario, reset_all_scenarios, get_all_scenarios
        save_scenario("S1", "R", [])
        save_scenario("S2", "R", [])
        reset_all_scenarios()
        assert get_all_scenarios() == []
