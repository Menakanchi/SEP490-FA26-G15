# ADR-015: Chặn câu hỏi trùng ở lối vào bằng so khớp chuỗi chính xác, không dùng ngưỡng embedding cho MVP

**Ngày:** 2026-08-12
**Trạng thái:** Accepted — triển khai cùng `POST /generate`, xem §Ghi chú khi triển khai

## Bối cảnh

Kỹ sư gõ lại một câu đã từng gõ là chuyện **sẽ** xảy ra, không phải trường hợp biên: cùng một đội, cùng một miền bài toán, và theo docstring của `ActorType` thì *"phần lớn kịch bản corner-case của bài toán này xoay quanh xe máy"*. Nhiều người sẽ gõ các biến thể của cùng một tình huống, và cùng một người sẽ gõ lại chính câu của mình.

Hôm nay không có gì chặn. Request đi hết 7 node, tốn tối thiểu hai lượt gọi LLM (`parse_intent`, `generate_draft`), sinh một `scenario_id` mới, nằm vào `pending_review`, và người duyệt phải duyệt lại thứ họ đã duyệt tuần trước.

**`retrieve` không giải quyết được việc này — nó là thứ gây ra bản sao.** Kết quả của `retrieve` không hiện cho người dùng; nó đi thẳng vào few-shot prompt của `generate_draft`. Khi câu vào giống hệt câu cũ, hit cosine gần `1.0` chỉ có tác dụng đưa cho model một bài mẫu gần như hoàn hảo để chép lại. Càng giống thì bản sao càng chuẩn. Thêm nữa `retrieve` lọc `status='approved_library'` cộng đủ bốn trục ODD, nên nó **mù** với hai ca đáng chặn nhất: kịch bản cũ đang chờ duyệt, và kịch bản cũ đã bị từ chối.

Kết quả thực tế còn khó chịu hơn một bản sao sạch. LLM không tất định, nên chạy lại cùng một câu cho ra **"anh em họ"**: 78 km/h thay vì 80, giây thứ 6 thay vì 7. Khác đủ để không nhận ra bằng cách so kết quả, không khác đủ để có thêm giá trị.

Ràng buộc quyết định hình dạng của giải pháp: **corpus đang rỗng.** Không có dữ liệu nào để hiệu chỉnh một ngưỡng similarity. Mọi con số kiểu `0.95` hay `0.98` ở thời điểm này đều là phỏng đoán.

## Các lựa chọn

### 1. Không làm gì, để graph chạy lại
- Ưu: không viết dòng nào.
- Nhược: đốt LLM cho một kết quả đã có; hàng chờ duyệt phình bằng anh-em-họ; và với câu từng bị từ chối thì bắt người duyệt loại nó lần thứ hai.

### 2. Ngưỡng cosine + khớp ô ODD, đặt sau `parse_intent`
- Ưu: bắt được cả câu diễn đạt khác nhưng cùng ý.
- Nhược: ngưỡng là số bịa cho tới khi có dữ liệu đo. Vẫn phải trả một lượt gọi API embedding, và đã tiêu mất lượt `parse_intent` trước khi biết là trùng. Dương tính giả chặn nhầm một yêu cầu hợp lệ thì tệ hơn là không chặn gì.

### 3. So khớp chuỗi đã chuẩn hoá, đặt ở API layer trước graph
- Ưu: quyết định **chính xác**, không xác suất, không ngưỡng, không dương tính giả; không tốn lượt gọi mạng nào; chặn trước cả `parse_intent` nên tiết kiệm nhiều nhất; test được trong vài dòng.
- Nhược: chỉ bắt trùng ký tự. Hai cách diễn đạt khác nhau của cùng một tình huống thì lọt.

### 4. Làm cả hai tầng ngay từ đầu
- **Loại.** Tầng hai cần dữ liệu chưa tồn tại. Làm bây giờ là chốt một hằng số bằng cảm giác rồi phải sửa — đúng thứ [ADR-002](ADR-002-python-version-hai-venv.md) đã đặt luật cấm.

## Quyết định

**Lựa chọn 3 cho MVP.**

### 15.1 Vị trí: API layer, trước khi dựng graph

Kiểm tra chạy trong handler của `POST /generate`, **trước** `parse_intent`. Không thêm node, không đổi contract của bảy node, không đụng `graph.py`.

### 15.2 Khoá tra cứu: `description_vi` đã chuẩn hoá

Chuẩn hoá là code thuần, tất định, có test: chuẩn Unicode NFC → cắt khoảng trắng đầu/cuối → gộp khoảng trắng liên tiếp thành một → `casefold()`.

