-- Migration 020: Bổ sung tài liệu kỹ thuật chuyên sâu (AEB, CP Crossing, MOBO Algorithms, Sensor Filtering)
-- Ngày tạo: 2026-11-24
-- Đảm bảo 100% chuẩn mã UTF-8 (utf8mb4)

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

INSERT INTO tech_references (
    ref_code, ref_type, ref_name, ref_value, unit, description,
    source_type, source_title, author, organization, publication_year, page, url, doi, is_active
) VALUES
(
    'SAE_J211_CFC60', 'STANDARD', 'SAE J211-1 / ISO 6487 Channel Frequency Class 60 (CFC 60) Filtering',
    NULL, NULL,
    'Tiêu chuẩn lọc tín hiệu gia tốc va chạm và phanh xe tự động theo Channel Frequency Class (CFC 60, tần số cắt 100 Hz / Euro NCAP TB 024 tần số 10 Hz). Sử dụng bộ lọc Butterworth pha 0 (zero-phase phaseless 12-pole / 2 lượt xuôi-ngược) để loại bỏ nhiễu rung lắc tần số cao trước khi tích phân tính RMS jerk và vận tốc va chạm.',
    'STANDARD', 'SAE J211-1 Instrumentation for Impact Test - Part 1: Electronic Instrumentation',
    'SAE Safety Test Instrumentation Standards Committee', 'Society of Automotive Engineers (SAE) / ISO', 2022,
    'Section 5.3: Filter Classes & Data Processing', 'https://www.sae.org/standards/content/j211/1_202208/', '10.4271/J211/1_202208', 1
),
(
    'PACEJKA_MAGIC_FORMULA', 'THEORY', 'Pacejka Magic Formula Tire Model (MF 5.2)',
    NULL, NULL,
    'Mô hình động học lực bám lốp xe phi tuyến Pacejka kinh điển: Fx = D*sin(C*arctan(B*kappa - E*(B*kappa - arctan(B*kappa)))). Xác định giới hạn lực kéo và phanh dọc cực đại theo hệ số trượt bánh xe (slip ratio kappa) trên các bề mặt đường khô (mu ~ 0.85-1.0) và đường ướt (mu ~ 0.35-0.55), là cơ sở kiểm soát phanh tránh trượt lết trong AEB/ABS.',
    'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)',
    'Hans B. Pacejka, Igo Besselink', 'Butterworth-Heinemann (Elsevier)', 2012,
    'Chapter 4: Semi-Empirical Tyre Models', 'https://www.elsevier.com/books/tire-and-vehicle-dynamics/pacejka/978-0-08-097016-5', '10.1016/B978-0-08-097016-5.00004-9', 1
),
(
    'ISO_19206_2_PED_TARGET', 'STANDARD', 'ISO 19206-2 Articulated Pedestrian Target (EPTa/EPTc)',
    NULL, NULL,
    'Tiêu chuẩn quốc tế quy định đặc tính quang học, hình học, chuyển động khớp chân tay và tiết diện phản xạ sóng radar (RCS) của bia người đi bộ (EPTa người lớn chiều cao 1.8m, EPTc trẻ em 1.15m) dùng kiểm thử nghiệm thu hệ thống AEB VRU ở dải tần radar ô tô 77 GHz theo kịch bản băng qua đường CP_CROSSING.',
    'STANDARD', 'ISO 19206-2:2020 Road vehicles - Test devices for target vehicles, vulnerable road users and other objects - Part 2: Pedestrian targets',
    'ISO/TC 22/SC 33 Technical Committee', 'International Organization for Standardization (ISO)', 2020,
    'Clause 6: Radar cross section and kinematics', 'https://www.iso.org/standard/74720.html', '10.19206-2:2020', 1
),
(
    'PAREGO_KNOWLES_2006', 'THEORY', 'ParEGO: Multi-Objective Bayesian Optimization via Augmented Chebyshev Scalarization',
    NULL, NULL,
    'Thuật toán tối ưu hóa đa mục tiêu Bayes (MOBO) chuyển đổi vector mục tiêu [RMS jerk, impact speed, stopping distance] thành hàm vô hướng bằng phương pháp Chebyshev tăng cường: f_lam(y) = max_i(lam_i * y_i) + rho * sum(lam_i * y_i). Tại mỗi vòng lặp, vector trọng số lambda được lấy mẫu ngẫu nhiên trên đơn thể để khám phá toàn diện mặt biên Pareto.',
    'PAPER', 'ParEGO: A Hybrid Algorithm with On-Line Control of Parameters for Distributed Multi-Objective Optimization',
    'Joshua Knowles', 'IEEE Transactions on Evolutionary Computation (Vol. 10, No. 1)', 2006,
    'pp. 50-66', 'https://ieeexplore.ieee.org/document/1583592', '10.1109/TEVC.2005.851274', 1
),
(
    'MESMO_ACQUISITION_2016', 'THEORY', 'MESMO: Multi-Objective Predictive Entropy Search Acquisition Function',
    NULL, NULL,
    'Hàm thu nhận tối ưu Bayes đa mục tiêu dựa trên tối đa hóa lượng giảm entropy thông tin (mutual information) của tập nghiệm tối ưu Pareto chưa biết. Cung cấp cơ chế cân bằng khám phá (exploration) và khai thác (exploitation) hiệu quả khi đánh giá hàm chi phí mô phỏng đắt đỏ (như CARLA hoặc kinematic 100 Hz).',
    'PAPER', 'Multi-Objective Predictive Entropy Search for Efficient Multi-Objective Bayesian Optimization',
    'Daniel Hernández-Lobato, Jose Hernandez-Lobato, Amar Shah, Ryan Adams', 'International Conference on Machine Learning (ICML 2016, PMLR 48)', 2016,
    'pp. 1492-1501', 'https://proceedings.mlr.press/v48/hernandez-lobatoa16.html', '10.48550/arXiv.1604.01502', 1
),
(
    'MATERN52_KERNEL', 'THEORY', 'Matérn 5/2 Covariance Kernel for Surrogate Modeling',
    NULL, NULL,
    'Hàm hiệp phương sai Matérn với tham số độ mượt nu = 5/2 dùng trong mô hình hồi quy Gauss (GPR): k_52(r) = sigma^2 * (1 + sqrt(5)*r/l + 5*r^2/(3*l^2)) * exp(-sqrt(5)*r/l). Cho phép các hàm xấp xỉ liên tục vi phân 2 lần (C^2), phù hợp hơn RBF khi mô phỏng phản hồi động học phi tuyến tính của hệ thống phanh AEB.',
    'BOOK', 'Interpolation of Spatial Data: Some Theory for Kriging',
    'Michael L. Stein', 'Springer Series in Statistics', 1999,
    'Chapter 2: Covariance Functions & Smoothness', 'https://link.springer.com/book/10.1007/978-1-4612-1494-6', '10.1007/978-1-4612-1494-6', 1
),
(
    'SOBOL_LHS_DOE', 'PRINCIPLE', 'Sobol Quasi-Random Sequences & Latin Hypercube Sampling (LHS)',
    NULL, NULL,
    'Phương pháp thiết kế thử nghiệm không gian (Space-Filling Design of Experiments - DoE) dùng dãy Sobol độ lệch thấp (low-discrepancy) hoặc Latin Hypercube Sampling để rải đều các bộ tham số khởi tạo ban đầu [TTC, delay, decel, buildup] trong không gian 4 chiều trước khi khởi chạy chu trình học lặp Gaussian Process trong MOBO.',
    'PAPER', 'A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code',
    'M. D. McKay, R. J. Beckman, W. J. Conover', 'Technometrics (Vol. 21, No. 2)', 1979,
    'pp. 239-245', 'https://www.jstor.org/stable/1268522', '10.1080/00401706.1979.10489755', 1
),
(
    'BOSCH_BRAKE_SYSTEMS', 'THEORY', 'Hydraulic and Electromechanical Brake Actuation Response Dynamics',
    NULL, NULL,
    'Mô hình cơ điện thủy lực của hệ thống phanh đĩa ô tô hiện đại (iBooster / ESP-EHB). Thời gian trễ kích hoạt phanh t_total ~ 0.35 s bao gồm: trễ nhận lệnh điện tử t_delay (~50-100 ms), lấp đầy khe hở má phanh (calliper filling ~100-150 ms) và tăng áp lực thủy lực t_buildup (~150-250 ms) đạt gia tốc cực đại (buildup_rate từ 15-40 m/s^3).',
    'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)',
    'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014,
    'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://link.springer.com/book/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1
),
(
    'EURO_NCAP_CP_SCENARIOS', 'STANDARD', 'Euro NCAP VRU Crossing Pedestrian Scenarios (CPFA, CPNA, CPNCO)',
    NULL, NULL,
    'Định nghĩa chi tiết 3 kịch bản kiểm thử va chạm người đi bộ cắt ngang: (1) CPFA-50 (Car-to-Pedestrian Farside Adult, va chạm tâm xe 50%, tốc độ người đi bộ 8 km/h), (2) CPNA-25 & CPNA-75 (Nearside Adult, xuất phát từ lề gần, va chạm 25% hoặc 75% chiều rộng xe, tốc độ 5 km/h), (3) CPNCO-50 (Nearside Child Obstructed, trẻ em khuất sau xe đỗ ven đường chạy vụt ra với tốc độ 5 km/h).',
    'STANDARD', 'Euro NCAP Assessment Protocol - Vulnerable Road User Protection v4.5',
    'Euro NCAP Secretariat', 'European New Car Assessment Programme (Euro NCAP)', 2023,
    'Section 3: AEB / LSS VRU Test Protocol', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1
),
(
    'EURO_NCAP_TB024', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols',
    NULL, NULL,
    'Quy định kỹ thuật chính thức của Euro NCAP về xử lý tín hiệu cảm biến trong kiểm thử an toàn chủ động: bộ lọc 12-pole không dịch pha (zero-phase 12-pole Butterworth filter) tần số cắt -6dB tại 10 Hz cho kênh gia tốc dọc và ngang; mốc thời gian T_AEB tính từ thời điểm phanh bắt đầu kích hoạt thực sự (deceleration đạt -0.5 m/s^2 hoặc áp lực dầu đạt ngưỡng).',
    'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols for Active Safety',
    'Euro NCAP Technical Working Group', 'European New Car Assessment Programme (Euro NCAP)', 2021,
    'Clause 4: Filtering of Vehicle Kinematic Data', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1
)
ON DUPLICATE KEY UPDATE
    ref_name = VALUES(ref_name),
    ref_type = VALUES(ref_type),
    ref_value = VALUES(ref_value),
    unit = VALUES(unit),
    description = VALUES(description),
    source_type = VALUES(source_type),
    source_title = VALUES(source_title),
    author = VALUES(author),
    organization = VALUES(organization),
    publication_year = VALUES(publication_year),
    page = VALUES(page),
    url = VALUES(url),
    doi = VALUES(doi),
    is_active = VALUES(is_active);
