"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, FolderOpen, Loader2, Plus } from "lucide-react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { cx } from "@/components/VehicSimUi";
import { FINISHED_TEXT, JOURNEY_STEPS, nextAction, stepHref, stepOfPath, statusOf } from "@/components/project/journey";
import { useJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectAvatar, StepStatusIcon, ToastStack, useDismiss, type ToastMessage } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";

/*
 * Các mảnh project cắm vào khung chung của app khi người dùng là EXPERIENCER: cổng khu làm việc và màn chào mừng,
 * thanh hành trình đầu trang và nút đổi project trên sidebar.
 */

/** Minh hoạ tình huống người đi bộ băng ngang: xe tiến tới vạch qua đường, người bước ra, AEB phanh. Chỉ trang trí. */
function RoadScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label="Xe đang tới vạch qua đường, người đi bộ bước ra" className={className}>
      <style>{`
        @keyframes vs-car { 0% { transform: translateX(-40px) } 70% { transform: translateX(250px) } 100% { transform: translateX(250px) } }
        @keyframes vs-walker { 0%, 30% { transform: translateY(0) } 100% { transform: translateY(58px) } }
        @keyframes vs-brake { 0%, 60% { opacity: 0 } 70%, 100% { opacity: 1 } }
        @media (prefers-reduced-motion: no-preference) {
          .vs-car { animation: vs-car 4.5s ease-out infinite }
          .vs-walker { animation: vs-walker 4.5s linear infinite }
          .vs-brake { animation: vs-brake 4.5s linear infinite }
        }
      `}</style>
      <rect width="640" height="220" rx="24" className="fill-vehicsim-soft" />
      <rect y="70" width="640" height="104" className="fill-vehicsim-road" />
      <line x1="0" x2="640" y1="122" y2="122" strokeDasharray="24 18" strokeWidth="3" className="stroke-vehicsim-lane" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x="420" y={74 + i * 17} width="56" height="10" rx="2" className="fill-white" />
      ))}
      <g className="vs-car">
        <rect x="60" y="130" width="120" height="34" rx="10" className="fill-vehicsim-ink" />
        <rect x="132" y="135" width="34" height="24" rx="5" className="fill-vehicsim-decision-bg" />
        <path d="M184 136 l70 -14 v54 l-70 -14 z" className="vs-brake fill-vehicsim-amber" opacity="0.35" />
      </g>
      <g className="vs-walker">
        <circle cx="448" cy="52" r="9" className="fill-vehicsim-control" />
        <rect x="441" y="62" width="14" height="24" rx="6" className="fill-vehicsim-control" />
      </g>
      <g className="vs-brake">
        <rect x="236" y="20" width="132" height="32" rx="16" className="fill-white" />
        <text x="302" y="41" textAnchor="middle" className="fill-vehicsim-danger text-[13px] font-bold">AEB phanh!</text>
      </g>
    </svg>
  );
}

const STAGES = [
  { n: "", title: "Tạo project", detail: "Đặt tên, ghi mục tiêu thử nghiệm và chọn xe." },
  { n: "①", title: "Dựng tình huống", detail: "Người đi bộ băng ngang với nhiều tốc độ, khoảng cách, thời tiết." },
  { n: "② ③", title: "Chạy và xem kết quả", detail: "AEB hiện tại có phanh kịp không, ca nào va chạm và vì sao." },
  { n: "④ ⑤", title: "Chỉnh AEB và kiểm chứng", detail: "Đổi 4 tham số, chạy lại đúng các tình huống để so từng cặp." },
];

/** Màn đầu tiên của EXPERIENCER chưa có project đang hoạt động (M0). */
export function Welcome() {
  return (
    <div className="flex min-w-0 flex-1 justify-center px-9 py-12">
      <div className="flex w-full max-w-[960px] flex-col gap-8">
        <section className="flex flex-col gap-6 rounded-[28px] border border-solid border-vehicsim-line bg-white p-8 shadow-vehicsim-card">
          <RoadScene className="w-full" />
          <div className="flex flex-col gap-3">
            <h1 className="text-[36px] font-extrabold leading-[1.15] tracking-[-1px] text-vehicsim-ink">Thử phanh khẩn cấp AEB trong mô phỏng</h1>
            <p className="max-w-[640px] text-[16px] leading-[1.6] text-vehicsim-muted">
              Dựng tình huống nguy hiểm, xem xe phanh có kịp không, rồi tìm cấu hình AEB tốt hơn — ngay trên trình duyệt, không cần xe thật.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/projects/new"
              className="flex items-center gap-2 rounded-full bg-vehicsim-ink px-6 py-[14px] text-[15px] font-semibold text-white hover:bg-black/80"
            >
              Tạo project đầu tiên
              
            </Link>
            <Link href="/projects" className="text-[14px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink hover:underline">
              Mở lại project đã lưu trữ
            </Link>
          </div>
        </section>

        <ol className="grid grid-cols-4 gap-4">
          {STAGES.map((s) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5">
              <span className="text-[13px] font-bold text-vehicsim-decision">{s.n || "Bắt đầu"}</span>
              <span className="text-[16px] font-bold text-vehicsim-ink">{s.title}</span>
              <span className="text-[14px] leading-[1.5] text-vehicsim-muted">{s.detail}</span>
            </li>
          ))}
        </ol>

        <p className="text-[13px] leading-[1.6] text-vehicsim-muted">
          Chỉ bạn thấy project của mình. Kết quả là mô phỏng để so sánh cấu hình, không phải chứng nhận an toàn.
        </p>
      </div>
    </div>
  );
}

