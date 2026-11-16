# Kiến trúc Module Tối ưu hóa Tham số AEB (Người 4 — MOBO)

## 1. Mục tiêu và phạm vi

Thành viên 4 chịu trách nhiệm chính về module tối ưu hóa đa mục tiêu bằng giải thuật Bayes (Multi-Objective Bayesian Optimization - MOBO):
* Nhận tập dữ liệu kịch bản và baseline từ Thành viên 3 (`optimization_run_ids`).
* Khởi tạo và điều phối thuật toán MOBO trong `MoboEngine.java` và `worker/vehicsim_core/mobo.py`.
* Quản lý không gian tìm kiếm 4 tham số AEB (`TTC_THRESHOLD`, `BRAKE_ACTIVATION_DELAY`, `BRAKE_BUILDUP_RATE`, `MAX_DECELERATION`).
* Tối thiểu hóa đồng thời 3 hàm mục tiêu: Độ giật RMS ($Jerk$), Vận tốc va chạm ($v_{\text{impact}}$), và Quãng đường dừng ($d_{\text{stop}}$).
* Trích xuất tập nghiệm Pareto Front và đề xuất ứng viên tối ưu (Candidate) cho Thành viên 5 kiểm chứng hồi quy (Regression).

```text
[Dataset v2 từ Người 3]
         ↓
[MoboEngine: Khởi tạo Initial Design] (Random sampling + Deduplication)
         ↓
[Chạy kịch bản mô phỏng CARLA / Kinematic]
         ↓
[Đo đạc 3 hàm mục tiêu & Đánh giá]
         ↓
[Cập nhật 3 Gaussian Processes + qEHVI Monte Carlo]
         ↓
[Mặt cong Pareto Front & Ứng viên Candidate]
         ↓
[Bàn giao cho Người 5 phê duyệt]
```

## 2. Giao thức tương tác giữa các module

* **Đầu vào**: Danh sách các lần chạy `optimization_run_ids` thuộc baseline hiện tại, đảm bảo cùng họ kịch bản, cùng mô hình xe và cấu hình thời tiết.
* **Xử lý**: Lõi `MoboEngine` chạy thuần JDK, sử dụng 3 mô hình Gaussian Process độc lập để xấp xỉ không gian mục tiêu và hàm thu thập qEHVI để đề xuất bộ tham số tiếp theo.
* **Đầu ra**: Cấu hình `MoboProposal` chứa 4 tham số AEB mới, độ tăng Hypervolume kỳ vọng và danh sách các trial thuộc Pareto Front.
