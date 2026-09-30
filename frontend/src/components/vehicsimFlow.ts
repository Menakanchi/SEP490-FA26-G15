/**
 * Vòng MVP 6 bước của VehicSim (kế hoạch MVP của nhóm, motif người đi bộ băng
 * ngang). Dùng chung cho panel đăng nhập, trang Dashboard và thanh tiến trình.
 */

export interface FlowStep {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  /** Tên ngắn cho thanh tiến trình. */
  short: string;
  detail: string;
  feature: string;
  href: string;
}

export const MVP_STEPS: FlowStep[] = [
  {
    n: 1,
    title: "Mô tả kịch bản",
    short: "Mô tả",
    detail: "Câu mô tả tiếng Việt → LLM → Scenario IR, kiểm tra và tự sửa",
    feature: "FE-06",
    href: "/scenarios/new",
  },
  {
    n: 2,
    title: "Sinh biến thể",
    short: "Biến thể",
    detail: "Lưới tham số: tốc độ, khoảng cách, tốc độ người đi bộ, thời tiết",
    feature: "FE-07",
    href: "/scenarios",
  },
  {
    n: 3,
    title: "Chạy cơ sở",
    short: "Chạy cơ sở",
    detail: "Chạy mọi biến thể với bản cơ sở AEB qua hàng đợi Celery",
    feature: "FE-08 · FE-11",
    href: "/scenarios",
  },
  {
    n: 4,
    title: "Phân tích lỗi",
    short: "Phân tích lỗi",
    detail: "Kết quả, chỉ số, kết luận, nguyên nhân gốc và phát lại từng ca lỗi",
    feature: "FE-09 · FE-12",
    href: "/analysis/failures",
  },
  {
    n: 5,
    title: "Cấu hình mới & chạy lại",
    short: "Chạy lại",
    detail: "Tạo ứng viên AEB, chạy lại đúng các biến thể với cùng seed",
    feature: "FE-11 · FE-14",
    href: "/aeb",
  },
  {
    n: 6,
    title: "So sánh & quyết định",
    short: "Quyết định",
    detail: "So từng cặp lỗi → đạt, đạt → lỗi, rồi kỹ sư chấp nhận / từ chối kèm lý do",
    feature: "FE-14",
    href: "/validation/recommendations",
  },
];
