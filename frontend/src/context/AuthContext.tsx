"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ApiUser, AuthContextType, Role, SessionResponse, User } from "@/types/auth";
import { clearAllAssistantChats } from "@/services/assistantHistory";
import {
  ApiError,
  changeMyPassword,
  getMe,
  getStoredToken,
  postLogin,
  storeToken,
  updateMyProfile,
  verifyRegistration,
} from "@/services/api";

/**
 * Phiên đăng nhập = JWT do backend ký. Frontend KHÔNG tự dựng user hay role:
 * mọi thứ hiển thị đều lấy từ `/auth/login`, `/auth/register/verify` hoặc
 * `/auth/me`. Backend từ chối token (401) thì phiên bị xoá — không có nhánh
 * "đăng nhập giả khi backend lỗi" như bản Forge cũ.
 */

/** Khoá localStorage của bản Forge cũ (user/token giả) — dọn một lần khi tải trang. */
const LEGACY_STORAGE_KEYS = ["auth_user", "forge_token", "forge_pending_users"];

/** Bảng users MySQL chưa có cột ảnh: ảnh đại diện chỉ lưu ở trình duyệt, theo user. */
const avatarKey = (userId: number | string) => `vehicsim_avatar_${userId}`;

function readAvatar(userId: number | string): string | undefined {
  try {
    return localStorage.getItem(avatarKey(userId)) || undefined;
  } catch {
    return undefined;
  }
}

function writeAvatar(userId: number | string, dataUrl: string | undefined): void {
  try {
    if (dataUrl) localStorage.setItem(avatarKey(userId), dataUrl);
    else localStorage.removeItem(avatarKey(userId));
  } catch {
    // Ảnh lớn có thể vượt quota localStorage — bỏ qua, không làm hỏng phiên.
  }
}

/** Một user có thể mang nhiều role; trang được chia theo role cao nhất. */
export function primaryRole(roles: string[]): Role {
  if (roles.includes("ADMIN")) return "admin";
  if (roles.includes("ENGINEER")) return "engineer";
  if (roles.includes("VIEWER")) return "viewer";
  return "guest";
}

function toUser(api: ApiUser): User {
  return {
    id: String(api.id),
    name: api.full_name,
    full_name: api.full_name,
    email: api.email,
    username: api.email,
    roles: api.roles,
    role: primaryRole(api.roles),
    status: "active",
    avatar_url: readAvatar(api.id),
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applySession = useCallback((session: SessionResponse): User => {
    storeToken(session.access_token);
    const nextUser = toUser(session.user);
    setToken(session.access_token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const clearSession = useCallback(() => {
    storeToken(null);
    setToken(null);
    setUser(null);
    // Lịch sử Meomeo Agent chỉ mất khi đăng xuất — chuyển trang hay tải lại thì vẫn giữ.
    clearAllAssistantChats();
  }, []);

  // Khôi phục phiên: có token thì hỏi backend nó còn hợp lệ không.
  useEffect(() => {
    try {
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }

    const saved = getStoredToken();
    if (!saved) {
      queueMicrotask(() => setIsLoading(false));
      return;
    }

    getMe()
      .then((apiUser) => {
        setToken(saved);
        setUser(toUser(apiUser));
      })
      .catch((err: unknown) => {
        // 401 = token hết hạn / bị thu hồi (vd. đã đổi mật khẩu ở máy khác).
        // Lỗi mạng thì giữ token để lần tải sau thử lại, nhưng chưa coi là đã đăng nhập.
        if (err instanceof ApiError && err.status === 401) storeToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => applySession(await postLogin(email.trim(), password)),
    [applySession],
  );

  const completeRegistration = useCallback(
    async (email: string, code: string, fullName: string, password: string) =>
      applySession(
        await verifyRegistration({ email: email.trim(), code: code.trim(), full_name: fullName.trim(), password }),
      ),
    [applySession],
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      applySession(await changeMyPassword(oldPassword, newPassword));
    },
    [applySession],
  );

  const updateProfile = useCallback(async (fullName: string, avatarUrl?: string) => {
    const apiUser = await updateMyProfile(fullName.trim());
    writeAvatar(apiUser.id, avatarUrl);
    const nextUser = toUser(apiUser);
    setUser(nextUser);
    return nextUser;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role ?? null,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        completeRegistration,
        changePassword,
        updateProfile,
        logout: clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth phải được sử dụng bên trong AuthProvider");
  }
  return context;
}

/** Trang đích sau khi đăng nhập, theo role. */
export function homeFor(role: Role): string {
  void role; // mọi vai trò vào VehicSim; quyền ghi do backend + `canWrite` quyết định
  return "/";
}
