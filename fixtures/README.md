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

```bash
# terminal 1
./CarlaUE4.sh -quality-level=Low

# terminal 2
python scenario_runner.py \
    --openscenario fixtures/xosc/sample_001_cut_in.xosc \
    --json --outputDir out/
```

Toạ độ `<WorldPosition>` của `hero` là **giá trị tạm** — cách lấy số thật ghi
trong chú thích đầu file. Xe máy đặt theo vị trí *tương đối* nên chỉ phải sửa
đúng một chỗ.

Chạy hỏng cũng có ích: **thông báo lỗi là thông tin**, và nó tới ở tuần 1 chứ
không phải tuần 5. Dán lỗi vào issue.

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

## Luật

- Thêm fixture thì phải qua `pytest tests/test_fixtures.py` — test đó nạp mọi
  file JSON ở đây vào schema. Fixture hỏng bị CI chặn.
- Mọi model trong hợp đồng đặt `extra="forbid"`: **gõ sai tên trường là lỗi**,
  không phải bị bỏ qua. Trường `_comment` trong các file ở đây chỉ để cho người
  đọc, và phải được **gỡ ra trước khi validate** (test đã tự làm). Payload thật
  đi qua ranh giới máy thì không được có nó.
- Fixture là **dữ liệu mô phỏng**, không có dữ liệu cá nhân thật — đúng ràng
  buộc an toàn của đề bài. Giữ nguyên như vậy.
