"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Play } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Card, ClassBadge, EmptyState, ErrorNote, PillButton, StatCard, cx, fmt, simulatorLabel } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { useProjectItem } from "@/components/project/ProjectJourneyContext";
import { OpenProjectCard, TERMS, Term } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisDataset, FailureItem } from "@/types/vehicsim";

type Variant = AnalysisDataset["variants"][number];
type CellOutcome = "COLLISION" | "NEAR_MISS" | "FALSE_BRAKING" | "SAFE" | "UNCLASSIFIED" | "NOT_RUN";

const SEVERITY: Record<CellOutcome, number> = { COLLISION: 5, NEAR_MISS: 4, FALSE_BRAKING: 3, UNCLASSIFIED: 2, SAFE: 1, NOT_RUN: 0 };

const CELL: Record<CellOutcome, { label: string; cls: string }> = {
  COLLISION: { label: "Va chạm", cls: "bg-vehicsim-danger text-white" },
  NEAR_MISS: { label: "Suýt va chạm", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" },
  FALSE_BRAKING: { label: "Phanh oan", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" },
  SAFE: { label: "An toàn", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" },
  UNCLASSIFIED: { label: "Chưa phân loại", cls: "bg-vehicsim-soft text-vehicsim-muted" },
  NOT_RUN: { label: "Chưa chạy", cls: "border border-dashed border-vehicsim-line-strong text-vehicsim-muted" },
};

function outcomeOf(v: Variant): CellOutcome {
  if (v.status !== "COMPLETED") return "NOT_RUN";
  return v.metrics?.outcome ?? "UNCLASSIFIED";
}

function variantLabel(v: Variant): string {
  return [
    v.ego_speed_kmh !== null && `${fmt.num(v.ego_speed_kmh)} km/h`,
    v.trigger_distance_m !== null && `bước ra cách ${fmt.num(v.trigger_distance_m)} m`,
    v.stops_at_curb === null ? null : v.stops_at_curb ? "dừng ở lề" : "băng qua",
  ]
    .filter(Boolean)
    .join(" · ");
}

function unique(values: (number | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== null))].sort((a, b) => a - b);
}

function OutcomeGrid({ variants }: { variants: Variant[] }) {
  const speeds = unique(variants.map((v) => v.ego_speed_kmh));
  const distances = unique(variants.map((v) => v.trigger_distance_m));
  if (speeds.length * distances.length < 2 || variants.some((v) => v.ego_speed_kmh === null || v.trigger_distance_m === null)) {
    return <p className="text-[14px] text-vehicsim-muted">Họ này không có đủ hai trục tốc độ xe và khoảng cách để vẽ lưới.</p>;
  }
  const worst = (speed: number, distance: number) =>
    variants
      .filter((v) => v.ego_speed_kmh === speed && v.trigger_distance_m === distance)
      .map(outcomeOf)
      .reduce<CellOutcome | null>((a, b) => (a === null || SEVERITY[b] > SEVERITY[a] ? b : a), null);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="px-2 text-left font-bold text-vehicsim-ink">
              Khoảng cách \ Tốc độ
            </th>
            {speeds.map((s) => (
              <th key={s} scope="col" className="px-2 font-semibold text-vehicsim-ink">
                {fmt.num(s)} km/h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {distances.map((d) => (
            <tr key={d}>
              <th scope="row" className="px-2 text-left font-semibold text-vehicsim-ink">
                {fmt.num(d)} m
              </th>
              {speeds.map((s) => {
                const outcome = worst(s, d);
                return (
                  <td key={s} className={cx("h-11 min-w-[104px] rounded-[10px] px-3 text-center font-semibold", outcome ? CELL[outcome].cls : "text-vehicsim-muted")}>
                    {outcome ? CELL[outcome].label : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorstCase({ variant, failure }: { variant: Variant; failure?: FailureItem }) {
  const m = variant.metrics;
  const outcome = outcomeOf(variant);
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-3 p-5">
      <span className={cx("w-fit rounded-full px-3 py-1 text-[13px] font-semibold", CELL[outcome].cls)}>{CELL[outcome].label}</span>
      <span className="text-[15px] font-bold text-vehicsim-ink">{variantLabel(variant)}</span>
      <dl className="flex flex-col gap-1 text-[14px]">
        {m?.collision_occurred && (
          <div className="flex justify-between gap-4">
            <dt className="text-vehicsim-muted">Tốc độ khi va chạm</dt>
            <dd className="font-semibold text-vehicsim-ink">{fmt.kmh(m.impact_speed_mps === null ? null : m.impact_speed_mps * 3.6)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-vehicsim-muted">
            <Term tip={TERMS.ttc}>TTC</Term> nhỏ nhất
          </dt>
          <dd className="font-semibold text-vehicsim-ink">{fmt.s(m?.min_ttc_s, 2)}</dd>
        </div>
      </dl>
      {failure && (
        <div className="flex flex-col gap-2">
          <ClassBadge value={failure.failure_class} />
          <p className="line-clamp-3 text-[14px] leading-[1.5] text-vehicsim-muted">{vi(failure.root_cause)}</p>
        </div>
      )}
      {variant.run_id !== null && (
        <PillButton href={`/analysis/failures/${variant.run_id}/playback`} className="mt-auto w-fit">
          <Play aria-hidden className="size-4" /> Xem phát lại
        </PillButton>
      )}
    </Card>
  );
}

export default function ProjectResultsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const requested = Number(useSearchParams().get("scenario_id"));
  const { ctx } = useVehicSimContext();
  const { project, opened, error: loadError } = useProjectItem(id);
  const families = opened ? (ctx?.families ?? []) : [];
  const [picked, setPicked] = useState<number | null>(null);
  const scenarioId = picked ?? (families.some((f) => f.id === requested) ? requested : (families[0]?.id ?? null));
  const [loaded, setLoaded] = useState<{ scenarioId: number; dataset: AnalysisDataset; failures: FailureItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scenarioId === null) return;
    let alive = true;
    vehicsimApi
      .analysisDataset(scenarioId)
      .then(async (dataset) => {
        const failures = await vehicsimApi
          .failures({ scenario_id: scenarioId, aeb_version_id: dataset.baseline.id }, 1, 100)
          .then((list) => list.items)
          .catch(() => []);
        if (alive) setLoaded({ scenarioId, dataset, failures });
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Không tải được kết quả baseline"));
    return () => {
      alive = false;
    };
  }, [scenarioId]);

  const dataset = loaded?.scenarioId === scenarioId ? loaded.dataset : null;
  const failureByRun = useMemo(() => new Map((loaded?.failures ?? []).map((f) => [f.run_id, f])), [loaded]);
  const variants = dataset?.variants ?? [];
  const count = (outcome: CellOutcome) => variants.filter((v) => outcomeOf(v) === outcome).length;
  const worst = variants
    .filter((v) => SEVERITY[outcomeOf(v)] >= SEVERITY.FALSE_BRAKING)
    .sort(
      (a, b) =>
        SEVERITY[outcomeOf(b)] - SEVERITY[outcomeOf(a)] ||
        (b.metrics?.impact_speed_mps ?? 0) - (a.metrics?.impact_speed_mps ?? 0) ||
        (a.metrics?.min_ttc_s ?? Infinity) - (b.metrics?.min_ttc_s ?? Infinity),
    )
    .slice(0, 3);
  const carla = dataset?.reference?.simulator.startsWith("carla") ?? false;

  return (
    <VehicSimPage
      crumbs={[
        { label: "Project của tôi", href: "/projects" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Kết quả baseline" },
      ]}
      title="③ Kết quả baseline"
      subtitle={
        dataset
          ? `AEB ${dataset.baseline.label} · ${dataset.counts.completed}/${dataset.counts.total} tình huống đã chạy${dataset.reference ? ` · ${simulatorLabel(dataset.reference.simulator)}` : ""}`
          : "AEB hiện tại phanh kịp ở đâu và hỏng ở đâu."
      }
      actions={
        families.length > 1 && scenarioId !== null ? (
          <select
            aria-label="Họ kịch bản"
            value={scenarioId}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="h-10 rounded-full border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-4 text-[14px] font-semibold text-vehicsim-ink"
          >
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {project && !opened && <OpenProjectCard project={project} purpose="xem kết quả baseline" />}
      <ErrorNote message={error ?? loadError} />

      {opened && families.length === 0 && (
        <EmptyState title="Chưa có kịch bản">
          <Link href={`/projects/${id}/start`} className="font-semibold text-vehicsim-ink hover:underline">
            Thiết kế kịch bản trước
          </Link>
        </EmptyState>
      )}

      {dataset && dataset.counts.completed === 0 && (
        <EmptyState title="Họ này chưa chạy baseline">
          <Link href="/scenarios" className="font-semibold text-vehicsim-ink hover:underline">
            Chạy baseline ở danh sách họ kịch bản
          </Link>
        </EmptyState>
      )}

      {dataset && dataset.counts.completed > 0 && (
        <>
          <div className="flex w-full gap-4">
            <StatCard label="An toàn" value={count("SAFE")} />
            <StatCard label="Suýt va chạm" value={count("NEAR_MISS")} valueClass={count("NEAR_MISS") ? "text-vehicsim-warn" : undefined} />
            <StatCard label="Va chạm" value={count("COLLISION")} valueClass={count("COLLISION") ? "text-vehicsim-danger" : undefined} />
            <StatCard label="Phanh oan" value={count("FALSE_BRAKING")} note="AEB phanh khi người dừng ở lề" tone="info" />
          </div>
          {dataset.counts.not_run > 0 && (
            <p className="text-[14px] text-vehicsim-muted">
              {dataset.counts.not_run} tình huống chưa có kết quả baseline nên không được tính.{" "}
              <Link href="/scenarios" className="font-semibold text-vehicsim-ink hover:underline">
                Chạy nốt
              </Link>
            </p>
          )}

          <Card className="flex flex-col gap-4 p-6">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">AEB hỏng ở đâu?</h2>
            <p className="text-[14px] text-vehicsim-muted">
              Mỗi ô là kết quả tệ nhất của các <Term tip={TERMS.variant}>biến thể</Term> cùng tốc độ xe và khoảng cách người bước ra;{" "}
              <Term tip={TERMS.falseBraking}>phanh oan</Term> là AEB phanh khi người đã dừng ở lề.
            </p>
            <OutcomeGrid variants={variants} />
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">{worst.length > 0 ? `${worst.length} ca tệ nhất` : "Không có ca hỏng"}</h2>
            {worst.length > 0 ? (
              <div className="flex w-full items-stretch gap-4">
                {worst.map((v) => (
                  <WorstCase key={v.scenario_version_id} variant={v} failure={v.run_id === null ? undefined : failureByRun.get(v.run_id)} />
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-vehicsim-muted">Mọi tình huống đã chạy đều an toàn với AEB {dataset.baseline.label}.</p>
            )}
          </section>

          {carla && <p className="text-[13px] text-vehicsim-muted">Số liệu CARLA chưa hiệu chuẩn phanh, chỉ dùng để quan sát và đối chiếu.</p>}

          <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-5">
            <Link href={`/analysis/failures?scenario_id=${scenarioId}`} className="text-[14px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink hover:underline">
              Phân tích chi tiết (công cụ kỹ sư)
            </Link>
            <PillButton variant="dark" href={`/projects/${id}/improve`}>
              Tiếp: Cải tiến AEB 
            </PillButton>
          </div>
        </>
      )}
    </VehicSimPage>
  );
}
