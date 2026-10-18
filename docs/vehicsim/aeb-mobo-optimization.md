# Tối ưu cấu hình AEB — Multi-Objective Bayesian Optimization

> Thiết kế thuật toán cho FE-13 (Optimization, Pareto, Robustness — xem TD-06 trong
> [tech-debt-tracker](../exec-plans/tech-debt-tracker.md)). Chưa có code; đây là đặc tả
> để cài đặt. Nguồn: tài liệu nhóm ngày 18/10/2026 (@men men).

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
(q Log Noisy Expected Hypervolume Improvement), cài bằng BoTorch.

## Phát biểu bài toán

### Biến quyết định

Vector `x = (x₁, x₂, x₃, x₄)`. Range lấy từ [Range tham số AEB](aeb-parameter-ranges.md).

| Ký hiệu | Tham số | Mã trong code (`AebParams`) | Min | Max | Đơn vị | Ghi chú |
|---|---|---|---|---|---|---|
| x₁ | TTC Threshold | `ttc_threshold` | 0.6 | 3.0 | s | Cận trên theo UN R131, GB/T 39901 |
| x₂ | Brake Activation Delay | `brake_activation_delay` | 0.1 | 0.5 | s | Mazda τ₁ = 0.1 s, Honda τ₁ = 0.5 s |
| x₃ | Brake Build-up Rate | `brake_buildup_rate` | 5 | 50 | m/s³ | Range suy luận quanh 12 m/s³ (Maschke 2024) |
| x₄ | Max Deceleration | `max_deceleration` | 3 | 10 | m/s² | Maschke 2024; với đường trơn nên đặt cận trên ≤ μ·g |

6 tham số còn lại của `AebParams` (`src/services/vehicsim/simulator.py`) giữ nguyên theo
baseline trong suốt một lượt tối ưu.

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

Kiểm tra hồi quy "đạt → lỗi" **không** nằm trong vòng MOBO; Regression Test (UC-59 → UC-61)
làm sau, với ứng viên đã chọn, đúng seed của baseline
([ADR-025](../adr/ADR-025-cong-regression-cung-seed-khong-tu-accept.md)).

## Thuật toán

Mỗi vòng chạy `q` cấu hình song song trên CARLA, cập nhật GP, rồi để acquisition chọn `q`
cấu hình tiếp theo hứa hẹn mở rộng Pareto front nhiều nhất.

### Các thành phần

1. **Chuẩn hóa.** `x` đưa về `[0, 1]⁴` theo bounds ở bảng biến quyết định. BoTorch mặc định
   tối đa hóa nên đổi dấu mục tiêu: `Y = −f`. Output mỗi GP chuẩn hóa bằng outcome
   transform `Standardize`.
2. **Khởi tạo.** Đánh giá baseline (AEB v1.0) và `n₀ = 2(d + 1) = 10` điểm Sobol xáo trộn
   (`d = 4`). Sobol phủ đều không gian hơn lấy mẫu ngẫu nhiên.
3. **Surrogate.** `ModelListGP` gồm 4 `SingleTaskGP` độc lập: f₁, f₂, f₃ và ràng buộc g₁.
   Kernel Matérn 5/2 với ARD (mặc định BoTorch); nhiễu quan sát học từ dữ liệu vì mô
   phỏng có nhiễu sensor và seed.
4. **Điểm tham chiếu r.** Hypervolume chỉ tính phần không gian tốt hơn `r`. Mặc định
   `rₖ = fₖ(baseline) + max(10% · |fₖ(baseline)|, εₖ)` với `ε = (1 km/h; 0.5 m; 0.1)`.
   Nhờ ε, `r` vẫn hợp lệ khi baseline có f₁ = 0. Đưa vào BoTorch dùng `−r`.
5. **Acquisition.** qLogNEHVI đo mức tăng hypervolume kỳ vọng khi thêm `q` điểm, có tính
   nhiễu quan sát. Ràng buộc `g₁ ≤ 0` truyền qua tham số `constraints`, nên điểm có xác
   suất vi phạm cao bị giảm ưu tiên.
6. **Chọn q điểm.** `optimize_acqf` với nhiều điểm khởi đầu ngẫu nhiên, chọn tuần tự từng
   điểm trong batch. `q` = số CARLA worker chạy song song.

### Pseudo-code

