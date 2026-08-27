#!/usr/bin/env python3
# ruff: noqa: E402 -- direct script execution must add the repository root before src imports
"""Reproducible prompt benchmark using production schemas and validators."""

from __future__ import annotations

import argparse
import asyncio
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import re
import statistics
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.agents.nodes.generate_draft import _build_user_content as build_generate_content
from src.agents.nodes.repair_draft import _build_user_content as build_repair_content
from src.agents.nodes.validate_node import validate_node
from src.config import get_settings
from src.models.schemas import ODDQuery, ScenarioDraft, ValidationIssue
from src.services.llm import call_with_escalation, collect_provider_metrics, summarize_provider_metrics

ROOT = PROJECT_ROOT / "prompt_ab"
NODES = ("parse_intent", "generate_draft", "repair_draft")
VARIANTS = ("variant_A", "variant_B")
EXPECTED_KEYS = {
    "parse_intent": frozenset(ODDQuery.model_fields),
    "generate_draft": frozenset(
        {"actors_count", "has_ego", "ego_has_maneuver", "maneuver_type", "s_offset_sign", "trigger_type"}
    ),
    "repair_draft": frozenset(
        {
            "s_offset_m",
            "initial_speed_kmh",
            "trigger_value",
            "trigger_type",
            "hero_has_maneuver",
            "adv_category",
            "odd_actor_type",
            "maneuver_type",
            "target_speed_lower_or_s_offset_closer",
            "target_speed_kmh",
            "trigger_time",
            "odd_unchanged",
            "ego_count",
            "has_actors",
            "has_maneuvers",
        }
    ),
}


@dataclass
class RunResult:
    case_id: int
    repeat: int
    node: str
    variant: str
    success: bool
    errors: list[str]
    output: dict[str, Any] | None
    latency_ms: float
    input_tokens: int
    output_tokens: int
    cost_usd: float
    timestamp: str


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_sha() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT.parent, check=True, capture_output=True, text=True
    ).stdout.strip()


