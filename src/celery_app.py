"""Celery cho vòng MVP VehicSim: mỗi task = một lần chạy mô phỏng.

Chạy worker (Windows cần ``--pool=solo``)::

    uv run celery -A src.celery_app worker --pool=solo --loglevel=info

Không có result backend: kết quả ghi thẳng vào MySQL, API đọc từ đó. Task
không trả gì — nên không cần nơi lưu kết quả của Celery.

``task_time_limit`` cắt run treo (kế hoạch rủi ro §2.2.4: "kill any run that
exceeds its timeout"); ``acks_late`` để worker chết giữa chừng thì task được
giao lại — ``execute_run`` idempotent nên chạy lại an toàn.
"""

from __future__ import annotations

from celery import Celery

from src.config import get_settings

_settings = get_settings()

app = Celery("vehicsim", broker=_settings.celery_broker_url)
app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=_settings.simulation_timeout_s,
    task_soft_time_limit=max(5, _settings.simulation_timeout_s - 10),
    broker_connection_retry_on_startup=True,
    task_default_queue="vehicsim.simulation",
)


@app.task(name="vehicsim.run_simulation")
def run_simulation(run_id: int) -> None:
    from src.services.vehicsim.runs import execute_run

    execute_run(run_id)