```text
Input: bounds, tập kịch bản S, ngân sách B, batch q, n₀, baseline x_b

X ← {x_b} ∪ Sobol(n₀)
for x in X:
    (F[x], G[x]) ← evaluate(x, S)          # chạy CARLA, tính f₁ f₂ f₃ g₁
r ← reference_point(F[x_b])
hv_hist ← []

while |X| < B:
    model ← fit ModelListGP(normalize(X), −F, G)
    acq   ← qLogNEHVI(model, ref = −r, X_baseline = normalize(X), constraint: G ≤ 0)
    X_new ← argmax acq                      # q điểm
    (F, G)[X_new] ← evaluate song song trên CARLA
    X ← X ∪ X_new
    hv_hist.append(hypervolume(Pareto(X khả thi), r))
    if cải thiện HV < 1% trong 3 vòng liên tiếp: break

return Pareto(X khả thi)
```

### Cấu hình mặc định

Giá trị khởi điểm; Engineer đổi được trong Configure Optimization Problem (UC-54).

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
3. Engineer dừng tay trong Control Simulation; kết quả đã có vẫn được giữ.

Một lần đánh giá lỗi (CARLA crash, timeout) **không** được ghi như kết quả xấu: đánh dấu
`failed`, không đưa vào GP, không trừ ngân sách, chạy lại tối đa 2 lần.

## Đầu ra và tích hợp

### Dữ liệu lưu cho mỗi lượt

**OptimizationRun** (một lần chạy tối ưu): `run_id`, `config` (bảng cấu hình trên),
`baseline_config_id`, `scenario_family_id`, `ref_point`, `hv_history` (hypervolume sau mỗi
vòng), `status` (`running` / `stopped` / `converged` / `budget_exhausted`).

**Trial** (một cấu hình được đánh giá): `trial_id`, `run_id`, `iteration` (0 = khởi tạo),
`source` (`baseline` / `sobol` / `acquisition`), `params` {`ttc_threshold`,
`activation_delay`, `buildup_rate`, `max_decel`}, `objectives` {`f1_safety`, `f2_stopping`,
`f3_comfort`}, `collision_rate`, `feasible`, `is_pareto`, `status` (`pending` / `running` /
`done` / `failed`), `sim_run_ids` (danh sách run CARLA của trial).

Hai bảng này chưa có trong `database/mysql/01_schema.sql`. Khi thêm phải sửa cả
`src/services/vehicsim/tables.py` trong cùng PR (luật mềm trong [AGENTS.md](../../AGENTS.md)).

### Chọn nghiệm

MOBO trả về tập Pareto. Để Engineer có điểm bắt đầu, hệ thống gợi ý một ứng viên mặc định:

1. Chỉ xét trial `feasible` và `is_pareto`.
2. Chuẩn hóa từng mục tiêu về `[0, 1]` trên tập Pareto (min-max).
3. Gợi ý trial có khoảng cách Euclid nhỏ nhất tới điểm lý tưởng `(0, 0, 0)`.

Engineer có thể chọn trial khác trên biểu đồ Pareto. Ứng viên được chọn đi qua Robustness
Validation → Regression Test → Reviewer.

### Robustness Validation

Chạy lại ứng viên với các seed mới (mặc định 3 seed) trên cùng scenario family. Báo cáo
mean ± std của f₁, f₂, f₃ và tỷ lệ va chạm. Ứng viên có std(f₁) > mean(f₁) bị đánh dấu
**"không ổn định"**.

### Ánh xạ use case

| Use case | Phần thuật toán |
|---|---|
| UC-54 Configure Optimization Problem | Chọn scenario family, baseline, sửa bounds và các khóa cấu hình |
| UC-55 List Optimization Runs | Danh sách OptimizationRun, trạng thái, số trial / budget |
| UC-56 Track Active Learning Search | Biểu đồ `hv_history` theo vòng; bảng trial mới nhất |
| UC-57 Compare Multi-Criteria | Pareto front 3 mục tiêu (scatter 2D theo cặp hoặc 3D), ứng viên gợi ý |
| UC-58 View Robustness Validation | Kết quả chạy lại nhiều seed của ứng viên đã chọn |

## Khung code (Python + BoTorch)

Chạy được khi thay `run_scenarios` bằng lời gọi CARLA thật. Cần `torch`, `botorch` ≥ 0.10
(đã có qLogNEHVI) và `gpytorch`. Toàn bộ tính toán dùng float64.