def load_prompt(node: str, variant: str) -> tuple[str, Path]:
    if node not in NODES or variant not in VARIANTS:
        raise ValueError(f"Unsupported prompt selection: {node}/{variant}")
    path = (ROOT / "prompts" / node / f"{variant}.py").resolve()
    expected_parent = (ROOT / "prompts" / node).resolve()
    if path.parent != expected_parent or not path.is_file():
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location(f"prompt_ab_{node}_{variant}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    prompt = getattr(module, "SYSTEM_PROMPT", None)
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError(f"{path} must define a non-empty SYSTEM_PROMPT")
    return prompt, path


def load_cases(node: str) -> tuple[list[dict[str, Any]], Path]:
    path = ROOT / "holdout" / f"{node}.yaml"
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    cases = payload.get("test_cases", [])
    if not cases:
        raise ValueError(f"No holdout cases in {path}")
    expected_field = "expected_fix" if node == "repair_draft" else "expected"
    seen: set[int] = set()
    for case in cases:
        case_id = case.get("id")
        if not isinstance(case_id, int) or case_id in seen:
            raise ValueError(f"Case ids must be unique integers in {path}: {case_id!r}")
        seen.add(case_id)
        unsupported = set(case.get(expected_field, {})) - EXPECTED_KEYS[node]
        if unsupported:
            raise ValueError(f"Case {case_id} has unchecked expectations: {sorted(unsupported)}")
        try:
            if node == "parse_intent":
                ODDQuery.model_validate(case["expected"])
            elif node == "generate_draft":
                _odd_query(case["odd_cell"])
            else:
                _odd_query(case["invalid_draft"]["odd"])
                for issue in case["issues"]:
                    ValidationIssue.model_validate(issue)
        except (KeyError, ValidationError) as exc:
            raise ValueError(f"Case {case_id} has invalid production input: {exc}") from exc
    return cases, path


def assert_no_exact_leakage(node: str, cases: list[dict[str, Any]], prompt: str, variant: str) -> None:
    """Reject holdout inputs copied verbatim into a prompt's few-shot examples."""
    if node == "repair_draft":
        return
    input_key = "user_input" if node == "parse_intent" else "user_query"
    normalized_prompt = re.sub(r"\W+", " ", prompt.casefold()).strip()
    leaked = []
    for case in cases:
        normalized_input = re.sub(r"\W+", " ", case[input_key].casefold()).strip()
        if normalized_input in normalized_prompt:
            leaked.append(case["id"])
    if leaked:
        raise ValueError(f"{node}/{variant} contains holdout inputs verbatim: {leaked}")


def _odd_query(odd: dict[str, Any]) -> ODDQuery:
    return ODDQuery(**odd, inferred=[])


def _messages(node: str, prompt: str, case: dict[str, Any]) -> tuple[list[Any], type | dict[str, Any]]:
    if node == "parse_intent":
        messages = [SystemMessage(content=prompt), HumanMessage(content=f"Mô tả kịch bản: {case['user_input']}")]
        return messages, ODDQuery
    if node == "generate_draft":
        odd, _assumptions = _odd_query(case["odd_cell"]).with_defaults()
        content = build_generate_content(case["user_query"], odd, [], [], {})
        return [
            {"role": "system", "content": prompt},
            {"role": "user", "content": content},
        ], ScenarioDraft.model_json_schema()
    issues = [ValidationIssue.model_validate(issue) for issue in case["issues"]]
    content = build_repair_content(case["invalid_draft"], issues)
    return [
        {"role": "system", "content": prompt},
        {"role": "user", "content": content},
    ], ScenarioDraft.model_json_schema()


def _as_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if not isinstance(value, dict):
        raise TypeError(f"Structured output must be an object, got {type(value).__name__}")
    return value


def _compare(actual: float, expression: str | int | float) -> bool:
    if isinstance(expression, int | float):
        return actual == float(expression)
    expression = expression.strip()
    for operator in (">=", "<=", ">", "<"):
        if expression.startswith(operator):
            target = float(expression[len(operator) :].strip())
            return {">=": actual >= target, "<=": actual <= target, ">": actual > target, "<": actual < target}[
                operator
            ]
    return actual == float(expression)


def evaluate_parse(data: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    try:
        actual = ODDQuery.model_validate(data).model_dump(mode="json")
    except ValidationError as exc:
        return [f"ODDQuery schema: {exc.errors()[0]['msg']}"]
    errors = []
    for key, wanted in expected.items():
        got = actual.get(key)
        if key == "inferred":
            got, wanted = sorted(got or []), sorted(wanted or [])
        if got != wanted:
            errors.append(f"{key}: expected {wanted!r}, got {got!r}")
    return errors


async def _production_issues(data: dict[str, Any], odd: dict[str, Any]) -> list[ValidationIssue]:
    state = {"draft": data, "odd_query": _odd_query(odd), "actors": [], "kinematic_hints": {}}
    return (await validate_node(state)).get("issues", [])


def _error_issues(data: dict[str, Any], odd: dict[str, Any]) -> list[str]:
    issues = asyncio.run(_production_issues(data, odd))
    return [
        f"production validator: {issue.code.value} at {issue.path}"
        for issue in issues
        if issue.severity.value == "error"
    ]


def evaluate_generate(data: dict[str, Any], case: dict[str, Any]) -> list[str]:
    expected = case["expected"]
    try:
        draft = ScenarioDraft.model_validate(data)
    except ValidationError as exc:
        return [f"ScenarioDraft schema: {error['msg']}" for error in exc.errors()]
    errors = _error_issues(data, case["odd_cell"])
    ego = next((actor for actor in draft.actors if actor.is_ego), None)
    adversaries = [actor for actor in draft.actors if not actor.is_ego]
    primary = next((m for m in draft.maneuvers if m.maneuver.value == case["odd_cell"]["maneuver"]), None)
    checks = {
        "actors_count": len(draft.actors),
        "has_ego": ego is not None,
        "ego_has_maneuver": bool(ego and any(m.actor_name == ego.name for m in draft.maneuvers)),
        "maneuver_type": primary.maneuver.value if primary else None,
        "trigger_type": getattr(primary.trigger.type, "value", primary.trigger.type) if primary else None,
    }
    if adversaries:
        offset = adversaries[0].position.s_offset_m
        checks["s_offset_sign"] = "negative" if offset < 0 else "positive" if offset > 0 else "zero"
    for key, wanted in expected.items():
        if checks.get(key) != wanted:
            errors.append(f"{key}: expected {wanted!r}, got {checks.get(key)!r}")
    return errors


def evaluate_repair(data: dict[str, Any], case: dict[str, Any]) -> list[str]:
    try:
        draft = ScenarioDraft.model_validate(data)
    except ValidationError as exc:
        return [f"ScenarioDraft schema: {error['msg']}" for error in exc.errors()]
    invalid, expected = case["invalid_draft"], case["expected_fix"]
    errors = _error_issues(data, invalid["odd"])
    adversary = next((actor for actor in draft.actors if not actor.is_ego), None)
    hero = next((actor for actor in draft.actors if actor.name == "hero"), None)
    primary = draft.maneuvers[0] if draft.maneuvers else None
    values: dict[str, Any] = {
        "s_offset_m": adversary.position.s_offset_m if adversary else None,
        "initial_speed_kmh": adversary.initial_speed_kmh if adversary else None,
        "trigger_value": primary.trigger.value if primary else None,
        "trigger_type": getattr(primary.trigger.type, "value", primary.trigger.type) if primary else None,
        "hero_has_maneuver": bool(hero and any(m.actor_name == hero.name for m in draft.maneuvers)),
        "adv_category": adversary.category.value if adversary else None,
        "odd_actor_type": draft.odd.actor_type.value,
        "maneuver_type": primary.maneuver.value if primary else None,
        "target_speed_kmh": primary.target_speed_kmh if primary else None,
        "trigger_time": primary.trigger.value if primary else None,
        "odd_unchanged": draft.odd.model_dump(mode="json") == invalid["odd"],
        "ego_count": sum(actor.is_ego for actor in draft.actors),
        "has_actors": bool(draft.actors),
        "has_maneuvers": bool(draft.maneuvers),
    }
    for key, wanted in expected.items():
        if key == "target_speed_lower_or_s_offset_closer":
            old_adv = next((actor for actor in invalid["actors"] if not actor.get("is_ego")), None)
            old_maneuver = invalid["maneuvers"][0]
            passed = bool(
                adversary
                and primary
                and (
                    (primary.target_speed_kmh or 0) < (old_maneuver.get("target_speed_kmh") or 0)
                    or abs(adversary.position.s_offset_m) < abs(old_adv["position"]["s_offset_m"])
                )
            )
        elif key in {"s_offset_m", "initial_speed_kmh", "trigger_value", "trigger_time", "target_speed_kmh"}:
            passed = values[key] is not None and _compare(float(values[key]), wanted)
        else:
            passed = values.get(key) == wanted
        if not passed:
            errors.append(f"{key}: expected {wanted!r}, got {values.get(key)!r}")
    return errors


def evaluate(node: str, data: dict[str, Any], case: dict[str, Any]) -> list[str]:
    if node == "parse_intent":
        return evaluate_parse(data, case["expected"])
    if node == "generate_draft":
        return evaluate_generate(data, case)
    return evaluate_repair(data, case)


def run_once(node: str, variant: str, prompt: str, case: dict[str, Any], repeat: int) -> RunResult:
    started, output, errors, metrics = time.perf_counter(), None, [], {}
    try:
        messages, schema = _messages(node, prompt, case)
        with collect_provider_metrics() as events:
            result = call_with_escalation(messages, schema, operation=f"prompt_ab.{node}")
        metrics = summarize_provider_metrics(events)
        output = _as_dict(result)
        errors = evaluate(node, output, case)
    except Exception as exc:
        errors = [f"{type(exc).__name__}: {exc}"]
    return RunResult(
        case_id=case["id"],
        repeat=repeat,
        node=node,
        variant=variant,
        success=not errors,
        errors=errors,
        output=output,
        latency_ms=(time.perf_counter() - started) * 1000,
        input_tokens=int(metrics.get("input_tokens", 0)),
        output_tokens=int(metrics.get("output_tokens", 0)),
        cost_usd=float(metrics.get("cost_usd", 0.0)),
        timestamp=datetime.now(UTC).isoformat(),
    )


def aggregate(results: list[RunResult]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}
    for node in sorted({result.node for result in results}):
        grouped[node] = {}
        for variant in VARIANTS:
            selected = [result for result in results if result.node == node and result.variant == variant]
            if not selected:
                continue
            latencies = [result.latency_ms for result in selected]
            grouped[node][variant] = {
                "success_rate": sum(result.success for result in selected) / len(selected),
                "passed": sum(result.success for result in selected),
                "total": len(selected),
                "latency_median_ms": statistics.median(latencies),
                "latency_p95_ms": sorted(latencies)[max(0, int(len(latencies) * 0.95) - 1)],
                "total_cost_usd": sum(result.cost_usd for result in selected),
            }
    return grouped


def winner(metrics: dict[str, Any]) -> str | None:
    a, b = metrics.get("variant_A"), metrics.get("variant_B")
    if not a or not b:
        return None
    if b["success_rate"] - a["success_rate"] >= 0.05 and b["total_cost_usd"] <= 2 * max(a["total_cost_usd"], 1e-12):
        return "variant_B"
    if a["success_rate"] - b["success_rate"] >= 0.05 and a["total_cost_usd"] <= 2 * max(b["total_cost_usd"], 1e-12):
        return "variant_A"
    return None


def write_report(directory: Path, metadata: dict[str, Any], summary: dict[str, Any]) -> None:
    lines = [
        "# Prompt benchmark report",
        "",
        f"Commit: `{metadata['git_sha']}`",
        f"Repeats: {metadata['repeats']}",
        "",
        "| Node | A pass | B pass | A median | B median | Winner |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for node, variants in summary.items():
        a, b = variants.get("variant_A", {}), variants.get("variant_B", {})
        lines.append(
            f"| {node} | {a.get('success_rate', 0):.1%} | {b.get('success_rate', 0):.1%} | {a.get('latency_median_ms', 0):.0f} ms | {b.get('latency_median_ms', 0):.0f} ms | {winner(variants) or 'inconclusive'} |"
        )
    (directory / "REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nodes", nargs="+", choices=NODES, default=list(NODES))
    parser.add_argument("--variants", nargs="+", choices=VARIANTS, default=list(VARIANTS))
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--experiment-name", default=datetime.now(UTC).strftime("%Y%m%d_%H%M%S"))
    parser.add_argument("--model")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if args.repeats < 3:
        parser.error("--repeats must be at least 3 for a mergeable benchmark")
    if args.workers < 1 or args.workers > 8:
        parser.error("--workers must be between 1 and 8")
    if args.model:
        os.environ["MODEL_NAME"], os.environ["ESCALATED_MODEL"] = args.model, args.model
        get_settings.cache_clear()
    settings = get_settings()
    if not settings.openai_api_key.strip():
        parser.error("OPENAI_API_KEY is required; mock results are never benchmark evidence")

    prompts, files, cases_by_node = {}, {}, {}
    for node in args.nodes:
        cases_by_node[node], case_path = load_cases(node)
        files[str(case_path.relative_to(ROOT.parent))] = sha256(case_path)
        for variant in args.variants:
            prompts[node, variant], prompt_path = load_prompt(node, variant)
            assert_no_exact_leakage(node, cases_by_node[node], prompts[node, variant], variant)
            files[str(prompt_path.relative_to(ROOT.parent))] = sha256(prompt_path)
    metadata = {
        "experiment_name": args.experiment_name,
        "created_at": datetime.now(UTC).isoformat(),
        "git_sha": git_sha(),
        "primary_model": settings.model_name,
        "escalated_model": settings.escalated_model,
        "repeats": args.repeats,
        "workers": args.workers,
        "nodes": args.nodes,
        "variants": args.variants,
        "file_sha256": files,
        "winner_policy": {"minimum_quality_delta": 0.05, "maximum_cost_ratio": 2.0},
    }
    tasks = []
    for node in args.nodes:
        for variant in args.variants:
            for repeat in range(1, args.repeats + 1):
                for case in cases_by_node[node]:
                    tasks.append((node, variant, prompts[node, variant], case, repeat))
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(run_once, *task) for task in tasks]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(
                f"{result.node}/{result.variant} repeat={result.repeat} "
                f"case={result.case_id}: {'PASS' if result.success else 'FAIL'}"
            )
    results.sort(key=lambda result: (result.node, result.variant, result.repeat, result.case_id))
    output_dir = ROOT / "results" / args.experiment_name
    output_dir.mkdir(parents=True, exist_ok=False)
    summary = aggregate(results)
    payload = {"metadata": metadata, "results": [asdict(result) for result in results]}
    (output_dir / "results.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "summary.json").write_text(
        json.dumps({"metadata": metadata, "nodes": summary}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_report(output_dir, metadata, summary)
    print(f"Results written to {output_dir}")


if __name__ == "__main__":
    main()
