"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, SlidersHorizontal, Sparkles } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { CLASS_STYLE, Card, ErrorNote, PillButton, paramValue } from "@/components/VehicSimUi";
import { useProjectItem } from "@/components/project/ProjectJourneyContext";
import { OpenProjectCard, TERMS, Term } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { FailureClass, FailureList } from "@/types/vehicsim";

function WayCard({ icon, title, effort, detail, cta, href }: { icon: React.ReactNode; title: string; effort: string; detail: string; cta: string; href?: string }) {
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
      <span className="flex size-11 items-center justify-center rounded-[14px] bg-vehicsim-soft text-vehicsim-ink">{icon}</span>
      <div className="flex flex-col gap-2">
        <h2 className="text-[18px] font-bold text-vehicsim-ink">{title}</h2>
        <span className="text-[13px] font-semibold text-vehicsim-muted">{effort}</span>
        <p className="text-[14px] leading-[1.55] text-vehicsim-muted">{detail}</p>
      </div>
      <PillButton variant="dark" href={href} disabled={!href} className="mt-auto w-fit">
        {cta} <ArrowRight aria-hidden className="size-4" />
      </PillButton>
    </Card>
  );
}

function topCause(kpis: FailureList["kpis"]): { cls: FailureClass; count: number; total: number } | null {
  const entries = Object.entries(kpis.by_class) as [FailureClass, number][];
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const [cls, count] = entries.sort((a, b) => b[1] - a[1])[0] ?? [];
  return cls && count > 0 ? { cls, count, total } : null;
}

export default function ProjectImprovePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const { ctx } = useVehicSimContext();
  const { project, opened, error } = useProjectItem(id);
  const baseline = opened ? (ctx?.system.baseline ?? null) : null;
  const baselineId = baseline?.id ?? null;
  const [kpis, setKpis] = useState<FailureList["kpis"] | null>(null);

  useEffect(() => {
    if (baselineId === null) return;
    vehicsimApi
      .failures({ aeb_version_id: baselineId }, 1, 1)
      .then((list) => setKpis(list.kpis))
      .catch(() => setKpis(null));
  }, [baselineId]);

  const cause = kpis ? topCause(kpis) : null;

  return (
    <VehicSimPage
      crumbs={[
        { label: "Project của tôi", href: "/projects" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Cải tiến AEB" },
      ]}
      title="④ Cải tiến AEB"
      subtitle={
        <>
          Tạo <Term tip={TERMS.candidate}>ứng viên</Term> mới từ cấu hình AEB {baseline?.label ?? "hiện tại"} bằng cách đổi tham số, rồi{" "}
          <Term tip={TERMS.verification}>kiểm chứng</Term> ở bước ⑤.
        </>
      }
    >
      {project && !opened && <OpenProjectCard project={project} purpose="cải tiến AEB" />}
      <ErrorNote message={error} />

      {cause && (
        <p className="rounded-[16px] bg-vehicsim-decision-bg px-5 py-4 text-[15px] leading-[1.55] text-vehicsim-ink">
          Gợi ý từ kết quả: {cause.count}/{cause.total} ca lỗi với AEB {baseline?.label} thuộc nhóm{" "}
          <strong>{CLASS_STYLE[cause.cls].label.toLowerCase()}</strong>. Tham số cùng nhóm thường là chỗ nên thử trước.
        </p>
      )}

      <div className="flex w-full items-stretch gap-5">
        <WayCard
          icon={<SlidersHorizontal className="size-5" />}
          title="Tự chỉnh tham số"
          effort="Khoảng 2 phút"
          detail="Đổi từng tham số và ghi lý do; ứng viên chạy lại đúng các tình huống và seed của baseline khi kiểm chứng."
          cta="Tự chỉnh"
          href={opened ? "/aeb?tab=manual" : undefined}
        />
        <WayCard
          icon={<Sparkles className="size-5" />}
          title="Để hệ thống tìm (MOBO)"
          effort="Vài phút tới vài chục phút, tuỳ số lần thử"
          detail="Hệ thống thử nhiều bộ tham số và đưa ra các phương án cân bằng giữa va chạm, độ êm và quãng phanh; bạn chọn một phương án để kiểm chứng."
          cta="Chạy tối ưu"
          href={opened ? "/aeb?tab=mobo" : undefined}
        />
      </div>

      {opened && ctx && ctx.parameters.length > 0 && (
        <Card className="flex flex-col gap-3 p-6">
          <h2 className="text-[17px] font-bold text-vehicsim-ink">{ctx.parameters.length} tham số chỉnh được</h2>
          <ul className="flex flex-col">
            {ctx.parameters.map((p) => (
              <li key={p.code} className="flex items-center justify-between gap-6 border-b border-solid border-vehicsim-line py-3 text-[14px] last:border-b-0">
                <span className="font-semibold text-vehicsim-ink">{p.name}</span>
                <span className="text-vehicsim-muted">
                  {CLASS_STYLE[p.category].label} · {paramValue(p.min_value, p.unit)} – {paramValue(p.max_value, p.unit)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </VehicSimPage>
  );
}