```python
import numpy as np
import torch
from botorch.models import SingleTaskGP, ModelListGP
from botorch.models.transforms.outcome import Standardize
from botorch.fit import fit_gpytorch_mll
from gpytorch.mlls import SumMarginalLogLikelihood
from botorch.acquisition.multi_objective.logei import (
    qLogNoisyExpectedHypervolumeImprovement,
)
from botorch.acquisition.multi_objective.objective import (
    IdentityMCMultiOutputObjective,
)
from botorch.optim import optimize_acqf
from botorch.sampling.normal import SobolQMCNormalSampler
from botorch.utils.sampling import draw_sobol_samples
from botorch.utils.transforms import normalize, unnormalize
from botorch.utils.multi_objective.pareto import is_non_dominated
from botorch.utils.multi_objective.hypervolume import Hypervolume

tkw = {"dtype": torch.double}

# ---- 1. Không gian tham số -------------------------------------------
PARAMS = ["ttc_threshold", "activation_delay", "buildup_rate", "max_decel"]
BOUNDS = torch.tensor([[0.6, 0.1,  5.0,  3.0],    # min
                       [3.0, 0.5, 50.0, 10.0]],   # max
                      **tkw)
UNIT = torch.stack([torch.zeros(4, **tkw), torch.ones(4, **tkw)])

CFG = dict(budget=50, n_init=10, q=4, d_ref=2.0, f2_penalty=10.0,
           ref_margin=0.10, ref_eps=(1.0, 0.5, 0.1),
           num_restarts=10, raw_samples=512, mc_samples=128,
           hv_tol=0.01, patience=3)

# ---- 2. Hàm đánh giá --------------------------------------------------
def ajv(jerk: np.ndarray) -> float:
    """AJV = 0.004 * hpj^2 + rms_j (SAE)."""
    hpj = np.max(np.abs(jerk))
    rms = np.sqrt(np.mean(jerk ** 2))
    return 0.004 * hpj ** 2 + rms

def run_scenarios(params: dict) -> list[dict]:
    """THAY BẰNG CARLA. Trả về 1 dict cho mỗi kịch bản:
    {collision: bool, impact_speed_kmh: float, stop_gap_m: float, jerk: np.ndarray}
    """
    raise NotImplementedError

def evaluate(x_raw: torch.Tensor) -> tuple[list[float], float]:
    """x_raw: tensor 4 phần tử (đơn vị thật). Trả về ([f1, f2, f3], collision_rate)."""
    res = run_scenarios(dict(zip(PARAMS, x_raw.tolist())))
    n = len(res)
    f1 = sum(r["impact_speed_kmh"] for r in res) / n
    safe = [r for r in res if not r["collision"]]
    f2 = (sum(abs(r["stop_gap_m"] - CFG["d_ref"]) for r in safe) / len(safe)
          if safe else CFG["f2_penalty"])
    f3 = sum(ajv(r["jerk"]) for r in res) / n
    collision_rate = sum(r["collision"] for r in res) / n
    return [f1, f2, f3], collision_rate

# ---- 3. Mô hình và acquisition ------------------------------------------
def fit_model(X_unit, Y):
    """Y cột 0..2 = -f (để tối đa hóa), cột 3 = g1 (<= 0 là khả thi)."""
    models = [SingleTaskGP(X_unit, Y[:, i:i + 1],
                           outcome_transform=Standardize(m=1))
              for i in range(Y.shape[-1])]
    model = ModelListGP(*models)
    fit_gpytorch_mll(SumMarginalLogLikelihood(model.likelihood, model))
    return model

def next_batch(model, X_unit, ref_max):
    acq = qLogNoisyExpectedHypervolumeImprovement(
        model=model,
        ref_point=ref_max.tolist(),
        X_baseline=X_unit,
        prune_baseline=True,
        sampler=SobolQMCNormalSampler(torch.Size([CFG["mc_samples"]])),
        objective=IdentityMCMultiOutputObjective(outcomes=[0, 1, 2]),
        constraints=[lambda Z: Z[..., 3]],          # g1 <= 0
    )
    cand, _ = optimize_acqf(acq, bounds=UNIT, q=CFG["q"],
                            num_restarts=CFG["num_restarts"],
                            raw_samples=CFG["raw_samples"],
                            options={"batch_limit": 5, "maxiter": 200},
                            sequential=True)
    return cand.detach()

def pareto_and_hv(Y, ref_max):
    feas = Y[:, 3] <= 0
    Yf = Y[feas, :3]
    if Yf.shape[0] == 0:
        return torch.zeros(0, dtype=torch.bool), 0.0
    mask = is_non_dominated(Yf)
    front = Yf[mask]
    front = front[(front > ref_max).all(dim=-1)]
    hv = Hypervolume(ref_point=ref_max).compute(front) if len(front) else 0.0
    pareto = torch.zeros(Y.shape[0], dtype=torch.bool)
    pareto[feas.nonzero().squeeze(-1)[mask]] = True
    return pareto, hv

# ---- 4. Vòng lặp chính ----------------------------------------------------
def run_mobo(baseline_raw: torch.Tensor, seed: int = 0):
    torch.manual_seed(seed)
    # khởi tạo: baseline + Sobol
    sobol = draw_sobol_samples(bounds=UNIT, n=CFG["n_init"], q=1,
                               seed=seed).squeeze(1)
    X_unit = torch.cat([normalize(baseline_raw.unsqueeze(0), BOUNDS), sobol])

    F, G = [], []
    for x in X_unit:
        f, cr = evaluate(unnormalize(x, BOUNDS)); F.append(f); G.append(cr)
    cr_base = G[0]
    Y = torch.tensor([[-a, -b, -c, cr - cr_base] for (a, b, c), cr in zip(F, G)], **tkw)

    # điểm tham chiếu từ baseline (không gian tối thiểu hóa), rồi đổi dấu
    f_base = torch.tensor(F[0], **tkw)
    eps = torch.tensor(CFG["ref_eps"], **tkw)
    r = f_base + torch.maximum(CFG["ref_margin"] * f_base.abs(), eps)
    ref_max = -r

    hv_hist, stall = [], 0
    while X_unit.shape[0] < CFG["budget"]:
        model = fit_model(X_unit, Y)
        cand = next_batch(model, X_unit, ref_max)[: CFG["budget"] - X_unit.shape[0]]
        rows = []
        for x in cand:                      # thực tế: chạy song song q worker
            f, cr = evaluate(unnormalize(x, BOUNDS))
            rows.append([-f[0], -f[1], -f[2], cr - cr_base])
        X_unit = torch.cat([X_unit, cand])
        Y = torch.cat([Y, torch.tensor(rows, **tkw)])

        _, hv = pareto_and_hv(Y, ref_max)
        if hv_hist and hv_hist[-1] > 0 and (hv - hv_hist[-1]) / hv_hist[-1] < CFG["hv_tol"]:
            stall += 1
        else:
            stall = 0
        hv_hist.append(hv)
        if stall >= CFG["patience"]:
            break

    pareto, _ = pareto_and_hv(Y, ref_max)
    X_raw = unnormalize(X_unit, BOUNDS)
    return dict(X=X_raw, F=-Y[:, :3], feasible=Y[:, 3] <= 0,
                pareto=pareto, hv_history=hv_hist)
```

