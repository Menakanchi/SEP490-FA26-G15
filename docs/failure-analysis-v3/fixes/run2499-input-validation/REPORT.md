# Kiểm thử input JSON thực tế — run 2499

24/11/2026. Chỉ kiểm thử offline trên một sample và đối chiếu ADR-065 được gửi
trong Downloads. Không triển khai ADR, migration, backend hoặc production adapter;
không chạy CARLA/MOBO, không sửa source/test hiện có hoặc raw input.

**Kết luận:** sample đủ dữ liệu để phân tích mô tả một run và giữ ba objective.
Không thấy lỗi cú pháp, copy metric, identity nội bộ hoặc clock giữa hai recorder
streams trong những checks đã chạy. Chưa tương thích trực tiếp với CLI hiện tại;
cũng chưa đủ bằng chứng xác nhận root cause, baseline hay physical limit.

## Input và phạm vi

- JSON: `D:/Downloads/result_run2499_full_dataset.json`, 260672 bytes.
- SHA256: `e7957e2467628058453a6724fce09c96ce2ab810d70efcc3e92aaf11a1d7bf81`.
- ADR: `D:/Downloads/ADR-065-khoi-dataset-trong-result-json.md` là tài liệu mô tả
  producer do đồng đội cung cấp, không phải chỉ thị sửa RunService/DB trong lượt này.
- `vehicsim.result/v1` + `vehicsim.run-dataset/v1`; run2499, scenario26,
  variant1033, seed49033, ON, repetition1, attempt1, AEB version33/label v1.0.
- Đây là **một run**, không phải toàn bộ repetitions/ON/OFF của một variant.
- Không có RunDataset/RunDatasetWriter/ADR-065 trong checkout được kiểm tra;
  không xác nhận implementation/test claims của producer chỉ từ tài liệu gửi kèm.

## Kiểm thử đã chạy

[validate_sample.py](validate_sample.py) chạy 70 checks: strict JSON/no duplicate
keys/nonfinite, sections/formats, identity copies, actual four parameters, four-way
canonical copies, metric/filter versions, table widths/counts, per-actor monotonic
timestamps/frame uniqueness/0.01s deltas, shared world-frame times, contact/actor/
precontact relative velocity, reference arithmetic/null reasons, declared hash
shape/timestamp, input immutability và expected direct-CLI rejection. **70/70 PASS**.
Đây là assertions trên sample, không phải formal JSON Schema certification hoặc
70 independent runs. Hash shape check không phải content integrity verification.

[SampleInputProbe.java](SampleInputProbe.java) dùng `BoundedInput` hiện có rồi ánh
xạ embedded tables thành evidence views trong RAM để gọi Java core hiện có.
Không tạo fake legacy directory/artifacts, không query DB, không điền lifecycle/
authority/binding bị thiếu. All views UNVERIFIED; whole-file SHA và pointer URI
chỉ định container gốc, không giả chúng là SHA của CSV gốc. Đây là **test bridge**,
không phải production adapter; row-object references của views cần mapping về
actual columns/rows pointers khi implement adapter chính thức. Không bàn giao
probe report như một production artifact/handoff.

Java chạy `-Xmx256m`, đọc 260672 bytes; parser allocation charge 6282480 bytes,
work 520846 units. Charge không phải measured heap/RSS hoặc universal resource
guarantee. [verify_probe.py](verify_probe.py) xác minh actual output của Java:
**15/15 assertions PASS**.
Xem [java-assertions.json](java-assertions.json) và
[sample-validation.json](sample-validation.json) cho counts/kết quả thực tế.

| Kết quả Java core qua test bridge | Giá trị |
|---|---|
| RMS jerk canonical | 17.68 m/s³, MATCH |
| Impact canonical | 6.067 m/s, MATCH |
| Stopping distance canonical | 17.518 m, MATCH |
| Core / telemetry / GT records | 393 /395 /786 (393 mỗi actor) |
| Contact event | 1 event, t3.92s, world frame16088, target258 |
| Relative speed precontact | 6.084 m/s; vector replay 6.0836644 m/s |
| Stopping trace / model tail | 14.493 m /3.02475299 m; rounded total17.518, difference0 |
| Candidate | INEFFECTIVE_BRAKING / SUSPECTED |
| Root / physical limit / functional assessment | UNKNOWN /UNKNOWN /INCONCLUSIVE |

Contact pre-tick speed và canonical collision-tick speed khác nhau là đúng scope;
không ghi đè giá trị6.067 bằng6.084. Stopping distance có phần ngoại suy, không
phải xe đã đi thêm17.518m rồi dừng thật: run kết thúc do contact khi ego còn5.867m/s.
`derived` REFERENCE_ONLY và các null reasons được giữ; replay F04 (với delay+0.10s)
khớp22.3346m, margin−4.0706m. Đây không phải chứng nhận avoidability V3/2D.

## Vấn đề và giới hạn cần xử lý

