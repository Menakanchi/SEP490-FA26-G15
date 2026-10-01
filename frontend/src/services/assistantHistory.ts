/**
 * Lịch sử hội thoại của Meomeo Agent trên trình duyệt.
 *
 * - Giữ qua chuyển trang (Phân tích, Kiểm định...) và tải lại trang: lưu ở localStorage,
 *   khoá riêng theo từng tài khoản nên người khác đăng nhập cùng máy không thấy.
 * - Chỉ xoá khi người dùng ĐĂNG XUẤT (`clearAllAssistantChats` trong AuthContext.logout) hoặc bấm
 *   "Cuộc trò chuyện mới". Server không lưu hội thoại (ADR-029).
 * - Mọi truy cập bọc try/catch: chế độ ẩn danh / chặn bộ nhớ thì chat vẫn chạy, chỉ không nhớ.
 */

const PREFIX = "vehicsim_assistant_chat:";
const MAX_STORED = 40;

export function loadAssistantChat<T>(userKey: string): T[] {
  if (!userKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + userKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveAssistantChat<T>(userKey: string, messages: T[]): void {
  if (!userKey || typeof window === "undefined") return;
  try {
    if (messages.length) window.localStorage.setItem(PREFIX + userKey, JSON.stringify(messages.slice(-MAX_STORED)));
    else window.localStorage.removeItem(PREFIX + userKey);
  } catch {
    // vượt quota hoặc bị chặn — bỏ qua, không làm hỏng cuộc trò chuyện đang mở
  }
}

/** Gọi khi đăng xuất: xoá lịch sử chat của MỌI tài khoản trên trình duyệt này. */
export function clearAllAssistantChats(): void {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
