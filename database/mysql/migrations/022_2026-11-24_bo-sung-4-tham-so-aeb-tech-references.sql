-- Migration 022: Bổ sung tài liệu kỹ thuật chi tiết cho 4 tham số AEB cốt lõi
-- Ngày tạo: 2026-11-24
-- Đảm bảo 100% chuẩn mã UTF-8 (utf8mb4) và liên kết chính thức

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 1. Bổ sung 4 tham số AEB vào bảng tech_references
INSERT INTO tech_references (
    ref_code, ref_type, ref_name, ref_value, unit, description,
    source_type, source_title, author, organization, publication_year, page, url, doi, is_active
) VALUES
(
    'PARAM_TTC_THRESHOLD', 'DEFINITION', 'AEB Parameter: Time-to-Collision Threshold (TTC_THRESHOLD)',
    NULL, 's',
    'Tham số quyết định kích hoạt phanh khẩn cấp tự động: khi giá trị Time-to-Collision (TTC) dự đoán nhỏ hơn hoặc bằng ngưỡng này, hệ thống AEB lập tức phát lệnh phanh khẩn cấp. Công thức: TTC = Range / Range_Rate (hoặc X_rel / V_ego với kịch bản người đi bộ cắt ngang CP_CROSSING). Khoảng tối ưu: [0.5, 3.5] s (mặc định 1.5 - 1.8 s). Đánh đổi: TTC lớn phanh sớm giúp tránh va chạm nhưng tăng nguy cơ phanh oan (false positive); TTC nhỏ giảm phanh oan nhưng xe không đủ quãng đường dừng gây va chạm.',
    'STANDARD', 'ISO 15623:2013 Transport systems - Forward vehicle collision warning systems',
    'ISO Technical Committee ISO/TC 204', 'International Organization for Standardization (ISO)', 2013,
    'Clause 5.3: Collision Warning & Braking Timing', 'https://www.iso.org/standard/54483.html', 'ISO-15623:2013', 1
),
(
    'PARAM_BRAKE_ACTIVATION_DELAY', 'THEORY', 'AEB Parameter: Brake Activation Delay (BRAKE_ACTIVATION_DELAY)',
    NULL, 's',
    'Tham số mô hình hóa tổng thời gian trễ của hệ thống chấp hành phanh cơ điện tử: khoảng thời gian từ lúc ECU phát lệnh phanh khẩn cấp đến khi má phanh ép sát đĩa và áp suất thủy lực sinh gia tốc hãm thực sự (a(t) <= -0.5 m/s^2). Công thức: t_total = t_CAN + t_valve + t_calliper. Khoảng tối ưu: [0.0, 0.5] s (mặc định 0.15 s). Trong thời gian trễ này, xe tiếp tục chuyển động quán tính một quãng s_lost = v0 * t_delay.',
    'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)',
    'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014,
    'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://www.springer.com/gp/book/9783658039776', '10.1007/978-3-658-03978-3', 1
),
(
    'PARAM_MAX_DECELERATION', 'PRINCIPLE', 'AEB Parameter: Maximum Emergency Deceleration (MAX_DECELERATION)',
    NULL, 'm/s2',
    'Mức gia tốc giảm tốc tối đa mà bộ điều khiển AEB yêu cầu hệ thống phanh đạt tới trong pha phanh khẩn cấp: a_target = min(MAX_DECELERATION, mu * g). Khoảng tối ưu: [3.0, 10.0] m/s^2 (mặc định 8.0 m/s^2). Cận trên 10.0 m/s^2 bị giới hạn bởi độ bám cực đại Coulomb giữa lốp cao su và mặt đường nhựa khô ráo; cận dưới 5.0 m/s^2 là ngưỡng tối thiểu theo Euro NCAP để phân loại là phanh khẩn cấp (Emergency Braking) thay vì phanh cảnh báo.',
    'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)',
    'Hans B. Pacejka, Igo Besselink', 'Society of Automotive Engineers (SAE) / Elsevier', 2012,
    'Chapter 1: Tire Characteristics & Braking Limits', 'https://www.sae.org/publications/books/content/r-435/', '10.4271/R-435', 1
),
(
    'PARAM_BRAKE_BUILDUP_RATE', 'THEORY', 'AEB Parameter: Brake Buildup Rate (BRAKE_BUILDUP_RATE)',
    NULL, 'm/s3',
    'Tốc độ tăng lực phanh (buildup rate / jerk limit), biểu thị tốc độ thay đổi gia tốc theo thời gian: r = da/dt (m/s^3). Thời gian đạt gia tốc phanh cực đại: t_buildup = MAX_DECELERATION / BRAKE_BUILDUP_RATE. Khoảng tối ưu: [5.0, 20.0] m/s^3 (mặc định 20.0 m/s^3 = JERK_LIMIT của lõi AEB theo ADR-040). Buildup rate cao giúp phanh đạt lực hãm nhanh nhất để cứu mạng nhưng tạo ra RMS Jerk lớn gây giật mạnh; buildup rate thấp giúp phanh êm ái nhưng kéo dài quãng phanh.',
    'PAPER', 'Optimization of Braking Curves for Autonomous Emergency Braking Systems Considering Passenger Safety and Acceptance',
    'Dominik Ebel, Christoph Lachenmayer, Klaus Dietmayer', 'IEEE Transactions on Intelligent Vehicles', 2020,
    'Vol. 5, Iss. 3, pp. 488-498', 'https://ieeexplore.ieee.org/document/9089293/', '10.1109/TIV.2020.2987445', 1
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

-- 2. Cập nhật bảng aeb_parameters với mô tả đầy đủ công thức và đánh đổi
UPDATE aeb_parameters SET
    description = 'Ngưỡng Time-to-Collision kích hoạt phanh AEB (TTC = Range / Range_Rate). Khoảng tối ưu [0.5, 3.5] s; đánh đổi giữa tránh va chạm và tỷ lệ phanh oan (ISO 15623:2013).'
WHERE code = 'TTC_THRESHOLD';

UPDATE aeb_parameters SET
    description = 'Độ trễ phản hồi hệ thống chấp hành phanh cơ điện tử t_total = t_CAN + t_valve + t_calliper. Khoảng tối ưu [0.0, 0.5] s (Bosch Automotive Handbook / Reif 2014).'
WHERE code = 'BRAKE_ACTIVATION_DELAY';

UPDATE aeb_parameters SET
    description = 'Giới hạn giảm tốc phanh khẩn cấp tối đa a_target <= mu * g. Khoảng tối ưu [3.0, 10.0] m/s^2 (Pacejka 2012 / Euro NCAP min 5.0 m/s^2).'
WHERE code = 'MAX_DECELERATION';

UPDATE aeb_parameters SET
    description = 'Tốc độ tăng lực phanh (buildup rate / jerk limit da/dt). Khoảng tối ưu [5.0, 20.0] m/s^3; cân bằng giữa RMS Jerk êm ái và quãng phanh dừng (Ebel et al. 2020 / ADR-040).'
WHERE code = 'BRAKE_BUILDUP_RATE';
