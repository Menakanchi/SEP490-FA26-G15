# 06 — Information architecture mới

**Chọn hai trang chính** trong module Failure Analysis. Giữ một route playback hiện có như công cụ điều tra sâu. Không tạo ba dashboard riêng cho mỗi API, không đổi navigation/shared shell của module khác.

## 1. Cấu trúc theo tác vụ

```text
Shared entry hiện có: Kết quả & phân tích
└─ /analysis/failures — Dữ liệu & kết quả
   ├─ Scope/filter + summary theo nhóm nguồn
   ├─ Run table: chọn / mở kết quả
   ├─ Tra cứu lỗi theo luật cũ (advanced tool, scope riêng)
   └─ Chuẩn bị bàn giao (selection tray → review panel → snapshot/check/export)
      [Collection JSON + Analyze V3: BLOCKED backend, không active mock]

└─ /analysis/failures/{runId} — Kết quả run
   ├─ Tóm tắt: identity/status/source +3objective + nhận định có bằng chứng
   ├─ Điều tra: timeline / telemetry / evidence, mở theo nhu cầu
   └─ Xuất / tác vụ khác: hiện chỉ các operation thực được hỗ trợ
      └─ /analysis/failures/{runId}/playback — Phát lại từ dữ liệu đã ghi
```

Result route DB run ID hiện có không được ép chứa offline run_key. Sau khi backend hỗ trợ JSON analysis, owner phải chốt result resource identity/permissions và route mapping trước khi mở result của offline run không DB ID. Không dùng ID0 hoặc hash rút gọn giả DB ID.

## 2. Chứng minh từng màn cần tồn tại

| Surface | Người dùng muốn làm gì? | Backend/data thật | Action có thật? | Vì sao cần / có gộp được không? |
|---|---|---|---|---|
| Workspace chính | chọn run, xem bức tranh scope, chuẩn bị tập khi cần | C01/02 dashboard DB; C05legacy lookup; C09–11snapshot | đọc/open/filter/chốt/check có thật | gộp overview+runs+draft giúp giữ ngữ cảnh; không cần trang tổng hợp riêng |
| Result run | hiểu một run,3objective, mở điều tra | C03/04/07/08 stored result | mở/seek/đọc có thật; V3 job/report chưa có | tách khỏi list vì deep link/run identity và technical density; summary+investigation cùng page |
| Review/export panel trong workspace | rà hai tập và snapshot/freshness | C09/10/11 | POST/GET thật | không phải task mọi user luôn làm; gộp panel đủ, giữ focus/URLdataset_id |
| Legacy lookup trong workspace | tìm failure row/cause code/outcome theo luật cũ, CSV | C05/06 (scope khác run table) | thật | không xóa nghiệp vụ khi runs API không có outcome/days search; secondary tool ghi scope riêng |
| Playback deep route | theo dõi thời gian/khung/sự kiện | C07 recorded frames | thật, display clock | giữ incoming links/regression; không cần thêm entry primary hay đẩy user qua đây để hiểu mọi run |
| JSON/collection analyze tương lai | chạy core/report/handoff trên producer export | C14–22 offline only | **chưa có REST** | chỉ gộp vào workspace sau backend unblock; không tạo trang upload trống hiện tại |

Không có một “Report dashboard” bắt buộc. Aggregate nằm workspace; report export trong context run/dataset. Nếu có report-list API/lịch sử phân tích thật trong task sau mới đánh giá nhu cầu navigation riêng.

## 3. URL/state compatibility

Giữ paths hiện có trong FE-R1..R5 để không phải sửa links từ regression/module2/shared nav. Không thay business/API schema. Query aliases là frontend routing compatibility, không data migration.

| URL hiện tại | Hành vi đích đề xuất | Bảo toàn |
|---|---|---|
| `?view=overview` hoặc mặc định | workspace với summary+table | server filters,scope,page/size |
| `?view=runs` | table trong workspace, scroll/focus phù hợp | q/sort chỉ trong current page; selection draft |
| `?view=failures&f_*` | mở advanced legacy lookup | **f_* riêng**, không âm thầm chuyển sang filter runs |
| `?view=dataset&dataset_id=...` | mở review/snapshot panel | dataset ID phân biệt draft/current/archive/v1/v2 |
| `/{id}?section=summary` | tóm tắt run | returnTo/compare |
| `/{id}?section=telemetry&t=&signal=` | mở Điều tra/Telemetry | exact recorded seconds/signal; không tự offset clocks |
| `/{id}?section=evidence` | mở Điều tra/Bằng chứng | source IDs/legacy caveats, không V3 label rewrite |
| `/{id}/playback?t=&rate=&signal=&compare=&returnTo=` | vẫn dùng route playback | paired/context caveat; query bounds/valid ID guards |

Không cần thêm taxonomy navigation theo CORE/PHYSICS/OBJECTIVES/MOBO hay G01/P01. Future field mapping đọc theo report contract khi API có; IDs kỹ thuật nằm details/copy source refs.

## 4. Hierarchy và thuật ngữ

| Nhãn chính | Chi tiết kỹ thuật dưới disclosure | Điều không được gộp |
|---|---|---|
| Trạng thái lượt chạy | end_reason/error/simulator/dt/seed | simulator execution vs analysis validity |
| Kết quả đã lưu | legacy outcome/source/evaluation_valid | physical sensor event ≠ canonical collision flag |
| Mức đầy đủ bằng chứng | reason codes/source pointers khi API hỗ trợ | API không hỗ trợ ≠ evidence INVALID |
| Nhận định cần điều tra | legacy chain hiện tại; V3 candidate status tương lai | symptom ≠ requirement violation ≠ confirmed cause |
| Chỉ số | canonical key/unit/version/filter/window/currentness | canonical value ≠ chart derived signal ≠ sensor recomputation |
| Cấu hình lúc chạy |4AEB values + source; không form điều khiển | baseline declaration ≠ verified historical v1 |
| Bàn giao dữ liệu | dataset schema/snapshot/hash/consumer status | v2 snapshot check ≠ V3.1 handoff ≠ dispatch approval |

UNKNOWN/INCONCLUSIVE không thuộc “lỗi kỹ thuật” chung. Dữ kiện đã biết có thể hiển thị đồng thời với root UNKNOWN. Legacy null chưa có reason metadata phải nói rõ API chưa phân biệt missing/NA, không bịa reason từ kết quả SAFE.

## 5. Scope/data ownership

Workspace lấy auth/project từ provider hiện có; mọi request giữ header và active project. Draft tiếp tục scoped account+project, không gửi validation data sang optimizer hints. Server owns revision/freeze/metric aggregation/eligibility; FE owns view/sort/currentpage/cursor/panelopen/formatting. Không import core math sang TS hoặc ghi canonical numbers trong FE.

Không thêm data nhập lặp: các IDs đã có trên row/snapshot lấy từ response; không bắt gõ lại AEB/xe/seed để mở result. Chưa có catalog endpoint đủ cho advanced filters thì giữ ID field có nhãn hoặc context options đã có, không giả dropdown toàn hệ thống.

Backend không trả list datasets/report jobs, nên không có màn “Lịch sử phân tích” đầy đủ trong IA hiện thực. Snapshot URL/directID có thể được chia sẻ có quyền; archive/browser draft không được quảng cáo thành database history browser.
