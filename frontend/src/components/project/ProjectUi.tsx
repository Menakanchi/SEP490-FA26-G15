"use client";

import React, { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Ellipsis, Loader2, Settings, Trash2, TriangleAlert, X } from "lucide-react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { JourneyStatus, ProjectItem } from "@/types/vehicsim";

/*
 * Thành phần giao diện dùng chung của phần project: avatar, dấu trạng thái bước, hộp thoại, thông báo, menu "⋯"
 * và hộp thoại lưu trữ / xoá project.
 */

const PALETTE = [
  "bg-vehicsim-decision-bg text-vehicsim-decision",
  "bg-vehicsim-perception-bg text-vehicsim-perception",
  "bg-vehicsim-dynamics-bg text-vehicsim-dynamics",
  "bg-vehicsim-control-bg text-vehicsim-control",
  "bg-vehicsim-ok-bg text-vehicsim-ok",
];

/** Chữ cái đầu của tên project trên nền màu cố định theo id, để nhận ra project trong danh sách và menu. */
export function ProjectAvatar({ id, name, size = "md" }: { id: number; name: string; size?: "sm" | "md" | "lg" }) {
  const letter = [...name.trim()][0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-[10px] font-extrabold",
        PALETTE[Math.abs(id) % PALETTE.length],
        size === "sm" && "size-7 text-[12px]",
        size === "md" && "size-9 text-[15px]",
        size === "lg" && "size-12 rounded-[14px] text-[20px]",
      )}
    >
      {letter}
    </span>
  );
}

export const PROJECT_CONTEXT_CLASS = "rounded-[14px] border border-solid border-vehicsim-line bg-white px-3 py-[10px]";

export function ProjectIdentity({ project, label, fallback }: {
  project?: { id: number; name: string };
  label: string;
  fallback: string;
}) {
  return (
    <>
      {project && <ProjectAvatar id={project.id} name={project.name} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-vehicsim-muted">{label}</span>
        <span className="truncate text-[14px] font-bold text-vehicsim-ink" title={project?.name}>{project?.name ?? fallback}</span>
      </span>
    </>
  );
}

export function StepStatusIcon({ status, n, current, size = "md" }: { status: JourneyStatus; n: number; current?: boolean; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-[22px] text-[11px]" : "size-9 text-[14px]";
  const icon = size === "sm" ? "size-3" : "size-4";
  const label = status === "RUNNING" ? "đang chạy" : status === "FAILED" ? "có lượt chạy lỗi" : current ? "gợi ý làm tiếp" : "";
  return (
    <span
      role="img"
      aria-label={`Bước ${n}${label && `: ${label}`}`}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        box,
        status === "RUNNING"
          ? "bg-vehicsim-decision-bg text-vehicsim-decision"
          : status === "FAILED"
            ? "bg-vehicsim-danger-bg text-vehicsim-danger"
            : current
              ? "bg-vehicsim-ink text-white"
              : "border border-solid border-vehicsim-line-strong bg-white text-vehicsim-ink",
      )}
    >
      {status === "RUNNING" ? (
        <Loader2 className={cx(icon, "motion-safe:animate-spin")} />
      ) : status === "FAILED" ? (
        <TriangleAlert className={icon} />
      ) : (
        n
      )}
    </span>
  );
}

/** Đóng menu khi bấm ra ngoài vùng `root` hoặc nhấn Esc. */
export function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [root, open, close]);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại chuẩn: Esc hoặc bấm nền để đóng (trừ khi đang xử lý), giữ Tab trong hộp, trả focus về nút đã mở khi đóng.
 */
export function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const locked = useRef(!!busy);

  useEffect(() => {
    close.current = onClose;
    locked.current = !!busy;
  }, [onClose, busy]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("[autofocus], " + FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked.current) close.current();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-vehicsim-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked.current) close.current();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[480px] flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card"
      >
        <h2 id={titleId} className="text-[18px] font-bold text-vehicsim-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: string;
  tone: "ok" | "warn";
  text: React.ReactNode;
  action?: { label: string; href: string };
  onClose: () => void;
}

