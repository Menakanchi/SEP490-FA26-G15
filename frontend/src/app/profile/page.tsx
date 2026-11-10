"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { inputClass, labelClass } from "@/components/auth/AuthCard";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, ErrorNote, PillButton, ROLE_LABELS, initials } from "@/components/VehicSimUi";
import { useAuth } from "@/context/AuthContext";

const MIN_PASSWORD_LENGTH = 8;
type Feedback = { tone: "ok" | "error"; text: string };

function FormFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  if (feedback.tone === "error") return <ErrorNote message={feedback.text} />;
  return <p role="status" className="rounded-lg bg-vehicsim-ok-bg px-3 py-2.5 text-sm text-vehicsim-ok">{feedback.text}</p>;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateProfile, changePassword } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp thông tin tài khoản vào biểu mẫu chỉnh sửa
    setFullName(user.full_name || user.name || "");
    setAvatarUrl(user.avatar_url || "");
  }, [user]);

  if (!user) return null;

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileFeedback({ tone: "error", text: "Vui lòng chọn tệp hình ảnh hợp lệ." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImageToCrop(reader.result);
    };
    reader.onerror = () => setProfileFeedback({ tone: "error", text: "Không đọc được ảnh. Hãy thử chọn ảnh khác." });
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim()) {
      setProfileFeedback({ tone: "error", text: "Họ và tên không được để trống." });
      return;
    }
    setProfileSaving(true);
    setProfileFeedback(null);
    try {
      await updateProfile(fullName, avatarUrl || undefined);
      setProfileFeedback({ tone: "ok", text: "Đã lưu thông tin cá nhân." });
    } catch (err) {
      setProfileFeedback({ tone: "error", text: err instanceof Error ? err.message : "Không lưu được thông tin cá nhân." });
    } finally {
      setProfileSaving(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!oldPassword || newPassword.length < MIN_PASSWORD_LENGTH || newPassword !== confirmPassword) {
      const text = !oldPassword ? "Vui lòng nhập mật khẩu hiện tại."
        : newPassword.length < MIN_PASSWORD_LENGTH ? `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`
        : "Mật khẩu xác nhận không khớp với mật khẩu mới.";
      setPasswordFeedback({ tone: "error", text });
      return;
    }
    setPasswordSaving(true);
    setPasswordFeedback(null);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordFeedback({ tone: "ok", text: "Đã đổi mật khẩu và đăng xuất các phiên khác." });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordFeedback({ tone: "error", text: err instanceof Error ? err.message : "Không đổi được mật khẩu." });
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <VehicSimPage
      crumbs={[{ label: "Hồ sơ cá nhân" }]}
      title="Hồ sơ cá nhân"
      subtitle="Quản lý thông tin hiển thị và mật khẩu tài khoản."
      showContext={false}
      actions={<PillButton onClick={() => router.back()}><ArrowLeft aria-hidden className="size-4" /> Quay lại</PillButton>}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-5 p-4 sm:p-5">
          <CardTitle>Thông tin cá nhân</CardTitle>
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 border-b border-vehicsim-line pb-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh đại diện là dữ liệu lưu trong trình duyệt
                <img src={avatarUrl} alt="Ảnh đại diện" className="size-16 shrink-0 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-vehicsim-primary-bg text-lg font-bold text-vehicsim-primary">
                  {initials(user.full_name || user.name || user.username)}
                </span>
              )}
              <div className="flex min-w-0 flex-1 basis-[180px] flex-col items-start gap-2">
                <p className="text-sm font-semibold">Ảnh đại diện</p>
                <p className="text-xs text-vehicsim-muted">Ảnh đại diện được lưu trên trình duyệt này.</p>
                <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Chọn ảnh đại diện" onChange={handleFileUpload} />
                <PillButton onClick={() => fileInput.current?.click()}><Upload aria-hidden className="size-4" /> Chọn ảnh</PillButton>
              </div>
            </div>
            <div>
              <label htmlFor="profile-name" className={labelClass}>Họ và tên</label>
              <input id="profile-name" type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label htmlFor="profile-email" className={labelClass}>Email đăng nhập</label>
              <input id="profile-email" type="email" autoComplete="username" value={user.email} readOnly className={inputClass + " read-only:bg-vehicsim-soft"} />
            </div>
            <dl className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <dt className="text-vehicsim-muted">Vai trò</dt>
              <dd className="font-semibold">{ROLE_LABELS[user.role] ?? user.role}</dd>
            </dl>
            <FormFeedback feedback={profileFeedback} />
            <div className="flex justify-end border-t border-vehicsim-line pt-4">
              <PillButton type="submit" variant="dark" disabled={profileSaving}>{profileSaving ? "Đang lưu…" : "Lưu thay đổi"}</PillButton>
            </div>
          </form>
        </Card>
        <Card className="flex flex-col gap-5 p-4 sm:p-5">
          <CardTitle>Đổi mật khẩu</CardTitle>
          <form onSubmit={savePassword} className="flex flex-col gap-4">
            <div>
              <label htmlFor="profile-password-current" className={labelClass}>Mật khẩu hiện tại</label>
              <input id="profile-password-current" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label htmlFor="profile-password-new" className={labelClass}>Mật khẩu mới</label>
              <input id="profile-password-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} maxLength={72} aria-describedby="profile-password-rule" className={inputClass} required />
              <p id="profile-password-rule" className="mt-1.5 text-xs text-vehicsim-muted">Ít nhất {MIN_PASSWORD_LENGTH} ký tự.</p>
            </div>
            <div>
              <label htmlFor="profile-password-confirm" className={labelClass}>Xác nhận mật khẩu mới</label>
              <input id="profile-password-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} required />
            </div>
            <p className="text-xs leading-relaxed text-vehicsim-muted">Khi đổi mật khẩu, các phiên đăng nhập khác của tài khoản sẽ kết thúc.</p>
            <FormFeedback feedback={passwordFeedback} />
            <div className="flex justify-end border-t border-vehicsim-line pt-4">
              <PillButton type="submit" variant="dark" disabled={passwordSaving}>{passwordSaving ? "Đang cập nhật…" : "Đổi mật khẩu"}</PillButton>
            </div>
          </form>
        </Card>
      </div>
      {imageToCrop && (
        <AvatarCropModal imageSrc={imageToCrop} onClose={() => setImageToCrop(null)} onCropConfirm={(cropped) => {
          setAvatarUrl(cropped);
          setProfileFeedback({ tone: "ok", text: "Đã cắt ảnh. Chọn Lưu thay đổi để cập nhật ảnh đại diện." });
        }} />
      )}
    </VehicSimPage>
  );
}
