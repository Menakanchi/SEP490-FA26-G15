# Hướng dẫn test local — màn 1 (Chi) và role Manager (23/10/2026)

Branch: `feature/manager-workspace`. Thắc mắc chưa chốt: xem [thac-mac-con-lai.md](thac-mac-con-lai.md).

## 1. Môi trường local (đã chạy sẵn)

| Thành phần | Địa chỉ | Ghi chú |
|---|---|---|
| Frontend | http://localhost:3000 | `next dev` |
| Backend | http://localhost:8001 (`/health`) | Bộ mô phỏng **động học** — không cần CARLA, chạy baseline mất vài giây |
| MySQL | `localhost:3307` (docker) | Cổng 3306 đã bị MySQL80 của máy chiếm |
| Redis | `localhost:6380` (docker) | Cổng 6379 đã bị Memurai chiếm |

### Tài khoản (mật khẩu chung `Dev@123456`)

| Email | Role | Dùng để |
|---|---|---|
| `manager@example.com` | MANAGER | Quản lý workspace "AEB Pedestrian" (id 1) |
| `manager2@example.com` | MANAGER | Workspace "Nhóm thử nghiệm B" — kiểm cách ly |
| `eng1@example.com` | ENGINEER | Màn 1, nhận task / thông báo |
| `eng2@example.com` | ENGINEER | Thành viên workspace 1 |
| `rev1@example.com` | REVIEWER | Thành viên workspace 1 |
| `exp1@example.com` | EXPERIENCER | Không thêm vào workspace được |
| `admin@example.com` | ADMIN | Thấy mọi workspace |

### Tự khởi động lại (khi đã tắt máy)

PowerShell, mỗi lệnh một cửa sổ, đứng ở thư mục repo `SEP490-FA26-G15`:

```powershell
# 1. MySQL + Redis (cần file compose.port3307.yml ở dưới, đặt cạnh docker-compose.yml, KHÔNG commit)
docker compose -f docker-compose.yml -f compose.port3307.yml up -d mysql redis

# 2. Backend (bộ động học)
$env:SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3307/vehicsim?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC'
$env:SPRING_REDIS_PORT='6380'; $env:VEHICSIM_SIMULATOR='kinematic'
.\mvnw.cmd -q clean compile spring-boot:run

# 3. Frontend
cd frontend; npm run dev
```

Nội dung `compose.port3307.yml` (đổi cổng vì máy đã có MySQL80 ở 3306, Memurai ở 6379):

```yaml
services:
  mysql:
    ports: !override
      - "3307:3306"
  redis:
    ports: !override
      - "6380:6379"
```

### Lỗi hay gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Backend báo `Unresolved compilation problem` | IDE ghi `.class` lỗi; chạy lại với `clean compile` (lệnh trên đã có) |
| Đăng nhập / API trả 429 "quá nhiều yêu cầu" khi đổi tài khoản liên tục | Git Bash: `MSYS_NO_PATHCONV=1 docker exec sep490-fa26-g15-redis-1 sh -c 'redis-cli --scan --pattern "ratelimit:*" \| xargs -r redis-cli del'` |
| Màn duyệt báo cáo rỗng | App chưa có luồng nộp báo cáo — chèn báo cáo mẫu bằng SQL (mục 2.B bước 0) |

---

## 2. Workflow test

Mỗi bước: **Làm** → **Kỳ vọng**. Đánh dấu ☐ → ☑ khi đạt. Gặp lỗi thì chụp màn hình + ghi bước số mấy.

### A. Màn 1 — luồng của Chi (đăng nhập `eng1@example.com`)

**A1. Chặn biến thể không chạy được (task 2)**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 1 | Vào **Kịch bản** → nút tạo nhập tay (hoặc mở `http://localhost:3000/scenarios?new=1`) | Form "Tạo họ kịch bản" hiện |
| ☐ | 2 | Ô "Tốc độ xe ego" nhập `10, 40`; ô "Khoảng cách kích hoạt" nhập `20, 80` | Khung đỏ "… cặp tốc độ / khoảng cách không chạy được" liệt kê **10 km/h + 80 m (30.3 s)**; nút "Tạo họ kịch bản" bị khoá |
| ☐ | 3 | Sửa khoảng cách thành `20, 25` | Khung đỏ biến mất, nút mở lại |
| ☐ | 4 | Thử biên: tốc độ `10`, khoảng cách `29` rồi `30` | 29 m hợp lệ (11,9 s); 30 m bị chặn (12,3 s) |