const OPEN_PATHS = ["/projects", "/profile"];

const OTHER_ROLE_PATHS = [
  { prefix: "/validation/recommendations", title: "Project cá nhân không có khuyến nghị", detail: "Bạn tự xem kết luận kiểm chứng và tự chọn ứng viên làm baseline ở màn Kết luận vòng." },
  { prefix: "/workspace", title: "Workspace dành cho Manager", detail: "Tài khoản Experiencer làm việc trong project cá nhân của mình." },
];

function OtherRolePage({ title, detail, href, cta }: { title: string; detail: string; href: string; cta: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-9">
      <div className="flex max-w-[520px] flex-col items-start gap-4 rounded-[24px] border border-solid border-vehicsim-line bg-white p-8 shadow-vehicsim-card">
        <h1 className="text-[22px] font-bold text-vehicsim-ink">{title}</h1>
        <p className="text-[15px] leading-[1.55] text-vehicsim-muted">{detail}</p>
        <Link href={href} className="flex items-center gap-2 rounded-full bg-vehicsim-ink px-5 py-3 text-[14px] font-semibold text-white hover:bg-black/80">
          {cta}
          
        </Link>
      </div>
    </div>
  );
}

/**
 * Cổng của khu làm việc: EXPERIENCER chưa chọn project thì được đưa về "Project của tôi" (trừ các trang quản lý project / hồ sơ);
 * role khác đi thẳng vào nội dung như cũ. Cũng là nơi hiện thông báo về project và việc vừa chạy xong.
 */
export function ProjectGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ctx, error, isExperiencer, choosing, projectNotice, clearProjectNotice } = useVehicSimContext();
  const { journey, finished, clearFinished } = useJourney();
  const open = !isExperiencer || pathname === "/" || OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const otherRole = isExperiencer ? OTHER_ROLE_PATHS.find((p) => pathname.startsWith(p.prefix)) : undefined;
  const last = journey?.counts.last_regression_id ?? null;
  const mustChoose = choosing && !open;

  useEffect(() => {
    if (mustChoose) router.replace("/projects");
  }, [mustChoose, router]);

  const toasts: ToastMessage[] = [];
  if (projectNotice) {
    toasts.push({
      id: "project-notice",
      tone: "warn",
      text: `${projectNotice} Chọn một project để tiếp tục.`,
      onClose: clearProjectNotice,
    });
  }
  if (finished && journey) {
    const next = nextAction(journey);
    toasts.push({
      id: `finished-${finished}`,
      tone: "ok",
      text: FINISHED_TEXT[finished] ?? "",
      action: { label: next.cta, href: next.href },
      onClose: clearFinished,
    });
  }

  return (
    <main key={open ? "open" : (ctx?.project.id ?? "none")} className="flex min-w-0 flex-1">
      {otherRole ? (
        <OtherRolePage
          title={otherRole.title}
          detail={otherRole.detail}
          href={ctx && last !== null ? `/projects/${ctx.project.id}/rounds/${last}` : ctx ? `/projects/${ctx.project.id}` : "/projects"}
          cta={ctx && last !== null ? "Mở Kết luận vòng" : ctx ? "Về trang chủ project" : "Về Project của tôi"}
        />
      ) : open || ctx || error ? (
        children
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-vehicsim-muted" />
        </div>
      )}
      <ToastStack messages={toasts} />
    </main>
  );
}