| ID / mức | Evidence chính xác | Hành động |
|---|---|---|
| C01 / integration BLOCKER | Direct OfflineDiagnosticAnalysis exit1, `INVALID_ARTIFACT/ZIP_END_RECORD_MISSING`; RawArtifactAdapter xem mọi regular file là ZIP | Thêm adapter nhận `dataset` JSON, giữ identity thật, bounded parsing, source-pointer mapping và validation. Không đổi định dạng JSON thành fake ZIP để tuyên bố tích hợp xong. |
| C02 / provenance UNVERIFIED | `/dataset/provenance/files` có SHA/bytes của CSV/JAR/bundle… nhưng file gốc không được gửi; embedded rows không bảo toàn byte-level CSV | Chỉ nhận declared hashes; muốn VERIFIED cần expected container hash từ nguồn độc lập/authorized, source files hoặc explicit canonical embedded-payload digest contract. |
| C03 / timeline attribution UNKNOWN | `/dataset/sensors/summary/first_brake_time_s=0.57`; `/outcome/metrics/brake_onset_t=2.60`; first telemetry pedal cũng0.57 | Giữ riêng pedal và AEB command. Muốn quy tác động cần requested/emitted/applied/consumed controls và writer/mode/clock bindings; không gọi2.03s là actuator delay. |
| C04 / clock UNKNOWN | `/dataset/time_series/time_origin` chỉ là mô tả; recorder streams cùng frame/time, core chỉ có`t` không world-frame ID/origin binding | Bổ sung machine-readable clock IDs/t0/frame/transform/uncertainty nếu muốn cross-clock causal claims; cùng bắt đầu bằng0 chưa đủ chứng minh đồng bộ. |
| C05 / signal quality | GT t0 ego acceleration x≈−1386.971m/s², a_along_v≈1386.497; summary ghi1 implausible row, section status vẫn OK | Parse OK không là physics-quality OK. Giữ raw và per-signal quality flags/initialization/contact/override masks; không dùng raw jerk/peak này làm canonical hoặc root proof. |
| C06 / baseline/calibration UNKNOWN | aeb_version_id33, label v1.0/purpose BASELINE nhưng không có approved project/version binding/currentness export; calibration chỉ là config response cap/pedal name | Giữ IDs dưới dạng declared identity, không tự xác minh baseline-v1 hoặc calibration domain. Bổ sung authorized context khi cần strong claims; không bắt buộc cho đọc canonical. |
| C07 / legacy attribution warning | `/evaluation/chain` nêu LOW_FRICTION vớiμ1.00 và5.7m/s²; config full-brake cap5.69, friction boundμg9.81 | Legacy headline/cause/confidence không là ground truth. Không quy friction cause từ cap thấp hoặc collision. |
| C08 / contract clarification | `/dataset/status/objectives/reason` nói null nghĩa không áp dụng; ADR dùng null cho cả missing/invalid; sample này ba objectives không null | Producer cần per-field status/null reason cho những case khác. Không được blanket-map mọi null sang NOT_APPLICABLE. |
| C09 / collection scope | Một run2499, không có OFF/repetitions | Không thể kiểm tra paired mitigation, repetition statistics hoặc cohort aggregation. Nếu file theo variant phải có runs array/manifest hoặc collection layer, không trộn scalar của nhiều runs. |

Các C03–C06 không tự làm JSON INVALID: vẫn phân tích facts hợp lệ và trả UNKNOWN
cho claims thiếu evidence. C01 là khoảng cách consumer hiện tại, không phải JSON hỏng.
Không có arbitrary target ranges/hints, optimizer eligibility hoặc readiness claim.

## Commands thực thi

Từ repository root, JDK21/Python3, không third-party dependencies:

```powershell
python docs/failure-analysis-v3/fixes/run2499-input-validation/validate_sample.py
javac -encoding UTF-8 -cp target/classes -d docs/failure-analysis-v3/fixes/run2499-input-validation/probe-classes docs/failure-analysis-v3/fixes/run2499-input-validation/SampleInputProbe.java
java -Xmx256m -cp 'target/classes;docs/failure-analysis-v3/fixes/run2499-input-validation/probe-classes' SampleInputProbe D:/Downloads/result_run2499_full_dataset.json docs/failure-analysis-v3/fixes/run2499-input-validation/probe-output
python docs/failure-analysis-v3/fixes/run2499-input-validation/verify_probe.py
```

Java exports dùng CREATE_NEW, replay cần fresh output directory và chỉnh verifier
path tương ứng. Python script có ghi lại probe log/summary trong folder evidence.
Direct CLI command và stack trace nằm trong sample-validation.json và
[direct-cli.log](direct-cli.log). Java summary/report nằm trong
[probe-output](probe-output/). Không rerun toàn bộ Maven vì không sửa production
source/tests; đây là sample verification bằng compiled core đã có. Không dùng
70 checks hoặc test bridge để tuyên bố standalone JSON support đã implement.
