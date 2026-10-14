"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import type { RegisterPayload } from "@/services/api";
import { AuthCard, inputClass, labelClass, linkClass, primaryButtonClass } from "@/components/auth/AuthCard";
import { Lock, Mail, User as UserIcon, UserPlus, Loader2, Phone, CalendarDays, MapPin } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

const GENDERS: { value: NonNullable<RegisterPayload["gender"]>; label: string }[] = [
  { value: "MALE", label: "Nam" },
  { value: "FEMALE", label: "Nữ" },
  { value: "OTHER", label: "Khác" },
];

/**
 * Đăng ký một bước với backend Java (`POST /api/v1/auth/register`): tạo tài khoản
 * EXPERIENCER và đăng nhập luôn. Chưa xác minh email bằng mã OTP — bản này khớp
 * đúng những gì backend Java đang có.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<RegisterPayload["gender"] | "">("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      const user = await register({
        email,
        password,
        lastName: lastName.trim(),
        middleName: middleName.trim() || undefined,
        firstName: firstName.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        address: address.trim() || undefined,
      });
      router.push(homeFor(user.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng ký không thành công. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Đăng ký bằng email để bắt đầu vòng kiểm thử AEB / FCW. Đăng ký xong bạn được đăng nhập luôn."
      backHref="/login"
      backLabel="Quay lại trang Đăng nhập"
      error={error}
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link href="/login" className={linkClass}>
            Đăng nhập tại đây
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <span className={labelClass}>
            <UserIcon className="size-3.5" /> Họ và tên <span className="text-vehicsim-danger">*</span>
          </span>
          <div className="grid grid-cols-3 gap-2">
            <input
              aria-label="Họ"
              type="text"
              required
              maxLength={80}
              autoComplete="family-name"
              className={inputClass}
              placeholder="Họ"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            <input
              aria-label="Tên đệm"
              type="text"
              maxLength={80}
              autoComplete="additional-name"
              className={inputClass}
              placeholder="Đệm"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
            <input
              aria-label="Tên"
              type="text"
              required
              maxLength={80}
              autoComplete="given-name"
              className={inputClass}
              placeholder="Tên"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-email" className={labelClass}>
            <Mail className="size-3.5" /> Email <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="register-password" className={labelClass}>
            <Lock className="size-3.5" /> Mật khẩu <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            autoComplete="new-password"
            className={inputClass}
            placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="register-confirm" className={labelClass}>
            <Lock className="size-3.5" /> Nhập lại mật khẩu <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-confirm"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <details className="rounded-[14px] border border-solid border-vehicsim-line px-4 py-3 [&[open]>summary]:mb-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-vehicsim-muted">
            Thông tin thêm (không bắt buộc)
          </summary>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="register-phone" className={labelClass}>
                <Phone className="size-3.5" /> Số điện thoại
              </label>
              <input
                id="register-phone"
                type="tel"
                maxLength={30}
                autoComplete="tel"
                className={inputClass}
                placeholder="0901234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="register-dob" className={labelClass}>
                  <CalendarDays className="size-3.5" /> Ngày sinh
                </label>
                <input
                  id="register-dob"
                  type="date"
                  autoComplete="bday"
                  className={inputClass}
                  value={dateOfBirth}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="register-gender" className={labelClass}>
                  <UserIcon className="size-3.5" /> Giới tính
                </label>
                <select
                  id="register-gender"
                  className={inputClass}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as RegisterPayload["gender"] | "")}
                >
                  <option value="">Không chọn</option>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="register-address" className={labelClass}>
                <MapPin className="size-3.5" /> Địa chỉ
              </label>
              <input
                id="register-address"
                type="text"
                maxLength={500}
                autoComplete="street-address"
                className={inputClass}
                placeholder="Số nhà, đường, quận / huyện, tỉnh / thành"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        </details>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          <span>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</span>
        </button>
      </form>
    </AuthCard>
  );
}