/** Vùng thông báo duy nhất ở góc phải dưới; mỗi thông báo có nút đóng và tối đa một hành động. */
export function ToastStack({ messages }: { messages: ToastMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 flex w-[400px] max-w-[calc(100vw-48px)] flex-col gap-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cx(
            "flex items-start gap-3 rounded-[16px] border border-solid bg-white px-4 py-3 text-[14px] shadow-vehicsim-card",
            m.tone === "ok" ? "border-vehicsim-ok/30" : "border-vehicsim-warn/30",
          )}
        >
          <span className={cx("mt-[6px] size-2 shrink-0 rounded-full", m.tone === "ok" ? "bg-vehicsim-ok" : "bg-vehicsim-warn")} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="leading-[1.5] text-vehicsim-ink">{m.text}</span>
            {m.action && (
              <Link href={m.action.href} onClick={m.onClose} className="w-fit text-[13px] font-semibold text-vehicsim-decision hover:underline">
                {m.action.label}
              </Link>
            )}
          </div>
          <button type="button" aria-label="Đóng thông báo" onClick={m.onClose} className="shrink-0 rounded-full p-1 text-vehicsim-muted hover:bg-vehicsim-soft">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export const TERMS = {
  baseline: "Cấu hình AEB đang dùng làm mốc. Mọi ứng viên được so với nó trên cùng tình huống và cùng seed.",
  variant: "Một tình huống cụ thể trong họ kịch bản: một tốc độ xe, một khoảng cách người bước ra, một điều kiện thời tiết.",
  seed: "Số khởi tạo ngẫu nhiên. Cùng biến thể và cùng seed thì mô phỏng lặp lại y hệt, nên so sánh mới công bằng.",
  ttc: "Time-to-collision: số giây còn lại trước khi va chạm nếu không ai đổi tốc độ. Càng nhỏ càng nguy hiểm.",
  falseBraking: "AEB phanh khi không cần, ví dụ người đi bộ đã dừng ở lề. Phanh oan nhiều làm xe khó chịu và kém tin cậy.",
  candidate: "Bộ tham số AEB mới được tạo từ baseline để thử. Chỉ dùng thay baseline khi đã đạt kiểm chứng.",
  verification: "Chạy lại đúng các tình huống với ứng viên, cùng seed, rồi so từng cặp với baseline.",
} as const;

export function Term({ children, tip }: { children: React.ReactNode; tip: string }) {
  const id = useId();
  return (
    <span className="group relative inline-block">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-vehicsim-line-strong"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-[10px] bg-vehicsim-ink px-3 py-2 text-left text-[13px] font-normal leading-[1.45] text-white opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 motion-reduce:transition-none"
      >
        {tip}
      </span>
    </span>
  );
}

export function OpenProjectCard({ project, purpose }: { project: ProjectItem; purpose: string }) {
  const { openProject } = useVehicSimContext();
  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <p className="text-[14px] text-vehicsim-muted">
        Bạn đang mở project khác. Mở “{project.name}” để {purpose}.
      </p>
      <PillButton variant="dark" onClick={() => openProject(project.id)}>
        Mở project này
      </PillButton>
    </Card>
  );
}

export type ProjectAction = "archive" | "unarchive" | "delete";

const COPY: Record<ProjectAction, { title: string; body: string; confirm: string; done: string }> = {
  archive: {
    title: "Lưu trữ project?",
    body: "Project lưu trữ không mở được để làm việc và không tính vào giới hạn project đang hoạt động. Bỏ lưu trữ bất cứ lúc nào để mở lại.",
    confirm: "Lưu trữ",
    done: "Đã lưu trữ",
  },
  unarchive: {
    title: "Bỏ lưu trữ project?",
    body: "Project hoạt động trở lại và tính vào giới hạn project đang hoạt động.",
    confirm: "Bỏ lưu trữ",
    done: "Đã bỏ lưu trữ",
  },
  delete: {
    title: "Xoá vĩnh viễn project?",
    body: "Mọi kịch bản, lượt chạy, phân tích, kiểm thử và file kết quả của project sẽ bị xoá và không thể khôi phục.",
    confirm: "Xoá vĩnh viễn",
    done: "Đã xoá",
  },
};

const RUN = { archive: vehicsimApi.archiveProject, unarchive: vehicsimApi.unarchiveProject };

