# Cơ sở lý thuyết đo độ lệch CARLA — công thức và nguồn

**Ngày:** 14/11/2026. **Đi kèm:** [thiết kế carla-ped-bench](README.md), code ở repo [phutro](https://github.com/Menakanchi/phutro).

## Mục đích

Mọi công thức mà công cụ carla-ped-bench dùng để so CARLA với mô hình lý tưởng đều có gốc trong tài liệu kỹ thuật được công nhận: tiêu
chuẩn UNECE, giao thức Euro NCAP và các bài báo có bình duyệt. Tài liệu này ghi từng công thức kèm nguồn, rồi chỉ ra chỗ nào là giả định
riêng của nhóm.

Phạm vi: ca người đi bộ băng ngang, không có AEB (lệnh phanh cố định).

## Mô hình phanh và quãng dừng

Công thức quãng dừng của công cụ là dạng tích phân chính xác của công thức (7) trong
[Kudarauskas (2007)](https://journals.vilniustech.lt/index.php/Transport/article/view/7789), chỉ chênh một số hạng hiệu chỉnh cỡ 5 cm.
Bài báo chia quá trình phanh thành: phản ứng tài xế t₁, trễ dẫn động phanh t₂, thời gian tăng giảm tốc t₃ và giảm tốc ổn định aₓ
(trang 156):

```math
S = (t_1 + t_2 + 0{,}5\,t_3)\,v_0 + \frac{v_0^2}{2\,a_x}
```

Công cụ chạy open-loop nên t₁ = 0; t₂ ứng với trễ t_d = 0,15 s; t₃ ứng với t_r = a_e / J (J = 20 m/s³). Tích phân chính xác pha tăng lực
tuyến tính cho:

```math
d = v_0 t_d + v_0 t_r - \frac{J t_r^3}{6} + \frac{v_1^2}{2 a_e}
  = v_0\,(t_d + 0{,}5\,t_r) + \frac{v_0^2}{2 a_e} - \frac{a_e t_r^2}{24},
  \qquad v_1 = v_0 - \frac{a_e^2}{2J}
```

Ví dụ 40 km/h, a_e = 8 m/s²: d = 11,55 m, nhỏ hơn công thức (7) 0,053 m. Quãng dừng tính từ lúc ra lệnh phanh, đúng định nghĩa "từ lúc
bắt đầu tác động cơ cấu điều khiển phanh tới khi xe dừng" của UNECE R13, Phụ lục 4, mục 1.1.2.

Số liệu xe thật cho thấy mức đích 8 m/s² và mức 9,5 m/s² trong DB nằm trong dải thực tế:

| Nguồn | Điều kiện | Giảm tốc đo được |
| --- | --- | --- |
| Kudarauskas 2007, kết luận 1 | Xe có ABS, đường khô, 40 / 60 / 80 km/h | 8,00 / 8,41 / 8,76 m/s², đỉnh thường trên 9 m/s² |
| Kudarauskas 2007, kết luận 1 | Xe không ABS, 40 / 60 / 80 km/h | 7,00 / 6,89 / 6,66 m/s² |
| Greibe 2007, tr. 66 | Tài xế chuyên nghiệp, khô / ướt | 8,1–8,6 / 7,2–8,5 m/s² |
| Greibe 2007, tr. 43 | Đường khô, dải 50→30 / 100→70 km/h | ≈ 9,5 / ≈ 9,1 m/s² |

Hai nguồn còn giải thích hiện tượng thấy trên CARLA: giảm tốc **tăng dần khi xe chậm lại**. Kudarauskas ghi xe có ABS "thường đạt giá trị
lớn nhất ở pha ổn định và cuối quá trình phanh" (tr. 156). Greibe ghi hệ số ma sát "tăng trong lúc phanh khi tốc độ giảm" (tr. 6). Vì vậy
mô hình giảm tốc hằng số là xấp xỉ có chủ đích, không phải giới hạn vật lý. (Trích dẫn trong ngoặc là bản dịch.)

## Giới hạn bám đường μ·g

Giảm tốc tối đa bị chặn bởi hệ số bám lốp – mặt đường nhân g. Đây là công thức (1) của Kudarauskas (2007, tr. 154), với φₓ là hệ số bám dọc:

```math
a_{xn} = \varphi_x \cdot g \qquad\Rightarrow\qquad a_e = \min(a,\ \mu g)
```

Công cụ dùng dạng bên phải: mức đích a bị kẹp ở μ·g. Giá trị μ đường khô: tài liệu cũ lấy 0,8; xe và lốp hiện đại đạt 1,0–1,2
(Kudarauskas 2007, tr. 154), nên μ = 1,0 cho đường khô là giá trị thận trọng.

Tiêu chuẩn Đan Mạch mà [Greibe (2007)](https://trafitec.dk/wp-content/uploads/2024/02/Braking-distance-friction-and-driver-behaviour.pdf)
trích (tr. 6) tính quãng phanh từ tốc độ V (km/h), μ trung bình và độ dốc s:

```math
l_{brake} = \frac{V^2}{2 \cdot 3{,}6^2 \cdot g\,(\mu_{brake} + s)}
```

Kết luận thử nghiệm của Greibe (tr. 66): trên đường khô ma sát gần như không ảnh hưởng quãng phanh; trên đường ướt quãng phanh tăng khi ma
sát giảm. Đây là cơ sở để nhóm G5 (đường ướt) kiểm CARLA: nếu CARLA không phản ứng với ma sát thì lệch so với xe thật.

Giá trị μ mưa 0,65 và mưa lớn 0,55 lấy từ bảng `Vs.WEATHER_FRICTION` của VehicSim, ghi nguồn Bosch (Reif 2014). Nhóm chưa mở sách gốc, nên
cần kiểm lại trước khi đưa vào báo cáo.

## Đo giảm tốc thực: MFDD và a_dải

Cách đo giảm tốc phẩm chất phanh theo quy chuẩn là **giảm tốc trung bình toàn phần (MFDD, d_m)** của
[UNECE R13 Rev.5](https://documents.un.org/doc/undoc/gen/g04/238/76/pdf/g0423876.pdf) (E/ECE/324 Rev.1/Add.12/Rev.5, 08/10/2004), Phụ
lục 4, mục 1.1.2: giảm tốc lấy trung bình theo quãng đường trên khoảng v_b → v_e:

```math
d_m = \frac{v_b^2 - v_e^2}{25{,}92\,(s_e - s_b)} \ \ [\mathrm{m/s^2}], \qquad v_b = 0{,}8\,v_0,\quad v_e = 0{,}1\,v_0
```

Tốc độ tính bằng km/h, s_b và s_e là quãng đường (m) từ v₀ tới v_b và tới v_e; 25,92 = 2 × 3,6². Quy chuẩn cho phép đo bằng phương pháp khác
nếu sai số trong ±3%. Bản đã đối chiếu là R13 (xe hạng nặng); bản R13-H cho xe con chưa tải được từ trang UNECE.

| Chỉ số | Dải đo | Cách lấy trung bình | Dùng ở đâu |
| --- | --- | --- | --- |
| MFDD (UNECE R13) | 0,8·v₀ → 0,1·v₀ | Theo quãng đường | Kiểm định phanh, so được giữa các nguồn |
| a_dải (công cụ) | Sau t_d + a_e/J, ≤ 0,95·v₀ → 6 m/s | Hồi quy v(t) theo thời gian | Tách pha phanh đều khỏi cú dừng gấp của CARLA |

Hai chỉ số cùng ý tưởng: bỏ phần đầu (tăng lực) và phần cuối (gần dừng). Công cụ cắt ở 6 m/s thay vì 0,1·v₀ vì ở 40 km/h, 0,1·v₀ = 1,1 m/s
nằm trong vùng CARLA dừng gấp 19–27 m/s². Đề xuất: công cụ tính thêm MFDD đúng chuẩn để so với số liệu xe thật, và giữ a_dải để đo riêng pha
phanh đều.

## TTC và ΔTTC cần bù

TTC là thời gian còn lại tới va chạm nếu hai bên giữ nguyên chuyển động. Định nghĩa bắt nguồn từ Hayward (1972), *Near-Miss Determination
Through Use of a Scale of Danger*, Highway Research Board 384, tr. 24–34. Công thức lấy từ phương trình (1) của
[Lu et al. (2021)](https://doi.org/10.1016/j.aap.2021.106403), *Accident Analysis and Prevention* 162:106403, bài này dẫn Hayward:

```math
TTC = \begin{cases} \dfrac{gap}{v_f - v_l}, & v_f > v_l \\ \infty, & v_f \le v_l \end{cases}
```

gap là khoảng cách đầu xe trừ chiều dài xe; v_f, v_l là vận tốc xe sau và vật phía trước. Với người đi bộ băng ngang, vận tốc theo chiều xe
chạy bằng 0 nên TTC = gap / v_xe. Euro NCAP cũng dùng TTC làm mốc: mỗi lần thử bắt đầu tại T₀ = 4 s TTC (giao thức AEB VRU v3.0.4, mục 7.4.2).

**ΔTTC là công thức nhóm tự suy ra, không lấy từ bài báo.** Ý tưởng: nếu xe chỉ đạt a_thực thay vì a_e, số hạng v₀²/(2a) trong công thức
quãng dừng (mục trên) dài thêm Δd. Muốn dừng cùng chỗ thì phải phanh sớm hơn Δd / v:

```math
\Delta d = \frac{v^2}{2}\left(\frac{1}{a_{thuc}} - \frac{1}{a_e}\right), \qquad
\Delta TTC = \frac{\Delta d}{v} = \frac{v}{2}\left(\frac{1}{a_{thuc}} - \frac{1}{a_e}\right)
```

Giả định đi kèm: trễ và thời gian tăng lực không đổi, chỉ mức phanh đều khác. ΔTTC âm nghĩa là xe phanh mạnh hơn giả định, không cần bù.

## Người đi bộ: tốc độ và thời gian khởi động

Các tốc độ người đi bộ trong công cụ (1,0–5,0 m/s) bao trùm dải đo thực tế và hai tốc độ thử của Euro NCAP. Giả định "người đạt ngay tốc độ"
là lý tưởng hóa: người thật cần vài bước mới đi ổn định.

| Nguồn | Nội dung | Giá trị |
| --- | --- | --- |
| [Knoblauch, Pietrucha & Nitzburg (1996)](https://pure.psu.edu/en/publications/field-studies-of-pedestrian-walking-speed-and-start-up-time/), TRR 1538:27–38 | Tốc độ đi bộ bách phân vị 15, người 14–64 tuổi / từ 65 tuổi | 1,25 / 0,97 m/s |
| Knoblauch et al. (1996) | Tốc độ đề xuất cho thiết kế, người trẻ / người già | 1,22 / 0,91 m/s |
| [Euro NCAP AEB VRU v2.0.2](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_vru_test_protocol_v202_5323bb181e.pdf) (11/2017), mục 7.2.4, tr. 22 | Tốc độ xe thử AEB người đi bộ | 20–60 km/h, bước 5 km/h |
| Euro NCAP AEB VRU v2.0.2, mục 7.2.4 | Tốc độ mục tiêu người đi bộ | 8 km/h (2,22 m/s) và 5 km/h (1,39 m/s) |
| [Euro NCAP AEB VRU v3.0.4](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_vru_test_protocol_v304_0201dd55a8.pdf) (04/2021), mục 7.4.2 | Dung sai tốc độ mục tiêu khi đã ổn định | ±0,2 km/h |
| [Anand, Seipel & Rietdyk (2017)](https://purdue.edu/hhs/hk/Biomechanics-MotorBehavior/wp-content/uploads/2017/04/Anand-Seipel-Rietdyk-2017-Model-Gait-Initiation-Post-Print-version.pdf), bản postprint, mục 1 | Bắt đầu bước đi từ tư thế đứng | Cuối bước 1 đạt ~90% tốc độ bước 2; đi ổn định sau 3–5 bước |

Trong bảng của Euro NCAP v2.0.2, hai tốc độ 8 và 5 km/h nằm chung một dòng cho các kịch bản CPFA, CPNA, CPNC. Bản v3.0.4 gọi CPFA là
"người lớn chạy từ phía xa" và CPNA là "người lớn đi bộ từ phía gần" (hình 7-1, 7-2), khớp với 8 km/h cho CPFA và 5 km/h cho CPNA.

Đối chiếu với công cụ: mức 2,2 m/s đúng bằng 8 km/h của Euro NCAP; 1,0 m/s gần tốc độ thiết kế cho người già; 1,5 m/s gần 5 km/h
(1,39 m/s). Mức 5,0 m/s không có nguồn, chỉ dùng để thử giới hạn. Người đi bộ trên CARLA mất ~0,6 s để đạt 90% tốc độ (đo ngày 14/11/2026),
cùng cỡ với "cuối bước đầu tiên" ở người thật. Vì vậy độ trễ vào đường đi 0,34 s của CARLA là gần thực tế hơn mô hình.

## Đối chiếu công thức trong công cụ với nguồn

Sáu trong mười ba thành phần có nguồn trực tiếp; các thành phần còn lại là suy ra hoặc giả định của nhóm, cần ghi rõ khi đưa vào báo cáo.

| Thành phần trong công cụ | Nguồn | Tình trạng |
| --- | --- | --- |
| Quãng dừng: trễ + tăng lực + phanh đều | Kudarauskas 2007, công thức (7) | Có nguồn (dạng tích phân chính xác) |
| a_e = min(a, μ·g) | Kudarauskas 2007, công thức (1) | Có nguồn |
| μ đường khô = 1,0 | Kudarauskas 2007, tr. 154 (1,0–1,2) | Có nguồn |
| Quãng dừng tính từ lệnh phanh | UNECE R13, Phụ lục 4, mục 1.1.2 | Có nguồn |
| μ mưa 0,65, mưa lớn 0,55 | Bosch (Reif 2014), qua VehicSim | Chưa kiểm sách gốc |
| t_d = 0,15 s; J = 20 m/s³ | Tham số AEB của VehicSim (ADR-040: trễ 0–0,5 s, tăng lực 5–20 m/s³) | Giả định nhóm |
| Bàn đạp = a / 9,13, tuyến tính | Đo trên CARLA (ADR-051) | Giả định, nhóm G1 đo kiểm |
| a_dải (pha phanh đều) | Tương tự MFDD của UNECE R13 | Biến thể có lý do; nên thêm MFDD chuẩn |
| TTC = gap / v | Hayward 1972, qua Lu et al. 2021 | Có nguồn |
| ΔTTC = v/2 · (1/a_thực − 1/a_e) | Suy ra từ công thức (7) | Suy ra, không có trong bài báo |
| Tốc độ người 1,0–3,0 m/s | Knoblauch 1996; Euro NCAP v2.0.2 | Có nguồn (5,0 m/s thì không) |
| Người đạt ngay tốc độ | Anand et al. 2017: thực tế cần ~1 bước tới 90% | Lý tưởng hóa, đã biết giới hạn |
| Hành lang = nửa bề ngang xe + 0,3 m; người xuất phát cách mép làn 1,85 m | Theo kịch bản CP_CROSSING của VehicSim | Giả định nhóm |

Về phía CARLA, tài liệu API 0.9.16 ghi `VehicleControl.brake` là "giá trị điều khiển phanh trong [0.0, 1.0]"
([CARLA Python API](https://carla.readthedocs.io/en/0.9.16/python_api/)). Bài gốc của bộ mô phỏng là
[Dosovitskiy et al. (2017)](https://arxiv.org/abs/1711.03938), hội nghị CoRL lần thứ nhất.

## Tài liệu tham khảo

1. Kudarauskas, N. (2007). [Analysis of emergency braking of a vehicle](https://journals.vilniustech.lt/index.php/Transport/article/view/7789).
   *Transport*, 22(3), 154–159. doi:10.3846/16484142.2007.9638118.
2. Greibe, P. (2007). [Braking distance, friction and behaviour – Findings, analyses and recommendations based on braking trials](https://trafitec.dk/wp-content/uploads/2024/02/Braking-distance-friction-and-driver-behaviour.pdf).
   Trafitec, Lyngby.
3. UNECE (2004). [Regulation No. 13, Revision 5](https://documents.un.org/doc/undoc/gen/g04/238/76/pdf/g0423876.pdf),
   E/ECE/324 Rev.1/Add.12/Rev.5 — Annex 4, Braking tests and performance of braking systems.
4. Hayward, J.C. (1972). Near-Miss Determination Through Use of a Scale of Danger. *Highway Research Board*, 384, 24–34 (trích qua tài liệu 5).
5. Lu, C., He, X., van Lint, H., Tu, H., Happee, R., Wang, M. (2021).
   [Performance evaluation of surrogate measures of safety with naturalistic driving data](https://doi.org/10.1016/j.aap.2021.106403).
   *Accident Analysis and Prevention*, 162, 106403.
6. Knoblauch, R.L., Pietrucha, M.T., Nitzburg, M. (1996).
   [Field studies of pedestrian walking speed and start-up time](https://pure.psu.edu/en/publications/field-studies-of-pedestrian-walking-speed-and-start-up-time/).
   *Transportation Research Record*, 1538, 27–38. doi:10.3141/1538-04 (số liệu lấy từ tóm tắt).
7. Euro NCAP (2017). [Test Protocol – AEB VRU systems, v2.0.2](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_vru_test_protocol_v202_5323bb181e.pdf).
8. Euro NCAP (2021). [Test Protocol – AEB VRU systems, v3.0.4](https://cdn.euroncap.com/cars/assets/euro_ncap_aeb_vru_test_protocol_v304_0201dd55a8.pdf).
9. Anand, M., Seipel, J., Rietdyk, S. (2017).
   [A modelling approach to the dynamics of gait initiation](https://purdue.edu/hhs/hk/Biomechanics-MotorBehavior/wp-content/uploads/2017/04/Anand-Seipel-Rietdyk-2017-Model-Gait-Initiation-Post-Print-version.pdf).
   Bản postprint, Purdue University.
10. Dosovitskiy, A., Ros, G., Codevilla, F., López, A., Koltun, V. (2017). [CARLA: An Open Urban Driving Simulator](https://arxiv.org/abs/1711.03938).
    Conference on Robot Learning (CoRL).
11. CARLA Team. [Python API reference, 0.9.16](https://carla.readthedocs.io/en/0.9.16/python_api/).

Còn mở: số liệu Bosch (Reif 2014) cho μ đường ướt và bản UNECE R13-H cho xe con chưa đối chiếu được với bản gốc.
