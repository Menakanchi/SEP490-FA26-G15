# Tối ưu cấu hình AEB — Multi-Objective Bayesian Optimization

> Thiết kế thuật toán cho FE-13 (Optimization, Pareto, Robustness — xem TD-06 trong
> [tech-debt-tracker](../exec-plans/tech-debt-tracker.md)). Tài liệu chỉ gồm thuật toán và
> cơ sở lý thuyết. Nguồn: tài liệu nhóm ngày 18/10/2026 (@men men).

## Tổng quan

VehicSim dùng **Multi-Objective Bayesian Optimization (MOBO)** để tìm bộ tham số AEB
cân bằng giữa an toàn, khoảng cách dừng và độ êm. Mỗi lần đánh giá một bộ tham số phải
chạy cả một batch kịch bản trên CARLA, nên rất đắt. MOBO chọn điểm thử tiếp theo dựa trên
mô hình xấp xỉ (Gaussian Process), nhờ vậy tìm được Pareto front với ít lần chạy hơn tìm
kiếm ngẫu nhiên hay lưới.

Phạm vi:

- Chỉ dùng MOBO — không dùng NSGA-II, Random Search hay grid search.
- 4 biến quyết định: TTC Threshold, Brake Activation Delay, Brake Build-up Rate, Max Deceleration.
- 3 mục tiêu: Safety, Stopping Distance, Comfort.
- Đầu ra là **tập nghiệm Pareto**, không phải một nghiệm. Cấu hình cuối do Engineer đề
  xuất và Reviewer duyệt (không bao giờ tự Accept — luật cứng 5 trong [AGENTS.md](../../AGENTS.md)).

Thuật toán cụ thể: một Gaussian Process cho từng mục tiêu, acquisition **qLogNEHVI**
(q Log Noisy Expected Hypervolume Improvement).

## Phát biểu bài toán

### Biến quyết định

Vector `x = (x₁, x₂, x₃, x₄)`. Range lấy từ [Range tham số AEB](aeb-parameter-ranges.md).

| Ký hiệu | Tham số | Min | Max | Đơn vị | Ghi chú |
|---|---|---|---|---|---|
| x₁ | TTC Threshold | 0.6 | 3.0 | s | Cận trên theo UN R131, GB/T 39901 |
| x₂ | Brake Activation Delay | 0.1 | 0.5 | s | Mazda τ₁ = 0.1 s, Honda τ₁ = 0.5 s |
| x₃ | Brake Build-up Rate | 5 | 50 | m/s³ | Range suy luận quanh 12 m/s³ (Maschke 2024) |
| x₄ | Max Deceleration | 3 | 10 | m/s² | Maschke 2024; với đường trơn nên đặt cận trên ≤ μ·g |

6 tham số AEB còn lại giữ nguyên theo baseline trong suốt một lượt tối ưu.

x₂ ngoài đời là đặc tính hệ thống; trong VehicSim nó được coi là tham số thiết kế: thời
gian xác nhận trước khi gửi lệnh phanh. Delay ngắn phản ứng nhanh nhưng dễ phanh nhầm;
delay dài thì ngược lại.

### Hàm đánh giá

Đánh giá một bộ `x` = chạy `x` trên tập kịch bản `S` gồm `N` biến thể (ví dụ một scenario
family 48 biến thể), mỗi kịch bản một seed cố định. Với kịch bản thứ `i`:

| Ký hiệu | Đại lượng | Cách tính |
|---|---|---|
| cᵢ | Có va chạm | 1 nếu va chạm, 0 nếu không |
| vᵢ | Vận tốc va chạm (km/h) | Vận tốc tương đối lúc va chạm; 0 nếu không va chạm |
| dᵢ | Khoảng cách còn lại khi dừng (m) | Từ đầu xe tới vật cản khi v = 0; chỉ tính khi cᵢ = 0 |
| AJVᵢ | Chỉ số jerk (SAE) | `AJV = 0.004 · hpj² + rmsⱼ`, với `hpj = max\|jerk(t)\|`, `rmsⱼ` = RMS của jerk(t) trong pha phanh |

### Ba mục tiêu (cùng tối thiểu hóa)

