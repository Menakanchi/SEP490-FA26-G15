"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, RotateCw } from "lucide-react";
import { inputClass, labelClass } from "./AuthCard";

/** Khớp OTP_RESEND_COOLDOWN_SECONDS mặc định ở backend. */
export const RESEND_COOLDOWN_SECONDS = 60;

interface OtpCodeFieldProps {
  email: string;
  value: string;
  onChange: (code: string) => void;
  onResend: () => Promise<void>;
}

/**
 * Ô nhập mã 6 số + nút gửi lại có đếm ngược.
 *
 * `autoComplete="one-time-code"` cho phép trình duyệt / điện thoại tự điền mã
 * từ email hoặc SMS. Chỉ nhận chữ số: ký tự khác bị bỏ ngay khi gõ hoặc dán.
 */
export function OtpCodeField({ email, value, onChange, onResend }: OtpCodeFieldProps) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleResend = async () => {
    setResending(true);
    try {
      await onResend();
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  };

  return (
    <div>
      <label htmlFor="otp-code" className={labelClass}>
        <KeyRound className="size-3.5" /> Mã xác minh 6 số <span className="text-vehicsim-danger">*</span>
      </label>
      <input
        id="otp-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        className={`${inputClass} text-center text-[20px] font-extrabold tracking-[0.5em]`}
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-vehicsim-faint">
        <span>
          Mã đã gửi tới <strong className="font-semibold text-vehicsim-ink">{email}</strong>
        </span>
        <button
          type="button"
          onClick={handleResend}
          disabled={secondsLeft > 0 || resending}
          className="inline-flex cursor-pointer items-center gap-1 font-semibold text-vehicsim-ink hover:underline disabled:cursor-not-allowed disabled:text-vehicsim-faint disabled:no-underline"
        >
          <RotateCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
          {secondsLeft > 0 ? `Gửi lại sau ${secondsLeft}s` : "Gửi lại mã"}
        </button>
      </div>
    </div>
  );
}
