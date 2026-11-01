"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Card, Tag, cx } from "@/components/VehicSimUi";
import { JOURNEY_STEPS, STEP_NUMBER, nextAction, splitDescription, stepDefinition, stepHref, stepSummary, statusOf, timeAgo } from "@/components/project/journey";
import { ProjectAvatar, ProjectMenu, StepStatusIcon, type ProjectAction } from "@/components/project/ProjectUi";
import type { ProjectItem, ProjectJourney } from "@/types/vehicsim";

/* Khối hiển thị project: thẻ project trong "Project của tôi", thẻ "Bước tiếp theo" và dòng thời gian 5 bước của trang chủ project. */

/** Thẻ một project: mục tiêu, tiến độ 5 bước và nút đi tiếp đúng bước đang dở. */
export function ProjectCard({
  project,
  opened,
  limitReason,
  onContinue,
  onAction,
}: {
  project: ProjectItem;
  opened: boolean;
  limitReason?: string;
  onContinue: (href: string) => void;
  onAction: (kind: ProjectAction) => void;
}) {
  const journey = project.journey;
  const active = project.status === "ACTIVE";
  const next = nextAction(journey);
  const done = journey.steps.filter((s) => s.status === "DONE").length;
  const goal = splitDescription(project.description).goal;

  return (
    <Card className={cx("flex flex-col gap-4 p-5", opened && "ring-2 ring-vehicsim-decision/40")}>
      <div className="flex items-start gap-3">
        <ProjectAvatar id={project.id} name={project.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/projects/${project.id}`} className="truncate text-[16px] font-bold text-vehicsim-ink hover:underline">
            {project.name}
          </Link>
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-vehicsim-muted">
            {project.vehicle_name ?? "Chưa chọn xe"}
            {opened && <Tag tone="info">Đang mở</Tag>}
            {project.has_running_work && <Tag tone="warn">Đang chạy</Tag>}
          </span>
        </div>
        <ProjectMenu project={project} onAction={onAction} limitReason={limitReason} />
      </div>

      <p className="line-clamp-2 min-h-[42px] text-[14px] leading-[1.5] text-vehicsim-muted">{goal || "Chưa ghi mục tiêu thử nghiệm."}</p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1" aria-label={`Đã xong ${done}/5 bước`}>
          {JOURNEY_STEPS.map((step) => (
            <StepStatusIcon key={step.key} status={statusOf(journey, step.key)} n={step.n} current={journey.next === step.key} size="sm" />
          ))}
          <span className="ml-2 text-[13px] font-semibold text-vehicsim-ink">
            {next.key ? `Bước ${stepDefinition(next.key).n}/5 · ${stepDefinition(next.key).title}` : `Vòng ${journey.round} đã xong`}
          </span>
        </div>
        <span className="truncate text-[13px] text-vehicsim-muted">
          {next.key ? stepSummary(next.key, journey) : stepSummary("VERIFY", journey)} · {timeAgo(journey.last_activity_at)}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-solid border-vehicsim-line pt-4">
        {active ? (
          <button
            type="button"
            onClick={() => onContinue(next.href)}
            className="flex items-center gap-2 rounded-full bg-vehicsim-ink px-4 py-[10px] text-[13px] font-semibold text-white hover:bg-black/80"
          >
            {next.key ? `Tiếp tục: ${next.cta}` : next.cta}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!!limitReason}
            title={limitReason}
            onClick={() => onAction("unarchive")}
            className="rounded-full border border-solid border-vehicsim-line-strong px-4 py-[10px] text-[13px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bỏ lưu trữ
          </button>
        )}
        <Link href={`/projects/${project.id}`} className="text-[13px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink hover:underline">
          Trang chủ project
        </Link>
      </div>
    </Card>
  );
}

/** Ô "Tạo project" cuối lưới, hiện số chỗ còn lại theo hạn mức. */
export function NewProjectCard({ remaining }: { remaining: number }) {
  return (
    <Link
      href="/projects/new"
      className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-vehicsim-line-strong text-vehicsim-muted hover:border-vehicsim-ink hover:text-vehicsim-ink"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-vehicsim-soft">
        <Plus className="size-6" />
      </span>
      <span className="text-[15px] font-bold">Tạo project</span>
      <span className="text-[13px]">Còn {remaining} chỗ cho project đang hoạt động</span>
    </Link>
  );
}

/** Thẻ nổi nhất của trang chủ project: đúng một việc nên làm tiếp, kèm tiến độ khi baseline đang chạy. */
export function NextStepCard({ journey, opened, onGo }: { journey: ProjectJourney; opened: boolean; onGo: (href: string) => void }) {
  const action = nextAction(journey);
  const c = journey.counts;
  const running = action.key === "BASELINE" && statusOf(journey, "BASELINE") === "RUNNING" && c.variants > 0;
  const progress = running ? Math.round((c.baseline_completed / c.variants) * 100) : null;

  return (
    <section aria-labelledby="next-step-title" className="flex w-full items-center gap-8 rounded-[24px] bg-vehicsim-ink p-7 text-white shadow-vehicsim-card">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.8px] text-white/70">
          {action.key ? `Bước tiếp theo · vòng ${journey.round}` : "Hoàn tất vòng"}
        </span>
        <h2 id="next-step-title" className="text-[26px] font-extrabold leading-[1.2] tracking-[-0.5px]">
          {action.title}
        </h2>
        <p className="max-w-[640px] text-[15px] leading-[1.55] text-white/85">{action.detail}</p>
        {progress !== null && (
          <div className="mt-2 flex max-w-[480px] items-center gap-3">
            <div
              role="progressbar"
              aria-label="Tiến độ chạy baseline"
              aria-valuenow={c.baseline_completed}
              aria-valuemin={0}
              aria-valuemax={c.variants}
              className="h-2 flex-1 overflow-hidden rounded-full bg-white/20"
            >
              <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[13px] font-semibold tabular-nums">
              {c.baseline_completed}/{c.variants}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onGo(action.href)}
        className="flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-[14px] text-[15px] font-bold text-vehicsim-ink hover:bg-white/90"
      >
        {opened ? action.cta : "Mở project và tiếp tục"}
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </section>
  );
}

/** Năm bước của vòng hiện tại theo thứ tự: trạng thái thật, số liệu và lối vào từng bước. */
export function JourneyTimeline({ journey, onGo, disabled }: { journey: ProjectJourney; onGo: (href: string) => void; disabled?: string }) {
  const nextIndex = journey.next ? JOURNEY_STEPS.findIndex((s) => s.key === journey.next) : JOURNEY_STEPS.length;

  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-5 p-6">
      <h2 className="text-[17px] font-bold text-vehicsim-ink">Hành trình · vòng {journey.round}</h2>
      <ol className="flex flex-col">
        {JOURNEY_STEPS.map((step, i) => {
          const status = statusOf(journey, step.key);
          const isNext = journey.next === step.key;
          const later = i > nextIndex;
          const last = i === JOURNEY_STEPS.length - 1;
          const label = status === "DONE" ? "Xem lại" : status === "RUNNING" ? "Xem tiến độ" : isNext ? "Làm bước này" : "Mở";
          return (
            <li key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepStatusIcon status={status} n={step.n} current={isNext} />
                {!last && <span aria-hidden className={cx("my-1 w-[2px] flex-1 rounded-full", status === "DONE" ? "bg-vehicsim-ok/40" : "bg-vehicsim-line")} />}
              </div>
              <div className={cx("flex min-w-0 flex-1 items-start justify-between gap-4", !last && "pb-6")}>
                <div className={cx("flex min-w-0 flex-col gap-1", later && "opacity-60")}>
                  <span className="text-[16px] font-bold text-vehicsim-ink">
                    {STEP_NUMBER[i]} {step.title}
                  </span>
                  <span className="text-[14px] text-vehicsim-muted">{step.question}</span>
                  <span className={cx("text-[14px] font-semibold", status === "DONE" ? "text-vehicsim-ok" : status === "FAILED" ? "text-vehicsim-danger" : "text-vehicsim-ink")}>
                    {stepSummary(step.key, journey)}
                  </span>
                  {later && journey.next && (
                    <span className="text-[13px] text-vehicsim-muted">Nên xong bước {stepDefinition(journey.next).n} trước.</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!!disabled}
                  title={disabled}
                  onClick={() => onGo(stepHref(step.key, journey))}
                  className={cx(
                    "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                    isNext ? "bg-vehicsim-ink text-white hover:bg-black/80" : "border border-solid border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft",
                  )}
                >
                  {label}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
