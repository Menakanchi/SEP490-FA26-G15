/**
 * Auth Data Types — VehicSim
 *
 * Backend (`/api/v1/auth/*`) trả `role` — đúng MỘT mã role hệ thống MySQL (ADR-035):
 * ADMIN / MANAGER / ENGINEER / REVIEWER / EXPERIENCER (người tự đăng ký).
 * Frontend quy về `Role` chữ thường để chia trang (xem `toRole` trong AuthContext).
 */

import type { RegisterPayload } from "@/services/api";

export type Role = "admin" | "manager" | "engineer" | "reviewer" | "experience" | "guest";

/** Người dùng đang đăng nhập, đã quy đổi từ `ApiUser`. */
export interface User {
  id?: string;
  name: string;
  full_name?: string;
  avatar_url?: string;
  email: string;
  role: Role;
  /** Mã role gốc từ backend (ADMIN / MANAGER / ENGINEER / REVIEWER / EXPERIENCER). */
  roleCode?: string;
  /** Tên hiển thị dự phòng. Tài khoản VehicSim không có username riêng nên đây chính là email. */
  username: string;
}

/** Hình dạng user mà backend `/auth/*` trả về. */
export interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
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
  /** Đăng ký một bước: tạo tài khoản EXPERIENCER và đăng nhập luôn. */
  register: (payload: RegisterPayload) => Promise<User>;
  /** Đổi mật khẩu khi đang đăng nhập; backend cấp phiên mới vì phiên cũ hết hiệu lực. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (fullName: string, avatarUrl?: string) => Promise<User>;
  logout: () => void;
}
