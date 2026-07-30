# fixtures/ — dữ liệu mẫu để bốn nhánh làm việc song song

Mục đích: **không ai phải chờ ai.** Mỗi người code dựa trên file ở đây thay vì
chờ phần của người khác xong, và thay vì đoán hình dạng dữ liệu.

Hình dạng chuẩn nằm ở `src/models/schemas.py`. Fixture nào lệch schema là
**fixture sai**, không phải schema sai.

## Ai dùng cái gì

| Thư mục | Ai cần | Làm được gì mà không cần chờ ai |
|---|---|---|
| `xosc/` | **Tuấn Anh** | Chạy ScenarioRunner ngay hôm nay, không cần LLM/converter/backend |
| `scenario_specs/` | **Linh Đan** | Viết prompt + eval, test converter, seed thư viện |
| `invalid_drafts/` | **Tuấn Anh** | Viết `static_check.py` — có sẵn cả input lẫn đáp án |
| `execution_results/` | **Chi** | Dựng UI trên JSON tĩnh, không cần backend chạy |

## `invalid_drafts/` — bộ đề cho `static_check.py`

Một validator chỉ có fixture **đúng** thì không chứng minh được gì: hàm
`return []` cũng cho pass. Thư mục này là 12 kịch bản **sai**, mỗi file tự khai
nó sai code gì và ai phải bắt được:

```json
{
  "_comment": "vì sao case này nguy hiểm",
  "caught_by": "pydantic" | "static_check",
  "expected_codes": ["GEOM_NO_CATCHUP"],
  "draft": { ... hình dạng ScenarioDraft, không có scenario_id ... }
}
```

| `caught_by` | Số file | Ai bắt |
|---|---|---|
| `pydantic` | 9 | `ScenarioDraft.model_validate()` — **đã chạy hôm nay** |
| `static_check` | 3 | `services/carla/static_check.py` — **chưa ai viết** |

Ba file `static_check` là phần đáng đọc nhất: chúng **hợp lệ hoàn toàn về
schema**. Chạy trót lọt, `success=true`, và không có gì xảy ra — loại hỏng tệ
nhất vì nó trông y hệt thành công. Đúng loại lỗi ADR-010 nói *"cách duy nhất để
phát hiện là chạy sim và ngồi nhìn"*, và là lý do static validator tồn tại.

Viết xong `static_check.py` thì sửa `test_geometry_bugs_pass_schema_and_need_static_check`
trong `tests/test_fixtures.py` thành assert hàm trả đúng `expected_codes`. Bộ đề
đã có sẵn, không phải nghĩ ra ca test nữa.

Thêm case mới: đặt code vào `IssueCode` trong `schemas.py` trước, rồi mới thêm
file — test canh chuyện đó, vì code là khoá gom nhóm cho failure analysis W5.

## `xosc/sample_001_cut_in.xosc` — chạy trước, hỏi sau

File `.xosc` **viết tay**, không do converter sinh. Nó tồn tại để trả lời câu hỏi
rủi ro dài nhất của dự án — *"CARLA có chạy trên máy Tuấn Anh không?"* — bằng
một file, thay vì bằng ba tuần chờ converter.

✅ **Đã chạy được thật ngày 31/7** — CARLA 0.9.15 (server Windows/RTX 4060) +
ScenarioRunner v0.9.15 (client WSL2, Python 3.10). Quy trình đã kiểm chứng:

```bash
# terminal 1 — KHÔNG dùng -quality-level=Low, xem cảnh báo dưới
./CarlaUE4.sh -carla-rpc-port=2000 -windowed -ResX=640 -ResY=480

# terminal 2
export PYTHONPATH=$CARLA_ROOT/PythonAPI/carla:$PWD
python scenario_runner.py \
    --openscenario fixtures/xosc/sample_001_cut_in.xosc \
    --json --outputDir out/
```

> ### ⚠ `-quality-level=Low` làm **server** sập trên Town04
>
> ```
> EXCEPTION_ACCESS_VIOLATION
> FLandscapeRenderSystem::FGetSectionLODBiasesTask::AnyThreadTask()
> ```
>
> Low quality bỏ tải vật liệu landscape trong khi tác vụ tính LOD vẫn trỏ vào nó.
> Triệu chứng dễ đọc nhầm: **client segfault** còn server thì chết sau — trông
> như lỗi client. Bỏ cờ đó ra là hết.

Môi trường worker (`worker/.venv`, Python 3.10):

```bash
uv venv --python 3.10 worker/.venv
uv pip install --python worker/.venv/bin/python "carla==0.9.15" "setuptools<81" \
    "py-trees==0.8.3" networkx shapely xmlschema numpy psutil ephem tabulate \
    six simple-watchdog-timer "antlr4-python3-runtime==4.10" matplotlib graphviz
```

