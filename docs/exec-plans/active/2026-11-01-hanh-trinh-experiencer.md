# 01/11/2026 — Hành trình trải nghiệm cho EXPERIENCER (thiết kế lại giao diện)

**Trạng thái:** đã code giai đoạn 0 (một phần), A, B, C, D và E (01/11/2026); đã chạy xuyên luồng trên MySQL thật và chụp giao diện
(mục 12). Còn: ADR-046 chờ nhóm duyệt, thông báo (Luồng 5 của exec plan 31/10), thanh hành trình ở màn 1024 px, đối chiếu Figma. Tiếp nối [project cá nhân cho EXPERIENCER](2026-10-31-experiencer-project-ca-nhan.md)
(Luồng 1–2 đã xong). Người làm, deadline theo GitHub Issues/Project.

## 1. Vấn đề hiện tại

Người tự đăng ký vào hệ thống thấy giao diện của kỹ sư, không thấy một hành trình:

| Hiện trạng | Hậu quả |
|---|---|
| Các bước nằm rải ở 5 khu menu: Kịch bản, Phân tích, Phanh khẩn cấp, Kiểm định, Project của tôi | Không biết bắt đầu ở đâu, làm xong thì đi đâu |
| `FlowBar` 6 bước chỉ là dãy tab, không cho biết bước nào đã xong | Không thấy tiến độ |
| Màn "Chưa có project" là 3 gạch đầu dòng; danh sách project là bảng chữ 12–13 px | Màn đầu tiên không tạo hứng thú; khó đọc (chữ mờ #9aa0ac chỉ đạt tương phản ≈ 2,6:1) |
| Sau regression: "Chờ kỹ sư duyệt", nút dẫn tới trang duyệt không dùng được | Hành trình bị cụt, không khép được vòng |
| Thanh trên hiện "Không gian: —", sidebar có 6 mục "Chưa có trong đợt MVP", thẻ hiện mã "FE-06" | Cảm giác sản phẩm dở dang, thuật ngữ nội bộ |

## 2. Mục tiêu và thước đo

- Tạo project là **một việc trọn vẹn** (thông tin, mục tiêu, xe) và xong trước khi sang kịch bản; không trộn bước kịch bản vào form tạo project.
- Tạo xong project → thấy kết quả baseline đầu tiên trong **≤ 2 phút, ≤ 4 lần bấm** khi chọn kịch bản mẫu ở bước ①.
- Mọi màn trong hành trình cho biết **đang ở bước mấy / 5** và có **đúng một nút chính "Bước tiếp theo"**.
- Không màn nào cụt: lỗi, không cải thiện, đang chạy đều có câu giải thích và việc nên làm.
- ADMIN / ENGINEER / REVIEWER / MANAGER **không đổi giao diện**.
- Không sửa database của nhóm (giữ ràng buộc của exec plan 31/10).

## 3. Nguyên tắc thiết kế

1. **Hành trình là trục điều hướng**: sidebar, thanh hành trình và trang chủ project cùng dùng một nguồn trạng thái.
2. **Một hành động chính mỗi màn**; thao tác phụ thu vào menu "⋯" hoặc liên kết nhỏ.
3. **Mỗi bước làm xong một việc**: tạo project chỉ khai báo project; kịch bản bắt đầu ở bước ①. **Cho thấy kết quả sớm** bằng kịch bản
   mẫu ở đầu bước ①: chạy baseline ngay để người mới thấy xe phanh, va chạm, phát lại.
4. **Nói bằng ngôn ngữ người dùng**: "Xe phanh có kịp không?" trước "TTC 0,4 s"; thuật ngữ có chú thích khi rê chuột.
5. **Trạng thái thật** (bất biến của repo): bước chưa có dữ liệu thì để "Chưa làm", không tick giả; số CARLA ghi rõ chỉ để quan sát.
6. **Lớp hành trình bọc ngoài**: màn của thành viên khác giữ nguyên, chỉ thêm điểm chạm nhỏ ở mục 8.

## 4. Bản đồ hành trình

```text
 Đến ─► Tạo project ─► ① Kịch bản ─────────► ② Chạy baseline ─► ③ Xem kết quả ─► ④ Cải tiến AEB ─► ⑤ Kiểm chứng ─► Khép vòng
 M0       M1 (3 bước)     M2 chọn cách → mẫu /     (màn có sẵn,         M4                 M5 → /aeb           (màn có sẵn) → M6   vòng 2
          chỉ thông tin   /scenarios/new / nhập tay  tiến độ ở M3)
                    └──────────────── trang chủ project M3 luôn là nơi quay về ────────────────┘
```

| Bước | Người dùng muốn biết | Màn chính | "Xong" khi (suy từ dữ liệu, không thêm cột) | Nút tiếp |
|---|---|---|---|---|
| Đến | Đây là gì, mất bao lâu | M0 Chào mừng | Có project `ACTIVE` | Tạo project đầu tiên |
| Tạo project | Project này để thử gì, dùng xe nào | M1: Thông tin → Phương tiện → Xác nhận | Project tạo xong (có xe + AEB gốc v1.0) | Thiết kế kịch bản (M2) |
| ① Kịch bản | Tình huống nguy hiểm trông thế nào | M2 chọn cách, rồi mẫu / `/scenarios/new` / nhập tay | Có ≥ 1 họ có biến thể | Chạy baseline |
| ② Baseline | AEB hiện tại có phanh kịp không | `/scenarios` + tiến độ trên M3 | Có ≥ 1 họ có đủ run `COMPLETED` cho mọi biến thể bản hiện hành với baseline hiện tại; họ thêm sau hiện "N họ chưa chạy", không kéo bước về | Xem kết quả |
| ③ Kết quả | Ca nào hỏng, vì sao | M4 (+ `/analysis/failures/**` cho chi tiết) | Đã chốt tập phân tích, hoặc bước ④/⑤ đã bắt đầu | Cải tiến AEB |
| ④ Cải tiến | Đổi tham số nào | M5 → `/aeb` (tự chỉnh hoặc MOBO) | Có ≥ 1 ứng viên `CANDIDATE` hoặc trial MOBO hoàn tất | Kiểm chứng |
| ⑤ Kiểm chứng | Ứng viên có tốt hơn thật không | `/validation/regression/new`, `/validation/regression/[testId]` | Có regression `COMPLETED` | Xem kết luận |
| Khép vòng | Dùng ứng viên này chưa | M6 | Chủ project chọn ứng viên `PASSED` làm baseline (D-UX1, ADR-046) | Bắt đầu vòng 2 |

Mọi bước luôn mở được, kể cả bước trước: link bước ① luôn tới M2 (thêm họ mới), bước đã xong không bị làm mờ. Số đếm ③–⑤ tính theo
baseline hiện hành, nên đổi baseline thì các bước ②–⑤ bắt đầu lại ở vòng mới.

Đang chạy (run / tối ưu / regression `PENDING`, `RUNNING`) thì bước đó ở trạng thái **Đang chạy** với tiến độ, không tính là xong.
Cột "Xong khi" chỉ dùng bên trong để chọn bước gợi ý; giao diện không hiện dấu "đã xong" (02/11/2026) vì người dùng luôn có thể thêm họ
mới và đi lại từ đầu. Mỗi bước hiện số thứ tự kèm số liệu thật; chỉ có hai dấu hiệu: đang chạy và gợi ý làm tiếp. Bước ② chỉ đếm run
của bộ mô phỏng đang cấu hình, cùng luật ghép của regression.

## 5. Sơ đồ màn

| Mã | Màn | Đường dẫn | Loại |
|---|---|---|---|
| M0 | Chào mừng | thay `NoProject` trong `ProjectGate` | Mới |
| M1 | Tạo project 3 bước: Thông tin → Phương tiện → Xác nhận (chỉ thông tin project) | `/projects/new` | Làm lại |
| M2 | Bắt đầu bước ①: chọn cách thiết kế kịch bản (mẫu / mô tả / nhập tay) | `/projects/[projectId]/start` | Mới |
| M3 | Trang chủ project (hub hành trình); `/` của EXPERIENCER chuyển tới đây | `/projects/[projectId]` | Làm lại |
| M4 | Tóm tắt kết quả baseline | `/projects/[projectId]/results` | Mới |
| M5 | Chọn cách cải tiến | `/projects/[projectId]/improve` | Mới |
| M6 | Kết luận vòng | `/projects/[projectId]/rounds/[testId]` | Mới |
| M7 | Project của tôi (dạng thẻ) | `/projects` | Làm lại |
| M8 | Cài đặt project (sửa + vùng nguy hiểm) | `/projects/[projectId]/settings` (đã thay `/edit`) | Làm lại |
| K1 | Sidebar hành trình | `VehicSimSidebar` khi role EXPERIENCER | Khung |
| K2 | Thanh hành trình | `VehicSimPage` thay `FlowBar` khi role EXPERIENCER | Khung |
| K3 | Chip "Project" ở thanh trên | `VehicSimPage` | Khung |
| K4 | Thuật ngữ có chú thích | `Term`, `TERMS` trong `components/project/ProjectUi.tsx` | Khung |
| K5 | Modal, Toast, menu "⋯" chuẩn | `components/project/` | Khung |

## 6. Chi tiết màn

### M0 — Chào mừng (chưa có project)

```text
┌────────────────────────────────────────────────────────────────────────┐
│   [Hình: mặt đường, vạch qua đường, xe đang tới, người đi bộ bước ra]   │
│                                                                        │
│   Thử phanh khẩn cấp AEB trong mô phỏng                                 │
│   Dựng tình huống nguy hiểm, xem xe phanh có kịp không, rồi tìm         │
│   cấu hình AEB tốt hơn — trên trình duyệt, không cần xe thật.           │
│                                                                        │
│                       [ Tạo project đầu tiên → ]                        │
├─────────────────┬─────────────────┬─────────────────┬──────────────────┤
│ Tạo project:    │ ① Dựng tình     │ ② ③ Chạy với AEB│ ④ ⑤ Chỉnh AEB và │
│ tên, mục tiêu,  │ huống nguy hiểm │ hiện tại, xem   │ kiểm chứng lại   │
│ xe              │                 │ ca va chạm      │                  │
└─────────────────┴─────────────────┴─────────────────┴──────────────────┘
```

- Hình dựng bằng SVG từ token sẵn có `vehicsim-road`, `lane`, `zebra` (cùng phong cách `ScenarioMap`), có chuyển động nhẹ, tôn trọng `prefers-reduced-motion`.
- Một nút chính đi tới M1. Dòng nhỏ cuối màn: "Chỉ bạn thấy project của mình. Kết quả là mô phỏng, không phải chứng nhận an toàn."

### M1 — Tạo project 3 bước (chỉ thông tin project)

Tạo project là khai báo **project này để làm gì**, xong trọn vẹn rồi mới sang kịch bản. Không hỏi gì về kịch bản ở đây.

```text
 Tạo project      ● 1 Thông tin ───── ○ 2 Phương tiện ───── ○ 3 Xác nhận
┌──────────────────────────────────────────────────┐ ┌──────────────────────────┐
│ Tên project *   [Thử AEB ban đêm              ]   │ │ Xem trước                 │
│                 Bạn sẽ thấy tên này ở sidebar     │ │ (T) Thử AEB ban đêm       │
│ Mục tiêu thử nghiệm                               │ │ Mục tiêu: AEB có kịp phanh│
│  [Người đi bộ băng ngang] [Ban đêm] [Đường ướt]   │ │ khi người đi bộ băng ngang│
│  [Tự viết]                                        │ │ vào ban đêm không?        │
│  [AEB có kịp phanh khi người đi bộ băng ngang  ]  │ │ Xe: chưa chọn             │
│  [vào ban đêm không?                           ]  │ │                           │
│ Ghi chú thêm (tuỳ chọn)                           │ │                           │
│  [Điều kiện muốn kiểm, câu hỏi cần trả lời…    ]  │ │                           │
│                                      [ Tiếp → ]   │ │                           │
└──────────────────────────────────────────────────┘ └──────────────────────────┘

 Bước 2 · Phương tiện
 ┌ Audi e-tron  [Khuyên dùng] ┐ ┌ Xe khác ───────────┐
 │ 4,75 × 1,93 m · 2.100 kg    │ │ …                  │
 │ Giảm tốc tối đa 9,5 m/s²    │ │                    │
 └─────────────────────────────┘ └────────────────────┘
 Xe dùng cho mọi lượt chạy của project; đổi được tới khi có lượt chạy đầu tiên.

 Bước 3 · Xác nhận
 Thử AEB ban đêm · mục tiêu … · Audi e-tron
 Project mới có sẵn: cấu hình AEB gốc v1.0 (4 tham số) làm mốc so sánh.
 Bước tiếp theo sau khi tạo: ① Thiết kế kịch bản.
                                                  [← Quay lại]  [ Tạo project ]
```

- Chỉ dùng cột sẵn có: tên → `name`; mục tiêu + ghi chú gộp thành `description` (dòng đầu là mục tiêu, hiện nổi bật ở M3 và thẻ M7);
  xe → `carla_vehicle_model_id`. Không thêm cột.
- Chip mục tiêu chỉ điền sẵn câu mục tiêu, sửa được; không ngầm quyết định kịch bản.
- Kiểm tra ngay khi rời ô (tên trống, quá dài); lỗi từ backend theo `code` hiện dưới đúng ô và quay về đúng bước chứa ô đó.
- Bấm "Tạo project": mở project vừa tạo rồi chuyển tới M2.

### M2 — Bắt đầu bước ①: thiết kế kịch bản

```text
 ✓ Đã tạo “Thử AEB ban đêm”                                      Để sau, về trang chủ →
 ① Thiết kế kịch bản đầu tiên
 Mục tiêu của bạn: AEB có kịp phanh khi người đi bộ băng ngang vào ban đêm không?
 ┌ Dùng kịch bản mẫu ─────────┐ ┌ Mô tả bằng lời ─────────────┐ ┌ Tự nhập tham số ──────────┐
 │ [Khuyên dùng · ~1 phút]    │ │ Viết một câu tiếng Việt,    │ │ Chọn từng khoảng tốc độ,  │
 │ Người đi bộ băng ngang,    │ │ hệ thống dựng tình huống    │ │ khoảng cách, thời tiết    │
 │ 24 biến thể, chạy baseline │ │ và lưới biến thể            │ │                           │
 │ ngay. Chọn: Ngày/Đêm/Ướt   │ │                             │ │                           │
 │ [ Dùng mẫu này → ]         │ │ [ Mô tả tình huống → ]      │ │ [ Nhập tham số → ]        │
 └────────────────────────────┘ └─────────────────────────────┘ └───────────────────────────┘
```

- "Dùng mẫu": tạo họ từ `FamilyRequest` mẫu rồi chạy baseline (mục 7), chuyển về M3 với thẻ "Bước tiếp theo" hiện tiến độ baseline
  (`██████░░ 14/24`), thăm dò `GET …/journey` 2 giây/lần, chạy xong bật nút "Xem kết quả".
- "Mô tả bằng lời" → `/scenarios/new`; "Tự nhập tham số" → `/scenarios?new=1` (màn của phần 1, có thanh hành trình K2).
- Lỗi khi tạo họ mẫu hoặc chạy: báo ngay trên thẻ kèm "Thử lại"; project vẫn dùng được.
- M3 khi bước ① chưa xong cũng dẫn tới màn này.

### M3 — Trang chủ project (hub)

```text
 Thử AEB ban đêm   [Đang hoạt động] [Audi e-tron] [AEB v1.0]                   [⋯]
┌ Bước tiếp theo ────────────────────────────────────────────────────────────────┐
│ ③ Xem kết quả baseline                                                         │
│ 8/24 tình huống xe vẫn va chạm với AEB v1.0. Xem ca nào tệ nhất và vì sao.      │
│                                                          [ Xem kết quả → ]     │
└────────────────────────────────────────────────────────────────────────────────┘
 Hành trình · vòng 1                                    │ Gần đây
  ✓ ① Kịch bản        1 họ · 24 biến thể    Xem lại     │  • Baseline xong 24/24 · 2 phút trước
  ✓ ② Baseline        24/24 run xong        Xem lại     │  • Tạo họ CP-001 · 3 phút trước
  ● ③ Kết quả         8 va chạm · 2 phanh oan           │
  ○ ④ Cải tiến AEB    Chưa có ứng viên                  │ Thông tin
  ○ ⑤ Kiểm chứng      —                                 │  Xe, AEB gốc, ngày tạo
                                                        │  Cài đặt project →
```

- `/` của EXPERIENCER chuyển tới M3 của project đang mở; ENGINEER vẫn thấy dashboard cũ.
- Bước đã xong có "Xem lại"; bước sau bước hiện tại để mờ nhưng vẫn bấm được, kèm câu "Nên làm bước ③ trước".
- Menu "⋯": Cài đặt, Lưu trữ, Xoá (đưa vùng nguy hiểm khỏi màn chính).

### M4 — Tóm tắt kết quả baseline

```text
 Kết quả baseline · AEB v1.0 · 24 tình huống                     [Chọn họ ▾]
 [ 14 An toàn ] [ 2 Suýt va chạm ] [ 8 Va chạm ] [ 2 Phanh oan ]
 AEB thất bại ở đâu?   lưới tốc độ xe × khoảng cách người bước ra, ô đỏ = va chạm
 3 ca tệ nhất
 ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
 │ [bản đồ nhỏ]   │ │ [bản đồ nhỏ]   │ │ [bản đồ nhỏ]   │
 │ 50 km/h · 12 m │ │ ...            │ │ ...            │
 │ Va chạm 23 km/h│ │                │ │                │
 │ Phát hiện muộn │ │                │ │                │
 │ [Xem phát lại] │ │                │ │                │
 └────────────────┘ └────────────────┘ └────────────────┘
 Phân tích chi tiết (công cụ kỹ sư) →                    [ Tiếp: Cải tiến AEB → ]
```

- Dữ liệu từ API hiện có: `families` (lưới tham số), `failures`/`analysisRuns` (kết quả từng run), `playback`. Chỉ số theo định nghĩa của phần 3
  (`AnalysisMetrics`), không tự tính lại công thức.
- Lưới đỏ chỉ vẽ khi họ có đủ 2 trục tham số; thiếu dữ liệu thì để mờ kèm lý do.
- "Phân tích chi tiết" dẫn sang `/analysis/failures?scenario_id=…` (màn của phần 3).

### M5 — Chọn cách cải tiến

```text
 Cải tiến AEB v1.0 · 4 tham số
 ┌ Tự chỉnh · khoảng 2 phút ───────────┐  ┌ Để hệ thống tìm (MOBO) · vài phút ──┐
 │ Kéo 4 tham số, mỗi tham số có giải  │  │ Thử tự động 10–20 bộ tham số, chọn   │
 │ thích "tăng thì xe phanh sớm hơn…"  │  │ một phương án cân bằng va chạm / êm  │
 │              [ Tự chỉnh → ]         │  │              [ Chạy tối ưu → ]       │
 └─────────────────────────────────────┘  └──────────────────────────────────────┘
 Gợi ý từ kết quả: phần lớn ca va chạm có nguyên nhân "phát hiện muộn".
```

- Hai nút dẫn sang `/aeb?tab=manual` và `/aeb?tab=mobo` (điểm chạm mục 8).
- Dòng gợi ý chỉ hiện khi có dữ liệu nguyên nhân thật; không suy diễn tham số "đúng".

### M6 — Kết luận vòng

```text
 Vòng 1 · AEB v1.0 → ứng viên v2                                   [ĐẠT tiêu chí]
 [ Sửa được 6 ca ] [ Xấu đi 0 ca ] [ Va chạm mới 0 ] [ Phanh oan +1 điểm % ]
 Đã đổi: TTC 1,5 → 2,1 s · Giảm tốc tối đa 8 → 9 m/s²
 [ Dùng v2 làm baseline cho vòng 2 ]*   Thử ứng viên khác   Xem từng cặp →
 * theo quyết định D-UX1; KHÔNG ĐẠT thì chỉ có "Thử ứng viên khác" và lý do trượt
```

- Trang regression của phần 5 khi người xem là EXPERIENCER hiện nút "Xem kết luận" dẫn tới M6 thay cho nút duyệt.

### M7 — Project của tôi

```text
 Project của tôi                     Hạn mức ■■□ 2/3 đang hoạt động     [+ Tạo project]
 [Đang hoạt động 2] [Lưu trữ 1]
 ┌──────────────────────┐ ┌──────────────────────┐ ┌ - - - - - - - - - - ┐
 │ (T) Thử AEB ban đêm   │ │ (M) Mưa đường trơn    │ ¦   + Tạo project    ¦
 │ Audi e-tron · Đang mở │ │ Audi e-tron           │ ¦   còn 1 chỗ        ¦
 │ ✓✓●○○  Bước 3/5       │ │ ✓●○○○  Đang chạy 6/24 │ └ - - - - - - - - - - ┘
 │ 8 va chạm · 2 phút    │ │ 5 phút trước          │
 │ [Tiếp tục →]      [⋯] │ │ [Mở →]            [⋯] │
 └──────────────────────┘ └──────────────────────┘
```

- Avatar chữ cái đầu, màu cố định theo id; tiến độ 5 chấm lấy từ `journey_summary` (mục 7).

### M8 — Cài đặt project

Form sửa hiện có (`ProjectForm`) + "Vùng nguy hiểm" viền đỏ ở cuối: Lưu trữ, Xoá vĩnh viễn (giữ hộp thoại gõ tên).

### K1 — Sidebar khi là EXPERIENCER

```text
 VehicSim
 [(T) Thử AEB ban đêm   ▾]     ← menu: các project hoạt động, Quản lý, + Tạo
 ⌂ Trang chủ project
 (1) Thiết kế kịch bản ▾        2 họ · 24 biến thể      ← mỗi bước là một mục có dropdown
       Kịch bản mẫu · Sinh từ mô tả · Nhập tham số
 (2) Chạy baseline ›            ⟳ đang chạy 14/24
       Họ kịch bản & chạy baseline · Dữ liệu CARLA
 (3) Xem kết quả ›              2 va chạm · 2 phanh oan  ← gợi ý làm tiếp (số nền đen)
       Tóm tắt kết quả · Phân tích chi tiết
 (4) Cải tiến AEB ›             1 ứng viên tự chỉnh
       Chọn cách cải tiến · Tối ưu tự động (MOBO) · Chỉnh tay · Phiên bản AEB
 (5) Kiểm chứng ›               1 lần · lần cuối đạt
       Kiểm thử hồi quy · Tạo kiểm thử · Kết luận vòng
   Phương tiện
   Project của tôi
   Cài đặt project
 (avatar) Tên · Experiencer
```

Cùng bộ vẽ nhóm/dropdown với sidebar của các role khác (`NavGroups` trong `VehicSimSidebar.tsx`). Năm bước là năm mục, dưới tên là
số liệu thật, không có dấu "xong"; chỉ một mục con khớp dài nhất trên cả sidebar được tô (xét cả `?tab=` của `/aeb`) và chỉ bước chứa
nó mở ra. Ẩn "Khuyến nghị", "Workspace", "Quản trị" và các mục "Chưa có trong đợt
MVP"; mở thẳng `/validation/recommendations/**` hoặc `/workspace/**` thì `ProjectGate` hiện thẻ giải thích kèm nút về Kết luận vòng.

### K2, K3 — Thanh hành trình và chip project

```text
 Project: Thử AEB ban đêm │ ✓ Kịch bản ─ ✓ Baseline ─ ● Kết quả ─ ○ Cải tiến ─ ○ Kiểm chứng │ [Tiếp: Cải tiến AEB →]
```

Hiện ở đầu mọi màn làm việc của EXPERIENCER (thay `FlowBar`); chip "Không gian" đổi thành "Project". Khi một bước vừa chuyển
sang xong (so với lần tải trước), hiện toast "Baseline xong 24/24 · Xem kết quả".

### K4, K5 — Thuật ngữ, Modal, Toast

- `Term`: gạch chân chấm, rê chuột hoặc focus hiện chú thích ngắn (baseline, biến thể, seed, TTC, phanh oan, regression, Pareto).
- Modal: Esc / bấm nền để đóng, giữ focus trong hộp, trả focus về nút mở. Toast: một vùng `role="status"` duy nhất ở góc phải dưới.
- Chữ nội dung ≥ 14 px; chữ phụ dùng `vehicsim-muted` (đạt 4,5:1) thay `vehicsim-faint` trong các màn mới.

## 7. Backend cần thêm (gói `project`, không đổi schema)

```text
GET /api/v1/vehicsim/projects/{projectId}/journey      (chỉ chủ project, như các route project khác)
{
  "round": 1, "baseline_label": "v1.0", "last_activity_at": "…",
  "steps": [
    {"key": "SCENARIO", "status": "DONE",    "counts": {"families": 1, "variants": 24}},
    {"key": "BASELINE", "status": "RUNNING", "counts": {"completed": 14, "total": 24, "failed": 0}},
    {"key": "RESULTS",  "status": "TODO",    "counts": {"collisions": 8, "near_misses": 2, "false_activations": 2}},
    {"key": "IMPROVE",  "status": "TODO",    "counts": {"candidates": 0, "optimizations_running": 0}},
    {"key": "VERIFY",   "status": "TODO",    "counts": {"regressions": 0, "last_verdict": null}}
  ],
  "next": "BASELINE"
}
```

- `status` ∈ `TODO | RUNNING | DONE | FAILED`; luật "xong" theo bảng mục 4. Đếm kết quả bằng cột kết quả sẵn có của `simulation_runs`, cùng định nghĩa với
  phần 3; run lỗi/huỷ không tính là an toàn.
- `ProjectItem` mang kèm `journey` đầy đủ cho thẻ M7 (đã làm).
- `counts` có thêm `families_baseline_done` / `families_baseline_pending`; ứng viên, tập phân tích, tối ưu, regression chỉ đếm theo
  baseline hiện hành (vòng).
- `POST /projects/{projectId}/regressions/{testId}/adopt` `{reason, confirmed}` → hành trình mới (ADR-046).
- Test: `ProjectServiceTest` thêm các trạng thái: project trống, đang chạy, có run lỗi, có regression hoàn tất.
- Kịch bản mẫu (D-UX2, đề xuất phía client, chỉ chạy khi người dùng bấm "Dùng mẫu" ở M2 — không chạy lúc tạo project): gọi `createFamily` với `FamilyRequest` mẫu cố định
  (`components/project/starter.ts`, kiểm theo `ScenarioRules`) và `runFamily`. Không thêm API mới, dùng lại hạn mức sẵn có.

## 8. Điểm chạm vào màn của thành viên khác (phải báo người phụ trách)

| File | Thay đổi nhỏ | Phần |
|---|---|---|
| `components/VehicSimPage.tsx` | EXPERIENCER: `JourneyBar` thay `FlowBar`, chip "Project" thay "Không gian" | Khung chung |
| `components/VehicSimSidebar.tsx` | EXPERIENCER: dùng `JourneySidebarNav` | Khung chung |
| `app/page.tsx` | EXPERIENCER: chuyển tới `/projects/{id}` | Khung chung |
| `app/aeb/page.tsx` | Tab đi theo `?tab=manual|versions` (mặc định MOBO), bấm tab cập nhật URL (đã làm) | Phần 4 |
| `app/validation/regression/[testId]/page.tsx` | EXPERIENCER: "Xem kết luận" (M6) thay "Mở khuyến nghị" / "Duyệt ngay"; ẩn câu "cần kỹ sư quyết định" (đã làm, chỉ frontend) | Phần 5 |
| `app/validation/regression/page.tsx`, `app/validation/regression/new/page.tsx` | EXPERIENCER: link "Kết luận" thay "Khuyến nghị", câu chữ không nhắc khuyến nghị (đã làm, chỉ frontend) | Phần 5 |
| `components/VehicSimSidebar.tsx` | Tách bộ vẽ nhóm `NavGroups` dùng chung; nhóm của EXPERIENCER; giao diện role khác không đổi (đã làm) | Khung chung |

Bỏ điểm chạm `app/scenarios/new/page.tsx` (phần 1): thẻ "Bước tiếp theo" trên M3 đã có nút chạy baseline.

Code mới đặt trong `frontend/src/components/project/` và `frontend/src/app/projects/**`; các file trên chỉ thêm nhánh theo role.

## 9. Lộ trình

| Giai đoạn | Nội dung | Phụ thuộc | Xong khi |
|---|---|---|---|
| **0. Chuẩn bị** | Chạy app, chụp hiện trạng 6 màn; chốt D-UX1–4; sửa lỗi project dùng chung giữa các tab (`sessionStorage` + sự kiện `storage`) | — | Có ảnh "trước"; quyết định ghi vào mục 11 |
| **A. Khung hành trình** | API `journey` + test; K1, K2, K3; M3; `/` → M3; K5 Modal/Toast | 0 | EXPERIENCER luôn thấy mình ở bước nào và nút tiếp theo trên mọi màn |
| **B. Vào cửa** | M0, M1 (Thông tin → Phương tiện → Xác nhận), M2 chọn cách thiết kế kịch bản, kịch bản mẫu | A | Tạo project trọn vẹn rồi mới sang kịch bản; từ lúc tạo xong → kết quả baseline mẫu ≤ 2 phút, ≤ 4 lần bấm |
| **C. Hiểu kết quả, chuyển bước** | M4, M5, toast chuyển bước, điểm chạm `/scenarios/new` và `/aeb` | A | Từ kết quả tới ứng viên đầu tiên không cần mở menu |
| **D. Khép vòng** | M6, nút kết luận ở trang regression, "Dùng làm baseline" nếu D-UX1 cho phép, vòng 2 trên M3 | C, D-UX1 | Hoàn tất một vòng và bắt đầu vòng 2 (hoặc kết luận rõ khi không đạt) |
| **E. Hoàn thiện** | M7 dạng thẻ, M8, K4 thuật ngữ, tương phản, bàn phím, màn hẹp | A | Đạt mục 12 |

Mỗi giai đoạn là một PR riêng merge được; giai đoạn A là nền, các giai đoạn sau làm song song được.

## 10. Quyết định cần chốt

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| D-UX1 | EXPERIENCER có tự dùng ứng viên ĐẠT làm baseline trong project cá nhân? | Có, chỉ khi regression PASSED và baseline chưa đổi, bắt nhập lý do + xác nhận; cần ADR vì khác bất biến "chỉ REVIEWER Accept" (áp cho project nhóm) |
| D-UX2 | Có kịch bản mẫu ở đầu bước ① không, tạo ở client hay backend? | Có, ở client bằng API sẵn có (mục 7); không gắn vào form tạo project |
| D-UX3 | Sidebar EXPERIENCER bỏ hẳn menu kỹ sư? | Không bỏ: cùng các nhóm chức năng có dropdown như kỹ sư, lọc mục EXPERIENCER không dùng được (02/11/2026) |
| D-UX4 | Hub ở `/projects/[id]` hay `/`? | `/projects/[id]`; `/` chuyển hướng cho EXPERIENCER |

## 11. Nhật ký quyết định

| Ngày | Nội dung |
|---|---|
| 01/11/2026 | Lập kế hoạch từ rà code: hành trình rải 5 khu menu, cụt sau regression, màn đầu sơ sài; chọn hướng "lớp hành trình bọc ngoài" |
| 01/11/2026 | Góp ý: tạo project chỉ khai báo thông tin (tên, mục tiêu, ghi chú, xe) và xong trọn vẹn rồi mới sang kịch bản → M1 thành Thông tin → Phương tiện → Xác nhận; bỏ "cách bắt đầu" khỏi M1; M2 thành màn chọn cách thiết kế kịch bản ở đầu bước ①; tiến độ baseline mẫu chuyển lên M3 |
| 01/11/2026 | Triển khai A–B với đề xuất mặc định của D-UX2 (mẫu ở client), D-UX3 (sidebar riêng, bỏ hẳn menu kỹ sư; mục "Project của tôi" của menu kỹ sư gỡ vì thừa), D-UX4 (hub `/projects/[id]`). D-UX1 chưa chốt nên vòng kết thúc ở "Xem kết quả kiểm chứng" |
| 02/11/2026 | Góp ý: bỏ dấu ✓ "đã xong" (Cách A: số liệu thật + gợi ý); sidebar EXPERIENCER đủ chức năng có dropdown như các role khác; ẩn mục chưa có trong MVP |
| 02/11/2026 | Góp ý: không tách nhóm Hành trình và nhóm chức năng; mỗi bước của hành trình là một mục, dropdown ra các trang của bước đó |
| 01/11/2026 | Chốt theo đề xuất: D-UX1 = có (ADR-046; định lưu lý do ở dòng `engineering_recommendations` ACCEPTED nhưng chạy MySQL thật bị `ck_er_no_self_review` chặn, nên lý do nối vào `aeb_versions.notes`); D-J1 bước ② xong khi ≥ 1 họ chạy đủ; D-J2 M2 luôn mở được để thêm họ; hạn chế đụng màn người khác (bỏ chạm phần 1, phần 5 chỉ frontend). Triển khai C, D, E |

## 12. Kiểm chứng

- Backend: `.\mvnw.cmd -B clean test` (thêm test `journey`).
- Frontend: `npm run lint`, `npx tsc --noEmit`, `npx next build`.
- Chạy thật: tài khoản EXPERIENCER mới → M0 → M1 (3 bước) → M2 "Dùng mẫu" → M3 tiến độ baseline → M4 → M5 → ứng viên → regression → M6; ghi số lần bấm và thời gian; ảnh trước/sau
  từng màn; thử hai tab mở hai project khác nhau không ghi nhầm.
- Tương phản chữ ≥ 4,5:1; dùng được hoàn toàn bằng bàn phím; màn rộng 1280 px và 1024 px không vỡ.
- Đăng nhập ENGINEER / REVIEWER: giao diện không đổi.
- Không có khung Figma cho các màn này: dựng khung trước khi code giai đoạn B; nếu không làm được thì ghi rõ giới hạn đối chiếu.

Đã chạy 01/11/2026 sau giai đoạn A–B: `.\mvnw.cmd -B test` 430 test, 0 lỗi, 1 bỏ qua (6 test hành trình, nay nằm trong
`ProjectServiceTest`; route `/journey` trong `ProjectSecurityTest`); `npx tsc --noEmit`, `npm run lint`, `npx next build` sạch. **Chưa chạy app để xem giao diện**
(Docker Desktop tắt) và chưa đối chiếu Figma — phải làm trước khi merge.

Đã chạy 01/11/2026 sau giai đoạn C–E:

- `.\mvnw.cmd -B clean test`: 435 test, 0 lỗi, 1 bỏ qua. Frontend: `npm run lint`, `npx tsc --noEmit`, `npx next build` sạch.
- Xuyên luồng qua API trên MySQL 8.4 + Redis dùng một lần (dựng từ `01_schema.sql`, cổng riêng, đã xoá sau khi kiểm; không chạm DB
  nhóm), bộ động học: **24/24 bước đúng** — project trống ở bước ①; họ mẫu 12 biến thể chạy baseline → bước ② xong; thêm họ sau không
  kéo bước ② về (1 họ chưa chạy); dữ liệu M4/M5; ứng viên TTC 2,0 s bị chặn (sửa 2 ca nhưng thêm 1 ca phanh oan) → `TEST_NOT_PASSED`;
  ứng viên giảm tốc 10 m/s² + trễ 0 s `PASSED` → thiếu lý do `REASON_REQUIRED`, người khác `PROJECT_NOT_YOURS`, chọn đúng → vòng 2,
  ứng viên `BASELINE`, v1.0 `ARCHIVED`, lý do nằm trong ghi chú phiên bản, không có dòng `engineering_recommendations`; chọn lại →
  `CANDIDATE_ALREADY_DECIDED`; exp2 đọc project / hành trình / regression của exp1 đều bị chặn.
- Lần chạy đầu phát hiện `ck_er_no_self_review` chặn cách lưu lý do ban đầu (lỗi 500, transaction rollback, baseline nguyên vẹn) → đổi
  sang ghi chú phiên bản (ADR-046). Unit test dùng mock không bắt được lỗi này.
- Giao diện (Edge headless, 1280 px, không lỗi trang): trang chủ project vòng 2, ① Thêm kịch bản, ③ kết quả (lưới, 3 ca tệ nhất, phát
  lại), ④ cải tiến (gợi ý nhóm nguyên nhân), M6 (đạt, đã là baseline), trang regression của EXPERIENCER ("Xem kết luận"), Cài đặt + vùng
  nguy hiểm, `/aeb?tab=manual`. Tài khoản đã đổi sang ENGINEER: `/projects` chỉ xem + mục sidebar "Project cá nhân (1)"; ENGINEER không
  có project cá nhân: sidebar không đổi. 1024 px: nội dung không vỡ, nhưng thanh hành trình phải cuộn ngang mới thấy bước ④⑤.
- Chưa đối chiếu Figma (không có khung cho các màn này); chưa kiểm hết bằng bàn phím.

Đã chạy 02/11/2026 sau giai đoạn F:

- `.\mvnw.cmd -B clean test`: 436 test, 0 lỗi, 1 bỏ qua. Frontend `npm run lint`, `npx tsc --noEmit`, `npx next build` sạch.
- Xuyên luồng API (MySQL/Redis dùng một lần, đã xoá): vẫn 24/24 bước đúng.
- Sidebar EXPERIENCER theo bước (Edge headless): trình duyệt tự bấm 18 đường dẫn lấy từ sidebar — 0 lỗi trang, 0 lỗi API; mỗi trang
  chỉ một mục con được tô và chỉ bước chứa nó mở ra (kể cả `/scenarios/new` so với `/scenarios`, `/aeb?tab=manual|versions`,
  `/projects/{id}/rounds/{test}` của vòng cũ). Sidebar ENGINEER chụp lại giống trước khi sửa.
  `/validation/recommendations` với EXPERIENCER hiện thẻ "Project cá nhân không có khuyến nghị".
- MOBO bằng EXPERIENCER: tạo đợt 6 rồi 20 trial trên họ 12 biến thể → chạy xong, nhưng 20/20 trial vi phạm ràng buộc nên Pareto rỗng.
  Baseline 1/12 va chạm, 3/12 phanh oan; với 12 biến thể, thêm 1 ca phanh oan là +8,33 điểm % > 5, nên ràng buộc thực chất là "không
  thêm ca phanh oan nào", trong khi trial chủ yếu tăng TTC. Ứng viên tay giảm tốc 10 m/s² + trễ 0 s vẫn đạt regression, tức có điểm
  hợp lệ mà thuật toán chưa tìm ra. Đã báo người phụ trách phần 4; không sửa `OptimizationService`.
- Mỗi trial MOBO là một phiên bản `CANDIDATE` (nguồn `OPTIMIZATION`): hành trình đếm riêng "ứng viên tự chỉnh" (bỏ trial) và "đợt
  tối ưu đã xong", tránh hiện "20 ứng viên" khi chưa có phương án hợp lệ.

## 13. Tiến độ triển khai

| Giai đoạn | Đã làm | Còn lại |
|---|---|---|
| 0 | Project đang mở lưu theo tab (`sessionStorage`, `localStorage` chỉ làm giá trị mở đầu cho tab mới); xoá khi hết phiên | Chụp hiện trạng; chốt D-UX1 |
| A | `GET /projects/{id}/journey` (`ProjectJourneyService`, luật trạng thái là hàm thuần, kết quả baseline dùng `Vs.classifyOutcome`); sidebar hành trình + menu đổi project; thanh hành trình và chip "Project" trong `VehicSimPage`; trang chủ project M3 (thẻ bước tiếp theo, dòng thời gian 5 bước, menu "⋯"); `/` → M3; `Modal`, `ToastStack`, thông báo khi một bước vừa xong | — |
| B | M0 chào mừng (`RoadScene`), M1 tạo project 3 bước (`ProjectWizard`, mục tiêu + ghi chú gộp vào `description`), M2 chọn cách thiết kế kịch bản + kịch bản mẫu 12 biến thể chạy baseline ngay | M8 (form sửa còn hiện nguyên `description`) |
| C | M4 `/projects/[id]/results` (dùng `analysisDataset` + `failures` của phần 3, không tự tính chỉ số; lưới tốc độ × khoảng cách; 3 ca tệ nhất kèm phát lại); M5 `/projects/[id]/improve` (gợi ý nhóm nguyên nhân từ `failures.kpis.by_class`, hai lối vào `/aeb?tab=`); `aeb/page.tsx` đọc `?tab=` | Xác nhận với người phụ trách phần 4 trạng thái thật của MOBO trước khi demo |
| D | `POST /projects/{id}/regressions/{testId}/adopt` (`ProjectService.adopt`, 7 lỗi mới trong `ProjectError`); hành trình đếm theo baseline hiện hành; M6 `/projects/[id]/rounds/[testId]` (kết luận, 4 số, tham số đã đổi, hộp thoại lý do + xác nhận); trang regression rẽ nhánh EXPERIENCER | ADR-046 cần nhóm duyệt |
| E | M8 `/settings` + vùng nguy hiểm; `Term`; chủ project đã đổi role xem chỉ đọc; thanh hành trình hiện ở M2, M4, M5, M6 | Bàn phím và màn 1024 px kiểm trên app thật |
| F (02/11) | Bỏ dấu "đã xong" khỏi sidebar, thanh hành trình, trang chủ, thẻ project; thông báo khi baseline / tối ưu / kiểm chứng vừa chạy xong thay cho "Xong bước"; sidebar EXPERIENCER đủ nhóm chức năng (dùng chung `NavGroups`, gỡ `JourneyNav` / `PersonalProjectsLink` trùng lặp ở `ProjectShell`); `/aeb` đổi tab theo URL; chặn trang khuyến nghị / workspace; câu chữ EXPERIENCER ở danh sách và màn tạo regression; M4 "Xem ảnh camera" cho run CARLA; bước ② lọc theo bộ mô phỏng | Đã chạy app thật và thử MOBO (mục 12) |

Thông số xe trên thẻ chọn xe lấy từ `carla_vehicle_models` qua `vehicle-options` (thêm 4 trường, không đổi schema).

**Gọn file (01/11/2026):** backend chỉ còn `ProjectService` (hành trình gộp vào; `ProjectItem` mang kèm `journey`), test gộp vào
`ProjectServiceTest`. Frontend `components/project/` còn 6 file theo vai trò:

| File | Chứa |
|---|---|
| `journey.ts` | Logic thuần: 5 bước, câu chữ, đường dẫn, mục tiêu/ghi chú trong `description`, `timeAgo`, họ kịch bản mẫu |
| `ProjectJourneyContext.tsx` | Tải hành trình, thăm dò khi đang chạy, provider cho project đang mở, `useProjectItem` |
| `ProjectUi.tsx` | Avatar, dấu trạng thái bước, `Modal`, `ToastStack`, `Term`, thẻ "Mở project này", menu "⋯", hộp thoại lưu trữ / xoá |
| `ProjectShell.tsx` | Mảnh cắm vào khung chung: cổng + màn chào mừng, thanh hành trình, menu hành trình, nút đổi project, mục "Project cá nhân" cho role khác, `/` → `/projects` |
| `ProjectHome.tsx` | Thẻ project (danh sách, có chế độ chỉ xem), thẻ "Bước tiếp theo" (kèm nhắc họ chưa chạy baseline), dòng thời gian 5 bước |
| `ProjectForms.tsx` | Tạo project 3 bước và Cài đặt project (M8), dùng chung ô thông tin và thẻ chọn xe |

**Trang đích:** EXPERIENCER đăng nhập / đăng ký xong vào `/projects` (`homeFor`); `/` cũng chuyển về đó. "Project của tôi" (M7) làm sớm
dạng thẻ có tiến độ 5 bước và nút "Tiếp tục"; chưa có project nào thì hiện màn chào mừng.
