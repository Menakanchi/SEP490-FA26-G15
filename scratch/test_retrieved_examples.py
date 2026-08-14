import sys
sys.path.insert(0, ".")

import asyncio
import json

sys.stdout.reconfigure(encoding="utf-8")

from src.api.routes import (
    GenerateRequest,
    _generation_requests,
    _run_mock_workflow,
    _scenarios,
    generate,
)


async def main():
    prompt = "xe trộn bê tông đang lùi chậm vào công trình"
    body = GenerateRequest(prompt=prompt)
    res = await generate(body)
    await _run_mock_workflow(res.request_id)

    req = _generation_requests[res.request_id]
    sc_id = req["scenario_id"]
    scenario = _scenarios[sc_id]

    print("=== ODD FIELD ===")
    print(json.dumps(scenario["odd"], indent=2, ensure_ascii=False))

    print("=== RETRIEVED EXAMPLES FIELD ===")
    print(json.dumps(scenario.get("retrieved_examples", []), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