**Không bỏ dấu tiếng Việt** — bỏ dấu là đổi nghĩa, và sẽ gộp nhầm hai câu khác nhau.

Hàm chuẩn hoá là **nguồn sự thật duy nhất**, dùng cả lúc ghi lẫn lúc tra. Hai đường mà lệch nhau thì tra không bao giờ trúng, và hỏng **im lặng**.

### 15.3 Phạm vi tra cứu: mọi `ScenarioStatus`

Không mượn bộ lọc của `retrieve`. Hai bên phục vụ hai mục đích ngược nhau:

| | `retrieve` | kiểm trùng |
|---|---|---|
| Đang tìm | bài mẫu **tốt** để dạy model | công việc **đã làm** rồi |
| Nên thấy | chỉ `approved_library` | mọi trạng thái, gồm `rejected` và `pending_review` |

Chỉ tra luồng `origin='retail'` ([ADR-014](ADR-014-duyet-theo-lo-va-batch-khong-vao-thu-vien.md) §14.3). Luồng batch tự tránh trùng bằng danh sách đã sinh trong chính ô đó, không đi qua đường này.

### 15.4 Hành vi: báo, không chặn cứng

Có trùng thì trả về kịch bản cũ kèm **trạng thái** của nó, và **lý do từ chối** nếu nó từng bị loại. Người dùng chọn: xem lại, hay sinh mới.

Chọn sinh mới thì đi tiếp bình thường. Gõ lại đôi khi là cố ý — chặn cứng là quyết định thay người dùng.

Lý do từ chối là **thông tin đắt nhất** trong cả tình huống này: nó nói cho người dùng biết vì sao hướng đó đã bị loại, thứ mà sinh lại lần nữa không bao giờ nói được.

### 15.5 MVP không có tầng cosine

Không có ngưỡng similarity nào trong Phase 1. Xem §Ngưỡng đảo ngược.

## Lý do

1. **Câu hỏi được đặt ra là "gõ lại y hệt" — bài toán này quyết định được chính xác.** Dùng một phép đo xác suất cho một bài toán có lời giải tất định là tự chuốc dương tính giả, đổi lấy không gì cả.
2. **Ngưỡng chưa đo được thì không được chốt.** Dự án đã có kỷ luật này: `DEFAULT_SUPPORT_POLICY` để rỗng chờ đo, và [ADR-002](ADR-002-python-version-hai-venv.md) ghi thẳng *"không điền bằng phỏng đoán"*.
3. **Rẻ hơn phương án embedding ở mọi trục.** Không lượt gọi mạng nào (phương án cosine cần một lượt embedding trước khi biết kết quả), và vì chặn trước `parse_intent` nên tiết kiệm luôn lượt LLM đó.
4. **Hai mục đích khác nhau thì không dùng chung bộ lọc.** Mượn `status='approved_library'` của `retrieve` là nhầm "tìm bài mẫu tốt" với "tìm việc đã làm", và bỏ sót đúng hai ca khó chịu nhất.
5. **Sai sót của phương án này là bỏ sót, không phải chặn nhầm.** Bỏ sót thì hệ thống hành xử như hôm nay — không tệ hơn hiện trạng. Chặn nhầm thì lấy mất của người dùng một yêu cầu hợp lệ. Ở giai đoạn chưa có dữ liệu, chọn loại lỗi rẻ hơn.

## Ngưỡng đảo ngược

Viết ADR mới thêm tầng gần-giống khi **đo được** trên dữ liệu thật:

- Có ít nhất **300** câu người dùng thật trong `scenarios`, **và**
- Tỉ lệ request rơi vào nhóm "gần giống nhưng không trùng ký tự" vượt **20%**.

Lúc đó ngưỡng cosine được hiệu chỉnh **từ chính tập câu đó**, không phải chọn theo cảm giác. Trước khi đủ hai điều kiện: không thêm tầng hai vì thấy nó thông minh hơn.

## Hệ quả

**Schema (Phase 1, cùng PR với review/generate API):**

- `scenarios` thêm cột `description_normalized`, **có index**. Không quét bảng, không tính chuẩn hoá lúc truy vấn.
- Hàm chuẩn hoá đặt cạnh `schemas.py` để một chỗ định nghĩa, hai chỗ dùng. Kèm test khoá hành vi — cùng loại test như `test_odd_key_is_stable`, vì đây cũng là một khoá tra cứu hỏng im lặng được.

