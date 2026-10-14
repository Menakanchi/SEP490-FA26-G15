"""Lõi mô phỏng + chấm điểm AEB, chỉ dùng thư viện chuẩn (Python >= 3.10).

Dùng chung cho `worker/kinematic_sim.py` và `worker/run_variant.py` (CARLA): một AEB cho mọi bộ mô phỏng.
Backend Java không import file nào ở đây — nó gọi worker qua bundle JSON -> result.json (ADR-027).
"""
