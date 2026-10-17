"use client";

/**
 * Dữ liệu sensor CARLA gắn trên ego (radar, obstacle, IMU, collision) — thứ một AEB
 * thật nhìn thấy, khác quỹ đạo ground truth ở khối "Phát lại" phía trên.
 *
 * Bốn biểu đồ nhỏ chung trục thời gian (không dùng hai trục y), con trỏ đồng bộ
 * giữa các biểu đồ, giá trị tại con trỏ hiện ở đầu mỗi biểu đồ. Khoảng trống trên
 * đường = sensor không trả gì ở đoạn đó, không phải 0. Lượt chạy không có sensor
 * (mock, worker chưa bật) hiện trạng thái trống có lý do — không vẽ số giả.
 */

import { useMemo, useState, type PointerEvent } from "react";
import { Download, Radar } from "lucide-react";
import type { SensorData, SensorSample } from "@/types";

const W = 560;
const H = 180;
const PAD = { l: 40, r: 12, t: 10, b: 24 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const TTC_CLIP_S = 6;
/** Giây đầu là pha ScenarioRunner đặt lại tốc độ/vị trí ego (`SUMMARY_WARMUP_S` ở worker):
 * IMU vọt tới -40 m/s². Vẫn vẽ (bị cắt ở mép) nhưng không cho nó quyết định thang trục y. */
const WARMUP_S = 1;
/** UN R131 / GB/T 39901 cấm phanh khẩn cấp khi TTC > 3 s; baseline AEB v1.0 dùng 1,5 s. */
const TTC_REFERENCES = [
  { value: 3, label: "3,0 s cận trên tiêu chuẩn" },
  { value: 1.5, label: "1,5 s baseline AEB" },
];

/** Vận tốc mặt đất của mục tiêu radar dưới ngưỡng này = vật tĩnh (`STATIC_TARGET_SPEED_MS` ở worker). */
const STATIC_TARGET_SPEED_MS = 1;

/** Mẫu sensor + chuỗi suy ra: tách mục tiêu radar đang chuyển động khỏi vật tĩnh (rào, sườn đồi). */
type Row = SensorSample & {
  radar_ttc_moving_s?: number | null;
  radar_ttc_static_s?: number | null;
  radar_depth_moving_m?: number | null;
};

type Key = Exclude<keyof Row, "t">;

function deriveRows(samples: SensorSample[]): Row[] {
  return samples.map((s) => {
    const rel = s.radar_rel_velocity_ms;
    const ego = s.ego_speed_ms;
    const isStatic = rel == null || ego == null ? null : Math.abs(rel + ego) < STATIC_TARGET_SPEED_MS;
    return {
      ...s,
      radar_ttc_moving_s: isStatic === false ? s.radar_ttc_s : null,
      radar_ttc_static_s: isStatic === true ? s.radar_ttc_s : null,
      radar_depth_moving_m: isStatic === false ? s.radar_depth_m : null,
    };
  });
}

interface Series {
  key: Key;
  label: string;
  /** Lớp Tailwind cho nét — slot 1 xanh, slot 2 cam (đã kiểm CVD sáng/tối). */
  stroke: string;
  dashed?: boolean;
}

interface ChartSpec {
  title: string;
  unit: string;
  series: Series[];
  clip?: [number, number];
  references?: { value: number; label: string }[];
  zeroLine?: boolean;
  note?: string;
}

const SLOT_1 = { stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]" };
const SLOT_2 = { stroke: "stroke-[#eb6834] dark:stroke-[#d95926]" };
/** Slot 3 dưới 3:1 trên nền sáng — bù bằng nét đứt, chú giải và bảng dữ liệu. */
const SLOT_3 = { stroke: "stroke-[#1baf7a] dark:stroke-[#199e70]" };

const CHARTS: ChartSpec[] = [
  {
    title: "TTC radar tới mục tiêu phía trước",
    unit: "s",
    series: [
      { key: "radar_ttc_moving_s", label: "Mục tiêu chuyển động", ...SLOT_1 },
      { key: "radar_ttc_static_s", label: "Vật tĩnh (rào, dốc, xe dừng)", ...SLOT_3, dashed: true },
    ],
    clip: [0, TTC_CLIP_S],
    references: TTC_REFERENCES,
    note: `Cắt ở ${TTC_CLIP_S} s. Vật tĩnh: vận tốc mặt đất < ${STATIC_TARGET_SPEED_MS} m/s — nguồn phanh oan nếu AEB không lọc.`,
  },
  {
    title: "Khoảng cách tới vật phía trước",
    unit: "m",
    series: [
      { key: "radar_depth_moving_m", label: "Radar (mục tiêu chuyển động)", ...SLOT_1 },
      { key: "obstacle_distance_m", label: "Obstacle sensor", ...SLOT_2 },
    ],
    note: "Obstacle sensor chỉ báo khi tia dò dọc trục xe chạm actor động.",
  },
  {
    title: "Gia tốc dọc (IMU)",
    unit: "m/s²",
    series: [{ key: "imu_accel_x_ms2", label: "Gia tốc dọc", ...SLOT_1 }],
    zeroLine: true,
    note: "Âm = giảm tốc. Đỉnh lúc va chạm là xung lực đâm xe, không phải phanh.",
  },
  {
    title: "Tốc độ ego",
    unit: "m/s",
    series: [{ key: "ego_speed_ms", label: "Tốc độ", ...SLOT_1 }],
  },
];

function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || Number.isNaN(value) ? "—" : value.toFixed(digits).replace(".", ",");
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function nearest(samples: Row[], t: number): Row | undefined {
  let best: Row | undefined;
  for (const s of samples) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}

function SensorChart({
  spec,
  samples,
  tMax,
  collisionT,
  hoverT,
  onHover,
}: {
  spec: ChartSpec;
  samples: Row[];
  tMax: number;
  collisionT: number | null;
  hoverT: number | null;
  onHover: (t: number | null) => void;
}) {
  const { yMin, yMax } = useMemo(() => {
    if (spec.clip) return { yMin: spec.clip[0], yMax: spec.clip[1] };
    // Thang trục theo dữ liệu sau khởi tạo và trước va chạm — cùng cửa sổ với ô số liệu.
    // Xung lực đâm xe (~-45 m/s²) vẫn vẽ nhưng bị cắt ở mép thay vì làm dẹt cả biểu đồ.
    const values = samples
      .filter((s) => s.t >= WARMUP_S && (collisionT == null || s.t < collisionT))
      .flatMap((s) => spec.series.map((se) => s[se.key]))
      .filter((v): v is number => v != null);
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    return { yMin: lo < 0 ? -niceMax(-lo) : 0, yMax: niceMax(hi) };
  }, [samples, spec, collisionT]);

  const x = (t: number) => PAD.l + (t / tMax) * PLOT_W;
  const y = (v: number) => PAD.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * PLOT_H;

  const paths = spec.series.map((se) => {
    let d = "";
    let pen = false;
    for (const s of samples) {
      const v = s[se.key];
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(s.t).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return { se, d };
  });

  const yTicks = yMin < 0 ? [yMin, 0, yMax] : [yMin, (yMin + yMax) / 2, yMax];
  const tStep = tMax > 20 ? 5 : tMax > 8 ? 2 : 1;
  const tTicks = Array.from({ length: Math.floor(tMax / tStep) + 1 }, (_, i) => i * tStep);
  const at = hoverT != null ? nearest(samples, hoverT) : undefined;

  const handleMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    onHover(Math.min(tMax, Math.max(0, ((px - PAD.l) / PLOT_W) * tMax)));
  };

  return (
    <figure className="rounded-xl border border-slate-200 dark:border-slate-700/40 bg-white/70 dark:bg-slate-900/30 p-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {spec.title} <span className="font-normal text-slate-500">({spec.unit})</span>
        </span>
        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400" aria-live="polite">
          {at
            ? `t = ${fmt(at.t, 1)} s · ` +
              spec.series.map((se) => `${spec.series.length > 1 ? se.label + " " : ""}${fmt(at[se.key])}`).join(" · ")
            : "Rê chuột để xem giá trị"}
        </span>
      </figcaption>
      {spec.series.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
          {spec.series.map((se) => (
            <span key={se.key} className="inline-flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden className="overflow-visible">
                <line x1="0" x2="16" y1="2" y2="2" className={se.stroke} strokeWidth={2} strokeDasharray={se.dashed ? "4 3" : undefined} />
              </svg>
              {se.label}
            </span>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 h-auto w-full touch-none select-none"
        role="img"
        aria-label={`${spec.title} theo thời gian`}
        onPointerMove={handleMove}
        onPointerLeave={() => onHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-700/60" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} className="fill-slate-500">
              {fmt(v, Math.abs(yMax - yMin) < 5 ? 1 : 0)}
            </text>
          </g>
        ))}
        <rect x={PAD.l} y={PAD.t} width={x(WARMUP_S) - PAD.l} height={PLOT_H} className="fill-slate-400/10" />
        <text x={PAD.l + 3} y={PAD.t + PLOT_H - 4} fontSize={9} className="fill-slate-400">
          khởi tạo
        </text>
        {spec.zeroLine && yMin < 0 && (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={1} />
        )}
        {tTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} className="fill-slate-500">
            {t}s
          </text>
        ))}
        {spec.references?.map((r) => (
          <g key={r.value}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(r.value)}
              y2={y(r.value)}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={W - PAD.r - 2} y={y(r.value) - 4} textAnchor="end" fontSize={9.5} className="fill-slate-500">
              {r.label}
            </text>
          </g>
        ))}
        {collisionT != null && (
          <g>
            <line
              x1={x(collisionT)}
              x2={x(collisionT)}
              y1={PAD.t}
              y2={PAD.t + PLOT_H}
              className="stroke-red-600 dark:stroke-red-400"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text x={x(collisionT) - 4} y={PAD.t + 10} textAnchor="end" fontSize={9.5} className="fill-red-700 dark:fill-red-300">
              ✕ va chạm
            </text>
          </g>
        )}
        {paths.map(({ se, d }) =>
          d ? (
            <path
              key={se.key}
              d={d}
              fill="none"
              className={se.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={se.dashed ? "5 4" : undefined}
            />
          ) : null,
        )}
        {at && (
          <g>
            <line x1={x(at.t)} x2={x(at.t)} y1={PAD.t} y2={PAD.t + PLOT_H} className="stroke-slate-500" strokeWidth={1} />
            {spec.series.map((se) => {
              const v = at[se.key];
              return v == null ? null : (
                <circle
                  key={se.key}
                  cx={x(at.t)}
                  cy={y(v)}
                  r={4}
                  className={`${se.stroke} fill-white dark:fill-slate-900`}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={PLOT_W} height={PLOT_H} fill="transparent" />
      </svg>
      {spec.note && <p className="mt-1 text-xs text-slate-500">{spec.note}</p>}
    </figure>
  );
}

const TILES: { key: string; label: string; unit: string; hint: string }[] = [
  { key: "radar_min_ttc_s", label: "TTC radar nhỏ nhất", unit: "s", hint: "Mục tiêu chuyển động" },
  { key: "radar_min_ttc_static_s", label: "TTC tới vật tĩnh", unit: "s", hint: "Rào, dốc — nguy cơ phanh oan" },
  { key: "obstacle_min_distance_m", label: "Khoảng cách nhỏ nhất", unit: "m", hint: "Obstacle sensor" },
  { key: "max_deceleration_ms2", label: "Giảm tốc lớn nhất", unit: "m/s²", hint: "IMU, trước va chạm" },
  { key: "max_abs_jerk_ms3", label: "Jerk lớn nhất", unit: "m/s³", hint: "IMU, trung bình 0,1 s" },
  { key: "first_brake_time_s", label: "Lệnh phanh đầu tiên", unit: "s", hint: "Brake > 0,05" },
  { key: "impact_peak_accel_ms2", label: "Xung lực va chạm", unit: "m/s²", hint: "Đỉnh IMU sau va chạm" },
];

function toCsv(samples: SensorSample[]): string {
  const keys: (keyof SensorSample)[] = [
    "t",
    "ego_speed_ms",
    "brake",
    "radar_ttc_s",
    "radar_depth_m",
    "radar_rel_velocity_ms",
    "obstacle_distance_m",
    "imu_accel_x_ms2",
  ];
  return [keys.join(","), ...samples.map((s) => keys.map((k) => s[k] ?? "").join(","))].join("\n");
}

export default function SensorPanel({ data, scenarioId }: { data?: SensorData | null; scenarioId: string }) {
  const [hoverT, setHoverT] = useState<number | null>(null);

  if (!data || data.samples.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700/30 rounded-xl">
        <Radar className="w-9 h-9 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Lượt chạy này không ghi dữ liệu sensor.</p>
        <p className="text-xs mt-1 max-w-md mx-auto">
          Kết quả mock hoặc worker CARLA chưa bật <code>SENSOR_RECORD_DIR</code>. Chạy lại trên CARLA để có radar, IMU,
          obstacle và collision.
        </p>
      </div>
    );
  }

  const samples = data.samples;
  const rows = deriveRows(samples);
  const tMax = Math.max(1, samples[samples.length - 1].t);
  const collision = data.collisions[0];
  const summary = data.summary;

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(samples)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenarioId}-sensor.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            className="rounded-xl border border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/40 p-3"
            title={summary[tile.key] == null ? "Không đo được ở lượt chạy này" : undefined}
          >
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmt(summary[tile.key])}
              <span className="ml-1 text-xs font-normal text-slate-500">{tile.unit}</span>
            </p>
            <p className="text-[11px] text-slate-500">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          collision
            ? "border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200"
            : "border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 text-green-800 dark:text-green-200"
        }`}
      >
        <span aria-hidden>{collision ? "✕" : "✓"}</span>
        {collision ? (
          <span>
            Collision sensor: <strong>{data.collisions.length}</strong> sự kiện, lần đầu ở <strong>{fmt(collision.t, 2)} s</strong>
            {collision.other_actor ? ` với ${collision.other_actor}` : ""} (xung lực {fmt(collision.impulse_ns, 0)} N·s).
          </span>
        ) : (
          <span>Collision sensor không ghi va chạm nào.</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {CHARTS.map((spec) => (
          <SensorChart
            key={spec.title}
            spec={spec}
            samples={rows}
            tMax={tMax}
            collisionT={collision?.t ?? null}
            hoverT={hoverT}
            onHover={setHoverT}
          />
        ))}
      </div>

      <details className="rounded-xl border border-slate-200 dark:border-slate-700/40 p-3 text-sm">
        <summary className="cursor-pointer text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2">
          <span>Bảng dữ liệu ({samples.length} mẫu)</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              download();
            }}
            className="btn-primary btn-ghost text-xs px-3 py-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Tải CSV
          </button>
        </summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-xs tabular-nums text-slate-700 dark:text-slate-300">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 text-slate-500">
              <tr>
                {["t (s)", "Tốc độ (m/s)", "Brake", "TTC radar (s)", "Radar (m)", "Obstacle (m)", "IMU (m/s²)"].map((h) => (
                  <th key={h} className="px-2 py-1 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.t} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-0.5 text-right">{fmt(s.t, 2)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.ego_speed_ms)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.brake)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.radar_ttc_s)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.radar_depth_m)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.obstacle_distance_m)}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(s.imu_accel_x_ms2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