**A2. Sinh từ mô tả + bàn giao sang màn 2 (task 3)**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 5 | Mở `http://localhost:3000/scenarios/new`, nhập: *"Ban ngày trời quang, xe chạy 40 km/h, người đi bộ đi chậm sang đường khi xe cách khoảng 20 m"* → **Trích xuất Scenario IR** | Hiện bảng tham số, mỗi trường có nhãn nguồn (có trong câu / suy luận / giả định) |
| ☐ | 6 | Bấm **Tạo họ kịch bản** | **Không** tự chuyển trang; hiện khung xanh "Đã tạo họ kịch bản PXn" kèm số biến thể, số lượt đã xếp chạy, 3 nút |
| ☐ | 7 | Bấm **Tiếp tục: Chạy baseline →** | Sang `/scenarios?family=<id>`; dòng của họ vừa tạo được **viền sáng** và cuộn tới; có dòng gợi ý trạng thái (đang chạy / đã có kết quả) |
| ☐ | 8 | Đợi vài giây, tải lại trang | Họ chuyển sang có kết quả baseline (bộ động học chạy rất nhanh) |
| ☐ | 9 | Quay lại bước 6 với một họ khác, bấm **Chạy trên CARLA** | Sang `/analysis/carla?family=<id>`, ô "Họ kịch bản chạy CARLA" **đã chọn sẵn** đúng họ. ⚠ Không bấm chạy — backend đang ở chế độ động học, CARLA chưa mở |
| ☐ | 10 | Ở khung bàn giao bấm **Tạo họ khác** | Form trống lại để tạo họ mới |
| ☐ | 11 | Mở `http://localhost:3000/scenarios?family=99999` | Báo rõ không tìm thấy họ này trong project |

**A3. Kiểm qua API (tuỳ chọn)** — backend từ chối cả khi bỏ qua form:

```powershell
$tok = (Invoke-RestMethod -Method Post http://localhost:8001/api/v1/auth/login -ContentType 'application/json' `
  -Body '{"email":"eng1@example.com","password":"Dev@123456"}').access_token
try { Invoke-RestMethod -Method Post http://localhost:8001/api/v1/vehicsim/families -Headers @{Authorization="Bearer $tok"} `
  -ContentType 'application/json' -Body '{"name":"x","ego_speeds_kmh":[10,40],"trigger_distances_m":[20,80],"pedestrian_speeds_mps":[1.5],"stops_at_curb":[false],"weathers":["CLEAR"],"times_of_day":["DAY"],"run_baseline":false}' }
catch { $_.ErrorDetails.Message }
```

Kỳ vọng: lỗi 400, `detail` chứa "Xe không tới được điểm băng ngang trong 12 s … 10 km/h + 80 m (tới vạch sau 30.3 s)".

### B. Role Manager (đăng nhập `manager@example.com`)

**Bước 0 — chuẩn bị báo cáo mẫu** (app chưa có luồng nộp báo cáo; máy dev đã chạy sẵn 1 lần, chạy lại sẽ thêm 3 báo cáo mới). Git Bash:

```bash
MSYS_NO_PATHCONV=1 docker exec -i -e MYSQL_PWD=vehicsim_root sep490-fa26-g15-mysql-1 \
  mysql -uroot --default-character-set=utf8mb4 vehicsim <<'SQL'
-- Báo cáo mẫu cho màn duyệt của Manager (M8–M9). App chưa có luồng nộp báo cáo, nên chèn bằng SQL.
-- Chạy lại bao nhiêu lần cũng được: mỗi lần thêm 3 báo cáo SUBMITTED mới.
SET @e1 = (SELECT id FROM users WHERE email = 'eng1@example.com');
SET @r1 = (SELECT id FROM users WHERE email = 'rev1@example.com');
INSERT INTO task_reports (project_id, submitted_by_user_id, report_title, report_content, attachment_url) VALUES
  (1, @e1, 'Báo cáo baseline tuần 43', 'Đã chạy baseline 12 biến thể PX2, 2 ca va chạm ở 70 km/h.', 'https://example.com/baseline-w43.pdf'),
  (1, @e1, 'Báo cáo phanh oan', 'Ca dừng ở lề không còn phanh oan sau khi sửa TD-47.', 'javascript:alert(1)'),
  (2, @r1, 'Nhận xét bản AEB v2', 'Đề nghị chạy thêm ca ban đêm trước khi duyệt.', NULL);
