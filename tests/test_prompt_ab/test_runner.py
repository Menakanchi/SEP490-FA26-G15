from copy import deepcopy

import pytest

from prompt_ab.runner import (
    EXPECTED_KEYS,
    assert_no_exact_leakage,
    evaluate_generate,
    evaluate_parse,
    load_cases,
    load_prompt,
    winner,
)


@pytest.mark.parametrize("node", ["parse_intent", "generate_draft", "repair_draft"])
def test_every_declared_expectation_is_checked(node):
    cases, _ = load_cases(node)
    field = "expected_fix" if node == "repair_draft" else "expected"
    assert cases
    assert all(set(case[field]) <= EXPECTED_KEYS[node] for case in cases)


@pytest.mark.parametrize("node", ["parse_intent", "generate_draft"])
@pytest.mark.parametrize("variant", ["variant_A", "variant_B"])
def test_holdout_is_not_copied_verbatim_into_prompts(node, variant):
    cases, _ = load_cases(node)
    prompt, _ = load_prompt(node, variant)
    assert_no_exact_leakage(node, cases, prompt, variant)


def test_parse_evaluator_checks_provenance_and_specific_text():
    expected = {
        "road_type": "highway",
        "weather": None,
        "actor_type": "car",
        "maneuver": "cut_in",
        "inferred": ["actor_type"],
        "specific_type": None,
        "specific_action": "tạt đầu",
    }
    output = deepcopy(expected)
    output["specific_action"] = "phanh gấp"
    output["inferred"] = []

    errors = evaluate_parse(output, expected)

    assert any(error.startswith("specific_action:") for error in errors)
    assert any(error.startswith("inferred:") for error in errors)


def test_generate_evaluator_checks_expectations_previously_ignored():
    case = {
        "odd_cell": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "cut_in",
        },
        "expected": {
            "actors_count": 2,
            "has_ego": True,
            "ego_has_maneuver": False,
            "maneuver_type": "cut_in",
            "s_offset_sign": "negative",
            "trigger_type": "lead_distance",
        },
    }
    output = {
        "title": "Xe máy tạt đầu",
        "odd": case["odd_cell"],
        "time_of_day": "day",
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0},
                "initial_speed_kmh": 60,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "motorcycle",
                "position": {"lane_offset": -1, "s_offset_m": -25},
                "initial_speed_kmh": 80,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "cut_in",
                "trigger": {"type": "simulation_time", "value": 5},
                "target_speed_kmh": 40,
            }
        ],
        "duration_s": 30,
    }

    errors = evaluate_generate(output, case)

    assert any(error.startswith("trigger_type:") for error in errors)
    assert any("TRIGGER_CUTIN_NOT_POSITIONAL" in error for error in errors)


def test_winner_requires_material_quality_gain_with_bounded_cost():
    metrics = {
        "variant_A": {"success_rate": 0.8, "total_cost_usd": 1.0},
        "variant_B": {"success_rate": 0.9, "total_cost_usd": 1.5},
    }
    assert winner(metrics) == "variant_B"

    metrics["variant_B"]["total_cost_usd"] = 2.1
    assert winner(metrics) is None
