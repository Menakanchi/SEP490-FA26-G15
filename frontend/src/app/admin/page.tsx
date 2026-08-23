"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getAdminStats,
  getPendingReviewers,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  approveReviewer,
  rejectReviewer,
  type AdminStats,
} from "@/services/api";
import type { User, Role, UserStatus } from "@/types/auth";
import {
  Shield,
  Users,
  FileText,
  Clock,
  UserCheck,
  UserX,
  UserPlus,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Mail,
} from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, role, isLoading: authLoading } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [pendingReviewers, setPendingReviewers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "users">("pending");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [approvedData, setApprovedData] = useState<{ user: User; temp_password?: string } | null>(null);

  // Form states for Create / Edit
  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
    role: "creator" as Role,
    status: "active" as UserStatus,
    password: "",
    reason: "",
  });

  // Guard route: only Admin allowed
  useEffect(() => {
    if (!authLoading && (!user || role !== "admin")) {
      router.push("/");
    }
  }, [user, role, authLoading, router]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, pendingRes] = await Promise.all([
        getAdminStats().catch(() => null),
        getAdminUsers().catch(() => []),
        getPendingReviewers().catch(() => []),
      ]);
      if (statsRes) setStats(statsRes);
      setUsers(usersRes);
      setPendingReviewers(pendingRes);
    } catch {
      setToast({ type: "error", msg: "Lỗi kết nối khi tải dữ liệu Admin Dashboard." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Load initial admin dashboard data
      loadDashboardData();
    }
  }, [user, role, loadDashboardData]);

  // Handlers
  const handleApproveReviewer = async (username: string) => {
    setSubmitting(true);
    try {
      const res = await approveReviewer(username);
      setToast({
        type: "success",
        msg: `Đã phê duyệt tài khoản Reviewer ${username}! Mật khẩu đăng nhập tạm thời đã được tự động gửi về Email.`,
      });
      if (res.user && res.user.temp_password) {
        setApprovedData({ user: res.user, temp_password: res.user.temp_password });
      }
      await loadDashboardData();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Lỗi khi phê duyệt tài khoản.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectReviewer = async (username: string) => {
    if (!confirm(`Bạn có chắc chắn muốn từ chối yêu cầu đăng ký của ${username}?`)) return;
    setSubmitting(true);
    try {
      await rejectReviewer(username);
      setToast({ type: "success", msg: `Đã từ chối đơn đăng ký của ${username}.` });
      await loadDashboardData();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Lỗi khi từ chối yêu cầu.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editUser) {
        // Update user
        await updateAdminUser(editUser.username, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: formData.status,
          password: formData.password || undefined,
          reason: formData.reason,
        });
        setToast({ type: "success", msg: `Cập nhật tài khoản ${editUser.username} thành công!` });
        setEditUser(null);
      } else {
        // Create user
        await createAdminUser({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: formData.status,
          password: formData.password || "123456",
          reason: formData.reason,
        });
        setToast({ type: "success", msg: `Tạo mới tài khoản ${formData.username} thành công!` });
        setCreateModalOpen(false);
      }
      setFormData({ username: "", name: "", email: "", role: "creator", status: "active", password: "", reason: "" });
      await loadDashboardData();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Không thể lưu thông tin tài khoản.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteAdminUser(deleteTarget.username);
      setToast({ type: "success", msg: `Đã xóa tài khoản ${deleteTarget.username} khỏi hệ thống.` });
      setDeleteTarget(null);
      await loadDashboardData();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Không thể xóa tài khoản.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (u: User) => {
    setEditUser(u);
    setFormData({
      username: u.username,
      name: u.name || "",
      email: u.email || "",
      role: u.role || "creator",
      status: u.status || "active",
      password: "",
      reason: u.reason || "",
    });
  };

  const openCreateModal = () => {
    setEditUser(null);
    setFormData({ username: "", name: "", email: "", role: "creator", status: "active", password: "", reason: "" });
    setCreateModalOpen(true);
  };

  // Filtered lists
  const pendingList = pendingReviewers.length > 0
    ? pendingReviewers
    : users.filter((u) => u.status === "pending_approval" || u.status === "pending");
  
  const filteredUsers = users.filter((u) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    const matchesSearch =
      !searchTerm.trim() ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRole && matchesStatus && matchesSearch;
  });

  if (authLoading || (!user && role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-[#0f2d59] dark:text-slate-100 p-4 md:p-8 space-y-6 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-2xl border shadow-xl flex items-center gap-3 max-w-md animate-fade-in text-xs font-semibold ${
            toast.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-200 border-green-300"
              : "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200 border-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-blue-600 text-white shadow-md">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-[#0f2d59] dark:text-white tracking-tight">
              Dashboard Quản Trị Hệ Thống (Admin Control Panel)
            </h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 pl-11">
            Quản lý tài khoản, phê duyệt yêu cầu Reviewer không mật khẩu & thống kê dữ liệu thực tế (`data/app.db`)
          </p>
        </div>

        <button
          onClick={loadDashboardData}
          disabled={loading}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-700 text-[#0f2d59] dark:text-slate-200 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Tải lại dữ liệu
        </button>
      </div>

      {/* Overall Metrics Cards (BrightBuild Styling) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Stats Card */}
        <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-sky-200/80 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#0f2d59] dark:text-white">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Tổng Số Người Dùng Trực Tuyến
            </div>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-xs font-black rounded-full border border-blue-300">
              {stats?.users.total || users.length} người dùng
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-white dark:bg-slate-800/80 border border-sky-100 dark:border-slate-700 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Creator (Kỹ sư)</span>
              <span className="text-xl font-black text-blue-700 dark:text-blue-400">{stats?.users.creator || 0}</span>
            </div>
            <div className="p-3 bg-white dark:bg-slate-800/80 border border-sky-100 dark:border-slate-700 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reviewer (Duyệt)</span>
              <span className="text-xl font-black text-purple-700 dark:text-purple-400">{stats?.users.reviewer || 0}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">Chờ Phê Duyệt</span>
              <span className="text-xl font-black text-amber-700 dark:text-amber-400">{pendingList.length}</span>
            </div>
          </div>
        </div>

        {/* Scenario Stats Card */}
        <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-sky-200/80 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#0f2d59] dark:text-white">
              <FileText className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              Thống Kê Kho Kịch Bản ODD
            </div>
            <span className="px-3 py-1 bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200 text-xs font-black rounded-full border border-cyan-300">
              {stats?.scenarios.total || 0} kịch bản
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 bg-white dark:bg-slate-800/80 border border-sky-100 dark:border-slate-700 rounded-2xl space-y-0.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase block">Bản Nháp</span>
              <span className="text-base font-black text-slate-700 dark:text-slate-300">{stats?.scenarios.draft || 0}</span>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-800/80 border border-sky-100 dark:border-slate-700 rounded-2xl space-y-0.5">
              <span className="text-[9px] font-bold text-amber-600 uppercase block">Chờ Mô phỏng</span>
              <span className="text-base font-black text-amber-600">{stats?.scenarios.pending_sim_review || 0}</span>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-800/80 border border-sky-100 dark:border-slate-700 rounded-2xl space-y-0.5">
              <span className="text-[9px] font-bold text-blue-600 uppercase block">Chờ Chạy thử</span>
              <span className="text-base font-black text-blue-600">{stats?.scenarios.simulation_queued || 0}</span>
            </div>
            <div className="p-2.5 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-2xl space-y-0.5">
              <span className="text-[9px] font-bold text-green-700 dark:text-green-300 uppercase block">Đã Duyệt</span>
              <span className="text-base font-black text-green-700 dark:text-green-300">{stats?.scenarios.approved_library || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-200/80 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === "pending"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-sky-50"
              }`}
            >
              <Clock className="w-4 h-4" />
              Danh Sách Chờ Duyệt (Pending Approvals)
              {pendingList.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black bg-amber-400 text-slate-950 rounded-full">
                  {pendingList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === "users"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-sky-50"
              }`}
            >
              <Users className="w-4 h-4" />
              Quản Trị Người Dùng (CRUD Users)
            </button>
          </div>

          {activeTab === "users" && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Thêm Người Dùng Mới
            </button>
          )}
        </div>

        {/* TAB 1: PENDING APPROVALS */}
        {activeTab === "pending" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                Yêu cầu Đăng ký Tài khoản Reviewer (Không Mật khẩu) - Cần Phê Duyệt:
              </h3>
            </div>

            {pendingList.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-slate-800/60 rounded-2xl border border-sky-100 dark:border-slate-800 space-y-2">
                <UserCheck className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-xs font-bold text-[#0f2d59] dark:text-slate-200">
                  Hiện không có yêu cầu đăng ký Reviewer nào đang chờ duyệt!
                </p>
                <p className="text-[11px] text-slate-500">
                  Mọi tài khoản Reviewer đăng ký không mật khẩu đã được thẩm định và xử lý trọn vẹn.
                </p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto rounded-2xl border border-sky-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <table className="min-w-[700px] w-full text-left border-collapse">
                  <thead className="bg-sky-100/60 dark:bg-slate-800/80 text-[#1e3a8a] dark:text-sky-300 font-semibold text-xs tracking-wider uppercase border-b border-sky-200/80 dark:border-slate-700">
                    <tr>
                      <th className="py-3 px-4 whitespace-nowrap">Họ và tên</th>
                      <th className="py-3 px-4 whitespace-nowrap">Username</th>
                      <th className="py-3 px-4 whitespace-nowrap">Email làm việc</th>
                      <th className="py-3 px-4 whitespace-nowrap">Lý do / Đơn vị công tác</th>
                      <th className="py-3 px-4 whitespace-nowrap">Ngày đăng ký</th>
                      <th className="py-3 px-4 whitespace-nowrap text-right">Thao tác Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100 dark:divide-slate-800 text-xs md:text-sm">
                    {pendingList.map((u) => (
                      <tr key={u.username} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/50 transition">
                        <td className="py-3 px-4 font-bold text-[#0f2d59] dark:text-slate-100 whitespace-nowrap">
                          {u.name || u.username}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-purple-700 dark:text-purple-300 whitespace-nowrap">
                          {u.username}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">{u.email}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {u.reason || "Kỹ sư mô phỏng Đơn vị Thẩm định"}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString("vi-VN") : "Gần đây"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleRejectReviewer(u.username)}
                              disabled={submitting}
                              className="px-3 py-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold border border-red-200 dark:border-red-800 transition flex items-center gap-1 cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              Từ chối
                            </button>
                            <button
                              onClick={() => handleApproveReviewer(u.username)}
                              disabled={submitting}
                              className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <UserCheck className="w-4 h-4" />
                              Duyệt & Gửi Mật Khẩu qua Email
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT (CRUD USERS) */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-sky-100 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo username, họ tên hoặc email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs bg-transparent border-none text-[#0f2d59] dark:text-slate-100 focus:outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-sky-50/60 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-[#0f2d59] dark:text-slate-100 focus:outline-none"
                  >
                    <option value="all">Tất cả Vai trò</option>
                    <option value="creator">Creator (Kỹ sư)</option>
                    <option value="reviewer">Reviewer (Duyệt)</option>
                    <option value="admin">Admin (Quản trị)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Trạng thái:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-sky-50/60 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-[#0f2d59] dark:text-slate-100 focus:outline-none"
                  >
                    <option value="all">Tất cả Trạng thái</option>
                    <option value="active">Active (Kích hoạt)</option>
                    <option value="pending_approval">Pending (Chờ duyệt)</option>
                    <option value="inactive">Inactive (Khóa)</option>
                    <option value="rejected">Rejected (Từ chối)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="w-full overflow-x-auto rounded-2xl border border-sky-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <table className="min-w-[750px] w-full text-left border-collapse">
                <thead className="bg-sky-100/60 dark:bg-slate-800/80 text-[#1e3a8a] dark:text-sky-300 font-semibold text-xs tracking-wider uppercase border-b border-sky-200/80 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4 whitespace-nowrap">Username</th>
                    <th className="py-3 px-4 whitespace-nowrap">Họ và tên</th>
                    <th className="py-3 px-4 whitespace-nowrap">Email</th>
                    <th className="py-3 px-4 whitespace-nowrap">Vai trò</th>
                    <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">Thao tác CRUD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100 dark:divide-slate-800 text-xs md:text-sm">
                  {filteredUsers.map((u) => (
                    <tr key={u.username} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700 dark:text-cyan-300 whitespace-nowrap">
                        {u.username}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0f2d59] dark:text-slate-100 whitespace-nowrap">
                        {u.name || u.username}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">{u.email}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.role === "admin" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                            Admin
                          </span>
                        ) : u.role === "reviewer" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Reviewer
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            Creator
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.status === "active" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
                            🟢 Active
                          </span>
                        ) : u.status === "inactive" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                            🔴 Inactive (Đã Khóa)
                          </span>
                        ) : u.status === "pending_approval" || u.status === "pending" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            🟡 Chờ duyệt
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            ⚪ {u.status || "Inactive"}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Sửa thông tin"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Xóa người dùng"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Approval Success & Temp Password Display */}
      {approvedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-sky-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Duyệt Reviewer Thành Công</h3>
                <p className="text-xs text-slate-500">Mật khẩu tạm thời đã được tạo và gửi qua email</p>
              </div>
            </div>

            <div className="p-4 bg-sky-50 dark:bg-slate-800/80 rounded-2xl border border-sky-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Reviewer:</span>
                <span className="font-bold text-[#0f2d59] dark:text-slate-100">{approvedData.user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Username:</span>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">{approvedData.user.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email nhận thông tin:</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{approvedData.user.email}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-sky-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300">Mật khẩu cấp tạm:</span>
                <span className="font-mono text-sm font-black bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-purple-300 text-purple-700 dark:text-purple-300">
                  {approvedData.temp_password}
                </span>
              </div>
            </div>

            <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-200 dark:border-green-800 text-[11px] text-green-900 dark:text-green-300 flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0 text-green-600" />
              <span>Dịch vụ Email đã tự động gửi thông tin đăng nhập trên đến <strong>{approvedData.user.email}</strong>.</span>
            </div>

            <button
              onClick={() => setApprovedData(null)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit User Modal */}
      {(createModalOpen || editUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-sky-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-sky-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                {editUser ? <Edit className="w-4 h-4 text-blue-600" /> : <UserPlus className="w-4 h-4 text-green-600" />}
                {editUser ? `Chỉnh Sửa Tài Khoản: ${editUser.username}` : "Thêm Người Dùng Mới (Admin CRUD)"}
              </h3>
              <button
                onClick={() => {
                  setCreateModalOpen(false);
                  setEditUser(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              {!editUser && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100"
                    placeholder="nguyenvana"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100"
                  placeholder="Nguyễn Văn A"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email làm việc <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Vai trò (Role)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100"
                  >
                    <option value="creator">Creator (Kỹ sư AI)</option>
                    <option value="reviewer">Reviewer (Duyệt kịch bản)</option>
                    <option value="admin">Admin (Quản trị viên)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Trạng thái (Status)</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                    className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 font-semibold"
                  >
                    <option value="active">🟢 Active (Hoạt động)</option>
                    <option value="inactive">🔴 Inactive (Khóa / Vô hiệu hóa)</option>
                    {editUser && (editUser.status === "pending_approval" || editUser.status === "pending") && (
                      <option value={editUser.status}>🟡 Pending (Chờ duyệt)</option>
                    )}
                    {editUser && editUser.status === "rejected" && (
                      <option value="rejected">⚪ Rejected (Từ chối)</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {editUser ? "Đổi mật khẩu mới (Bỏ trống nếu không đổi)" : "Mật khẩu ban đầu"}
                </label>
                <input
                  type="password"
                  className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100"
                  placeholder={editUser ? "Bỏ trống nếu giữ mật khẩu cũ..." : "123456"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setEditUser(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editUser ? "Cập Nhật" : "Tạo Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-sky-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác Nhận Xóa Người Dùng</h3>
                <p className="text-xs text-slate-500">Thao tác này sẽ xóa vĩnh viễn tài khoản khỏi Database</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300">
              Bạn có chắc chắn muốn xóa tài khoản <strong className="text-red-600">{deleteTarget.username}</strong> ({deleteTarget.name})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={submitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-md cursor-pointer"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
