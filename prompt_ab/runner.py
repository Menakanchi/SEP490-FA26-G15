#!/usr/bin/env python3
"""Runner: Chạy A/B experiment với các prompt variants."""

import argparse
import json
import time
import yaml
import importlib.util
import re
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load .env
load_dotenv(Path(__file__).parent.parent / ".env")

import requests

NODES = ["parse_intent", "generate_draft", "repair_draft"]


@dataclass
class RunResult:
    """Kết quả một lần chạy."""
    case_id: int
    node: str
    variant: str
    success: bool
    output: str | None
    error: str | None
    latency_ms: float
    tokens_used: int | None
    cost_usd: float | None
    timestamp: str


def load_prompt(node: str, variant: str) -> str:
    """Load prompt từ file variant."""
    base_dir = Path(__file__).parent
    path = base_dir / "prompts" / node / f"{variant}.py"
    spec = importlib.util.spec_from_file_location(f"prompt_ab.prompts.{node}.{variant}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SYSTEM_PROMPT


def load_test_cases(node: str) -> list[dict]:
    """Load test cases từ YAML file cho một node."""
    base_dir = Path(__file__).parent
    path = base_dir / "test_cases" / f"{node}.yaml"
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data["test_cases"]


def call_llm(prompt: str, user_message: str, config: dict) -> dict:
    """Gọi LLM bằng requests."""
    api_key = os.getenv("OPENAI_API_KEY")
    model = config.get("model", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))

    if not api_key:
        return call_mock()

    return call_openai(prompt, user_message, api_key, model)


