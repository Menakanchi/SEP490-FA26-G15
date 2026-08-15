# ADR-017: Mức kiểm chứng là trục riêng, không phải một trạng thái duyệt

**Ngày:** 2026-08-15
**Trạng thái:** Proposed — chốt cùng PR đóng vòng lặp kết quả mô phỏng

## Bối cảnh

ADR-011 chốt bốn `ScenarioStatus` và bảng transition hai cổng. Đọc lại bảng đó
sau khi worker GPU chạy được, có hai chỗ hở:

```
pending_review      + before_library  True  -> approved_library
pending_review      + before_library  False -> rejected
pending_sim_review  + before_sim      True  -> approved_library
pending_sim_review  + before_sim      False -> approved_library
```

**`approved_library` là ngõ cụt.** Không transition nào đi ra. `rejected` chỉ
tới được từ `pending_review`, tức là chỉ trước khi kịch bản vào thư viện.

**Kết quả mô phỏng không đi tới đâu.** `POST /internal/jobs/{id}/result` ghi
`ExecutionResult` vào `scenario_jobs.result` rồi dừng. Không code nào đọc lại
nó, không trạng thái nào đổi theo nó, retrieval không biết nó tồn tại.

Cộng hai điều đó lại: một kịch bản vào thư viện ở cổng 1 dựa trên **spec và
preview 2D**, chưa từng chạy lần nào. Nếu về sau chạy ra không đúng ý, không có
gì xảy ra cả. Nó ở lại thư viện, giữ embedding, và tiếp tục được retrieval trả
về làm ví dụ few-shot.

Đây không phải giả thuyết. Đo trên chính 10 seed của dự án, chạy thật trên
CarlaUE4 0.9.15: **3 trong 4 kịch bản chạy được đều không dựng được tình huống
nguy hiểm nào** (`CollisionTest` = 0 va chạm). Kịch bản `sc_014` do LLM sinh
cũng vậy.

## Vấn đề

`approved_library` đang mang **hai nghĩa bị gộp làm một**:

- *có người chịu trách nhiệm gật đầu giữ nó lại*
- *đã chứng minh tái hiện đúng nguy hiểm đã mô tả*

Gộp hai fact khác nhau vào một boolean thì không có ô nào diễn tả được trạng
thái "đã duyệt nhưng chạy ra không đúng ý" — mà đó lại là trạng thái phổ biến
nhất theo số đo ở trên.

Hệ quả nghiêm trọng nhất là một **vòng tự khẳng định**: seed và kịch bản đã
duyệt làm few-shot → LLM bắt chước → sinh ra thứ tương tự → được duyệt ở cổng 1
(cũng chỉ nhìn spec) → thành ví dụ mới. Sai ở đầu vào được nhân bản, và **không
có cơ chế nào phát hiện từ bên trong hệ thống**.

## Các lựa chọn

### 1. Thêm đường rút khỏi thư viện (`approved_library -> rejected`)

Chạy ra sai thì xoá. Đơn giản, khớp trực giác.

Nhưng xoá là **mất thông tin**. Kịch bản chạy không va chạm chưa chắc vô dụng:
có khi chỉ lệch vài km/h là thành đúng, có khi nó hữu ích làm ví dụ âm. Vứt đi
là vứt luôn bằng chứng đã chạy — thứ đắt nhất trong cả hệ thống, vì nó tốn GPU.

Và nó bắt con người bấm thêm một lần nữa sau mỗi lần mô phỏng, để làm một việc
mà dữ liệu đã tự trả lời.

### 2. Thêm cổng duyệt thứ ba, sau mô phỏng

Nhất quán với hai cổng có sẵn. Nhưng cổng HITL tồn tại để **người quyết thứ máy
không quyết được**. Ở đây máy quyết được: `CollisionTest` là số, ngưỡng rõ ràng.
Dựng một cổng cho việc máy làm được là thêm việc cho người mà không thêm thông
tin.

### 3. Chạy mô phỏng **trước** khi vào thư viện

Đảo thứ tự: sim trước, đạt thì mới vào thư viện.

Phá NFR-02 — *"static path phải hoạt động khi worker offline"*. Không có GPU thì
không có thư viện, và live URL mất luôn phần đáng xem nhất. Cũng phá luôn tính
chất "web sinh/duyệt/tải được độc lập" mà ADR-001 dựng ra.

