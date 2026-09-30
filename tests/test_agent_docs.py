"""Giữ tài liệu cho agent không mục: bản đồ ngắn, link còn sống, bảng bất biến trỏ đúng test.

``AGENTS.md`` là bản đồ, không phải cẩm nang (xem chính file đó). Tài liệu chỉ có
ích cho agent khi nó đúng với repo; mấy phép kiểm dưới đây bắt những kiểu mục phổ
biến nhất: file bị đổi tên/xoá mà link còn trỏ, heading đổi làm anchor chết, test
được đổi tên mà bảng "bất biến ↔ máy kiểm" không cập nhật, ADR mới không vào mục lục.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MAX_AGENTS_LINES = 150

AGENT_DOCS = sorted(
    {
        ROOT / "AGENTS.md",
        *(ROOT / "docs" / "vehicsim").glob("*.md"),
        *(ROOT / "docs" / "exec-plans").rglob("*.md"),
        *(ROOT / "docs" / "adr").glob("ADR-02[3-9]-*.md"),
    }
)

_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
_TEST_REF = re.compile(r"`(test_[a-z0-9_]+)`")
_TEST_DEF = re.compile(r"^\s*(?:async\s+)?def\s+(test_[a-z0-9_]+)", re.MULTILINE)


def _slug(heading: str) -> str:
    """Anchor kiểu GitHub: chữ thường, bỏ dấu câu, khoảng trắng → '-'. Giữ chữ có dấu."""
    return re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")


def _anchors(path: Path) -> set[str]:
    return {
        _slug(m.group(1)) for m in re.finditer(r"^#{1,6}\s+(.+?)\s*$", path.read_text(encoding="utf-8"), re.MULTILINE)
    }


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def test_agents_md_stays_a_map_not_a_manual() -> None:
    lines = (ROOT / "AGENTS.md").read_text(encoding="utf-8").count("\n")
    assert lines <= MAX_AGENTS_LINES, (
        f"AGENTS.md có {lines} dòng (> {MAX_AGENTS_LINES}). Chuyển chi tiết sang docs/ và chỉ để link ở đây."
    )


@pytest.mark.parametrize("doc", AGENT_DOCS, ids=_rel)
def test_relative_links_and_anchors_resolve(doc: Path) -> None:
    broken = []
    for target in _LINK.findall(doc.read_text(encoding="utf-8")):
        if re.match(r"^[a-z]+:", target):  # http:, https:, mailto:
            continue
        file_part, _, anchor = target.partition("#")
        dest = (doc.parent / file_part).resolve() if file_part else doc
        if not dest.exists():
            broken.append(f"{target} (không có file)")
        elif anchor and dest.is_file() and anchor.lower() not in _anchors(dest):
            broken.append(f"{target} (không có heading #{anchor})")
    assert not broken, f"{_rel(doc)} có link chết: {broken}"


def test_every_test_named_in_agent_docs_exists() -> None:
    defined = set()
    for path in (ROOT / "tests").rglob("*.py"):
        defined |= set(_TEST_DEF.findall(path.read_text(encoding="utf-8")))
    missing = {
        f"{_rel(doc)}: {name}"
        for doc in AGENT_DOCS
        for name in _TEST_REF.findall(doc.read_text(encoding="utf-8"))
        if name not in defined
    }
    assert not missing, f"Tài liệu nhắc tới test không còn tồn tại (đổi tên thì sửa tài liệu): {sorted(missing)}"


def test_every_adr_file_is_listed_in_the_index() -> None:
    index = (ROOT / "docs" / "adr" / "README.md").read_text(encoding="utf-8")
    unlisted = [p.name for p in sorted((ROOT / "docs" / "adr").glob("ADR-*.md")) if f"({p.name})" not in index]
    assert not unlisted, f"ADR chưa có trong docs/adr/README.md: {unlisted}"