**API:** `POST /generate` có thêm một dạng phản hồi "đã tồn tại" (kèm `scenario_id`, `status`, `reason` nếu bị từ chối). Đây **không phải lỗi** — không dùng `4xx`; người dùng vẫn được sinh mới nếu muốn.

**Không đụng:** `graph.py`, contract bảy node, `Retriever`, `ODDQuery.as_filter()`. Bộ lọc của `retrieve` giữ nguyên `status='approved_library'` — ADR này không nới nó.

**Rủi ro chấp nhận, nói rõ để không ai tưởng đã xong:** *"Xe máy tạt đầu ô tô"* và *"Ô tô bị xe máy tạt đầu"* là hai chuỗi khác nhau mô tả cùng một tình huống. MVP **không** bắt được ca này. Đó là giá của việc không chốt một ngưỡng bịa, và là lý do §Ngưỡng đảo ngược tồn tại.

**Ngoài phạm vi ADR này:** trùng lặp ở phía **đầu ra** — hai câu vào khác nhau nhưng sinh ra hai kịch bản có cùng cấu hình động học. Đó là bài toán đo độ đa dạng của thư viện, cần dữ liệu thật để định nghĩa đơn vị đếm, và chỉ cắn khi đã có corpus. Không giải ở đây.


## Ghi chú khi triển khai

Bốn chỗ phải quyết thêm khi viết code; ghi lại vì chúng không suy ra được từ
phần trên, và §15.2 nói thiếu một chỗ.

### Cột nằm ở **hai** bảng, không chỉ `scenarios`

§15.2 chỉ nhắc `scenarios`. Không đủ: hai trong năm ca cần xử lý — *"lần sinh cũ
đang chạy"* và *"lần sinh cũ hỏng vì hạ tầng"* — chỉ tồn tại ở
`generation_requests`, vì lúc đó chưa có hàng `scenarios` nào. Ngược lại, đo
trên bản dev có **10/27 kịch bản không có hàng `generation_requests` nào trỏ
tới** (dữ liệu seed), và cả 10 đều ở `approved_library` — tra riêng
`generation_requests` sẽ mù với đúng phần thư viện có sẵn nhiều nhất.

Nên: cột ở cả hai bảng, cùng gọi **một** `normalize_prompt`. Rủi ro §15.2 cảnh
báo là **đường ghi lệch đường tra**, không phải "hai bảng" — hai bảng dùng chung
một hàm thì không có hai định nghĩa nào cả. Mỗi bảng chuẩn hoá `description_vi`
của **chính hàng đó**, nên quy tắc phát biểu được thành một câu và backfill được
cho dữ liệu cũ.

### `failed` không tính là trùng

Hỏng vì hạ tầng — hết quota, provider 500 — thì gõ lại là đúng việc cần làm.
Tính nó là trùng sẽ biến một lỗi tạm thời thành lỗi vĩnh viễn: câu đó không bao
giờ sinh được nữa mà không ai hiểu vì sao.

### `force_generate` ghi `NULL`, không ghi khoá

Hàng đó cố ý đứng ngoài cả phép tra lẫn unique index bên dưới, nên §15.4
("người dùng chọn sinh mới") luôn chạy được, kể cả khi một lần sinh của đúng câu
đó đang chạy. Kịch bản nó tạo ra vẫn tìm lại được về sau, vì
`scenarios.description_normalized` thì luôn được ghi.

### Race condition: unique index từng phần, không khoá trong process

ADR gốc không nói tới ca hai request giống hệt tới **cùng lúc**. Giữa lúc handler
đọc "chưa có ai chạy" và lúc nó `INSERT` có một khe, và khe đó đủ rộng cho
request thứ hai lọt qua.

```sql
CREATE UNIQUE INDEX ux_generation_requests_running_description
  ON generation_requests (description_normalized) WHERE status = 'running';
```

Đặt phép phân xử ở tầng DB vì khoá trong process vô dụng khi có nhiều worker.
`NULL` không đụng unique index trong cả SQLite lẫn Postgres, nên nó khớp sẵn với
quy ước `force_generate` ở trên.

Hệ quả kèm theo: `create_generation_request` phải đổi từ `INSERT OR REPLACE`
sang `INSERT` thuần. Với index này, `OR REPLACE` sẽ lặng lẽ **xoá** hàng đang
chạy mà nó đụng phải — tức là đúng cái race ta dựng index lên để chặn, nhưng tệ
hơn: request kia mất hàng và `GET /status` của nó trả 404.
