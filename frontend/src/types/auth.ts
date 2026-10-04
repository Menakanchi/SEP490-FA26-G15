/**
 * Auth Data Types — VehicSim
 *
 * Backend (`/api/v1/auth/*`) trả `roles` dạng mã MySQL: ADMIN / EXPERT / ENGINEER (ADR-030).
 * Frontend quy về MỘT `Role` để chia trang (xem `primaryRole` trong AuthContext):
 *   ADMIN -> "admin" · EXPERT -> "expert" · ENGINEER -> "engineer"; không role nào -> "guest".
 */

export type Role = "admin" | "expert" | "engineer" | "guest";

/** Người dùng đang đăng nhập, đã quy đổi từ `ApiUser`. */
export interface User {
  id?: string;
  name: string;
  full_name?: string;
  avatar_url?: string;
  email: string;
  role: Role;
  /** Mã role gốc từ backend (ADMIN / EXPERT / ENGINEER). */
  roles?: string[];
  /** Tên hiển thị dự phòng. Tài khoản VehicSim không có username riêng nên đây chính là email. */
  username: string;
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