### 4. Tách mức kiểm chứng thành trục riêng ✅

`ScenarioStatus` giữ nguyên, trả lời câu của nó: *có giữ lại không*.
Thêm `VerificationLevel`, trả lời câu khác: *đã kiểm chứng tới đâu*.

## Quyết định

Chọn **lựa chọn 4**.

`scenarios` có thêm cột `verification`, bốn giá trị:

| mức | nghĩa |
|---|---|
| `unverified` | chưa chạy CARLA lần nào — mọi kịch bản mới đều ở đây |
| `adversarial` | chạy được **và** dựng được tình huống nguy hiểm |
| `ran_no_hazard` | chạy trót lọt nhưng không có nguy hiểm nào |
| `execution_failed` | crash / timeout / lỗi XML |

Suy ra bằng code thuần từ `ExecutionResult` (`verification_from_execution`),
không có phán đoán, không gọi LLM. `CollisionTest = FAILURE` là **tin tốt** —
xe bị test trượt bài kiểm va chạm, tức kịch bản đã dựng được nguy hiểm.

Ba hệ quả cụ thể:

**Kịch bản không bao giờ bị rút khỏi thư viện.** `POST /internal/jobs/{id}/result`
cập nhật `verification`, **không** đụng `status`. Số phận kịch bản do người quyết
ở cổng 1; đây chỉ là bằng chứng đi kèm.

**Few-shot loại thứ đã chứng minh là hỏng.** `PROVEN_BAD_FOR_FEW_SHOT` gồm
`ran_no_hazard` và `execution_failed`. Đây là chỗ cắt vòng tự khẳng định: kịch
bản đã chứng minh không tái hiện đúng câu mô tả nó thì thôi được dùng để dạy
model, mà không ai phải bấm xoá gì.

**`unverified` vẫn được dùng làm few-shot.** Cố ý. Loại cả nó thì few-shot chết
ngay: mọi kịch bản mới sinh đều bắt đầu ở đó, và phần lớn seed cũng chưa chạy
được vì ngoài phạm vi ADR-016. Loại thứ *chưa chứng minh* khác hẳn loại thứ *đã
chứng minh là hỏng* — chỉ làm vế sau.

Cột thật chứ không phải nhãn trong `tags` JSON, cùng lý do ADR-013 đưa bốn trục
ODD ra cột riêng: retrieval lọc theo nó, mà `WHERE` không đào vào JSON được.

## Ngưỡng đảo ngược

Xem lại quyết định này khi một trong hai điều xảy ra:

- **Tỉ lệ `ran_no_hazard` xuống dưới 20%.** Lúc đó phần lớn kịch bản đã kiểm
  chứng đạt, và câu hỏi đổi từ "làm sao đừng dạy thứ hỏng" sang "làm sao xếp
  hạng thứ tốt" — có thể cần thang điểm thay vì bốn mức rời rạc.
- **Thư viện vượt ~500 kịch bản.** Lúc đó `unverified` chiếm đa số tuyệt đối và
  việc cho nó vào few-shot không còn là lựa chọn bắt buộc nữa; có thể siết lại
  thành "chỉ dùng `adversarial`".

## Hệ quả

Có thêm hai con số đo được mà trước đây không tồn tại:

- **Tỉ lệ kiểm chứng của thư viện** — bao nhiêu % kịch bản đã chạy thật.
- **`ODD coverage` tách đôi** — bao nhiêu ô đã phủ, và bao nhiêu ô đã phủ bằng
  kịch bản `adversarial`. Con số thứ hai mới là thứ đề bài thực sự hỏi ở hạng
  mục "Săn lỗi xe tự hành" (`adversarial_found >= 3`).

Hiện trạng lúc chốt ADR, đo trên 10 seed: `adversarial` 1, `ran_no_hazard` 3,
`unverified` 6. Con số xấu, và đó là điểm — trước đây nó không tồn tại nên không
ai biết thư viện mẫu đang dựa vào cái gì.

FE cần hiện nhãn này bên cạnh trạng thái duyệt, nếu không người dùng vẫn chỉ
thấy "đã duyệt" và hiểu nhầm y như trước.

**Quan hệ với ADR-011:** không mâu thuẫn. Bảng transition và bốn `ScenarioStatus`
giữ nguyên; ADR này thêm một trục **song song**, không sửa trục cũ.