### Ghi chú khi tích hợp

- `evaluate` trong vòng lặp chạy tuần tự cho dễ đọc. Khi đưa vào hệ thống, gửi `q` trial
  vào hàng đợi job (UC-36) rồi chờ đủ `q` kết quả trước khi fit lại GP.
- Mỗi trial ghi DB ngay khi có kết quả, để dừng giữa chừng không mất dữ liệu và chạy tiếp
  được từ `X`, `Y` đã lưu.
- Trial lỗi (CARLA crash) không thêm vào `X`, `Y`; chạy lại tối đa 2 lần.
- Cố định seed của tập kịch bản giữa các trial (luật cứng 4 trong [AGENTS.md](../../AGENTS.md)).
  Nếu không, GP sẽ học cả nhiễu do khác seed.
- Luật cứng 2: `src/` không import `carla`. Phần gọi CARLA của `run_scenarios` đi qua hàng
  đợi job/worker như hiện tại, không gọi trực tiếp từ backend.
- Baseline AEB v1.0 hiện là mặc định của `AebParams`: TTC 1.5 s, delay 0.15 s, build-up
  50 m/s³ (đúng cận trên), max decel 8 m/s². Baseline nằm trên biên x₃ là hợp lệ, nhưng
  nên kiểm tra lại khi nới bounds.

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
