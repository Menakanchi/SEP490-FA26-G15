"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, Role, UserStatus, LoginPayload, RegisterPayload, AuthContextType } from "@/types/auth";
import { postLogin, postRegister, getMe } from "@/services/api";

const DEFAULT_MOCK_USER: User = {
  id: "usr_creator_01",
  name: "Creator User",
  email: "creator@forge.ai",
  role: "creator",
  username: "creator",
  status: "active",
};

const DEFAULT_PENDING_REVIEWERS: User[] = [
  {
    id: "usr_rev_pending_01",
    name: "Trần Văn Reviewer",
    email: "reviewer_pending@company.com",
    role: "reviewer",
    username: "reviewer_pending",
    status: "pending",
    created_at: new Date().toISOString(),
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pendingUsers, setPendingUsers] = useState<User[]>(() => {
    if (typeof window === "undefined") return DEFAULT_PENDING_REVIEWERS;
    const savedPendingStr = localStorage.getItem("forge_pending_users");
    if (savedPendingStr) {
      try {
        return JSON.parse(savedPendingStr);
      } catch {
        return DEFAULT_PENDING_REVIEWERS;
      }
    }
    localStorage.setItem("forge_pending_users", JSON.stringify(DEFAULT_PENDING_REVIEWERS));
    return DEFAULT_PENDING_REVIEWERS;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedUserStr = localStorage.getItem("auth_user");
    const savedToken = localStorage.getItem("forge_token");

    if (savedToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore token on mount
      setToken(savedToken);
      getMe()
        .then((userData: User) => {
          const userWithRole: User = {
            ...userData,
            id: String(userData.id ?? "usr_01"),
            name: userData.name || userData.username || "User",
            email: userData.email || `${userData.username || "user"}@forge.ai`,
            role: (userData.role as Role) || "creator",
            status: userData.status || "active",
          };
          setUser(userWithRole);
          localStorage.setItem("auth_user", JSON.stringify(userWithRole));
        })
        .catch(() => {
          if (savedUserStr) {
            try {
              const parsedUser = JSON.parse(savedUserStr) as User;
              setUser(parsedUser);
            } catch {
              setUser(DEFAULT_MOCK_USER);
            }
          } else {
            setUser(DEFAULT_MOCK_USER);
          }
        })
        .finally(() => setIsLoading(false));
    } else if (savedUserStr) {
      try {
        const parsedUser = JSON.parse(savedUserStr) as User;
        setUser(parsedUser);
        setToken("mock_jwt_token");
      } catch {
        setUser(DEFAULT_MOCK_USER);
        setToken("mock_jwt_token");
      }
      setIsLoading(false);
    } else {
      // Default initial session
      setUser(DEFAULT_MOCK_USER);
      setToken("mock_jwt_token");
      localStorage.setItem("auth_user", JSON.stringify(DEFAULT_MOCK_USER));
      localStorage.setItem("forge_token", "mock_jwt_token");
      setIsLoading(false);
    }
  }, []);

  const approveUser = useCallback((userId: string) => {
    setPendingUsers((prev) => {
      const updated = prev.filter((u) => u.id !== userId);
      localStorage.setItem("forge_pending_users", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const login = useCallback(
    async (emailOrPayload?: string | LoginPayload, roleOrPass?: Role | string) => {
      setIsLoading(true);
      try {
        if (typeof emailOrPayload === "string") {
          const email = emailOrPayload;
          const targetRole = (roleOrPass as Role) || "creator";
          const username = email.split("@")[0] || "user";

          // Check if pending reviewer
          const isPending = pendingUsers.some(
            (p) => p.email.toLowerCase() === email.toLowerCase() || p.username === username,
          );
          if (isPending && targetRole === "reviewer") {
            throw new Error("Tài khoản Reviewer của bạn chưa được Admin phê duyệt qua email.");
          }

          const newUser: User = {
            id: `usr_${targetRole}_${Date.now().toString().slice(-4)}`,
            name: `${targetRole.toUpperCase()} User`,
            email,
            role: targetRole,
            username,
            status: "active",
          };
          const mockToken = `token_${targetRole}_${Date.now()}`;

          setUser(newUser);
          setToken(mockToken);
          localStorage.setItem("auth_user", JSON.stringify(newUser));
          localStorage.setItem("forge_token", mockToken);
        } else if (emailOrPayload && typeof emailOrPayload === "object") {
          const payload = emailOrPayload;

          // Check pending status
          if (payload.email || payload.username) {
            const matchEmail = (payload.email || "").toLowerCase();
            const matchUsername = payload.username || "";
            const pendingMatch = pendingUsers.find(
              (p) =>
                (matchEmail && p.email.toLowerCase() === matchEmail) ||
                (matchUsername && p.username === matchUsername),
            );
            if (pendingMatch) {
              throw new Error("Tài khoản Reviewer của bạn chưa được Admin phê duyệt qua email.");
            }
          }

          if (payload.username && payload.password) {
            try {
              const res = await postLogin({
                username: payload.username,
                password: payload.password,
              });
              const fetchedUser: User = {
                id: String(res.user.id ?? "usr_01"),
                name: res.user.name || res.user.username || payload.username,
                email: res.user.email || `${payload.username}@forge.ai`,
                role: (res.user.role as Role) || payload.role || "creator",
                username: res.user.username || payload.username,
                status: "active",
              };
              setUser(fetchedUser);
              setToken(res.access_token);
              localStorage.setItem("auth_user", JSON.stringify(fetchedUser));
              localStorage.setItem("forge_token", res.access_token);
            } catch {
              // Fallback to local mock login if backend API is not running
              const fallbackRole =
                payload.role ||
                (payload.username.includes("review")
                  ? "reviewer"
                  : payload.username.includes("admin")
                  ? "admin"
                  : "creator");

              const fallbackUser: User = {
                id: `usr_${fallbackRole}_${Date.now().toString().slice(-4)}`,
                name: `${payload.username}`,
                email: payload.email || `${payload.username}@forge.ai`,
                role: fallbackRole,
                username: payload.username,
                status: "active",
              };
              const mockToken = `mock_token_${Date.now()}`;
              setUser(fallbackUser);
              setToken(mockToken);
              localStorage.setItem("auth_user", JSON.stringify(fallbackUser));
              localStorage.setItem("forge_token", mockToken);
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    },
    [pendingUsers],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("forge_token");
    setUser(null);
    setToken(null);
  }, []);

  const switchRole = useCallback((newRole: Role) => {
    setUser((prev) => {
      const updatedUser: User = prev
        ? { ...prev, role: newRole }
        : {
            id: `usr_${newRole}_${Date.now().toString().slice(-4)}`,
            name: `${newRole.toUpperCase()} User`,
            email: `${newRole}@forge.ai`,
            role: newRole,
            username: newRole,
            status: "active",
          };
      localStorage.setItem("auth_user", JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setIsLoading(true);
      try {
        const res = await postRegister(payload);
        const userStatus: UserStatus = (res.status as UserStatus) || (payload.role === "reviewer" ? "pending_approval" : "active");

        if (userStatus === "active" && res.user) {
          setUser(res.user);
          setToken(`token_${Date.now()}`);
          localStorage.setItem("auth_user", JSON.stringify(res.user));
        }
        return { status: userStatus, user: res.user };
      } catch {
        const targetRole = payload.role || "creator";
        const email = payload.email || `${payload.username || "user"}@company.com`;
        const name = payload.name || payload.username || "User";
        const fallbackStatus: UserStatus = targetRole === "reviewer" ? "pending_approval" : "active";

        const fallbackUser: User = {
          id: `usr_${targetRole}_${Date.now().toString().slice(-4)}`,
          name,
          email,
          role: targetRole,
          username: payload.username || email.split("@")[0],
          status: fallbackStatus,
          reason: payload.reason,
          created_at: new Date().toISOString(),
        };

        if (fallbackStatus === "active") {
          setUser(fallbackUser);
          setToken(`token_${Date.now()}`);
          localStorage.setItem("auth_user", JSON.stringify(fallbackUser));
        }
        return { status: fallbackStatus, user: fallbackUser };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role ?? null,
        isAuthenticated: !!user,
        isLoading,
        pendingUsers,
        login,
        logout,
        switchRole,
        register,
        approveUser,
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
