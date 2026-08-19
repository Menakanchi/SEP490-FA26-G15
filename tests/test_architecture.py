"""Bất biến kiến trúc, ép bằng CI thay vì bằng luật trong tài liệu.

Đây là chỗ để **luật không phụ thuộc vào việc ai nhớ nó**. Một dòng tài liệu
viết *"không được import cái này"* chỉ có tác dụng tới lúc người đọc nó đi ngủ;
một test đỏ thì chặn merge.

Phân biệt rõ với tài liệu phân công: tài liệu nói **ai đang làm gì** — mềm, đổi
được bất cứ lúc nào. File này nói **cái gì không được phép xảy ra** — cứng, và
mỗi dòng đều trỏ về một ADR. Đổi luật ở đây thì phải đổi ADR trước.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).parent.parent / "src"


def _imports(path: Path) -> set[str]:
    """Tên module được import trong một file. Dùng AST, không grep.

    Grep sẽ dính cả chữ ``carla`` trong comment và trong docstring — mà file
    ``schemas.py`` nói về CARLA suốt. Chỉ ``import`` thật mới tính.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def _py_files(*parts: str) -> list[Path]:
    root = SRC.joinpath(*parts)
    return sorted(p for p in root.rglob("*.py") if "__pycache__" not in p.parts) if root.exists() else []


@pytest.mark.parametrize("path", _py_files(), ids=lambda p: str(p.relative_to(SRC)))
def test_src_never_imports_carla(path: Path) -> None:
    """ADR-001. Vi phạm = backend không deploy được = mất Deliverable #5.

    Hỏng theo kiểu tệ nhất: máy dev có CARLA nên chạy ngon, chỉ chết trên Render
    — nơi không ai nhìn cho tới lúc demo.
    """
    offenders = {m for m in _imports(path) if m == "carla" or m.startswith("carla.")}
    assert not offenders, f"{path.relative_to(SRC)} import {offenders} — ADR-001 cấm, CARLA chỉ ở worker/"


@pytest.mark.parametrize("path", _py_files("api"), ids=lambda p: str(p.relative_to(SRC)))
def test_http_layer_does_not_query_storage_directly(path: Path) -> None:
    """Router là **lớp HTTP**, logic lưu trữ và tìm kiếm nằm ở ``services/``.

    ADR-013 bỏ Qdrant và đưa embedding vào chính SQLite, nên ranh giới cần canh
    đổi từ *"đừng import qdrant"* sang *"đừng tự mở DB và tự tính cosine"*. Nếu
    router tự query thì cách tìm kiếm bị nhân đôi ở hai chỗ, và người đổi thuật
    toán retrieval sẽ sửa một chỗ rồi tưởng xong.
    """
    banned = {"sqlite3", "sqlalchemy", "numpy"}
    offenders = {m for m in _imports(path) if m.split(".")[0] in banned}
    assert not offenders, f"{path.relative_to(SRC)} import {offenders} — gọi hàm trong services/ thay vì tự query"


def test_only_three_nodes_are_allowed_to_call_an_llm() -> None:
    """`ARCHITECTURE.md` §"Workflow 7 nodes" + ADR-007: đúng 3 node gọi LLM,
    phần còn lại là code thuần.

    Đây là bằng chứng PLO1/PLO2 **kiểm được bằng máy**, không phải một câu
    khẳng định trong slide. Node thứ tư lặng lẽ gọi LLM là trần chi phí và trần
    p95 latency mất hiệu lực mà không ai thấy.
    """
    allowed = {"parse_intent", "generate_draft", "repair_draft"}
    guilty = {
        p.stem
        for p in _py_files("agents", "nodes")
        if p.stem != "__init__" and any(m.endswith("services.llm") for m in _imports(p))
    }
    assert guilty <= allowed, (
        f"node không được gọi LLM: {sorted(guilty - allowed)} — xem ARCHITECTURE.md §Workflow 7 nodes"
    )


def test_nothing_imports_the_llm_provider_directly() -> None:
    """`ARCHITECTURE.md` §"Bất biến được kiểm bằng CI": mọi lệnh gọi LLM đi qua
    ``src/services/llm.py``.

    Đó là thứ làm *"đổi provider = đổi một biến môi trường"* thành câu nói thật
    — và là plan B khi hết quota giữa tuần demo (PRD §10, model/provider policy).
    """
    banned = ("openai", "anthropic", "litellm", "google.generativeai")
    offenders = {
        str(p.relative_to(SRC)): sorted(m for m in _imports(p) if m.split(".")[0] in {b.split(".")[0] for b in banned})
        for p in _py_files()
        if p != SRC / "services" / "llm.py"
    }
    offenders = {k: v for k, v in offenders.items() if v}
    assert not offenders, f"gọi provider thẳng: {offenders} — phải đi qua services/llm.py"


def test_installed_pre_push_hook_actually_calls_the_gate() -> None:
    """Hook đã cài phải gọi ``scripts/pre_push_check.sh``.

    ``.git/hooks/`` **không** được track, nên một commit sửa
    ``scripts/setup_hooks.sh`` không tự cập nhật hook trên máy ai cả. Đúng chỗ
    đó đã hỏng một lần: gate được thêm vào setup script ở #37 (14/8) nhưng
    không ai chạy lại nó, nên hook trên máy dev vẫn là bản 29/7 kết thúc bằng
    ``exit 0``. Gate im lặng không chạy suốt hai tuần và một lỗi format lọt vào
    ``services/library/retriever.py`` ở #52 (16/8).

    Comment cảnh báo trong hai setup script là cần, nhưng không đủ: kiểu hỏng
    này im lặng, và không ai đọc comment của một file mình không mở. Test thì
    chạy kể cả khi hook hỏng — đó là toàn bộ lý do nó nằm ở đây.

    ``skip`` khi chưa có hook: CI và máy vừa clone chưa chạy ``setup_hooks.sh``
    là chuyện bình thường, đỏ vì lý do đó chỉ dạy người ta bỏ qua test.
    """
    git_dir = Path(__file__).parent.parent / ".git"
    if not git_dir.is_dir():
        pytest.skip("không phải checkout git thường (worktree/submodule) — bỏ qua")

    hook = git_dir / "hooks" / "pre-push"
    if not hook.exists():
        pytest.skip("chưa cài hook — chạy: bash scripts/setup_hooks.sh")

    body = hook.read_text(encoding="utf-8", errors="replace")
    assert "pre_push_check.sh" in body, (
        "hook pre-push đã cài nhưng KHÔNG gọi scripts/pre_push_check.sh — "
        "hook cũ còn sót lại. Cài lại: bash scripts/setup_hooks.sh"
    )
