"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  KeyRound,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  Check,
  Camera,
  ArrowLeft,
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { updateUserProfile, changePassword } from "@/services/api";
import { AvatarCropModal } from "@/components/AvatarCropModal";

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileContent />
    </AuthGate>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { user, updateCurrentUser } = useAuth();

  // Profile Form State
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Avatar Cropper State
  const [selectedImageForCrop, setSelectedImageForCrop] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Password Form State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Toast / Status Message
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form state from user context
      setFullName(user.full_name || user.name || "");
      setAvatarUrl(user.avatar_url || "");
    }
  }, [user]);

  if (!user) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToast({ type: "error", msg: "Vui lòng chọn file hình ảnh hợp lệ (.jpg, .png, .webp)" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setSelectedImageForCrop(result);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setToast({ type: "error", msg: "Họ và tên không được để trống" });
      return;
    }

    setProfileSaving(true);
    setToast(null);
    try {
      const res = await updateUserProfile({
        username: user.username,
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
      });

      if (res.ok && res.user) {
        updateCurrentUser(res.user);
        setToast({ type: "success", msg: "Cập nhật thông tin cá nhân thành công!" });
      } else {
        setToast({ type: "error", msg: "Cập nhật thông tin thất bại." });
      }
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Đã xảy ra lỗi khi cập nhật profile.",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);

    if (!oldPassword) {
      setToast({ type: "error", msg: "Vui lòng nhập mật khẩu hiện tại" });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setToast({ type: "error", msg: "Mật khẩu mới phải có độ dài ít nhất 6 ký tự" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ type: "error", msg: "Mật khẩu xác nhận không khớp với mật khẩu mới" });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await changePassword({
        username: user.username,
        old_password: oldPassword,
        new_password: newPassword,
      });

      if (res.ok) {
        setToast({ type: "success", msg: res.message_vi || "Đổi mật khẩu thành công!" });
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setToast({ type: "error", msg: "Đổi mật khẩu thất bại." });
      }
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Mật khẩu hiện tại không chính xác.",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const displayName = user.full_name || user.name || user.username;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans text-slate-900 dark:text-slate-100">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-600 text-white shadow-green-500/20 font-bold"
              : "bg-red-600 text-white shadow-red-500/20 font-bold"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Glass Box */}
      <div className="bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-2xl rounded-[32px] p-6 sm:p-7 transition-all">
        <PageHeader
          icon={UserIcon}
          title="Quản lý Tài khoản Cá nhân"
          subtitle="Cập nhật thông tin hồ sơ người dùng và bảo mật mật khẩu tài khoản hệ thống"
          badge="User Profile"
          actions={
            <button
              type="button"
              onClick={() => router.back()}
              className="text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2 border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 font-extrabold transition cursor-pointer shadow-xs backdrop-blur-md"
            >
              <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Quay lại</span>
            </button>
          }
        />
      </div>

      {/* Main Grid: Left Section (Profile Details) + Right Section (Change Password) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Section: Personal Info (7 cols) */}
        <div className="lg:col-span-7 bg-white/75 dark:bg-slate-900/85 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Thông tin cá nhân
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tùy chỉnh ảnh đại diện và tên hiển thị người dùng
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Avatar Preview & Presets */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
              <div className="relative group shrink-0">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-20 h-20 rounded-full object-cover border-2 border-blue-600 dark:border-cyan-400 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-2xl font-black flex items-center justify-center border-2 border-blue-400 shadow-md">
                    {initial}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-slate-950/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer"
                  title="Tải ảnh mới"
                >
                  <Camera className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-2.5 flex-1 w-full text-center sm:text-left">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Ảnh đại diện (Avatar)
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tải file ảnh đại diện từ máy tính cá nhân.
                </p>

                <div className="pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs"
                  >
                    <Upload className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <span>Tải ảnh từ máy (.png, .jpg, .webp)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Inputs: Full Name & Read-only fields */}
            <div className="space-y-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/80">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Họ và tên (Full Name) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                    Tên đăng nhập (Username)
                  </label>
                  <input
                    type="text"
                    value={user.username}
                    readOnly
                    className="w-full px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-mono font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                    Email tài khoản
                  </label>
                  <input
                    type="email"
                    value={user.email}
                    readOnly
                    className="w-full px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-mono font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  <span>Vai trò phân quyền hệ thống:</span>
                </div>
                <span className="px-3 py-1 bg-blue-600 text-white font-extrabold rounded-full uppercase text-[10px] tracking-wider">
                  {user.role}
                </span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-3 border-t border-slate-200/60 dark:border-slate-800/80">
              <button
                type="submit"
                disabled={profileSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-blue-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{profileSaving ? "Đang lưu..." : "Lưu thay đổi"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Section: Change Password (5 cols) */}
        <div className="lg:col-span-5 bg-white/75 dark:bg-slate-900/85 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Đổi mật khẩu
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cập nhật mật khẩu mới bảo vệ tài khoản
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Mật khẩu hiện tại <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Nhập mật khẩu đang sử dụng"
                  className="w-full px-4 py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ít nhất 6 ký tự"
                  className="w-full px-4 py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-4 py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>

              <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/80 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>{passwordSaving ? "Đang cập nhật..." : "Đổi mật khẩu"}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300 block">Lưu ý bảo mật:</span>
            <p className="leading-relaxed">
              Mật khẩu mới của bạn sẽ được mã hóa an toàn bằng thuật toán PBKDF2-HMAC-SHA256 trên cơ sở dữ liệu.
            </p>
          </div>
        </div>
      </div>

      {/* Avatar Crop Modal */}
      <AvatarCropModal
        isOpen={isCropModalOpen}
        imageSrc={selectedImageForCrop}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedImageForCrop(null);
        }}
        onCropConfirm={(croppedDataUrl) => {
          setAvatarUrl(croppedDataUrl);
          setToast({ type: "success", msg: "Đã cắt và chỉnh sửa ảnh đại diện thành công!" });
        }}
      />
    </div>
  );
}
