# ADR-002: Hai môi trường Python tách rời — `src/` 3.11, `worker/` theo ràng buộc của wheel CARLA

**Ngày:** 2026-07-28
**Trạng thái:** Accepted — *con số version chờ đo, xem mục "Số liệu cần điền"*

## Bối cảnh

Template của chương trình dựng trên **Python 3.11** (Dockerfile, CI, `scripts/setup.sh`). Đổi template sang version cũ hơn nghĩa là mất tương thích với CI có sẵn và với phần lớn thư viện hiện đại (LangGraph, pydantic v2).

Gói `carla` phân phối dưới dạng **pre-built wheel** biên dịch cho một số version Python cố định — bản 0.9.15 nhắm 3.7/3.8. ScenarioRunner tự nó chỉ cần ≥3.8, nhưng nó `import carla`, nên **nút thắt thật sự là wheel CARLA**, không phải ScenarioRunner.

Không thể có một venv duy nhất vừa chạy được template 3.11 vừa `import carla`.

## Các lựa chọn

### Lựa chọn 1: Hạ toàn bộ dự án xuống version của wheel CARLA
- Ưu: một venv duy nhất, không có ranh giới nào phải quản lý.
- Nhược: phải sửa Dockerfile/CI của template; nhiều thư viện AI hiện đại không hỗ trợ; kéo cả 3 người không liên quan tới CARLA vào ràng buộc của CARLA.

### Lựa chọn 2: Tự build `carla` từ nguồn cho Python 3.11
- Ưu: giữ được một venv.
- Nhược: build CARLA từ nguồn mất nhiều giờ đến nhiều ngày, dễ hỏng, và người thực hiện là thành viên yếu nhất về kỹ thuật. Rủi ro không tương xứng.

### Lựa chọn 3: Hai venv tách rời, giao tiếp qua HTTP
- Ưu: `src/` giữ nguyên 3.11 theo template; ràng buộc CARLA bị nhốt trong `worker/`; ranh giới trùng luôn với ranh giới GPU của ADR-001.
- Nhược: hai project/lockfile; không share code Python trực tiếp giữa hai bên.

## Quyết định

**Lựa chọn 3.**

- `src/` = **Python 3.11**, `pyproject.toml` + `uv.lock` ở root.
- `worker/` = **venv riêng**, version theo đúng ràng buộc của wheel CARLA được chọn, `worker/pyproject.toml` + `worker/uv.lock`.
- Một venv duy nhất dùng chung cho cả CARLA và ScenarioRunner (chúng cùng ràng buộc).
- `src/` **không bao giờ** `import carla`. `worker/` **không bao giờ** được `src/` import.
- Giao tiếp duy nhất là HTTP job queue của ADR-001, payload là `xosc_content` (chuỗi XML) — worker không cần biết `ScenarioSpec`.

## Lý do

1. Ràng buộc version là **đặc tính của CARLA**, không phải của dự án. Nhốt nó vào đúng module cần nó là cách cô lập rẻ nhất.
2. Ba trong bốn thành viên không đụng CARLA. Không có lý do gì bắt họ chịu ràng buộc đó.
3. Quyết định này **không phụ thuộc vào con số thật là 3.7 hay 3.8** — kiến trúc đúng ở cả hai trường hợp. Nên chốt được ngay, không phải chờ đo.
4. Payload là XML string chứ không phải object Python ⇒ không cần chia sẻ schema giữa hai venv ⇒ không có nguy cơ lệch version pydantic giữa hai bên.

## Số liệu cần điền

| Cần đo | Hạn | Kết quả |
|---|---|---|
| Version thật của wheel `carla` được chọn | T3 28/7 | ✅ **0.9.15** từ PyPI |
| Version Python của venv `worker/` | T3 28/7 | ✅ **3.10** — wheel có cp37/38/39/**310** |
| VRAM tiêu thụ khi chạy Town04, 640×480 | T3 28/7 | ✅ **~2.9 GB / 8.2 GB** |

**Đo ngày 31/7.** Ràng buộc **lỏng hơn** giả định ban đầu: đầu ADR này ghi
*"0.9.15 → 3.7/3.8"*, nhưng PyPI có sẵn `carla-0.9.15-cp310-manylinux_2_27_x86_64.whl`
và nó `import` chạy thật. Nghĩa là **không cần deadsnakes PPA**, không cần build
từ nguồn — `uv venv --python 3.10` là đủ. Quyết định hai venv giữ nguyên; chỉ con
số đổi từ 3.8 lên 3.10.

⚠ Một ràng buộc **không** nằm trong dự đoán: ScenarioRunner `import pkg_resources`,
mà `setuptools>=81` đã bỏ module đó. Phải ghim **`setuptools<81`** trong venv worker.

**Không điền bằng phỏng đoán.** Nếu con số khác dự kiến, quyết định kiến trúc ở trên vẫn giữ nguyên — chỉ đổi số trong `worker/pyproject.toml` rồi cập nhật lockfile.

## Hệ quả

- Hai project/lockfile, hai lệnh đồng bộ, hai lần dựng môi trường.
- Không thể share helper Python giữa `src/` và `worker/`. Nếu có logic dùng chung, chép lại — chép 20 dòng rẻ hơn dựng package chung cho hai runtime.
- `converter.py` **phải** nằm ở `src/` (Python 3.11) chứ không phải `worker/`, vì nó thuần `xml.etree` và không cần CARLA. Xem `plan.md` §2 mục Converter.
- CI chỉ chạy test cho `src/`. Test của `worker/` chạy tay trên máy có CARLA và ghi kết quả vào `eval/results/`.
