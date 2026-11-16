# Đặc tả Hàm thu thập qEHVI và Tối ưu hóa Monte Carlo

## 1. Mức tăng Hypervolume (Hypervolume Improvement - HVI)

Mức tăng thể tích siêu khối khi bổ sung cấu hình mới $\mathbf{y}$:
$$\text{HVI}(\mathbf{y}, \mathcal{P}, \mathbf{r}) = \begin{cases} 
0 & \text{nếu } \mathbf{y} \ge \mathbf{r} \text{ hoặc } \exists \mathbf{p} \in \mathcal{P}: \mathbf{p} \prec \mathbf{y} \\
\text{HV}(\mathcal{P} \cup \{\mathbf{y}\}, \mathbf{r}) - \text{HV}(\mathcal{P}, \mathbf{r}) & \text{ngược lại}
\end{cases}$$

## 2. Hàm thu thập qEHVI bằng Monte Carlo

Kỳ vọng độ tăng Hypervolume trên phân phối dự đoán của 3 Gaussian Process:
$$\text{qEHVI}(\mathbf{x}) = \mathbb{E}_{\mathbf{y} \sim \mathcal{N}(\boldsymbol{\mu}(\mathbf{x}), \boldsymbol{\Sigma}(\mathbf{x}))} \big[ \text{HVI}(\mathbf{y}, \mathcal{P}, \mathbf{r}) \big]$$

Xấp xỉ số trị bằng Monte Carlo với $N_{MC} = 64$ mẫu (`N_MC`):
$$\text{qEHVI}(\mathbf{x}) \approx \frac{1}{N_{MC}} \sum_{s=1}^{N_{MC}} \text{HVI}\big(\mathbf{y}^{(s)}, \mathcal{P}, \mathbf{r}\big)$$

Mỗi mẫu $\mathbf{y}^{(s)}$ được sinh độc lập:
$$y_m^{(s)} = \mu_m(\mathbf{x}) + \sigma_m(\mathbf{x}) \cdot z_m^{(s)}, \quad z_m^{(s)} \sim \mathcal{N}(0, 1), \quad m \in \{1, 2, 3\}$$

## 3. Tạo Pool ứng viên & Lọc trùng

* **Ứng viên ngẫu nhiên (Exploration)**: 300 điểm phủ đều không gian $[0, 1]^4$ (`CANDIDATE_POOL_SIZE = 300`).
* **Đột biến cục bộ quanh Pareto (Exploitation)**: 8 điểm nhiễu Gauss quanh mỗi điểm thuộc Pareto Front (`PERTURBATIONS_PER_PARETO_POINT = 8`):
  $$x_{\text{pert}, d} = \min\big(1.0, \max(0.0, x_{\text{pareto}, d} + \mathcal{N}(0, \sigma_{\text{pert}}^2))\big), \quad \sigma_{\text{pert}} = 0.06$$
* **Bộ lọc chống trùng lặp (Deduplication)**:
  $$\sum_{d=1}^4 (x_{\text{cand}, d} - x_{\text{prev}, d})^2 < \tau^2, \quad \tau = 0.04 \implies \tau^2 = 0.0016$$