| Mục tiêu | Công thức | Ý nghĩa |
|---|---|---|
| f₁ Safety | `(1/N) · Σ vᵢ` | Vận tốc va chạm trung bình. Dùng thay tỷ lệ va chạm vì liên tục, GP mô hình hóa tốt hơn |
| f₂ Stopping Distance | trung bình `\|dᵢ − d_ref\|` trên các kịch bản không va chạm | Dừng quá sát thì nguy hiểm, dừng quá xa là phanh sớm |
| f₃ Comfort | `(1/N) · Σ AJVᵢ` | Độ giật trung bình |

- `d_ref` mặc định 2.0 m, cấu hình được trong 1–5 m.
- Nếu mọi kịch bản đều va chạm thì f₂ không xác định → gán `f₂ = f2_penalty` (mặc định
  10 m) để bộ tối ưu tránh vùng này.

### Ràng buộc

```
g₁(x) = CR(x) − CR_baseline ≤ 0,    CR(x) = (1/N) · Σ cᵢ
```

Cấu hình mới không được va chạm nhiều hơn cấu hình cơ sở (ví dụ AEB v1.0). Điểm vi phạm
vẫn được lưu và dùng huấn luyện GP, nhưng **không** vào Pareto front.

Kiểm tra hồi quy "đạt → lỗi" **không** nằm trong vòng MOBO; Regression Test làm sau, với ứng viên đã chọn, đúng seed của baseline
([ADR-025](../adr/ADR-025-cong-regression-cung-seed-khong-tu-accept.md)).

## Thuật toán

Mỗi vòng chạy `q` cấu hình song song trên CARLA, cập nhật GP, rồi để acquisition chọn `q`
cấu hình tiếp theo hứa hẹn mở rộng Pareto front nhiều nhất.

### Các thành phần

1. **Chuẩn hóa.** `x` đưa về `[0, 1]⁴` theo bounds ở bảng biến quyết định. Bài toán được
   phát biểu dưới dạng tối đa hóa nên đổi dấu mục tiêu: `Y = −f`. Output mỗi GP được chuẩn
   hóa về trung bình 0, phương sai 1.
2. **Khởi tạo.** Đánh giá baseline (AEB v1.0) và `n₀ = 2(d + 1) = 10` điểm Sobol xáo trộn
   (`d = 4`). Sobol phủ đều không gian hơn lấy mẫu ngẫu nhiên.
3. **Surrogate.** 4 Gaussian Process độc lập cho f₁, f₂, f₃ và ràng buộc g₁. Kernel Matérn
   5/2 với ARD (mỗi chiều một length-scale riêng); nhiễu quan sát học từ dữ liệu vì mô phỏng
   có nhiễu sensor và seed.
4. **Điểm tham chiếu r.** Hypervolume chỉ tính phần không gian tốt hơn `r`. Mặc định
   `rₖ = fₖ(baseline) + max(10% · |fₖ(baseline)|, εₖ)` với `ε = (1 km/h; 0.5 m; 0.1)`.
   Nhờ ε, `r` vẫn hợp lệ khi baseline có f₁ = 0. Trong không gian tối đa hóa dùng `−r`.
5. **Acquisition.** qLogNEHVI đo mức tăng hypervolume kỳ vọng khi thêm `q` điểm, có tính
   nhiễu quan sát. Giá trị acquisition được nhân với xác suất thỏa `g₁ ≤ 0`, nên điểm có
   xác suất vi phạm cao bị giảm ưu tiên.
6. **Chọn q điểm.** Tối đa hóa acquisition bằng gradient từ nhiều điểm khởi đầu ngẫu
   nhiên, chọn tuần tự từng điểm trong batch. `q` = số CARLA worker chạy song song.

### Pseudo-code

```text
Input: bounds, tập kịch bản S, ngân sách B, batch q, n₀, baseline x_b

X ← {x_b} ∪ Sobol(n₀)
for x in X:
    (F[x], G[x]) ← evaluate(x, S)          # chạy CARLA, tính f₁ f₂ f₃ g₁
r ← reference_point(F[x_b])
hv_hist ← []

while |X| < B:
    model ← fit 4 GP độc lập trên (normalize(X), −F, G)
    acq   ← qLogNEHVI(model, ref = −r, X_baseline = normalize(X), constraint: G ≤ 0)
    X_new ← argmax acq                      # q điểm
    (F, G)[X_new] ← evaluate song song trên CARLA
    X ← X ∪ X_new
    hv_hist.append(hypervolume(Pareto(X khả thi), r))
    if cải thiện HV < 1% trong 3 vòng liên tiếp: break

return Pareto(X khả thi)
```

### Cấu hình mặc định