`setuptools<81` là bắt buộc: ScenarioRunner `import pkg_resources`, mà setuptools
81 đã bỏ module đó.

Toạ độ `<WorldPosition>` của `hero` **không còn là giá trị tạm** — đã chốt
Town04 road=41 lane=-3 và đo lại: xe máy nằm lệch ngang −3.50 m (trái), lệch dọc
−25.00 m (sau). Ba bẫy của ScenarioRunner mà converter phải theo được ghi trong
chú thích đầu file `.xosc` và ở
[ADR-012](../docs/adr/ADR-012-converter-dung-relativelaneposition.md).

File này cũng là **đích của converter**: bài test đầu tiên của `converter.py` là
`convert(scenario_specs/sc_001.json)` phải ra đúng nó.

## `execution_results/` — ba file này là một bài học

Đọc cả ba theo thứ tự, vì chúng dạy đúng chỗ dễ hiểu ngược nhất trong dự án:

| File | `success` | `CollisionTest` | Nghĩa |
|---|---|---|---|
| `sc_001_success_with_collision` | `true` | `FAILURE` | **Tốt nhất.** Chạy được + dựng được nguy hiểm |
| `sc_002_success_no_collision` | `true` | `SUCCESS` | Chạy được nhưng **vô dụng** |
| `sc_003_failed` | `false` | *(rỗng)* | **Hỏng thật.** Chỉ file này bị trừ điểm |

> ### `CollisionTest: FAILURE` là TIN TỐT
>
> Chữ `FAILURE` là góc nhìn của **xe đang bị test** ("xe này trượt bài kiểm tra
> va chạm"), không phải góc nhìn của Forge ("kịch bản của tôi hỏng").
>
> Forge sinh ra kịch bản **nguy hiểm**. Chạy xong mà không va chạm gì thì kịch
> bản có thể vô dụng.
>
> Hai trục hoàn toàn tách rời:
> - `success` → kịch bản **chạy được** không → vào **validity rate**
> - `criteria_results` → kịch bản **tái hiện đúng nguy hiểm** không → vào **adversarial_found**
>
> Hạng mục "Săn lỗi xe tự hành" có ngưỡng `adversarial_found >= 3`, và con số đó
> **chính là đếm số kịch bản làm ego va chạm**. Hiểu ngược ở đây là cả đội đi
> tối thiểu hoá đúng cái đáng lẽ phải tối đa hoá.

Dùng `ExecutionResult.had_collision` để đếm adversarial. **Đừng đọc `success`.**

> ### ⚠ Bẫy cho `worker/runner.py` — đo được ngày 31/7
>
> JSON mà ScenarioRunner xuất ra **cũng có** một trường tên `success`, nhưng nó
> mang nghĩa **KHÁC HẲN** `ExecutionResult.success`:
>
> ```json
> // ScenarioRunner xuất — lần chạy TỐT NHẤT của Forge
> {"success": false,                                    // ← AND của mọi criteria
>  "criteria": [{"name": "CollisionTest", "actual": 1, "success": false}, ...]}
> ```
>
> `success: false` ở đây chỉ có nghĩa *"có tiêu chí không đạt"* — mà tiêu chí
> không đạt chính là **va chạm đã xảy ra**, tức là kịch bản THÀNH CÔNG.
>
> | Trường | Nghĩa |
> |---|---|
> | `ExecutionResult.success` (`plan.md` §4) | ScenarioRunner **chạy xong**, không crash/timeout/lỗi XML |
> | `success` trong JSON của ScenarioRunner | mọi criteria đều đạt |
>
> **Chép thẳng trường này sang `ExecutionResult.success` là hỏng cả hai số liệu
> nộp bài cùng lúc:** mọi kịch bản dựng được va chạm sẽ bị đếm là "chạy hỏng",
> kéo tụt validity rate, đồng thời `adversarial_found` mất luôn.
>
> `runner.py` phải map:
> ```python
> success = (proc.returncode == 0 and json_file_exists)   # KHÔNG phải data["success"]
> criteria_results = data["criteria"]
> ```

## Luật

- Thêm fixture thì phải qua `pytest tests/test_fixtures.py` — test đó nạp mọi
  file JSON ở đây vào schema. Fixture hỏng bị CI chặn.
- Mọi model trong hợp đồng đặt `extra="forbid"`: **gõ sai tên trường là lỗi**,
  không phải bị bỏ qua. Trường `_comment` trong các file ở đây chỉ để cho người
  đọc, và phải được **gỡ ra trước khi validate** (test đã tự làm). Payload thật
  đi qua ranh giới máy thì không được có nó.
- Fixture là **dữ liệu mô phỏng**, không có dữ liệu cá nhân thật — đúng ràng
  buộc an toàn của đề bài. Giữ nguyên như vậy.
