"""
Scenario persistence utilities for the CCA DRP Dashboard.

Responsibilities:
  - Read/write scenarios.json (UUID-keyed list of pending scenario dicts).
  - Each scenario record contains: id, name, reason, modifications, status.

All file I/O uses the path from src.config — no hardcoded paths here.
All diagnostic output uses the centralised logger — never print().
"""

import json
import os
import uuid
from typing import Any, Dict, List

from .data_tools import SCENARIOS_PATH  # re-exported path constant
from ..logger import get_logger

logger = get_logger(__name__)


def get_all_scenarios() -> List[Dict[str, Any]]:
    """
    Read all pending scenario records from scenarios.json.

    Returns:
        List of scenario dicts. Returns [] if the file is absent or corrupt.
    """
    if not os.path.exists(SCENARIOS_PATH):
        logger.debug("Scenarios file absent; returning empty list")
        return []
    try:
        with open(SCENARIOS_PATH, "r") as fh:
            scenarios = json.load(fh)
        logger.debug("Scenarios loaded", extra={"count": len(scenarios)})
        return scenarios
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read scenarios file", extra={"error": str(exc)})
        return []


def save_scenario(name: str, reason: str, modifications: List[Dict[str, Any]]) -> str:
    """
    Persist a new pending scenario and return its UUID.

    Args:
        name:          Human-readable scenario name supplied by the planner.
        reason:        Business justification for the scenario.
        modifications: List of row-level modification dicts.

    Returns:
        The UUID string assigned to the new scenario.
    """
    scenarios = get_all_scenarios()

    scenario_id = str(uuid.uuid4())
    scenario: Dict[str, Any] = {
        "id":            scenario_id,
        "name":          name,
        "reason":        reason,
        "modifications": modifications,
        "status":        "pending",
    }

    scenarios.append(scenario)

    with open(SCENARIOS_PATH, "w") as fh:
        json.dump(scenarios, fh, indent=2)

    logger.info("Scenario saved", extra={"id": scenario_id, "scenario_name": name, "modifications": len(modifications)})
    return scenario_id


def delete_scenario(scenario_id: str) -> bool:
    """
    Remove a single scenario record by ID (called after approval).

    Args:
        scenario_id: UUID of the scenario to remove.

    Returns:
        True if the write succeeded; False if the ID was not found.
    """
    scenarios = get_all_scenarios()
    filtered  = [s for s in scenarios if s["id"] != scenario_id]

    if len(filtered) == len(scenarios):
        logger.warning("Scenario not found for deletion", extra={"id": scenario_id})
        return False

    with open(SCENARIOS_PATH, "w") as fh:
        json.dump(filtered, fh, indent=2)

    logger.info("Scenario deleted", extra={"id": scenario_id})
    return True


def reset_all_scenarios() -> bool:
    """
    Wipe all pending scenarios from scenarios.json (dev/testing utility).

    Returns:
        True on success.
    """
    with open(SCENARIOS_PATH, "w") as fh:
        json.dump([], fh)

    logger.info("All scenarios reset")
    return True