export function useProjectActions(onDone: (kind: ProjectAction) => void | Promise<void>) {
  const { ctx, openProject } = useVehicSimContext();
  const [action, setAction] = useState<{ kind: ProjectAction; project: ProjectItem } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = (kind: ProjectAction, project: ProjectItem) => {
    setAction({ kind, project });
    setConfirmName("");
    setError(null);
    setNotice(null);
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;
    const { kind, project } = action;
    setBusy(true);
    try {
      if (kind === "delete") await vehicsimApi.deleteProject(project.id, confirmName);
      else await RUN[kind](project.id);
      setAction(null);
      setNotice(`${COPY[kind].done} “${project.name}”.`);
      if (project.id === ctx?.project.id && kind !== "unarchive") openProject(null);
      await onDone(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác không thành công");
    } finally {
      setBusy(false);
    }
  };

  const copy = action && COPY[action.kind];
  const blocked = action?.kind === "delete" && confirmName.trim() !== action.project.name;

  const view = (
    <>
      <ToastStack messages={notice ? [{ id: "project-action", tone: "ok", text: notice, onClose: () => setNotice(null) }] : []} />
      {action && copy && (
        <Modal title={copy.title} busy={busy} onClose={() => setAction(null)}>
          <form onSubmit={confirm} className="flex flex-col gap-4">
            <p className="text-[14px] leading-[1.55] text-vehicsim-muted">
              <span className="font-semibold text-vehicsim-ink">“{action.project.name}”</span>: {copy.body}
            </p>
            {action.kind === "delete" && (
              <label className="flex flex-col gap-[6px] text-[13px] font-medium text-vehicsim-muted">
                Gõ “{action.project.name}” để xác nhận
                <input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoFocus
                  className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                />
              </label>
            )}
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <PillButton onClick={() => setAction(null)} disabled={busy}>
                Huỷ
              </PillButton>
              <button
                type="submit"
                disabled={busy || blocked}
                className={cx(
                  "rounded-full px-5 py-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50",
                  action.kind === "delete" ? "bg-vehicsim-danger hover:opacity-90" : "bg-vehicsim-ink hover:bg-black/80",
                )}
              >
                {busy ? "Đang xử lý…" : copy.confirm}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );

  return { start, view };
}

const itemCls = "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-50";

/** Menu "⋯" của một project: cài đặt và các thao tác vòng đời, để chúng không chiếm chỗ trên màn chính. */
export function ProjectMenu({ project, onAction }: { project: ProjectItem; onAction: (kind: ProjectAction) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);
  const busy = project.has_running_work ? "Còn việc đang chờ hoặc đang chạy" : undefined;
  const run = (kind: ProjectAction) => {
    close();
    onAction(kind);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Thao tác với project"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full border border-solid border-vehicsim-line-strong bg-white text-vehicsim-ink hover:bg-vehicsim-soft"
      >
        <Ellipsis className="size-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-[240px] flex-col gap-[2px] rounded-[14px] border border-solid border-vehicsim-line bg-white p-2 shadow-vehicsim-card">
          <Link role="menuitem" href={`/projects/${project.id}/settings`} onClick={close} className={cx(itemCls, "text-vehicsim-ink hover:bg-vehicsim-soft")}>
            <Settings className="size-4" /> Cài đặt project
          </Link>
          {project.status === "ACTIVE" ? (
            <button type="button" role="menuitem" disabled={!!busy} title={busy} onClick={() => run("archive")} className={cx(itemCls, "text-vehicsim-ink hover:bg-vehicsim-soft")}>
              <Archive className="size-4" /> Lưu trữ
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => run("unarchive")} className={cx(itemCls, "text-vehicsim-ink hover:bg-vehicsim-soft")}>
              <ArchiveRestore className="size-4" /> Bỏ lưu trữ
            </button>
          )}
          <span aria-hidden className="my-1 h-px bg-vehicsim-line" />
          <button type="button" role="menuitem" disabled={!!busy} title={busy} onClick={() => run("delete")} className={cx(itemCls, "text-vehicsim-danger hover:bg-vehicsim-danger-bg")}>
            <Trash2 className="size-4" /> Xoá vĩnh viễn
          </button>
        </div>
      )}
    </div>
  );
}
