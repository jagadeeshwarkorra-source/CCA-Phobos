"""
Scenario agent for the CCA DRP Dashboard.

Handles all scenario lifecycle actions routed through the LangGraph:
  - save_scenario    → persist a new pending scenario (Demand Planner)
  - get_scenarios    → retrieve all pending scenarios (Demand Lead)
  - approve_scenario → apply modifications to baseline data + delete record
  - reset_scenarios  → wipe all pending scenarios (dev/testing)

All diagnostic output uses the centralised logger — never print().
"""

from ..logger import get_logger
from ..state import GraphState
from ..tools.data_tools import save_approved_data
from ..tools.scenario_tools import (
    delete_scenario,
    get_all_scenarios,
    reset_all_scenarios,
    save_scenario,
)

logger = get_logger(__name__)

_ALLOWED_ACTIONS = frozenset({"save_scenario", "get_scenarios", "approve_scenario", "reset_scenarios"})


def process_scenario_request(state: GraphState) -> GraphState:
    """
    Entry point for all scenario lifecycle actions.

    Dispatches to the appropriate scenario tool based on state["action"].
    Sets state["status"] = "success" on completion, or
    state["status"] = "failed" / state["error"] = <message> on failure.

    Args:
        state: Mutable LangGraph state dict. Expected keys per action:
          save_scenario    → scenario_name, scenario_reason, modifications
          get_scenarios    → (no extra keys required)
          approve_scenario → modifications, scenario_id
          reset_scenarios  → (no extra keys required)

    Returns:
        Updated state dict with results populated:
          save_scenario    → state["scenario_id"]
          get_scenarios    → state["scenarios"]
          approve_scenario → (writes to SQLite database, deletes scenario record)
          reset_scenarios  → (clears scenarios.json)
    """
    action = state.get("action")

    if action not in _ALLOWED_ACTIONS:
        return state

    logger.info("Processing scenario request", extra={"action": action})

    try:
        if action == "save_scenario":
            name          = state.get("scenario_name", "Untitled")
            reason        = state.get("scenario_reason", "No reason provided")
            modifications = state.get("modifications", [])
            scenario_id   = save_scenario(name, reason, modifications)
            state["scenario_id"] = scenario_id
            state["status"]      = "success"

        elif action == "get_scenarios":
            state["scenarios"] = get_all_scenarios()
            state["status"]    = "success"

        elif action == "approve_scenario":
            modifications = state.get("modifications", [])
            scenario_id   = state.get("scenario_id")
            save_approved_data(modifications)
            if scenario_id:
                delete_scenario(scenario_id)
            state["status"] = "success"
            logger.info("Scenario approved and applied", extra={"scenario_id": scenario_id})

        elif action == "reset_scenarios":
            reset_all_scenarios()
            state["status"] = "success"

    except Exception as exc:
        logger.error("Scenario request failed", extra={"action": action, "error": str(exc)})
        state["error"]  = str(exc)
        state["status"] = "failed"

    return state
