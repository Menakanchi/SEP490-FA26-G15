"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { NotificationItem } from "@/types/vehicsim";

/** Hỏi lại số chưa đọc mỗi 60 giây khi tab đang mở (không có đẩy realtime). */
const POLL_MS = 60_000;

const TYPE_LABEL: Record<string, string> = {
  MEMBER_ADDED: "Workspace",
  TASK_ASSIGNED: "Task",
  REPORT_SUBMITTED: "Báo cáo",
  WORKSPACE_ASSIGNED: "Workspace",
  SYSTEM: "Hệ thống",
};

/** "3 phút trước" từ thời điểm UTC backend trả (LocalDateTime không có 'Z'). */
function ago(iso: string): string {
  const t = new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

/** Chuông thông báo ở thanh trên (M10): số chưa đọc, danh sách 20 thông báo mới nhất, đánh dấu đã đọc. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await vehicsimApi.notifications(false, 20);
      setItems(r.items);
      setUnread(r.unread_count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thông báo");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải số chưa đọc khi vào trang
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Bấm ra ngoài hoặc Esc thì đóng.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  };

  const markRead = async (n: NotificationItem) => {
    if (n.is_read) return;
    try {
      const r = await vehicsimApi.markNotificationRead(n.id);
      setUnread(r.unread_count);
      setItems((list) => (list ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đánh dấu được");
    }
  };

  const markAll = async () => {
    try {
      const r = await vehicsimApi.markAllNotificationsRead();
      setUnread(r.unread_count);
      setItems((list) => (list ?? []).map((x) => ({ ...x, is_read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đánh dấu được");
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Thông báo: ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        className="relative flex size-[34px] items-center justify-center rounded-full border border-solid border-vehicsim-line bg-white hover:bg-vehicsim-soft"
      >
        <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" fill="none" className="text-vehicsim-muted">
          <path
            d="M8 1.8c-2.3 0-4 1.8-4 4.1v2.4L2.8 10.6h10.4L12 8.3V5.9c0-2.3-1.7-4.1-4-4.1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M6.3 12.6a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-vehicsim-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 top-[42px] z-50 flex w-[380px] flex-col overflow-hidden rounded-[18px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card"
        >
          <div className="flex items-center justify-between border-b border-solid border-vehicsim-line px-4 py-3">
            <span className="text-[14px] font-bold text-vehicsim-ink">Thông báo{unread ? ` · ${unread} chưa đọc` : ""}</span>
            <button
              type="button"
              disabled={!unread}
              onClick={markAll}
              className="text-[12px] font-semibold text-vehicsim-decision disabled:cursor-default disabled:text-vehicsim-faint"
            >
              Đánh dấu tất cả đã đọc
            </button>
          </div>
          {error && <p className="px-4 py-3 text-[12px] text-vehicsim-danger">{error}</p>}
          <div className="max-h-[420px] overflow-y-auto">
            {items && items.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-vehicsim-muted">Chưa có thông báo nào.</p>}
            {(items ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n)}
                className={cx(
                  "flex w-full gap-3 border-b border-solid border-vehicsim-line px-4 py-3 text-left last:border-b-0 hover:bg-vehicsim-soft",
                  !n.is_read && "bg-vehicsim-decision-bg/40",
                )}
              >
                <span className={cx("mt-[6px] size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-vehicsim-decision")} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className={cx("text-[13px] leading-[1.35] text-vehicsim-ink", !n.is_read && "font-bold")}>{n.title}</span>
                  <span className="text-[12px] leading-[1.4] text-vehicsim-muted">{n.content}</span>
                  <span className="text-[11px] text-vehicsim-faint">
                    {TYPE_LABEL[n.type] ?? n.type}
                    {n.workspace_name ? ` · ${n.workspace_name}` : ""} · {ago(n.created_date)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