SQL
```

**B1. Workspace và thành viên (M1–M5)**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 1 | Sidebar có mục **Workspace** → bấm vào | Chỉ thấy "AEB Pedestrian"; **không** thấy "Nhóm thử nghiệm B" (của manager2); có cột task mở, báo cáo chờ duyệt |
| ☐ | 2 | Mở "AEB Pedestrian" | Thấy 2 project (VF8 AEB MVP, Đánh giá VF9 ban đêm) và danh sách thành viên (eng1, eng2, rev1) |
| ☐ | 3 | Nút **Bớt** ở dòng chủ project | Bị khoá (không bớt được chủ project) |
| ☐ | 4 | Bớt `eng2` → xác nhận | eng2 biến mất; báo số project rời / task chuyển về "chưa giao" |
| ☐ | 5 | Ô tìm thành viên gõ `eng` / `exp` | Tìm ra eng2 (thêm được); **không** ra exp1 (EXPERIENCER) hay người đã là thành viên |
| ☐ | 6 | Thêm lại `eng2` | Thêm thành công, eng2 quay lại danh sách |

**B2. Giao và theo dõi task (M6–M7)**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 7 | Chi tiết workspace → **Task** | Có thống kê theo trạng thái, bảng task; task quá hạn tô đỏ |
| ☐ | 8 | Giao task mới: tên, người nhận `eng1`, project VF8, hạn = hôm nay, ưu tiên Cao | Tạo thành công, hiện trong bảng |
| ☐ | 9 | Giao task với hạn ở **quá khứ** | Báo "Hạn hoàn thành không được ở quá khứ" |
| ☐ | 10 | Đổi trạng thái ngay trên dòng: TODO → Đang làm → Review → Xong | Xong thì tiến độ tự lên 100 % |
| ☐ | 11 | Lọc theo trạng thái / người nhận / "chưa giao" | Bảng lọc đúng |
| ☐ | 12 | Xoá một task thường | Xoá được. Task đã có báo cáo: nút Xoá bị khoá |

**B3. Duyệt báo cáo (M8–M9)**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 13 | Chi tiết workspace → nút **Báo cáo (n chờ duyệt)** | Mặc định lọc "chờ duyệt", báo cáo chờ duyệt xếp trước |
| ☐ | 14 | Mở "Báo cáo baseline tuần 43" | Đính kèm `https://…` là link mở tab mới |
| ☐ | 15 | Mở "Báo cáo phanh oan" | Đính kèm `javascript:…` hiện dạng chữ, **không** bấm được (chống XSS) |
| ☐ | 16 | Bấm **Từ chối** khi để trống nhận xét | Bị chặn, yêu cầu nhập nhận xét |
| ☐ | 17 | Từ chối có nhận xét; duyệt một báo cáo khác | Thành công; báo cáo rời khỏi danh sách chờ duyệt |
| ☐ | 18 | Lọc "Tất cả" | Thấy người duyệt, thời điểm, nhận xét; không còn nút duyệt ở báo cáo đã quyết |

**B4. Thông báo (M10)** — đăng xuất, đăng nhập `eng1@example.com`

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 19 | Nhìn chuông góc trên | Có số chưa đọc (task được giao ở bước 8, kết quả duyệt báo cáo ở bước 17…) |
| ☐ | 20 | Mở chuông, bấm một thông báo | Thông báo đó thành đã đọc, số giảm |
| ☐ | 21 | **Đánh dấu tất cả đã đọc**; Esc / bấm ra ngoài | Số về 0; danh sách đóng |
| ☐ | 22 | Đăng nhập `eng2@example.com` | Thấy thông báo "đã được thêm vào workspace" (bước 6), **không** thấy thông báo của eng1 |

**B5. Phân quyền**

| ☐ | # | Làm | Kỳ vọng |
|---|---|---|---|
| ☐ | 23 | Đăng nhập `eng1`, gõ thẳng `http://localhost:3000/workspace` | Sidebar không có mục Workspace; trang báo bị chặn |
| ☐ | 24 | Đăng nhập `manager2`, gõ `http://localhost:3000/workspace/1` | Báo không tìm thấy (không lộ workspace của manager khác) |
| ☐ | 25 | Đăng nhập `admin` → Workspace | Thấy cả 2 workspace |

---

## 3. Ghi kết quả

| Bước lỗi | Mô tả | Ảnh |
|---|---|---|
| | | |
