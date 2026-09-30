"""AEB versions (FE-11, bản tối thiểu cho vòng MVP): tạo cấu hình ứng viên.

Ứng viên luôn sinh từ một version cha (``parent_version_id``), chép đủ 10 tham số
rồi ghi đè các giá trị được đổi — nên mọi version luôn có đủ bộ tham số, và mọi
giá trị phải nằm trong ``[min_value, max_value]`` của ``aeb_parameters`` (đó cũng
là không gian tìm kiếm của optimization sau này).
"""

from __future__ import annotations

from sqlalchemy import func, insert, select

from src.services.vehicsim import tables as t
from src.services.vehicsim.common import InvalidRequestError, NotFoundError, aeb_values, engine, now


def create_candidate(
    *,
    project_id: int,
    user_id: int,
    parent_version_id: int,
    values: dict[str, float],
    label: str | None = None,
    notes: str | None = None,
) -> int:
    with engine().begin() as conn:
        parent = conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.id == parent_version_id)).first()
        if parent is None:
            raise NotFoundError("parent AEB version")
        system = conn.execute(select(t.aeb_systems).where(t.aeb_systems.c.id == parent.aeb_system_id)).first()
        if system is None or system.project_id != project_id:
            raise NotFoundError("AEB system")
        catalog = {p.code: p for p in conn.execute(select(t.aeb_parameters)).all()}
        unknown = sorted(set(values) - set(catalog))
        if unknown:
            raise InvalidRequestError(f"tham số không tồn tại: {unknown}")
        for code, value in values.items():
            p = catalog[code]
            if not float(p.min_value) <= float(value) <= float(p.max_value):
                raise InvalidRequestError(
                    f"{code} = {value} ngoài khoảng [{float(p.min_value)}, {float(p.max_value)}] {p.unit}"
                )
        merged = {**aeb_values(conn, parent.id), **{k: float(v) for k, v in values.items()}}
        if merged == aeb_values(conn, parent.id):
            raise InvalidRequestError("ứng viên phải khác version cha ít nhất một tham số")

        next_number = (
            conn.execute(
                select(func.max(t.aeb_versions.c.version_number)).where(t.aeb_versions.c.aeb_system_id == system.id)
            ).scalar()
            or 0
        ) + 1
        version_id = int(
            conn.execute(
                insert(t.aeb_versions).values(
                    aeb_system_id=system.id,
                    version_number=next_number,
                    label=(label or "").strip() or f"v{next_number}",
                    source="MANUAL",
                    status="CANDIDATE",
                    parent_version_id=parent.id,
                    notes=(notes or "").strip() or None,
                    created_by=user_id,
                    created_at=now(),
                )
            ).inserted_primary_key[0]
        )
        conn.execute(
            insert(t.aeb_parameter_values),
            [
                {"aeb_version_id": version_id, "aeb_parameter_id": catalog[code].id, "value": value}
                for code, value in merged.items()
            ],
        )
    return version_id
