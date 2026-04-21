from typing import TypedDict, Optional, List, Dict, Any

class FilterState(TypedDict, total=False):
    Distributor: List[str]
    ZREP: List[str]
    Year: List[int]
    Period: List[int]
    Category: List[str]
    Planner_group: List[str]

class ScenarioModification(TypedDict):
    Sell_In_Forecast_Qty_Proposed: Optional[float]
    In_transit_Proposed: Optional[float]

class GraphState(TypedDict):
    action: str  # "get_overview", "get_details", "save_scenario", "get_scenarios", "approve_scenario", "reset_scenarios"
    filters: Optional[FilterState]
    scenario_id: Optional[str]
    scenario_name: Optional[str]
    scenario_reason: Optional[str]
    modifications: Optional[List[Dict[str, Any]]] # [{Distributor, ZREP, Year, Period, modifications: ScenarioModification}]
    is_scenario: Optional[bool]
    excel_file: Optional[str] # base64 string
    
    # Results
    data: Optional[List[Dict[str, Any]]]
    overview_summary: Optional[Dict[str, Any]]
    filter_options: Optional[Dict[str, List[Any]]]
    scenarios: Optional[List[Dict[str, Any]]]
    uploaded_overrides: Optional[Dict[str, Any]]  # from upload_scenario_excel
    filename: Optional[str]    # suggested download filename
    accuracy_data: Optional[Dict[str, Any]]  # from get_accuracy_comparison
    status: Optional[str]
    error: Optional[str]
