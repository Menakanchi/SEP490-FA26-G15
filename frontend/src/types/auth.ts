/**
 * Auth Data Types & Interfaces — Scenario Forge
 */

export type Role = "admin" | "reviewer" | "creator" | "guest";
export type UserRole = Role;
export type UserStatus = "active" | "pending" | "pending_approval" | "inactive" | "rejected";

export interface User {
  id?: string;
  name: string;
  email: string;
  role: Role;
  username: string;
  status?: UserStatus;
  reason?: string;
  created_at?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginPayload {
  username?: string;
  password?: string;
  email?: string;
  role?: Role;
}

export interface RegisterPayload {
  username?: string;
  password?: string;
  email?: string;
  name?: string;
  role?: Role;
  reason?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pendingUsers: User[];
  login: (emailOrPayload?: string | LoginPayload, roleOrPass?: Role | string) => Promise<void>;
  logout: () => void;
  switchRole: (role: Role) => void;
  register: (payload: RegisterPayload) => Promise<{ status: UserStatus; user: User }>;
  approveUser: (userId: string) => void;
}