Giá trị khởi điểm; Engineer đổi được trước mỗi lượt tối ưu.

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `budget` | 50 | Tổng số cấu hình được đánh giá, tính cả baseline và điểm khởi tạo ("Ngân sách 50 run" trên prototype) |
| `n_init` | 10 | Số điểm Sobol khởi tạo, = 2(d + 1) |
| `batch_size` (q) | 4 | Số cấu hình đánh giá song song mỗi vòng, = số CARLA worker |
| `scenarios_per_eval` (N) | 48 | Số biến thể kịch bản mỗi lần đánh giá |
| `seed` | cố định theo kịch bản | Mọi cấu hình chạy trên cùng tập seed để so sánh công bằng |
| `d_ref` | 2.0 m | Khoảng dừng mong muốn trong f₂ |
| `f2_penalty` | 10 m | f₂ khi mọi kịch bản đều va chạm |
| `ref_margin` | 10% | Độ nới khi tính điểm tham chiếu từ baseline |
| `ref_eps` | (1 km/h; 0.5 m; 0.1) | Độ nới tối thiểu cho từng mục tiêu |
| `num_restarts` | 10 | Số điểm khởi đầu khi tối ưu acquisition |
| `raw_samples` | 512 | Số mẫu thô để chọn điểm khởi đầu |
| `mc_samples` | 128 | Số mẫu Monte Carlo khi tính qLogNEHVI |
| `hv_tol` | 1% | Ngưỡng cải thiện hypervolume để coi là hội tụ |
| `patience` | 3 | Số vòng liên tiếp dưới ngưỡng trước khi dừng sớm |

**Điều kiện dừng** (gặp điều kiện nào trước thì dừng):

1. Đã đánh giá đủ `budget` cấu hình.
2. Hypervolume tăng ít hơn `hv_tol` trong `patience` vòng liên tiếp.
3. Engineer dừng tay; kết quả đã có vẫn được giữ.

Một lần đánh giá lỗi (mô phỏng crash, timeout) **không** được coi là kết quả xấu: lần đó
không đưa vào GP, không trừ ngân sách, chạy lại tối đa 2 lần.

## Đầu ra

### Chọn nghiệm

MOBO trả về tập Pareto. Để Engineer có điểm bắt đầu, hệ thống gợi ý một ứng viên mặc định:

1. Chỉ xét các cấu hình khả thi (thỏa g₁) và thuộc Pareto front.
2. Chuẩn hóa từng mục tiêu về `[0, 1]` trên tập Pareto (min-max).
3. Gợi ý cấu hình có khoảng cách Euclid nhỏ nhất tới điểm lý tưởng `(0, 0, 0)`.

Engineer có thể chọn cấu hình khác trên Pareto front. Ứng viên được chọn đi qua Robustness
Validation → Regression Test → Reviewer.

### Robustness Validation

Chạy lại ứng viên với các seed mới (mặc định 3 seed) trên cùng scenario family. Báo cáo
mean ± std của f₁, f₂, f₃ và tỷ lệ va chạm. Ứng viên có std(f₁) > mean(f₁) bị đánh dấu
**"không ổn định"**.

## Tài liệu tham khảo

1. Daulton, S., Balandat, M., Bakshy, E. (2021). *Parallel Bayesian Optimization of Multiple
   Noisy Objectives with Expected Hypervolume Improvement.* NeurIPS 2021. Nguồn gốc của
   qNEHVI.
2. Ament, S. et al. (2023). *Unexpected Improvements to Expected Improvement for Bayesian
   Optimization.* NeurIPS 2023. Họ LogEI, trong đó qLogNEHVI ổn định số hơn qNEHVI.
3. Balandat, M. et al. (2020). *BoTorch: A Framework for Efficient Monte-Carlo Bayesian
   Optimization.* NeurIPS 2020. Thư viện cài đặt.
4. *What Is the Best Way to Optimally Parameterize the MPC Cost Function for Vehicle
   Guidance?* MDPI Mathematics 11(2):465. So sánh MOBO với NSGA-II trên bài toán điều khiển
   xe; dùng để biện luận việc chọn MOBO.
5. Chen, Z. et al. (2025). *Predicting driving comfort in autonomous vehicles using road
   information and multi-head attention models.* Nature Communications 16:2709. Nguồn của
   chỉ số AJV trong f₃.
6. [Range tham số AEB — nguồn và luận cứ](aeb-parameter-ranges.md). Nguồn bounds x₁ → x₄.
