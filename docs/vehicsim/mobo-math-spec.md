# Đặc tả Toán học Mô hình Gaussian Process Regression (GPR)

## 1. Không gian tìm kiếm và Phép chuẩn hóa

Không gian tìm kiếm gồm 4 tham số AEB được chuẩn hóa về siêu lập phương $[0, 1]^4$:
$$x_{\text{norm}, k} = \frac{x_k - l_k}{u_k - l_k}, \quad k \in \{1, 2, 3, 4\}$$

Khi đề xuất tham số thực thi cho bộ mô phỏng:
$$x_k = l_k + x_{\text{norm}, k} \cdot (u_k - l_k)$$

Các mục tiêu đo đạc từ mô phỏng được chuẩn hóa Min-Max:
$$y_{\text{norm}, m} = \frac{y_m - y_{\min, m}}{y_{\max, m} - y_{\min, m}}, \quad m \in \{1, 2, 3\}$$

## 2. Hàm nhân RBF Kernel

Mức độ tương đồng giữa hai cấu hình tham số $\mathbf{a}, \mathbf{b} \in [0, 1]^4$:
$$k(\mathbf{a}, \mathbf{b}) = \sigma_f^2 \exp\left( -\frac{1}{2} \sum_{d=1}^4 \frac{(a_d - b_d)^2}{\ell^2} \right)$$

* Chiều dài bước tương quan: $\ell = 0.35$ (`LENGTH_SCALE`).
* Phương sai tín hiệu: $\sigma_f^2 = 1.0$ (`SIGNAL_VARIANCE`).

## 3. Ma trận hiệp phương sai và Phân rã Cholesky

Ma trận hiệp phương sai huấn luyện $K \in \mathbb{R}^{n \times n}$:
$$K_{ij} = k(\mathbf{x}_i, \mathbf{x}_j) + (\sigma_n^2 + \epsilon_{\text{jitter}}) \delta_{ij}$$
với $\sigma_n^2 = 10^{-4}$ (`NOISE`) và $\epsilon_{\text{jitter}} = 10^{-6}$ (`JITTER`).

Hệ phương trình $K \boldsymbol{\alpha} = \mathbf{y}$ được giải qua phân rã Cholesky $K = L L^T$:
1. **Thế tiến (Forward substitution)**: $L \mathbf{v} = \mathbf{y}$
2. **Thế lùi (Backward substitution)**: $L^T \boldsymbol{\alpha} = \mathbf{v}$

## 4. Phân phối hậu nghiệm (Posterior Prediction)

Tại điểm cấu hình mới $\mathbf{x}^*$:
* **Kỳ vọng dự đoán (Mean)**:
  $$\mu(\mathbf{x}^*) = \mathbf{k}_*^T \boldsymbol{\alpha} = \sum_{i=1}^n \alpha_i k(\mathbf{x}_i, \mathbf{x}^*)$$
* **Phương sai dự đoán (Variance)**:
  $$\sigma^2(\mathbf{x}^*) = \max\Big(0, \; k(\mathbf{x}^*, \mathbf{x}^*) + \sigma_n^2 - \|\mathbf{v}_*\|^2\Big), \quad L \mathbf{v}_* = \mathbf{k}_*$$
* **Độ lệch chuẩn**: $\sigma(\mathbf{x}^*) = \sqrt{\sigma^2(\mathbf{x}^*)}$
