/**
 * Auth Data Types — VehicSim
 *
 * Backend (`/api/v1/auth/*`) trả `roles` dạng mã MySQL: ADMIN / ENGINEER / VIEWER.
 * Frontend quy về MỘT `Role` để chia trang (xem `primaryRole` trong AuthContext):
 *   ADMIN -> "admin" · ENGINEER -> "engineer" · VIEWER -> "viewer".
 * "creator" / "reviewer" còn lại từ Forge cũ — không tài khoản mới nào mang chúng,
 * nhưng trang quản lý user cũ (/admin, SQLite) vẫn hiển thị các giá trị này.
 */

export type Role = "admin" | "engineer" | "viewer" | "reviewer" | "creator" | "guest";
export type UserRole = Role;
export type UserStatus = "active" | "pending" | "pending_approval" | "inactive" | "rejected";

/** Người dùng đang đăng nhập, đã quy đổi từ `ApiUser`. */
export interface User {
  id?: string;
  name: string;
  full_name?: string;
  avatar_url?: string;
  email: string;
  role: Role;
  /** Mã role gốc từ backend (ADMIN / ENGINEER / VIEWER). */
  roles?: string[];
  /**
   * Định danh cho các API Forge cũ (`created_by`, `reviewer`, ...). Tài khoản
   * VehicSim không có username riêng nên đây chính là email.
   */
  username: string;
  status?: UserStatus;
  reason?: string;
  created_at?: string;
}

/** Hình dạng user mà backend `/auth/*` trả về. */
export interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  roles: string[];
}

export interface SessionResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: ApiUser;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Bước 2 của đăng ký: mã 6 số + họ tên + mật khẩu -> tài khoản + phiên. */
  completeRegistration: (email: string, code: string, fullName: string, password: string) => Promise<User>;
  /** Đổi mật khẩu khi đang đăng nhập; backend cấp phiên mới vì phiên cũ hết hiệu lực. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (fullName: string, avatarUrl?: string) => Promise<User>;
  logout: () => void;
}