/** Thanh 5 bước ở đầu màn làm việc của EXPERIENCER: bước nào xong, đang ở bước nào và nút đi tiếp. */
export function JourneyBar() {
  const pathname = usePathname();
  const { ctx } = useVehicSimContext();
  const { journey } = useJourney();
  const here = ctx ? stepOfPath(pathname, ctx.project.id) : null;
  if (!ctx || (here === null && OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)))) return null;

  const next = journey ? nextAction(journey) : null;

  return (
    <nav
      aria-label="Hành trình project"
      className="flex w-full items-center gap-3 rounded-[18px] border border-solid border-vehicsim-line bg-white p-2 pl-4 shadow-vehicsim-card print:hidden"
    >
      <Link href={`/projects/${ctx.project.id}`} className="max-w-[200px] shrink-0 truncate text-[13px] font-bold text-vehicsim-ink hover:underline">
        {ctx.project.name}
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-vehicsim-line-strong" />
      <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {JOURNEY_STEPS.map((step, i) => {
          const status = journey ? statusOf(journey, step.key) : "TODO";
          const active = here === step.key;
          return (
            <li key={step.key} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="size-4 text-vehicsim-line-strong" />}
              <Link
                href={journey ? stepHref(step.key, journey) : "#"}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex items-center gap-2 rounded-full py-[6px] pl-[6px] pr-3 text-[13px] font-semibold",
                  active ? "bg-vehicsim-soft text-vehicsim-ink ring-1 ring-vehicsim-line-strong" : "text-vehicsim-muted hover:bg-vehicsim-soft",
                )}
              >
                <StepStatusIcon status={status} n={step.n} current={journey?.next === step.key} size="sm" />
                {step.short}
              </Link>
            </li>
          );
        })}
      </ol>
      {next && next.key === here && next.href === pathname ? (
        <span className="shrink-0 rounded-full bg-vehicsim-decision-bg px-4 py-[10px] text-[13px] font-semibold text-vehicsim-decision">
          Bạn đang ở bước gợi ý
        </span>
      ) : (
        next && (
          <Link
            href={next.href}
            className="flex shrink-0 items-center gap-2 rounded-full bg-vehicsim-ink px-4 py-[10px] text-[13px] font-semibold text-white hover:bg-black/80"
          >
            Tiếp: {next.cta}
            
          </Link>
        )
      )}
    </nav>
  );
}

type Option = { id: number; name: string };

const itemCls = "flex items-center gap-3 rounded-[10px] px-2 py-2 text-left text-[14px] hover:bg-vehicsim-soft";

/** Nút project đang mở trên sidebar; mở ra menu đổi project, quản lý và tạo mới. */
export function ProjectSwitcher() {
  const { ctx, choosing, openProject } = useVehicSimContext();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Option[] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = ctx?.project;
  useDismiss(root, open, close);

  useEffect(() => {
    if (!open) return;
    vehicsimApi
      .projects({ status: "ACTIVE", pageSize: 50 })
      .then((list) => setItems(list.items))
      .catch(() => setItems([]));
  }, [open]);

  const choose = (id: number) => {
    close();
    if (id !== current?.id) openProject(id, `/projects/${id}`);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-[14px] border border-solid border-vehicsim-line bg-white px-3 py-[10px] text-left hover:bg-vehicsim-soft"
      >
        {current ? <ProjectAvatar id={current.id} name={current.name} /> : <FolderOpen className="size-5 text-vehicsim-muted" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-vehicsim-muted">Project đang mở</span>
          <span className="truncate text-[14px] font-bold text-vehicsim-ink">
            {current?.name ?? (choosing ? "Chưa chọn project" : "Đang tải…")}
          </span>
        </span>
        <ChevronDown aria-hidden className={cx("size-4 shrink-0 text-vehicsim-muted transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 flex flex-col gap-[2px] rounded-[14px] border border-solid border-vehicsim-line bg-white p-2 shadow-vehicsim-card"
        >
          {items === null && <span className="px-3 py-2 text-[13px] text-vehicsim-muted">Đang tải…</span>}
          {items?.map((p) => (
            <button key={p.id} type="button" role="menuitem" onClick={() => choose(p.id)} className={itemCls}>
              <ProjectAvatar id={p.id} name={p.name} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold text-vehicsim-ink">{p.name}</span>
              {p.id === current?.id && <Check aria-label="Đang mở" className="size-4 text-vehicsim-ok" />}
            </button>
          ))}
          <span aria-hidden className="my-1 h-px bg-vehicsim-line" />
          <Link role="menuitem" href="/projects" onClick={close} className={cx(itemCls, "font-medium text-vehicsim-muted")}>
            <FolderOpen className="size-4" /> Quản lý project
          </Link>
          <Link role="menuitem" href="/projects/new" onClick={close} className={cx(itemCls, "font-semibold text-vehicsim-decision")}>
            <Plus className="size-4" /> Tạo project
          </Link>
        </div>
      )}
    </div>
  );
}

/** Trang đầu của EXPERIENCER là "Project của tôi". */
export function ExperiencerHome() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/projects");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 aria-label="Đang mở Project của tôi" className="size-6 animate-spin text-vehicsim-muted" />
    </div>
  );
}
