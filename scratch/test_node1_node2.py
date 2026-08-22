import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.agents.nodes.parse_intent import parse_intent_node
from src.agents.nodes.retrieve import retrieve_node
from src.services.library.retriever import BaseRetriever

class EmptyRetriever(BaseRetriever):
    def retrieve(self, query_text: str, odd_query: any = None, limit: int = 3) -> list[dict]:
        return []

state = {"user_query": "o to chan dau xe may"}

print("=== RUNNING NODE 1 ===")
res1 = parse_intent_node(state)
print("Node 1 parsed_intent:", res1.get("parsed_intent"))
print("Node 1 target_actors:", res1.get("target_actors"))
print("Node 1 maneuver_types:", res1.get("maneuver_types"))
print("Node 1 weather_context:", res1.get("weather_context"))

state.update(res1)

print("\n=== RUNNING NODE 2 WITH EMPTY RETRIEVER ===")
res2 = retrieve_node(state, retriever=EmptyRetriever())
print("Node 2 Output Keys:", list(res2.keys()))
print("Retrieved Examples Count:", len(res2.get("retrieved_examples", [])))
print("Retrieved Examples is list:", isinstance(res2.get("retrieved_examples"), list))
