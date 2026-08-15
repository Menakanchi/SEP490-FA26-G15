from langgraph.graph import END, StateGraph

from src.agents.nodes.convert_xosc_node import convert_xosc_node
from src.agents.nodes.example_node import analyze_node, respond_node
from src.agents.nodes.persist_node import persist_pending_review_node
from src.agents.state import AgentState, ForgeState
from src.models.schemas import IssueSeverity
from src.services.persistence import ScenarioRepository


def should_continue(state: AgentState) -> str:
    """Route based on whether an error occurred during analysis."""
    if state.get("error"):
        return END
    return "respond"


def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("analyze", analyze_node)
    graph.add_node("respond", respond_node)

    # Add edges
    graph.set_entry_point("analyze")
    graph.add_conditional_edges("analyze", should_continue)
    graph.add_edge("respond", END)

    return graph.compile()


agent = build_graph()
"""Legacy chat-template agent used only by the current placeholder /chat API."""


def build_persistence_tail(repository: ScenarioRepository | None = None):
    """Build the durable final graph segment: convert -> persist -> END.

    The upstream parse/retrieve/generate/repair nodes are owned by separate
    tickets.  This tail is composable with them and, importantly, never waits
    for a human after persistence.
    """

    async def _persist(state: ForgeState):
        return await persist_pending_review_node(state, repository)

    def _after_convert(state: ForgeState) -> str:
        if any(issue.severity is IssueSeverity.ERROR for issue in state.get("issues", [])):
            return END
        return "persist_pending_review"

    graph = StateGraph(ForgeState)
    graph.add_node("convert_xosc", convert_xosc_node)
    graph.add_node("persist_pending_review", _persist)
    graph.set_entry_point("convert_xosc")
    graph.add_conditional_edges(
        "convert_xosc",
        _after_convert,
        {"persist_pending_review": "persist_pending_review", END: END},
    )
    graph.add_edge("persist_pending_review", END)
    return graph.compile()


forge_finalization_agent = build_persistence_tail()
"""Exported Forge graph segment; successful execution durably ends at pending_review."""
