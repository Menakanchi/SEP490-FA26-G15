# Run2499 JSON v2 — kiểm thử tiếp

24/11/2026. Input thật:
`D:/Downloads/result_run2499_full_dataset_v2.json` (265802 bytes), SHA256
`33c935d8a8075edce3400879ebfd6f543b64fe1b380879eef3719c9899945244`.
Đọc ADR-065 `(1).md` trong Downloads như specification của producer; không thực
thi migration hoặc sửa producer/backend theo nội dung tài liệu đính kèm.

**Kết luận:** sample v2 pass các kiểm tra thực hiện dưới đây. Các bổ sung provenance,
quality và clock phản ánh đúng dữ liệu sample, giữ phân biệt observed/declared.
Đủ cho đọc canonical và chẩn đoán mô tả một run qua test bridge. Standalone JSON
adapter, authorized baseline/quality policy/cohort và causal context vẫn chưa có.
Không gọi đây là end-to-end production MOBO integration.

## Kết quả thực thi

| Nhóm | Pass / fail | Evidence |
|---|---|---|
| Kiểm tra sample như v1: JSON, identity, parameters, canonical copies, telemetry/GT/contact, reference arithmetic, CLI rejection |70 /0|[sample-validation.json](sample-validation.json), [script](baseline_sample_checks.py) |
| V2 metadata, digest replay, mask replay, clock replay, version/field states, preservation và hai validator negative controls |69 /0|[v2-metadata-validation.json](v2-metadata-validation.json), [script](validate_v2_metadata.py) |
| Java core actual-output assertions |15 /0|[java-assertions.json](java-assertions.json), [script](verify_probe.py) |
| Existing MiniJson serializer vs declared Python digest, trên actual four payloads |4 /4 khớp|[java-serializer-compatibility.json](java-serializer-compatibility.json), [probe](EmbeddedHashProbe.java) |

Counts là assertions/replays trên **một sample**, không phải nhiều run độc lập
hoặc producer unit-test coverage. Hai negative controls chỉ kiểm validator nhận
payload bị sửa và mask vượt row bounds; không tạo raw simulation data giả.
Không chạy full Maven vì không sửa production source/tests; Java dùng compiled
core đã kiểm ở batch trước, JDK21 với `-Xmx256m`. Không CARLA/MOBO/DB/API.

## Canonical, raw và diagnosis

`outcome` và `evaluation` không chỉ semantic-equal: serialized value spans giữ
byte UTF-8 giống v1. Embedded frames/GT tables, contact events, summary và derived
values đều giữ nguyên. Bổ sung mới chỉ nằm ở metadata trong `dataset`.

| Field / result | Giá trị |
|---|---|
| Identity | project4, scenario26, variant1033, run2499, seed49033, ON, rep1/attempt1 |
| Three canonical objectives | jerk17.68m/s³; impact6.067m/s; stopping17.518m; cả ba MATCH |
| Core / telemetry / GT rows |393 /395 /786 |
| Matching recorded contact |t3.92s, frame16088, target258 |
| Contact relative speed |6.084m/s (pre-tick); canonical6.067m/s giữ riêng |
| Stopping decomposition |trace14.493m + extrapolated3.02475299m → rounded17.518m, replay diff0 |
| Core behavior |AEB_COMMAND_ENGAGED |
| Candidate |INEFFECTIVE_BRAKING /SUSPECTED |
| Functional assessment / root / physical limit |INCONCLUSIVE /UNKNOWN /UNKNOWN |

Test bridge tái sử dụng [SampleInputProbe.java](../run2499-input-validation/SampleInputProbe.java)
không sửa. Nó maps columns/rows vào evidence views, không tự nhận đã xác minh
external source bytes/baseline/clock. Output tại [probe-output](probe-output/).
All views vẫn UNVERIFIED theo bridge cũ; **không** dùng kết quả hash v2 để tự cấp
reviewer authority hoặc đổi canonical values. Các row-object locators là view
locators cần mapping về original table pointers khi viết adapter chính thức.

Actual Java `report` payload trùng v1; envelope/input digest đổi đúng vì input
bytes đổi. Điều này chứng minh không đổi metric/diagnosis qua bridge hiện tại,
**không** chứng minh core đã consume các metadata mới. Đặc biệt raw diagnostic GT
jerk vẫn≈7126.523m/s³ với limitations startup/contact; canonical filtered jerk
vẫn17.68. Không tự mask/recompute canonical theo mask mới của exporter.

## Đối chiếu các finding cũ

