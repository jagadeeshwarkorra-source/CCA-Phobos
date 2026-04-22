"""
CCA DRP Dashboard — FastAPI application entry point.

Exposes a single generic endpoint POST /api/execute that accepts an action
name and optional payload, runs the LangGraph agent pipeline, and returns
the resulting state as JSON.

Logging is handled by the centralised src.logger module — never print().
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from src.graph import graph
from src.logger import get_logger
from src.state import GraphState

logger = get_logger(__name__)

app = FastAPI(
    title="CCA DRP Dashboard API",
    description="Demand & Replenishment Planning backend powered by LangGraph.",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Open for the React dev server. Restrict origins in production deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────
class FilterPayload(BaseModel):
    """Optional filter selections sent from the global filter bar."""
    Distributor:   Optional[List[str]] = None
    ZREP:          Optional[List[str]] = None
    Year:          Optional[List[int]] = None
    Period:        Optional[List[int]] = None
    Category:      Optional[List[str]] = None
    Planner_group: Optional[List[str]] = None


class ActionRequest(BaseModel):
    """
    Generic request envelope for all agent actions.

    Args:
        action:          Identifies which agent handler to invoke.
        filters:         Optional global filter selections.
        scenario_name:   Name for save_scenario action.
        scenario_reason: Justification for save_scenario action.
        scenario_id:     UUID for approve_scenario action.
        modifications:   List of row-level edits for save/approve actions.
        is_scenario:     Flag for export_to_excel — selects column set.
        excel_file:      Base64-encoded XLSX for upload_scenario_excel.
    """
    action:          str
    filters:         Optional[FilterPayload]        = None
    scenario_name:   Optional[str]                  = None
    scenario_reason: Optional[str]                  = None
    scenario_id:     Optional[str]                  = None
    modifications:   Optional[List[Dict[str, Any]]] = None
    is_scenario:     Optional[bool]                 = None
    excel_file:      Optional[str]                  = None


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all handler — logs unexpected errors and returns a clean 500.

    Inputs:  Any unhandled exception reaching the ASGI layer.
    Outputs: JSON { "detail": "Internal server error" } with HTTP 500.
    """
    logger.error(
        "Unhandled exception",
        extra={"path": request.url.path, "method": request.method, "error": str(exc)},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Main endpoint ─────────────────────────────────────────────────────────────
@app.post("/api/execute")
async def execute_graph(request: ActionRequest) -> Dict[str, Any]:
    """
    Generic endpoint that triggers the LangGraph agent pipeline.

    Builds the initial GraphState from the request, invokes the compiled
    graph, and returns the full result dict as JSON.

    Args:
        request: Validated ActionRequest payload.

    Returns:
        The final LangGraph state dict (JSON-serialisable).

    Raises:
        HTTPException 500 if the graph sets status='failed' or throws.
    """
    logger.info("Incoming request", extra={"action": request.action})

    state_input: GraphState = {
        "action":            request.action,
        "filters":           request.filters.dict(exclude_none=True) if request.filters else None,
        "scenario_name":     request.scenario_name,
        "scenario_reason":   request.scenario_reason,
        "scenario_id":       request.scenario_id,
        "modifications":     request.modifications,
        "is_scenario":       request.is_scenario,
        "excel_file":        request.excel_file,
        "data":              None,
        "overview_summary":  None,
        "filter_options":    None,
        "scenarios":         None,
        "uploaded_overrides":None,
        "filename":          None,
        "status":            None,
        "error":             None,
    }

    result = graph.invoke(state_input)

    if result.get("status") == "failed":
        error_msg = result.get("error", "Unknown error")
        logger.error("Graph returned failure", extra={"action": request.action, "error": error_msg})
        raise HTTPException(status_code=500, detail=error_msg)

    logger.info("Request completed", extra={"action": request.action, "status": result.get("status")})
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
