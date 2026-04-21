from langgraph.graph import StateGraph, END
from .state import GraphState
from .agents.data_agent import process_data_request
from .agents.scenario_agent import process_scenario_request

def route_request(state: GraphState):
    action = state.get("action")
    if action in ["get_overview", "get_details", "get_filter_options", "get_scenario_details", "export_to_excel", "upload_scenario_excel", "get_accuracy_comparison"]:
        return "data_node"
    elif action in ["save_scenario", "get_scenarios", "approve_scenario", "reset_scenarios"]:
        return "scenario_node"
    return END

def create_graph():
    workflow = StateGraph(GraphState)
    
    # Add nodes
    workflow.add_node("data_node", process_data_request)
    workflow.add_node("scenario_node", process_scenario_request)
    
    # Set entry point dynamically via conditional edge
    workflow.set_conditional_entry_point(
        route_request,
        {
            "data_node": "data_node",
            "scenario_node": "scenario_node",
            END: END
        }
    )
    
    # Add edges to END
    workflow.add_edge("data_node", END)
    workflow.add_edge("scenario_node", END)
    
    return workflow.compile()

graph = create_graph()
