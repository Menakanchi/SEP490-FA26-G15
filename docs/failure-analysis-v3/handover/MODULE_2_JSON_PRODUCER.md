# Module2 → Module3: xuất kết quả JSON CARLA

Bạn sở hữu việc chạy CARLA/ghi kết quả. Module3 sở hữu việc đọc evidence, chẩn đoán
và xuất handoff; không chạy lại simulator, không sửa AEB và không xác nhận nguyên
nhân từ legacy evaluator. Đọc kèm [mapping từng field](../json-input-integration/INPUT_CONTRACT_MAPPING.md).

## Hai input đang hỗ trợ thật

| Input | Hình dạng bắt buộc | Mẫu thật đi kèm |
|---|---|---|
| Một run | `format=vehicsim.result/v1`, có `dataset.format=vehicsim.run-dataset/v1` | [run2499 v2](examples/inputs/result_run2499_full_dataset_v2.json) |
| Collection | `format=vehicsim.run-collection/v1`, `runs[{run_id,result}]`, manifest và document digest profile | [variant1033 ON/OFF](examples/inputs/vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json) |

Standalone v1 cũ và cả ba collection1032/1033/1034 đều có trong examples/inputs.
Đây là byte-identical copies của file người dùng gửi, không phải dữ liệu dựng lại.
[INPUT_PROVENANCE.json](examples/INPUT_PROVENANCE.json) ghi hash/path gốc.
ADR-065 bản đồng đội gửi được giữ tại
[producer-contract/ADR-065-supplied.md](producer-contract/ADR-065-supplied.md);
đó là hợp đồng nguồn cung cấp, chưa chứng minh producer đang deploy đúng revision.
Các link tương đối trong bản ADR nguyên văn thuộc cây tài liệu producer gốc.

## Checklist trước khi gửi file

1. Giữ nguyên outcome/evaluation và raw sensor values. Không tính lại ba objective
   trong exporter để ép hai copy khớp; disagreement phải hiện ra.
2. Identity: positive run_id, variant_id=scenario_version_id, seed nguyên,
   simulator, ON/OFF và repetition/attempt dương. So source/dataset/wrapper/manifest
   copies. Không gộp hai run cùng variant/seed, không thay attempt bằng vị trí list.
3. Config: bốn giá trị thực `TTC_THRESHOLD`, `BRAKE_ACTIVATION_DELAY`,
   `MAX_DECELERATION`, `BRAKE_BUILDUP_RATE` trong dataset.config.aeb.params;
   phải khớp outcome.params với mapping trong contract. Gửi configured values,
   không gọi chúng là achieved deceleration/physical delay.
4. Canonical metrics: outcome.metrics và evaluation.aeb_result cùng ba keys
   rms_jerk_mps3, impact_speed_mps, stopping_distance_m. Giữ number/null; dataset
   objective mirror có value/evaluation_value/state/reason/source/version.
5. Nhúng **nội dung** bảng frames và ground_truth: columns, rows và row_count.
   Mỗi row có đúng số cells; tên cột không trùng. Frames phải có frame/sim_time_s;
   GT thêm actor_id/role và các vector/pose đã thu được. Chỉ gửi row count hoặc
   summary không đủ để phân tích physical evidence.
6. Contact: giữ events riêng, gồm actor/frame/time/precontact refs/speed/impulse
   khi có. Event[] không bằng đã chứng minh không contact; impulse0 vẫn có thể
   là contact. Không sửa canonical collision từ array length.
7. Tách core timestamps, recorder timestamps/world frame và GT. Nếu core chưa có
   independent frame binding thì alignment=DECLARED, không tự nói OBSERVED.
   Không coi first pedal activity là AEB-issued command.
8. Provenance: source revision, simulator/core/worker versions/hashes khi có;
   original-file hashes phải ghi DECLARED khi chưa đối chiếu bytes. Embedded
   digest là consistency check riêng. Thiếu để null + reason, không bịa revision.
9. Quality/masks: giữ startup/contact spikes, raw values và masks/caveats. Không
   lọc GT/IMU rồi gán số đó thành canonical jerk. derived.d_* chỉ REFERENCE_ONLY.
10. Collection manifest phải bao phủ mọi delivered member; document_sha256 phải
    tính theo profile khai báo, không tự sort keys/đổi separators. Báo rõ sealed,
    selection và excluded runs; export hoàn tất không tự là reviewed/frozen cohort.

Current supported digest profile là SHA256 của UTF-8
`Python json.dumps(value, ensure_ascii=False)` với default separators và float
representation của profile này. Document payload là toàn result member; table
payload là `{columns,rows}`, không bao gồm row_count/source metadata. Đừng nhầm
hash này với bytes của CSV gốc hoặc container file. Đổi profile/version phải được
giao hợp đồng mới, không giữ version cũ rồi đổi nghĩa.

## Các nghĩa vật lý cần giữ

- RMS jerk CARLA profile hiện hành: core ego_a, đúng Butterworth6 mỗi pass
  forward/backward10Hz, window T_AEB→end; raw-GT/IMU jerk là signal khác.
- Canonical impact hiện hành là relative speed tại core termination/collision
  tick; sensor precontact relative speed là evidence riêng, không ép bằng nhau.
- Stopping distance gồm core projected trace + model tail theo producer vintage;
  không gọi total là đã đo trọn quãng dừng. Không contact thì physical impact
  null;0 chỉ thuộc valid canonical aggregate contribution.
- OFF có thể có shadow detection/decision, không biến thành AEB thật đã phanh.

## Tự kiểm thử và diễn giải lỗi

Chạy [runbook](RUNBOOK.md) với file mới và output directory mới. Chỉ cần JDK21 +
repo đã compile, không cần DB/CARLA. Xem diagnostics/_input_manifest.json trước:
COMPLETE chỉ có nghĩa delivered manifest members được hạch toán đủ. PARTIAL/
BLOCKED phải sửa input hoặc giữ blocked reason; không bỏ member để xuất score đẹp.
Handoff từ population thiếu sẽ bị chặn.

Missing optional sensor/calibration/clock/baseline evidence có thể vẫn cho report
ANALYZED_PARTIAL/UNKNOWN; điều đó không đồng nghĩa exporter hỏng. Invalid schema,
duplicate ID, inconsistent identity/digest hoặc resource limit là vấn đề intake.
Default file/member bound8MiB (heap-aware),256runs,128columns,20000rows/table,
60000records/run. Không silent truncate để qua gate; chia collection có manifest
rõ hoặc bàn chính sách limit với module3.

## Dữ liệu cần phối hợp tiếp

Để phân tích nguyên nhân/physical guarantees cần aligned emitted/applied/consumed
command trace, writer IDs, validated geometry/calibration/coverage và approved
requirements. Để operational MOBO cần binding/version/currentness, frozen split,
canonical sample provenance và approved quality/domain. Không phải cứ thêm ID33
hay label v1.0 vào JSON là module3 được xác nhận baseline. Owner/chi tiết ở
[remaining dependencies](../json-input-integration/REMAINING_DEPENDENCIES.md).
