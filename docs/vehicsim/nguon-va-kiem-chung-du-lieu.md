# Sổ kiểm chứng nguồn dữ liệu của VehicSim

**Ngày kiểm:** 20/10/2026. **Phạm vi:** các con số, tiêu chuẩn và bài báo được trích trong
[aeb-parameter-ranges.md](aeb-parameter-ranges.md), [ADR-040](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[kế hoạch 20/10](ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) và các hằng số trong `worker/`.
Phần tham số *kịch bản* (tốc độ xe, tốc độ người đi bộ, hình học, thời tiết, ma sát) đã có
tài liệu riêng ở `C:\CapstoneFPTU\Notes\scenario_params_evidence\SCENARIO_PARAMS_BANG_CHUNG.md` (13/10/2026, ngoài repo, kèm PDF gốc
và 37 ảnh cắt); sổ này **không lặp lại** mà chỉ đối chiếu những chỗ hai tài liệu chạm nhau.

Mục tiêu: trả lời được câu hỏi của hội đồng "con số này lấy ở đâu, em đã đọc nguồn chưa". Mỗi khẳng định dưới đây được mở lại
trong văn bản gốc (hoặc bản sao của nó) và ghi **đoạn, trích dẫn ngắn, mức bằng chứng**. Cái nào không mở được thì ghi rõ là không mở được.

**Kết quả (56 khẳng định):** ✔ 34 khớp nguồn · ◐ 9 khớp một phần · ✘ 4 sai hoặc không tìm thấy · ⚠ 4 giả định của nhóm · ? 5 chưa xác minh được.

**Sáu phát hiện đáng chú ý nhất:**
1. Quy tắc "phanh khẩn cấp không được bắt đầu khi TTC > 3 s" chỉ xác minh được ở **R131 và EU 347/2012 (xe nặng)**; R152 (xe con) không có (R2, R3).
2. UN R152 yêu cầu lệnh phanh **≥ 5,0 m/s²**; 4 m/s² là của xe nặng (R1, R4).
3. "ISO 15622" cho giới hạn jerk 2,5/5 m/s³ là **sai tên**: bài báo gốc viết ISO 22179 (A25).
4. "10 km/h" và "90 so với 20 km/h" của R131 **không có** trong bản văn đã đọc; dải "10–70 km/h" là chưa xác minh (R7).
5. Ma sát mưa 0,70 / 0,55 **không có nguồn chính quy**; các tiêu chuẩn chỉ thử đường khô, và `frictionScaleFactor` đi vào thang ma sát riêng của CARLA (A5, A6).
6. Euro NCAP v4.5.1 là nguồn gốc của các yêu cầu đo ở D3 (≥ 100 Hz, lọc gia tốc 10 Hz, T_AEB −0,3/−1 m/s²) nhưng bản lọc thực nghiệm của dự án **chưa khớp** "12-pole phaseless" (R14, R19, M3).

## 1. Cách đọc

**Mức bằng chứng**

| Mức | Nghĩa |
|---|---|
| **A** | Đọc trong văn bản gốc (hoặc bản sao nguyên văn tiếng Anh của nó). Có đoạn và trích dẫn. |
| **B** | Đọc trong **bản dịch** của văn bản gốc (Công báo EU bằng tiếng Tây Ban Nha). Trích bản dịch, kèm nghĩa tiếng Việt; không phải văn bản tiếng Anh của UNECE. |
| **C** | Chỉ đọc được tóm tắt/trang mô tả (bài báo có phí, tiêu chuẩn ISO), hoặc chỉ xác nhận tiêu chuẩn **tồn tại**. |
| **D** | Chỉ có trích đoạn từ kết quả tìm kiếm hoặc nguồn thứ cấp; chưa mở được văn bản gốc. |
| **E** | Không có nguồn: giả định của nhóm, hoặc nguồn không truy cập được. |

**Kết luận**: ✔ khớp nguồn · ◐ khớp một phần (nêu rõ chỗ lệch) · ✘ sai hoặc không tìm thấy trong nguồn · ⚠ giả định của nhóm · ? chưa xác minh được.

**Quy tắc dùng trong báo cáo:** chỉ số liệu mức A/B và kết luận ✔ được trích như "căn cứ". Mức C/D/E chỉ được trình bày kèm nhãn
(ước tính, giả định, chưa xác minh). Bộ nhãn tham số của dự án (Measured/Sourced/Calibrated/Estimated/Assumed) vẫn áp dụng cho từng tham số.

## 2. Nguồn đã mở

Truy cập ngày 20/10/2026. PDF tải về chỉ để đối chiếu, **không đưa vào repo**.

| Mã | Nguồn | Phiên bản | Đường dẫn | Mức |
|---|---|---|---|---|
| E1 | Euro NCAP, AEB/LSS VRU Test Protocol | v4.5.1, 02/2024 | [cdn.euroncap.com](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_lss_vru_test_protocol_v451_cb0d5dfd0a.pdf) | A |
| E2 | Euro NCAP, AEB Car-to-Car Test Protocol | v4.3 | [cdn.euroncap.com](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_c2c_test_protocol_v43_1e6ed06def.pdf) | A |
| F1 | NHTSA, FMVSS No. 127 (49 CFR 571.127) | eCFR 01/01/2025 (89 FR 39686, 09/05/2024) | [ecfr.gov](https://www.ecfr.gov/current/title-49/part-571/section-571.127) | A |
| U1 | UN Regulation No. 131 (AEBS xe tải/buýt) | bản gốc, hiệu lực 13/02/2014 (EUR-Lex 42014X0719(01)) | [bản sao lexaris.de](https://lexaris.de/book/version/documentflat/head/2035378) | A |
| U2 | UN Regulation No. 152 (AEBS xe M1/N1) | chuỗi 02, bổ sung 3 (Công báo L 2024/2497, 27/09/2024, **tiếng Tây Ban Nha**) | [boe.es](https://www.boe.es/doue/2024/2497/L00001-00038.pdf) | B |
| U3 | UN Regulation No. 152 | bản hợp nhất 2020 (Công báo L 360, 30/10/2020, tiếng Tây Ban Nha) | [boe.es](https://www.boe.es/doue/2020/360/L00066-00089.pdf) | B |
| U4 | Quy định (EU) 347/2012 | Công báo L 109, 21/04/2012, tiếng Tây Ban Nha | [boe.es](https://www.boe.es/doue/2012/109/L00001-00017.pdf) | B |
| U5 | Seiniger (BASt), *AEBS for Heavy Vehicles* (bài trình bày) | 2021–2022 | [fnc.itu.int](https://fnc.itu.int/wp-content/uploads/2021/12/Seiniger-Patrick.pdf) | A (slide) |
| J1 | SAE J211-1 (1995), Phụ lục C | 1995 | [law.resource.org](https://law.resource.org/pub/us/cfr/ibr/005/sae.j211-1.1995.html) | A |
| P1 | Buerkle et al., *Safe Perception – A Hierarchical Monitor Approach* | arXiv 2208.00824 | [arxiv.org](https://arxiv.org/abs/2208.00824) | A |
| P2 | Lee, Jung, Kim, *Density-Aware Adaptive Thresholding* | arXiv 2404.13852 | [arxiv.org](https://arxiv.org/abs/2404.13852) | A |
| P3 | Banerjee et al., *Influence of Pedestrian Collision Warning Systems on Driver Behavior* | arXiv 2112.09074 | [arxiv.org](https://arxiv.org/abs/2112.09074) | A |
| P4 | *Stress Testing Method for …* | arXiv 2011.06553 | [arxiv.org](https://arxiv.org/abs/2011.06553) | A |
| P5 | *Generating Critical Scenarios for Testing ADS* (AVASTRA) | arXiv 2412.02574 | [arxiv.org](https://arxiv.org/abs/2412.02574) | A |
| P6 | Maschke, Preu, Plenter, Schoenawa (Volkswagen AG), *Assessing AEB: A Robust Approach Using Phenomenological Sensor Models*, Vehicles 2024, 6(4) | MDPI | [mdpi.com](https://www.mdpi.com/2624-8921/6/4/82) | A |
| P7 | Lai, Liu, Hu, *An AEB Control Method for Improving Ride Comfort*, WEVJ 2024, 15(6), 259 | MDPI | [mdpi.com](https://www.mdpi.com/2032-6653/15/6/259) | A |
| P8 | Fei et al., *A New Safety Distance Model Based on Braking Process Considering Adhesion Coefficient*, Electronics 2024, 13(2), 421 | MDPI | [mdpi.com](https://www.mdpi.com/2079-9292/13/2/421) | A |
| P9 | Taylor, *Brake Response Times of Advanced Emergency Braking Systems*, EVU 2024 | 32nd EVU Congress | [hawkins.biz](https://www.hawkins.biz/wp-content/uploads/2024/10/EVU2024_23_Taylor-1.pdf) | A |
| P10 | Seiler, Song, Hedrick, *Development of a Collision Avoidance System*, SAE 980853 | 1998 | [umn.edu](https://dept.aem.umn.edu/~SeilerControl/Papers/1998/SeilerEtAl_98SAE_CollisionAvoidanceSystem.pdf) | A |
| P11 | Chen et al., *A multi-closed loop pressure control in EHB for electric vehicle*, IJEHV 2023, 15(3) | Inderscience | [inderscience.com](https://inderscience.com/filter.php?aid=134374) | C (tóm tắt) |
| P12 | Krakowiak, Dębowski, *Analysis of operation and reaction time of a motorcycle braking system*, Biuletyn WAT 2022, 71(3) | WAT | [doaj.org](https://doaj.org/article/99f55998a030461195f026b5a0edf6e7) | C (tóm tắt) |
| K1 | CARLA 0.9.16, *Synchrony and time-step* | 0.9.16 | [readthedocs](https://carla.readthedocs.io/en/0.9.16/adv_synchrony_timestep/) | A |
| K2 | CARLA 0.9.16, Python API (`WheelPhysicsControl`) | 0.9.16 | [readthedocs](https://carla.readthedocs.io/en/0.9.16/python_api/) | A |
| K3 | ScenarioRunner, mã nguồn | tag `v0.9.16` (checkout cục bộ) | [GitHub](https://github.com/carla-simulator/scenario_runner) | A |

**Không mở được:** UNECE (chặn truy cập tự động) nên không có bản tiếng Anh của R152; NHTSA `woods.pdf` (chặn); bản văn GB/T 39901-2021;
bản văn R131 chuỗi 02; ISO 15622, ISO 22179, ISO 22733-1 (có phí); toàn văn Chen 2023, Krakowiak 2022; luận văn JKU; Mazda/Honda gốc ngoài Seiler 1998.

## 3. Tiêu chuẩn và giao thức

| ID | Khẳng định (nơi trích) | KQ | Mức | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| R1 | Pha phanh khẩn cấp bắt đầu khi AEBS yêu cầu ≥ 4 m/s² (EU 347/2012; R131) | ✔ | A / B | U1 đoạn 2.9: *"the phase starting when the AEBS emits a braking demand for at least 4 m/s² deceleration to the service braking system"*. U4 Điều 2(8): *"la fase que empieza cuando el AEBS emite una petición de frenado de al menos 4 m/s2"* | Cả hai áp dụng cho **xe nặng** (U4: M2, M3, N2, N3). |
| R2 | Phanh khẩn cấp không được bắt đầu trước khi TTC ≤ 3 s (R131, EU 347/2012) | ✔ (xe nặng) | A / B | U1 đoạn 6.4.5 và 6.5.4: *"The emergency braking phase shall not start before a TTC equal to or less than 3,0 seconds."* U4 Phụ lục II 2.4.4 và 2.5.4: *"no empezará hasta que el tiempo para la colisión no sea inferior o igual a tres segundos"* | **Chỉ xe nặng.** Xem R3. |
| R3 | Quy tắc TTC ≤ 3 s áp dụng cho xe con (docs dùng làm cận trên TTC) | ✘ | B | U2/U3 (R152, xe M1/N1): TTC chỉ xuất hiện ở định nghĩa 2.12 và ở một điều kiện thử (U2 dòng 1969); **không có** giới hạn thời điểm bắt đầu phanh khẩn cấp | Với xe con, cận 3 s chỉ có nguồn thứ cấp (R9). |
| R4 | UN R152 yêu cầu lệnh phanh ≥ 5,0 m/s² (docs nhắc 4 m/s² ở mục 7) | ◐ | B | U2 đoạn 5.2.1.2 (xe) và 5.2.2.2 (người đi bộ): *"una demanda de frenado de como mínimo 5,0 m/s²"*; U3 cùng nội dung | 4 m/s² là của xe nặng. Đã sửa docs. |
| R5 | R152: hệ thống phải hoạt động trong dải 10–60 km/h (xe) và 20–60 km/h (người đi bộ) | ✔ | B | U2 đoạn 5.2.1.3 và 5.2.2.3: *"en el intervalo de velocidades del vehículo de 10 a 60 km/h"* / *"de 20 a 60 km/h"* | Docs ghi "10–70 km/h từ MLIT": xem R7. |
| R6 | R152: người đi bộ cắt ngang với thành phần vận tốc ngang ≤ 5 km/h; đường phẳng, khô, bám tốt | ✔ | B | U2 đoạn 5.2.2.4 a), b) i): *"no superior a 5 km/h"*; *"calzada llana, horizontal y seca que permite una buena adherencia"*. Đoạn 2.13: hệ số phanh đủ để đạt giảm tốc trung bình ≥ 9 m/s² | R152 chỉ thử trên đường khô. |
| R7 | Tốc độ thử trong docs: R152 "xe đứng yên 40 km/h; xe đang chạy 60 so với 20 km/h"; R131 sửa đổi "từ 10 km/h; 90 so với 20 km/h (chênh 70)" | ◐ / ? | B / D | U3 (R152 00/01): thử đứng yên ở **20, 42, 60 km/h**; xe chạy 30 và 60 km/h với mục tiêu 20 km/h (chênh 10 và 40); người đi bộ 20, 30, 60 km/h, mục tiêu 5 km/h. U1 (R131 bản 2014): kích hoạt từ **15 km/h** (5.2.3); thử bắt đầu ở **80 ± 2 km/h** (6.4.1, 6.5.1); mục tiêu 12 hoặc 67 km/h (Phụ lục 3 cột H). R131 chuỗi 02 (công bố 21/02/2023): chỉ có trích đoạn tìm kiếm "10 đến 100 km/h" (D) | "10 km/h" và "90 so với 20" **không có** trong bản R131 đã đọc; dải "10–70 km/h" suy ra từ chúng là **chưa xác minh**. |
| R8 | Euro NCAP: CPFA 10–60 km/h, mục tiêu 8 km/h, va chạm 50 %; CPNA 20–60 km/h, mục tiêu 5 km/h, 25/75 %; CPNCO 50–80 km/h, 5 km/h | ✔ | A | E1 bảng mục 7.2, các hàng *"VUT speed [km/h] 10-60 20-60 50-80"*, *"Target speed [km/h] 8 5 5"*, *"Impact location [%] 50 25,75 50"* | Khớp với tài liệu kịch bản cũ (ảnh 10). |
| R9 | GB/T 39901-2021: phanh khẩn cấp không sớm hơn 3 s trước va chạm | ? | D | Chỉ có tin tức/bài ngành tiếng Trung; **chưa mở được bản văn**. Tiêu chuẩn đã bị thay bởi GB 39901-2025 (công bố 31/12/2025, hiệu lực 01/01/2028) theo các nguồn đó | Không dùng làm căn cứ chính. |
| R10 | Euro NCAP chỉ thử đường khô PBC ≥ 0,9, không mưa, tầm nhìn > 1 km (docs ghi ma sát ướt 0,70 / 0,55) | ✔ | A | E1 mục 6.1.3: *"minimal peak braking coefficient (PBC) of 0.9"*; 6.2.5: *"No precipitation shall be falling and horizontal visibility … greater than 1km"* | Mưa/sương nằm **ngoài** giao thức: xem A5. |
| R11 | FMVSS 127: AEB người đi bộ hoạt động ở 10 < v < 73 km/h; thử 10–60 km/h; người nộm 5 km/h (từ phải, S8.3.1), 8 km/h (từ trái, S8.3.2), 5 km/h (bị che khuất, S8.3.3) | ✔ | A | F1 S5.2.2: *"greater than 10 km/h (6.2 mph) and less than 73 km/h (45.3 mph)"*; S8.3.1 và S8.3.2: *"any speed between 10 km/h and 60 km/h"*; *"pedestrian test mannequin speed is 5 km/h"* (từ phải) / *"8 km/h"* (từ trái) | Khớp tài liệu cũ (ảnh 20, 23). |
| R12 | FMVSS 127: TTC0 = 5,0 s (xe phía trước), **4,0 s (người đi bộ)**; đây là headway khởi tạo bài thử, không phải giới hạn kích hoạt | ✔ | A | F1 S7.2 và S8.2: *"providing 5.0 seconds time to collision"*, *"providing 4.0 seconds time to collision"* | Đừng so 4,0 s với `TTC_THRESHOLD` như một giới hạn. |
| R13 | FMVSS 127: phanh oan nếu gia tốc phanh dư vượt phanh tay ≥ 0,25 g; mặt đường thử PFC 1,02 (ASTM E1337-19, 64 km/h), khô | ✔ | A | F1 S5.3: *"exceeds what manual braking would produce by 0.25 g or greater"*; S6.2.2: *"peak friction coefficient (PFC) of 1.02"* | ADR-040 dùng "phanh oan tăng ≤ 5 điểm %": đó là **ngưỡng của nhóm**, không phải của tiêu chuẩn (A4). |
| R14 | Euro NCAP: lấy mẫu ≥ 100 Hz; gia tốc lọc Butterworth 12 cực không lệch pha 10 Hz; vị trí và vận tốc không lọc | ✔ | A | E1 4.1.1: *"at least 100Hz"*; 4.4.1.1: *"Position and speed are not filtered"*; 4.4.1.2: *"Acceleration, yaw rate and VUT steering wheel velocity with a 12-pole phaseless Butterworth filter with a cut off frequency of 10Hz"* | Nguồn của D3 trong kế hoạch 20/10. |
| R15 | Euro NCAP: T_AEB = điểm dữ liệu cuối cùng mà gia tốc đã lọc < −1 m/s², rồi lùi về lúc gia tốc vượt −0,3 m/s² | ✔ | A | E1 mục 2: *"last data point where the filtered acceleration signal is below -1 m/s2, and then going back to the point … first crossed -0.3 m/s2"* | Là định nghĩa **khi chấm**; `brake_onset_t` của dự án định nghĩa khác (xem M2). |
| R16 | Euro NCAP chồng lấn ngang: 100 % = hai đường tâm trùng nhau (TD-41) | ✔ | A | E2 mục 3.4.1: *"In case of 100% overlap, the centrelines of the VUT and GVT are aligned."* | |
| R17 | "Euro NCAP dùng thời gian kịch bản 15 s" (`max_duration_s` mặc định, TD-42) | ✘ | A | Không có "15 s" trong E1 lẫn E2 | Là giá trị của nhóm hoặc từ phiên bản khác; không xác minh được. |
| R18 | Vận tốc va chạm tương đối (ISO 22733-1:2022) trong `TelemetryMetricsService` | ◐ | A / C | E2 mục 2: *"Vrel_impact - means the relative speed at which the VUT hits the GVT"*. ISO 22733-1:2022 có tồn tại (ed. 2, 13/09/2022, car-to-car) nhưng E2 không viện dẫn nó và em không đọc được bản văn | Nên trích Euro NCAP làm nguồn; ISO chỉ ở mức C. |
| R19 | "Bộ lọc Butterworth 12 cực không lệch pha" nghĩa là bộ lọc 6 cực chạy xuôi rồi ngược | ? | A (J1) / E | J1 Phụ lục C: *"Equation C1 is for a 2-pole filter. To make a 4-pole filter, the data are passed through the filter twice … forward and then backward"* | Đây là quy ước của SAE J211. **Euro NCAP không giải thích** "12-pole phaseless" cũng không nói 10 Hz áp cho mỗi lượt hay cho đáp ứng tổng; không tự chọn. |

## 4. Tham số AEB và các bài báo (đối chiếu từng dòng của `aeb-parameter-ranges.md`)

| ID | Tham số / khẳng định trong docs | KQ | Mức | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| A1 | #1 Ngưỡng tin cậy: PointPillars, ngưỡng 0,5 bỏ sót 90 và 9 FP; hạ xuống 0,2 còn 20 bỏ sót và 115 FP; lệch 0,1 làm mất cả xe tải | ✔ | A | P1: *"If we use a conservative threshold of 0.5 the numbers of missed objects (FN count) is 90"*; *"decreasing the threshold to 0.2 the number of missed objects reduces to 20"*; *"the number of false alarms (FPs) increases from 9 to 115"*; *"modification of 0.1 on conf leads to a miss detection of an entire truck"* | Dữ liệu Lyft, LiDAR. |
| A2 | #1 Bài 2404.13852: ba ngưỡng 0,3/0,5/0,7 trên KITTI; 0,7 làm tỉ lệ phát hiện vật xa hơn 40 m giảm mạnh | ✔ | A | P2: *"single threshold values, such as 0.3, 0.5, and 0.7 … Kitti"*; *"the detection rate for objects beyond 40m dropped significantly"* | Cả hai bài dùng LiDAR 3D; ngưỡng 0,70 của lõi AEB là **giả định mô hình** (A3). |
| A3 | #1–#3 là **hằng số** của lõi AEB, mô phỏng độ tin cậy | ⚠ | E | `aeb_stack.py`: `_WEATHER_CONFIDENCE`, `DETECTION_CONFIDENCE_THRESHOLD = 0.70`… | Tham số có nguồn tham khảo nhưng giá trị là mô hình. |
| A4 | Ngưỡng phanh oan (ADR-040) "tăng ≤ 5 điểm %", `RegressionService` 0,5 điểm % | ⚠ | E | Không có trong R152, FMVSS, Euro NCAP. FMVSS S5.3 dùng tiêu chí khác (0,25 g) | TD-48 đã ghi. |
| A5 | Ma sát mưa 0,70 và mưa lớn 0,55 (`WEATHER_FRICTION`) | ⚠ | D/E | Tiêu chuẩn chỉ thử đường khô (R6, R10, R13). Nguồn thứ cấp cho đường ướt không thống nhất: bảng 0,5–0,7; dữ liệu NHTSA (chỉ trích đoạn tìm kiếm, PDF bị chặn) ghi PFC ướt 0,85–0,88 với lốp chuẩn | **Assumed.** Khớp tài liệu cũ mục 4.9. |
| A6 | CARLA: `frictionScaleFactor` của OpenSCENARIO thành ma sát mặt đường | ◐ | A | K3: `ChangeRoadFriction` sinh `static.trigger.friction` với `friction = frictionScaleFactor`, vùng extent 1 000 000 (đơn vị CARLA). K2: `tire_friction` chỉ là *"A scalar value that indicates the friction of the wheel"* (mặc định 2,0; mỗi xe một giá trị) | Giá trị đi vào thang **riêng của CARLA**, không phải μ vật lý đã hiệu chuẩn. Phanh CARLA chưa hiệu chuẩn (TD-17); lõi còn tự chặn `μ·g` bằng phần mềm. |
| A7 | #2 Ngưỡng vận tốc tương đối 10–70 km/h từ R152 / R131 (MLIT) | ? | B / D | Xem R7 | Lõi dùng 2,0 m/s (7,2 km/h): thấp hơn mọi dải kích hoạt đã đọc (10 km/h với R152). |
| A8 | #3 Maschke Bảng 3: prediction 0,5 s, cycle 0,06 s, consideration 0,1 s | ✔ | A | P6, *Table 3. Constant sensor parameters*: Cycle time 0.06 s · Consideration time 0.1 s · Prediction time 0.5 s | Docs diễn giải 0,5 s là "thời gian ngoại suy sau khi mất tín hiệu"; bài viết: *"objects are predicted based on the last measurements for a maximum definable time"* (ngoài chu kỳ đo). Khớp ý. |
| A9 | #3 Luận văn JKU: NMPC horizon 5 s, tầng phanh/lái 2 s | ? | E | Không mở được | Docs đã tự ghi "độ tin cậy thấp". Hằng số 2,0 s là **giả định**. |
| A10 | #4 Seiler 1998: Mazda α1 = 6, α2 = 8 m/s², τ1 = 0,1 s, τ2 = 0,6 s, d0 = 5 m; Honda 7,8 m/s², τ1 = 0,5 s, τ2 = 1,5 s | ✔ | A | P10: *"α1 = 6 m/s², α2 = 8 m/s², τ1 = 0.1 s, τ2 = 0.6 s, and d0 = 5 m"*; *"α1 = α2 = 7.8 m/s², τ1 = .5 s, and τ2 = 1.5 s"* (ký hiệu Hy Lạp khôi phục từ ngữ cảnh vì PDF mất chúng khi trích) | |
| A11 | #4 Berkeley R_min = 5 m, giảm tốc 6 m/s² (AVASTRA) | ✔ | A | P5: *"default settings from the Berkeley algorithm [21], which assigns a deceleration value of -6m/s2 … sets Rmin to 5 meters"* | |
| A12 | #4 Lai 2024: khoảng cách dừng từ 2 m (Quad) đến 15,8 m (PDF) | ✔ | A | P7: *"The post-stopping … distances for the Quad, PDF and the proposed enhanced control system are 2.0 m, 15.8 m and 8.0 m"* (kịch bản 80 km/h) | Là kết quả mô phỏng, không phải tham số vào. Cận dưới 1 m là đề xuất của nhóm (docs đã ghi). |
| A13 | #5 Maschke: TTC ≤ 1,5 s → tối đa 3 m/s²; TTC ≤ 0,6 s → tối đa 10 m/s² | ✔ | A | P6: *"braking intervention is possible from a TTC value equal to or lower than 1.5 s with a maximum deceleration of 3 m/s²… limited to 10 m/s² if the TTC value is equal to or lower than 0.6 s"* | Mô hình của một hãng, không phải quy định. |
| A14 | #5 Lai: > 2 s không kích hoạt; 1,6–2 s nhẹ; 0,7–1,6 s vừa; < 0,7 s toàn phần; ngưỡng chuyển PDF 2,6 s | ✔ | A | P7 mục 2.1: *"more than 2 s … inactive"*, *"1.6 s to 2 s … mild brake"*, *"the time to collision ranges from 0.7 s to"* (1,6 s ở dòng kế: PDF hai cột bị trộn dòng khi trích), *"drops below 0.7 s … complete brake"* [13]; *"2.6 s in this study [22]"* | Các mốc 2/1,6/0,7 là của tài liệu [13] mà bài trích lại. |
| A15 | #5 Cận trên TTC 3,0 s | ◐ | A / B | Xem R2, R3 | ✔ với xe nặng; xe con chỉ nguồn thứ cấp (R9). Code cho phép tới 4,0 s: lệch so với **mô hình xe nặng**, không phải vi phạm một quy định xe con. |
| A16 | #6 Taylor 2024: 195 lần kích hoạt, 10 xe 2019–2022, tổng thời gian 0,76–1,97 s; P10/P50/P90 = 0,88/1,17/1,50 s | ✔ | A | P9: *"In total, 195 valid tests … activations"*; *"The total range stretched from 0.76 to 1.97 seconds"*; Bảng 1: 0,88 · 1,17 · 1,50 | Thử ở 32 và 48 km/h; thời gian tính từ lúc người nộm lộ ra tới lúc đạt phanh toàn phần. |
| A17 | #6 Maschke: 0,06 + 0,1 = 0,16 s | ✔ | A | P6 Bảng 3 (A8) | Phép cộng của docs. |
| A18 | #7 Fei 2024: giảm tốc tối đa B = μ·g; μ mô phỏng 0,1–0,9 | ✔ | A | P8 Phương trình (6) và câu kèm theo: *"The relationship between the maximum deceleration and the adhesion coefficient of the road is shown in Equation (6) … where [μ] is the adhesion coefficient of the road, g is the acceleration of gravity"* (PDF mất ký tự Hy Lạp khi trích văn bản); *"The value range of [μ1] is 0.1 to 0.9"* | "1–9 m/s²" là phép nhân của docs. |
| A19 | #7 Lai: giảm tốc cực đại 0,3 g – 1,0 g, μ = 1,0 | ✔ | A | P7: *"the road surface is set to high adhesion (u = 1.0)"*; *"about 0.3 g, 0.4 g,…"*; *"0.47 g, 0.8 g, 0.84 g, and 1.0 g"* | |
| A20 | #7 EU 347/2012: pha phanh khẩn cấp ≥ 4 m/s² | ✔ (xe nặng) | B | R1, R4 | Với xe con dùng 5,0 m/s² (R152). |
| A21 | #8 Maschke: gradient giảm tốc giới hạn 12 m/s³, thời gian đáp ứng 0,12 s | ✔ | A | P6: *"The deceleration gradient is limited to 12 m/s³, and a response time of 0.12 s … pressure build-up time in a real braking system [27]"* | [27] = Küçükay, *Grundlagen der Fahrzeugtechnik*, 2022, tr. 778–779: đúng như docs. |
| A22 | #8, #10 Chen 2023: áp suất xi-lanh đạt mục tiêu trong ~0,2 s | ◐ | C | Tóm tắt: mô phỏng liên hợp AMESim–Simulink, áp suất ổn định tại giá trị đặt sau khoảng 0,2 s | Là **mô phỏng**, không phải đo; không nói về AEB. Phép suy 45–50 m/s³ là của nhóm. |
| A23 | #8 Cận dưới 5 m/s³ theo "ISO 15622" | ✘ | A | Xem A25 | Mất nguồn cho cận dưới. |
| A24 | #9 Bài 2112.09074: jerk ±1 m/s³ thoải mái, ±2 chấp nhận được, ngoài ±2 không an toàn | ✔ | A | P3 mục 2.5: *"boundaries for comfortable jerk were found to be 1m/s³ while the acceptable limits … 2m/s³ [38]"*; bảng: *"Jerk < -2 … Unsafe jerk values"* | Bài trích lại tài liệu [38]: nguồn thứ cấp. Chỉ số trên (³) bị mất khi trích PDF, em khôi phục theo ngữ cảnh. |
| A25 | #9 "ISO 15622 (ACC): gradient giảm tốc 2,5 m/s³ khi > 20 m/s và 5 m/s³ khi < 5 m/s" (qua arXiv 2011.06553) | ✘ | A | P4: *"The average rate of deceleration gradient cannot exceed 2.5 m/s3 when the speed is greater than 20 m/s and 5 m/s3 when it is less than 5 m/s"*; bài gắn quan hệ giảm tốc–jerk–tốc độ với **ISO 22179 [33]**, không nêu ISO 15622 | Phải trích "ISO 22179 (theo P4)" hoặc bỏ tên tiêu chuẩn. Chưa đọc được bản ISO. Đã sửa docs. |
| A26 | #9 Maschke: hệ phanh khẩn cấp cho phép tới 12 m/s³ | ✔ | A | A21 | Là tham số mô hình, không phải giới hạn của tiêu chuẩn. |
| A27 | #10 Krakowiak & Dębowski 2022: xe máy, trung bình 0,2 s từ lúc bóp phanh tới lực đầy đủ | ◐ | C | Tóm tắt: *"the average time of activation of the braking system … is 0.2 seconds"* | Xe máy, chỉ để đối chiếu. |
| A28 | #10 Hằng số actuator 0,10 s thấp hơn cận dưới nghiên cứu 0,12 s | ✔ (số học) | A | A21 vs `ACTUATOR_RESPONSE_TIME_S = 0.10` | Docs đã ghi. |
| A30 | TTC mặc định 1,5 s (baseline) so với thực tế | ✔ | A | U5 (BASt): *"Systems typically brake 1-2 seconds before calculated crash"*; *"Avoidance Timing mostly constant: Cars ~ 1 s, Trucks ~ 2 s"*; P9: BRT trung vị 1,17 s | Khẳng định định tính; không phải quy định. |
| A29 | Bảng "Đối chiếu với code": jerk limit 20 m/s³ "vượt mức hệ phanh khẩn cấp thật (12)" | ◐ | A | A21 | 12 m/s³ là giá trị mô hình của một hãng (VW), không phải mức "hệ phanh thật" đã đo. |

## 5. Đo lường và kế hoạch 20/10

| ID | Khẳng định | KQ | Mức | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| M1 | 100 Hz, bước 0,01 s | ✔ | A | R14 (4.1.1) | Euro NCAP yêu cầu **ít nhất** 100 Hz cho dữ liệu quán tính/GPS. |
| M2 | Mốc phanh bằng gia tốc lọc với ngưỡng −0,3 / −1 m/s² | ✔ | A | R15 | Euro NCAP dùng cho **T_AEB khi chấm**. `brake_onset_t` (dùng mở cửa sổ RMS jerk) là thời điểm lệnh phanh có hiệu lực của lõi AEB, không cùng định nghĩa. Cần chốt. |
| M3 | Lọc gia tốc Butterworth 10 Hz trước khi tính jerk | ◐ | A | R14 (4.4.1.2) | Euro NCAP chỉ nêu lọc **gia tốc**, không định nghĩa jerk hay RMS jerk. Bản thực nghiệm `filters.py` là bậc 2 một chiều (causal) nên **không khớp** "12-pole phaseless" (R19). |
| M4 | RMS jerk, vận tốc va chạm, quãng phanh dừng là ba mục tiêu | ⚠ | E | Không tiêu chuẩn nào định nghĩa RMS jerk hay quãng phanh dừng như ADR-040. Vận tốc va chạm tương đối có định nghĩa ở Euro NCAP C2C (R18) | Là **định nghĩa của nhóm**. Đúng quy trình: ghi rõ khi trình bày. |
| M5 | Bước 0,05 s và 0,01 s hợp lệ với CARLA đồng bộ | ✔ | A | K1: *"This is enabled by default and is set to have a maximum of 10 physics substeps with a maximum physical delta time of 0.01"*; *"fixed_delta_seconds <= max_substep_delta_time * max_substeps"* (= 0,1 s); *"In synchronous mode, always use a fixed time-step"* | |
| M6 | ScenarioRunner `--frameRate` mặc định 20 | ✔ | A | K3 `scenario_runner.py`: `parser.add_argument('--frameRate', default='20', …)` | Đã đo thực tế bước 0,01 s ở 381 khoảng (exec plan 20/10). |
| M7 | Thời tiết trong CARLA chỉ ảnh hưởng camera RGB | ? | C | Chỉ có ở tài liệu cũ cho CARLA **0.9.15** (ảnh 50, 51); chưa đọc lại ở 0.9.16 | Cần kiểm lại trước khi dựa vào. |

## 6. Hằng số trong code không có nguồn (giả định của nhóm)

Chỉ liệt kê các hằng số ảnh hưởng tới kết quả chấm. Nhãn dự án: **Assumed** (không nguồn), **Estimated** (gần nguồn).

| Hằng số | Giá trị | Nhãn | Ghi chú |
|---|---|---|---|
| `SENSOR_RANGE_M` | 80 m | Assumed | |
| `PERCEPTION_LATENCY_S` | 0,10 s | Assumed | Gần `consideration time` 0,1 s của Maschke (A8) nhưng là khái niệm khác. |
| `FCW_LEAD_S` | 1,0 s | Assumed | |
| `PREDICTION_HORIZON_S`, `SAFETY_DISTANCE_MARGIN_M` | 2,0 s; 2,0 m | Assumed / Estimated | Xem A9, A12. |
| `JERK_LIMIT_MPS3` | 20 m/s³ | Assumed | Vượt mức Maschke 12 m/s³ (A29). |
| `_WEATHER_CONFIDENCE`, `_TIME_CONFIDENCE`, `_WEATHER_POSITION_NOISE_M` | bảng | Assumed | Mô hình đơn giản hoá có chủ đích (nhận xét trong code). |
| `WEATHER_FRICTION` | 1,0 / 0,70 / 0,55 | Sourced (1,0) / Assumed | A5. |
| `NEAR_MISS_TTC_S`, `NEAR_MISS_DISTANCE_M` | 1,0 s; 0,5 m | Assumed | |
| `TIMING_TOLERANCE_S`, `CONTROL_LOSS_LIMIT_S` | 0,15 s; 0,50 s | Assumed | |
| `MAX_DURATION_S` | 12 s | Assumed | Không phải của Euro NCAP (R17). |
| `PEDESTRIAN_RADIUS_M` | 0,3 m | Assumed | Người nộm Euro NCAP rộng ~0,6 m nhưng không kiểm ở sổ này. |
| `VehicleSpec` mặc định | 4,75 × 1,93 m; 9,5 m/s² | Assumed | Xe VF8 thật có cấu hình riêng trong DB. |
| Dải trong tài liệu khái niệm VehicSim (`CLAUDE.md` gốc) | ma sát 0,6–0,9, trễ phanh 0,15–0,30 s, người đi bộ 2–6 m/s | Assumed | Từ tài liệu khái niệm VehicSim; người đi bộ quy định là 5 km/h (1,4 m/s) và 8 km/h (2,2 m/s) (R8, R11). |

## 7. Việc phải làm tiếp

1. **Sửa docs** (đã làm trong đợt này): R3/R4/A23/A25 trong `aeb-parameter-ranges.md`; M3 trong `carla-local.md`, kế hoạch 20/10 và docstring `filters.py`.
2. **Chốt với Thành viên 3:** cách hiểu "12-pole phaseless 10 Hz" (R19), nguồn gia tốc (IMU, `ego_a`, hay ground truth), `brake_onset_t` so với T_AEB (M2). Không đổi objective chính thức khi chưa chốt.
3. **Mở được thì bổ sung:** bản tiếng Anh của R152 từ UNECE, R131 chuỗi 02, GB/T 39901-2021, ISO 15622/22179/22733-1, `woods.pdf` của NHTSA, toàn văn Chen 2023.
4. **Không có nguồn thì đừng khẳng định:** ma sát ướt (A5), ngưỡng 3 s cho xe con (R3, R9), "Euro NCAP 15 s" (R17), "10–70 km/h" (R7).
5. Đặt tên rõ trong báo cáo: giá trị nào là "Sourced", "Estimated", "Assumed" (bộ nhãn của dự án).

## 8. Cách kiểm lại

Mọi câu trích in nghiêng trong sổ đã được đối chiếu tự động với văn bản nguồn đã tải (chuẩn hóa dấu, khoảng trắng và chỉ số trên): 61/64 câu
khớp nguyên văn. Ba câu còn lại không khớp vì cách trích PDF, **không phải trích sai**: ký hiệu Hy Lạp và `d0` (PDF ghi thành "do") ở P10, chỉ số trên
bị mất ở P3, và câu của P12 lấy từ trang tóm tắt (mức C) nên không có trong văn bản tải về. Trước khi sửa lần đầu, kiểm tra này đã bắt được hai
câu em trích sai chữ ở P1 và một câu bị trộn dòng ở P7; cả hai đã sửa.

```bash
# Euro NCAP, tải PDF và trích văn bản (không commit PDF)
curl -sL -o vru.pdf <đường dẫn E1> && pdftotext -layout vru.pdf vru.txt
grep -n "Butterworth\|100Hz\|TAEB" vru.txt
# FMVSS 127 từ eCFR (cần --compressed)
curl -sL --compressed "https://www.ecfr.gov/api/versioner/v1/full/2025-01-01/title-49.xml?part=571&section=571.127"
# R152 / R131 / 347/2012: Công báo EU (tiếng Tây Ban Nha) trên boe.es; R131 bản gốc trên lexaris.de
```

UNECE, NHTSA và MDPI chặn truy cập tự động bằng `curl` thông thường; bản MDPI lấy được qua `mdpi-res.com/d_attachment/…`.
