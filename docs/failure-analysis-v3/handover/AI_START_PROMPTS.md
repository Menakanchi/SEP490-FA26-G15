# Prompt khởi đầu cho AI của đồng đội

Đổi task cụ thể phía cuối trước khi dùng. Các prompt này hướng AI đọc đúng source
và ranh giới, không tự cho phép triển khai M2/DB/CARLA campaign.

## Đồng đội2 — producer

```text
Repo SEP490-FA26-G15. Tôi làm module2, xuất kết quả JSON sau CARLA cho module3.
Đọc AGENTS.md/CLAUDE.md ở repo, docs/failure-analysis-v3/README.md,
handover/MODULE_2_JSON_PRODUCER.md, handover/ARCHITECTURE_AND_STATUS.md và
json-input-integration/INPUT_CONTRACT_MAPPING.md.
Đối chiếu JsonInputAdapter/EvidenceValidator/CanonicalObjectiveReader thật,
hai standalone và ba collection trong handover/examples/inputs.
Contract ADR-065 được gửi kèm là design/source declaration; xác minh producer
source/deployed revision của tôi riêng, không mặc định đã deploy.
Giữ canonical outcome/evaluation, null/reason, actor/clock/run/seed/rep/ONOFF.
Không sửa công thức/module3 để làm input sai pass; không fake baseline/hash.
Dùng runbook và actual bundled-input tests; báo missing evidence/consumer blockers
riêng với lỗi schema/exporter. Không tự chạy CARLA/DB nếu task chưa yêu cầu.
Task cụ thể của tôi: [điền thay đổi exporter hoặc bước tích hợp cần thực hiện].
```

## Đồng đội4 — consumer

```text
Repo SEP490-FA26-G15. Tôi làm module4, tiếp nhận handoff.json từ Failure Analysis.
Đọc repo AGENTS/CLAUDE, docs/failure-analysis-v3/README.md,
handover/MODULE_4_MOBO_CONSUMER.md, handover/ARCHITECTURE_AND_STATUS.md,
MOBO_HANDOFF_CONTRACT_V1.md, M2_CHANGE_PLAN.md và actual example handoffs.
Đọc MoboHandoffBuilder/CanonicalAggregation/ConsumerCompatibilityValidator và
OptimizationController/OptimizationService/MoboEngine/MoboTrial/ParameterBounds/
RegressionService source hiện tại; không suy từ tên DTO hoặc status JSON.
Samples là output thật nhưng NOT_DIRECTLY_CONSUMABLE/dispatch=false có chủ đích.
Không đổi cờ true, fake score/partition/range hay gửi diagnostic JSON vào GP.
Giữ full run/variant/seed/rep identity, canonical adr040-stored-aggregation/1,
null/NA counts, frozen cohort và sealed validation. Dùng typed3scalars chỉ từ
completed candidate observations đã được bind/gate; baseline không là trial0.
Hãy nêu phần parser/schema đã làm và phần consumer execution/enforcement còn thiếu.
Chỉ triển khai thay đổi consumer trong task tôi giao, không tự sửa GP/controller/
simulator/calibration/database hoặc chạy campaign ngoài scope.
Task cụ thể của tôi: [điền import/read-only validation hoặc authorized M2 scope].
```