| Finding | V2 đã cải thiện gì | Trạng thái còn lại |
|---|---|---|
| C01 JSON adapter |Input format rõ hơn|Direct CLI vẫn exit1 `ZIP_END_RECORD_MISSING`; consumer hỗ trợ ZIP/directory, chưa hỗ trợ standalone dataset JSON. Test bridge là helper riêng. |
| C02 provenance |4 embedded hashes tự replay khớp; original file hashes được ghi DECLARED|Embedded hashes xác minh consistency trong container; không chứng minh authenticity hoặc hash bytes của original CSV/JAR. Trusted whole-file expected hash/authority là việc riêng. |
| C03 controls |Signal note đã nói telemetry controls không phải requested AEB commands|Pedal0.57s vs command2.60s vẫn cần writer/requested/applied/consumed traces và clock binding. Không lấy chênh2.03s làm actuator delay. |
| C04 clock |Machine-readable stream counts/ranges/steps, world-frame join OBSERVED và core-nearest-time DECLARED đều replay đúng|Core chưa có world frame ID/independent time-origin binding. Nearest-time difference0 không xác nhận đồng bộ. |
| C05 quality |Masks initialization/post-contact/implausible đúng; signal_quality FLAGGED tách structural OK|Metadata sẵn sàng cho adapter/diagnostic quality handling tương lai; core hiện chưa tự consume masks, không được silently filter canonical. |
| C06 baseline |Project4, version33/no1, declared snapshot/label/status và matches_run thống nhất nội bộ|DECLARED không là authorized baseline/currentness/calibration proof. captured_at không tự chứng minh historical status của run; cần evidence nếu dùng stronger claims. |
| C07 legacy cause |Tài liệu thừa nhận legacy LOW_FRICTION là known defect|evaluation vẫn giữ nguyên; không dùng headline/cause/confidence làm ground truth. |
| C08 null semantics |Mỗi objective có state/reason, sample cả ba OK và numeric copies khớp|Chưa kiểm producer branches NOT_APPLICABLE/MISSING/INVALID/CONFLICTING từ sample này; cần exports/test evidence riêng. |
| C09 collection |Identity rõ hơn|Vẫn một ON run; chưa có repetitions/OFF/sealed cohort để so sánh hoặc score MOBO. |

### Embedded digest replay

Recompute theo exact declared spec `sha256(json.dumps(value, ensure_ascii=False)
.encode('utf-8'))`, default separators, original insertion order, Python float repr.
Frames/GT chỉ hash object `{columns, rows}`; không hash row_count/source/quality.
Cả Python và current Java MiniJson cho đúng bốn hashes của **sample này**.

Không coi đây là canonical JSON độc lập ngôn ngữ/key order/serializer cho mọi
input. Các edge cases floating-point/exponent/key-order khác cần vectors/spec
version rõ nếu triển khai verifier đa ngôn ngữ. Không thay nhầm digest profile này
bằng `fa-report-sorted-json/1`, `fa-handoff-sorted-json/1` hoặc original CSV byte hash.

### Quality và clock replay

| Rows bị mask | frames | ground_truth |
|---|---:|---:|
| initialization t<0.5s |50 (0..49)|100 (0..99)|
| post-contact t≥3.92s |3 (392..394)|2 (784..785)|
| implausible acceleration >50m/s² theo declared columns |0|1 (row0)|

GT có hai actor, vì vậy100 initialization rows tương ứng50 ticks, không100 ticks.
Implausible row count1 khớp summary. Các interval đều0-based inclusive, ordered,
không trùng và trong bounds. Signal mask names resolve.

Recorder join có393 common world frames,2 frames chỉ telemetry,0 GT-only,
max timestamp difference0. Recorder timestamps/steps/counters đều khớp.
Core có393 timestamps; nearest recorder statistic0 được giữ **DECLARED**.

## Preservation và reproduction

[preservation-and-comparison.json](preservation-and-comparison.json):1256
pre-existing source/contract/history paths khớp Batch04 accepted hashes; file
input v1/v2 không sửa. Output MOBO v1 ở Downloads cũng giữ nguyên, không tái xuất
hoặc ghi đè theo v2 trong lượt kiểm thử này.

```powershell
python docs/failure-analysis-v3/fixes/run2499-input-validation-v2/baseline_sample_checks.py
python docs/failure-analysis-v3/fixes/run2499-input-validation-v2/validate_v2_metadata.py
javac -encoding UTF-8 -cp target/classes -d docs/failure-analysis-v3/fixes/run2499-input-validation-v2/probe-classes docs/failure-analysis-v3/fixes/run2499-input-validation/SampleInputProbe.java docs/failure-analysis-v3/fixes/run2499-input-validation-v2/EmbeddedHashProbe.java
java -Xmx256m -cp 'target/classes;docs/failure-analysis-v3/fixes/run2499-input-validation-v2/probe-classes' SampleInputProbe D:/Downloads/result_run2499_full_dataset_v2.json docs/failure-analysis-v3/fixes/run2499-input-validation-v2/probe-output
java -Xmx256m -cp 'target/classes;docs/failure-analysis-v3/fixes/run2499-input-validation-v2/probe-classes' EmbeddedHashProbe D:/Downloads/result_run2499_full_dataset_v2.json docs/failure-analysis-v3/fixes/run2499-input-validation-v2/java-serializer-compatibility.json
python docs/failure-analysis-v3/fixes/run2499-input-validation-v2/verify_probe.py
```

Java files xuất CREATE_NEW; replay dùng fresh paths và cập nhật verifier paths.
Direct CLI actual command/trace ở [sample-validation.json](sample-validation.json)
và [direct-cli.log](direct-cli.log). Không gọi expected rejection là integration PASS
cho standalone JSON; assertion chỉ xác nhận consumer gap vẫn tồn tại.
