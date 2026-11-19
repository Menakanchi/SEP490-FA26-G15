# Đặc tả Thuật toán Pareto Dominance và Tích phân Hypervolume 3D

## 1. Quan hệ Thống trị Pareto (Pareto Dominance)

Trong bài toán tối thiểu hóa 3 mục tiêu (MINIMIZE):
$$\mathbf{a} \prec \mathbf{b} \iff (\forall i \in \{1, 2, 3\}, a_i \le b_i) \land (\exists j \in \{1, 2, 3\}, a_j < b_j)$$

Tập nghiệm Pareto Front $\mathcal{P}$ là tập các trial hợp lệ không bị bất kỳ trial nào khác thống trị:
$$\mathcal{P} = \{\mathbf{y} \in \mathcal{Y} \mid \nexists \mathbf{y}' \in \mathcal{Y}: \mathbf{y}' \prec \mathbf{y}\}$$

## 2. Thể tích siêu khối Hypervolume 3D

Điểm tham chiếu mốc xấu nhất: $\mathbf{r} = [1.1, 1.1, 1.1]^T$ (`REF_POINT`).

Thể tích bao bọc giữa tập Pareto Front $\mathcal{P}$ và $\mathbf{r}$:
$$\text{HV}(\mathcal{P}, \mathbf{r}) = \Lambda \left( \bigcup_{\mathbf{p} \in \mathcal{P}} [\mathbf{p}, \mathbf{r}] \right)$$
trong đó $\Lambda(\cdot)$ là độ đo Lebesgue trên không gian 3 chiều $\mathbb{R}^3$.

## 3. Thuật toán cắt lát tích phân 3D (3D Slicing Integration)

Do bài toán có 3 mục tiêu độc lập, code triển khai thuật toán tích phân hình học theo lát cắt:
$$\text{HV} = \sum_{i} \Delta z_i \cdot \text{Area}_{XY}(z_i)$$

* **Bước 1**: Cắt theo trục $Z$ (Quãng phanh dừng) thành các lát $\Delta z_i = z_{i+1} - z_i$.
* **Bước 2**: Tại mỗi lát, tập hợp các điểm thỏa mãn $p_z \le z_i$ và quét diện tích hợp hình chữ nhật trên mặt phẳng 2D $(X, Y)$ (Jerk và Vận tốc va chạm):
  $$\text{Area}_{XY}(z_i) = \sum_{j} \Delta x_j \cdot \max(0, r_y - \min_{p_x \le x_j} p_y)$$
* **Bước 3**: Nhân diện tích lát đáy với chiều cao $\Delta z_i$ và tính tổng tích lũy.

Độ phức tạp tính toán: $\mathcal{O}(N^2 \log N)$ với $N$ là số nghiệm Pareto ($N \le 50$), thực thi trong $1 \div 2\text{ ms}$ trên JVM.

## 4. Tài liệu Khoa học Đối chiếu (Academic References)

1. **Zitzler, E., & Thiele, L. (1999)**. *Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach*. IEEE Transactions on Evolutionary Computation, 3(4), 257-271. (Paper nền tảng định nghĩa độ đo Hypervolume / S-metric trong tối ưu đa mục tiêu).
2. **While, L., Hingston, P., Barone, L., & Huband, S. (2006)**. *A faster algorithm for calculating hypervolume*. IEEE Transactions on Evolutionary Computation, 10(1), 29-38. (Giải thuật tính Hypervolume lát cắt Slice-based $\mathcal{O}(N^2 \log N)$ cho 3 chiều mục tiêu).

