"""Probe tay: chạy node 1 (`parse_intent`) rồi node 2 (`retrieve`) trên một câu.

Không phải test — `parse_intent` có thể gọi LLM khi rule không đọc đủ trục bắt
buộc. Chạy bằng tay:

    .venv/bin/python scratch/probe_node1_node2.py "câu tiếng Việt cần thử"

Node 2 chạy với retriever rỗng: probe này soi hình dạng output của hai node,
không soi chất lượng retrieval — muốn cái đó thì xem
`scratch/probe_retrieved_examples.py` (chạy trên DB thật).
"""

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

from src.agents.nodes.parse_intent import parse_intent_node  # noqa: E402
from src.agents.nodes.retrieve import retrieve_node  # noqa: E402
from src.services.library.retriever import BaseRetriever  # noqa: E402

DEFAULT_QUERY = "ô tô chặn đầu xe máy trên cao tốc"


class EmptyRetriever(BaseRetriever):
    """Trả rỗng, không đụng DB — node 2 phải sống được với thư viện trống."""

    def retrieve(self, query_text: str, odd_query: Any = None, limit: int = 3) -> list[dict]:
        return []


def main() -> int:
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    state: dict = {"user_query": query}

    print(f"=== NODE 1: parse_intent === {query!r}")
    res1 = parse_intent_node(state)
    print("parsed_intent:", json.dumps(res1.get("parsed_intent"), indent=2, ensure_ascii=False))
    print("odd_query:", res1.get("odd_query"))
    print("odd_hints:", res1.get("odd_hints"))
    print("actors:", res1.get("actors"))
    print("assumptions:", res1.get("assumptions"))

    issues = res1.get("issues") or []
    print("issues:", [(i.code, i.message_vi) for i in issues])
    if issues:
        # Có issue ở node 1 nghĩa là graph thật sẽ dừng sớm; node 2 vẫn chạy
        # được nên cứ chạy tiếp, chỉ cần biết là đang chạy ngoài luồng bình thường.
        print("(node 1 có issue — graph thật sẽ dừng trước khi tới node 2)")

    state.update(res1)

    print("\n=== NODE 2: retrieve (EmptyRetriever) ===")
    res2 = retrieve_node(state, retriever=EmptyRetriever())
    print("output keys:", list(res2.keys()))
    print("retrieved_examples:", res2.get("retrieved_examples"))
    print("examples:", res2.get("examples"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
