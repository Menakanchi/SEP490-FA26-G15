# Kiến trúc Module Tối ưu hóa Tham số AEB (Người 4 — MOBO)

## 1. Mục tiêu và phạm vi

Thành viên 4 chịu trách nhiệm chính về module tối ưu hóa đa mục tiêu bằng giải thuật Bayes (Multi-Objective Bayesian Optimization - MOBO):
* Nhận tập dữ liệu kịch bản và baseline từ Thành viên 3 (`optimization_run_ids`).
* Khởi tạo và điều phối thuật toán MOBO trong `OptimizationService.java` và lõi Java `MoboEngine.java`; worker Python chỉ là adapter CARLA.
* Quản lý không gian tìm kiếm 4 tham số AEB (`TTC_THRESHOLD`, `BRAKE_ACTIVATION_DELAY`, `BRAKE_BUILDUP_RATE`, `MAX_DECELERATION`).
* Tối thiểu hóa đồng thời 3 hàm mục tiêu: Độ giật RMS ($Jerk$), Vận tốc va chạm ($v_{\text{impact}}$), và Quãng đường dừng ($d_{\text{stop}}$).
* Trích xuất tập nghiệm Pareto Front và đề xuất ứng viên tối ưu (Candidate) cho Thành viên 5 kiểm chứng hồi quy (Regression).

```text
[Dataset kịch bản & Baseline từ Người 3]
         ↓
[MoboEngine: Khởi tạo Initial Design] (Random sampling + Deduplication)
         ↓
[Chạy kịch bản mô phỏng CARLA (OpenSCENARIO 1.0)]
         ↓
[Đo đạc 3 hàm mục tiêu qua cảm biến CARLA]
         ↓
[Cập nhật 3 Gaussian Processes + qEHVI Monte Carlo]
         ↓
[Mặt cong Pareto Front & Ứng viên Candidate]
         ↓
[Bàn giao cho Người 5 phê duyệt hồi quy]
```

## 2. Giao thức tương tác giữa các module

* **Đầu vào**: `dataset_id` + `dataset_digest` của handoff FA v2 đã kiểm; campaign lưu `dataset_ref` trong `objective_config_json`. Dùng đúng `optimization_run_ids` của baseline hiện tại, cùng họ/xe/simulator/dt, giữ config và seed từng run; không chọn lại run mới nhất. `validation_run_ids` dành riêng verification, kể cả nhiều seed của cùng biến thể.
* **Xử lý**: Lõi `MoboEngine` chạy thuần JDK, sử dụng 3 mô hình Gaussian Process độc lập để xấp xỉ không gian mục tiêu và hàm thu thập qEHVI để đề xuất bộ tham số tiếp theo.
* **Đầu ra**: Cấu hình `MoboProposal` chứa 4 tham số AEB mới, độ tăng Hypervolume kỳ vọng và danh sách các trial thuộc Pareto Front.
* **Bàn giao**: chọn trial Pareto hợp lệ tạo regression trên partition validation đã chốt; retry chọn cùng trial không tạo test trùng. GP chỉ học aggregate canonical của trial thực, không fit giả thuyết nguyên nhân lỗi hoặc điểm baseline như trial. Handoff chẩn đoán V3 vẫn theo cổng authority riêng, không tự bật dispatch.
