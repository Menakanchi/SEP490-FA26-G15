"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, MessageSquareText, SlidersHorizontal, Sparkles } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ErrorNote, PillButton, Tag, cx } from "@/components/VehicSimUi";
import { STARTER_OPTIONS, STARTER_VARIANTS, splitDescription, starterFamily, type StarterCondition } from "@/components/project/journey";
import { useJourney, useProjectItem } from "@/components/project/ProjectJourneyContext";
import { OpenProjectCard } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";

function WayCard({
  icon,
  title,
  badge,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-vehicsim-soft text-vehicsim-ink">{icon}</span>
        {badge && <Tag tone="info">{badge}</Tag>}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[18px] font-bold text-vehicsim-ink">{title}</h2>
        <p className="text-[14px] leading-[1.55] text-vehicsim-muted">{detail}</p>
      </div>
      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </Card>
  );
}

/** Bước ① (M2): chọn cách thiết kế kịch bản, cho họ đầu tiên hoặc thêm họ mới khi quay lại. */
export default function StartScenarioPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const created = useSearchParams().get("created") === "1";
  const router = useRouter();
  const { canWrite } = useVehicSimContext();
  const { refresh } = useJourney();
  const { project, opened, error: loadError } = useProjectItem(id);
  const [condition, setCondition] = useState<StarterCondition>("DAY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWithSample = async () => {
    setBusy(true);
    setError(null);
    try {
      await vehicsimApi.createFamily(starterFamily(condition));
      await refresh();
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được kịch bản mẫu");
      setBusy(false);
    }
  };

  const goal = splitDescription(project?.description).goal;
  const families = project?.journey.counts.families ?? 0;
  const blocked = !opened ? "Mở project này trước khi thiết kế kịch bản" : !canWrite ? "Tài khoản không có quyền tạo kịch bản" : undefined;

  return (
    <VehicSimPage
      crumbs={[
        { label: "Project của tôi", href: "/projects" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Thiết kế kịch bản" },
      ]}
      title={families > 0 ? "① Thêm kịch bản" : "① Thiết kế kịch bản đầu tiên"}
      subtitle={
        families > 0
          ? `Project đã có ${families} họ kịch bản. Thêm họ mới để thử điều kiện khác; họ mới cần chạy baseline trước khi so sánh.`
          : "Kịch bản là tập tình huống người đi bộ băng ngang với nhiều tốc độ, khoảng cách và điều kiện. Chọn một cách để bắt đầu."
      }
      actions={
        families > 0 && opened ? (
          <PillButton href="/scenarios">Xem các họ kịch bản</PillButton>
        ) : (
          <Link href={`/projects/${id}`} className="text-[14px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink hover:underline">
            Để sau, về trang chủ project
          </Link>
        )
      }
    >
      {created && project && (
        <div role="status" className="flex items-center gap-3 rounded-[16px] border border-solid border-vehicsim-ok/30 bg-vehicsim-ok-bg px-5 py-4">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-vehicsim-ok" />
          <span className="text-[15px] text-vehicsim-ink">
            Đã tạo <strong>{project.name}</strong> với xe {project.vehicle_name} và cấu hình AEB gốc {project.baseline_label}.
          </span>
        </div>
      )}

      {goal && (
        <p className="text-[15px] leading-[1.55] text-vehicsim-ink">
          <span className="font-semibold">Mục tiêu của bạn:</span> {goal}
        </p>
      )}

      {project && !opened && <OpenProjectCard project={project} purpose="thiết kế kịch bản cho nó" />}

      <ErrorNote message={error ?? loadError} />

      <div className="flex w-full items-stretch gap-5">
        <WayCard
          icon={<Sparkles className="size-5" />}
          title="Dùng kịch bản mẫu"
          badge={families > 0 ? "~1 phút" : "Khuyên dùng · ~1 phút"}
          detail={`Người đi bộ bước ra trước xe ở ${STARTER_VARIANTS} tình huống, gồm cả ca người dừng ở lề. Baseline chạy ngay để bạn thấy kết quả.`}
        >
          <div role="radiogroup" aria-label="Điều kiện của kịch bản mẫu" className="flex flex-wrap gap-2">
            {STARTER_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={condition === o.key}
                onClick={() => setCondition(o.key)}
                className={cx(
                  "rounded-full px-4 py-2 text-[13px] font-semibold",
                  condition === o.key ? "bg-vehicsim-primary text-white" : "border border-solid border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <PillButton variant="dark" disabled={busy || !!blocked} title={blocked} onClick={() => void startWithSample()}>
            {busy ? "Đang tạo và chạy…" : "Dùng mẫu này"}
            
          </PillButton>
        </WayCard>

        <WayCard
          icon={<MessageSquareText className="size-5" />}
          title="Mô tả bằng lời"
          detail="Viết một câu tiếng Việt, ví dụ “người đi bộ bất ngờ băng qua khi xe chạy 50 km/h ban đêm”; hệ thống dựng tình huống và lưới biến thể."
        >
          <PillButton href={opened ? "/scenarios/new" : undefined} disabled={!!blocked} title={blocked}>
            Mô tả tình huống
            
          </PillButton>
        </WayCard>

        <WayCard
          icon={<SlidersHorizontal className="size-5" />}
          title="Tự nhập tham số"
          detail="Chọn từng khoảng tốc độ xe, khoảng cách người bước ra, tốc độ người, thời tiết và thời điểm trong ngày."
        >
          <PillButton href={opened ? "/scenarios?new=1" : undefined} disabled={!!blocked} title={blocked}>
            Nhập tham số
            
          </PillButton>
        </WayCard>
      </div>
    </VehicSimPage>
  );
}