def call_openai(prompt: str, user_message: str, api_key: str, model: str) -> dict:
    """Gọi OpenAI API bằng requests."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.0,
    }

    start = time.time()
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )

    response.raise_for_status()
    data = response.json()

    latency_ms = (time.time() - start) * 1000
    usage = data.get("usage", {})
    tokens = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)

    # Cost per 1k tokens
    cost_per_1k = {
        "gpt-4o": 0.005,
        "gpt-4o-mini": 0.00015,
        "gpt-3.5-turbo": 0.0015,
        "gpt-4": 0.03,
    }.get(model, 0.001)

    cost = tokens / 1000 * cost_per_1k

    return {
        "output": data["choices"][0]["message"]["content"],
        "latency_ms": latency_ms,
        "tokens_used": tokens,
        "cost_usd": cost,
    }


def call_mock() -> dict:
    """Mock LLM call khi không có API key."""
    time.sleep(0.1)
    return {
        "output": '{"mock": true}',
        "latency_ms": 100,
        "tokens_used": 100,
        "cost_usd": 0.001,
    }


def extract_json(text: str) -> str:
    """Extract JSON từ markdown code block."""
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return match.group(0)
    return text


def build_user_message_parse_intent(case: dict) -> str:
    """Build user message cho parse_intent."""
    return case["user_input"]


def build_user_message_generate_draft(case: dict) -> str:
    """Build user message cho generate_draft."""
    lines = [
        f"Input: {case['user_query']}",
        "",
        "ODDCell:",
        f"  road_type: {case['odd_cell']['road_type']}",
        f"  weather: {case['odd_cell']['weather']}",
        f"  actor_type: {case['odd_cell']['actor_type']}",
        f"  maneuver: {case['odd_cell']['maneuver']}",
    ]
    return "\n".join(lines)


def build_user_message_repair_draft(case: dict) -> str:
    """Build user message cho repair_draft."""
    lines = [
        "Draft hiện tại (có lỗi):",
        "```json",
        json.dumps(case["invalid_draft"], indent=2, ensure_ascii=False),
        "```",
        "",
        "Các lỗi cần sửa:",
    ]
    for i, issue in enumerate(case["issues"], 1):
        lines.append(f"  {i}. {issue['code']}")
        lines.append(f"     - message: {issue['message_vi']}")
        lines.append(f"     - suggestion: {issue['suggestion']}")
    lines.append("")
    lines.append("Sửa các lỗi trên và trả về ScenarioDraft đã sửa.")
    return "\n".join(lines)


def validate_parse_intent(output: str, expected: dict) -> tuple[bool, list[str]]:
    """Validate output cho parse_intent."""
    errors = []
    json_text = extract_json(output)

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"]

    # Check actor_type - strict: both must match
    if data.get("actor_type") != expected.get("actor_type"):
        errors.append(f"actor_type mismatch")

    # Check maneuver - strict: both must match
    if data.get("maneuver") != expected.get("maneuver"):
        errors.append(f"maneuver mismatch")

    # Check road_type - strict: both must match (including null)
    if data.get("road_type") != expected.get("road_type"):
        errors.append(f"road_type mismatch")

    # Check weather - strict: both must match (including null)
    if data.get("weather") != expected.get("weather"):
        errors.append(f"weather mismatch")

    return len(errors) == 0, errors


def validate_generate_draft(output: str, expected: dict) -> tuple[bool, list[str]]:
    """Validate output cho generate_draft."""
    errors = []
    json_text = extract_json(output)

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"]

    if "actors" not in data:
        errors.append("Missing actors")
    else:
        ego_count = sum(1 for a in data["actors"] if a.get("is_ego"))
        if ego_count != 1:
            errors.append(f"Wrong ego count: {ego_count}")
        if len(data["actors"]) < 2:
            errors.append("Need at least 2 actors")

    if "maneuvers" not in data or len(data["maneuvers"]) < 1:
        errors.append("Missing maneuvers")

    # Validate against expected if provided
    if expected:
        if "odd" in data and expected.get("odd_cell"):
            odd_cell = expected["odd_cell"]
            if odd_cell.get("road_type") and data["odd"].get("road_type") != odd_cell["road_type"]:
                errors.append("odd.road_type mismatch")
            if odd_cell.get("weather") and data["odd"].get("weather") != odd_cell["weather"]:
                errors.append("odd.weather mismatch")
            if odd_cell.get("actor_type") and data["odd"].get("actor_type") != odd_cell["actor_type"]:
                errors.append("odd.actor_type mismatch")

    return len(errors) == 0, errors


def validate_repair_draft(output: str, expected_fix: dict) -> tuple[bool, list[str]]:
    """Validate output cho repair_draft."""
    errors = []
    json_text = extract_json(output)

    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"]

    if not expected_fix:
        return True, errors

    # Check s_offset_m
    if "s_offset_m" in expected_fix:
        adv = next((a for a in data.get("actors", []) if a.get("name") == "adv"), None)
        if adv:
            s_offset = adv.get("position", {}).get("s_offset_m", 0)
            if expected_fix["s_offset_m"].startswith("<"):
                threshold = float(expected_fix["s_offset_m"][1:])
                if s_offset >= threshold:
                    errors.append(f"s_offset_m should be < {threshold}, got {s_offset}")

    # Check initial_speed_kmh
    if "initial_speed_kmh" in expected_fix:
        adv = next((a for a in data.get("actors", []) if a.get("name") == "adv"), None)
        if adv:
            speed = adv.get("initial_speed_kmh", 0)
            if expected_fix["initial_speed_kmh"].startswith(">"):
                threshold = float(expected_fix["initial_speed_kmh"][1:])
                if speed <= threshold:
                    errors.append(f"initial_speed_kmh should be > {threshold}, got {speed}")

    # Check ego_count
    if expected_fix.get("ego_count") == 1:
        ego_count = sum(1 for a in data.get("actors", []) if a.get("is_ego"))
        if ego_count != 1:
            errors.append(f"Must have exactly 1 ego, got {ego_count}")

    return len(errors) == 0, errors


def run_node(node: str, variant: str, test_cases: list[dict], config: dict) -> list[RunResult]:
    """Chạy tất cả test cases cho một node với một variant."""
    prompt = load_prompt(node, variant)
    results = []

    for case in test_cases:
        try:
            if node == "parse_intent":
                user_message = build_user_message_parse_intent(case)
                expected = case["expected"]
                response = call_llm(prompt, user_message, config)
                success, errors = validate_parse_intent(response["output"], expected)

            elif node == "generate_draft":
                user_message = build_user_message_generate_draft(case)
                expected = case.get("expected", {})
                response = call_llm(prompt, user_message, config)
                success, errors = validate_generate_draft(response["output"], expected)

            elif node == "repair_draft":
                user_message = build_user_message_repair_draft(case)
                expected_fix = case.get("expected_fix", {})
                response = call_llm(prompt, user_message, config)
                success, errors = validate_repair_draft(response["output"], expected_fix)

            result = RunResult(
                case_id=case["id"],
                node=node,
                variant=variant,
                success=success,
                output=response["output"] if success else None,
                error="\n".join(errors) if errors else None,
                latency_ms=response["latency_ms"],
                tokens_used=response.get("tokens_used"),
                cost_usd=response.get("cost_usd"),
                timestamp=datetime.now().isoformat(),
            )

        except Exception as e:
            result = RunResult(
                case_id=case["id"],
                node=node,
                variant=variant,
                success=False,
                output=None,
                error=str(e),
                latency_ms=0,
                tokens_used=None,
                cost_usd=None,
                timestamp=datetime.now().isoformat(),
            )

        results.append(result)
        status = "PASS" if result.success else "FAIL"
        print(f"    Case {case['id']}: {status} ({result.latency_ms:.0f}ms)")

    return results


def save_results(results: list[RunResult], experiment_name: str):
    """Lưu kết quả vào JSON file."""
    output_dir = Path(f"prompt_ab/results/{experiment_name}")
    output_dir.mkdir(parents=True, exist_ok=True)

    by_key = {}
    for r in results:
        key = f"{r.node}_{r.variant}"
        if key not in by_key:
            by_key[key] = []
        by_key[key].append(asdict(r))

    for key, data in by_key.items():
        output_path = output_dir / f"{key}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Saved: {output_path}")

    # Get unique nodes from results
    unique_nodes = list(set(r.node for r in results))

    summary = {
        "experiment_name": experiment_name,
        "timestamp": datetime.now().isoformat(),
        "nodes": {},
    }

    for node in unique_nodes:
        summary["nodes"][node] = {}
        for variant in ["variant_A", "variant_B"]:
            node_results = [r for r in results if r.node == node and r.variant == variant]
            if node_results:
                success_count = sum(1 for r in node_results if r.success)
                total = len(node_results)
                summary["nodes"][node][variant] = {
                    "success_rate": success_count / total,
                    "avg_latency_ms": sum(r.latency_ms for r in node_results) / total,
                    "total_cost_usd": sum(r.cost_usd or 0 for r in node_results),
                }

    summary_path = output_dir / "summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {summary_path}")


def main():
    parser = argparse.ArgumentParser(description="Run A/B experiment for prompts")
    parser.add_argument("--nodes", nargs="+", default=NODES, choices=NODES)
    parser.add_argument("--variants", nargs="+", default=["variant_A", "variant_B"])
    parser.add_argument("--experiment-name", type=str, default=None)
    parser.add_argument("--model", type=str, default=None)
    args = parser.parse_args()

    experiment_name = args.experiment_name or datetime.now().strftime("%Y%m%d_%H%M%S")
    config = {"model": args.model} if args.model else {}

    print(f"\n{'='*60}")
    print(f"A/B Experiment: {experiment_name}")
    print(f"{'='*60}\n")

    all_results = []

    for node in args.nodes:
        print(f"\n### Node: {node} ###")
        test_cases = load_test_cases(node)
        print(f"  Loaded {len(test_cases)} test cases")

        for variant in args.variants:
            print(f"\n  Running variant: {variant}")
            results = run_node(node, variant, test_cases, config)
            all_results.extend(results)

    print(f"\n{'='*60}")
    print("Saving results...")
    save_results(all_results, experiment_name)

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}\n")

    unique_nodes = list(set(r.node for r in all_results))

    for node in unique_nodes:
        print(f"\n{node}:")
        for variant in args.variants:
            node_results = [r for r in all_results if r.node == node and r.variant == variant]
            if node_results:
                success_count = sum(1 for r in node_results if r.success)
                total = len(node_results)
                avg_latency = sum(r.latency_ms for r in node_results) / total
                success_rate = 100 * success_count / total
                total_cost = sum(r.cost_usd or 0 for r in node_results)
                print(f"  {variant}: {success_rate:.1f}% ({success_count}/{total}) | Avg: {avg_latency:.0f}ms | Cost: ${total_cost:.4f}")

    print(f"\nResults saved to: prompt_ab/results/{experiment_name}/")


if __name__ == "__main__":
    main()
