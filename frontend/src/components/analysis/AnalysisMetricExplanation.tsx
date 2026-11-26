"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import { metricExplanation, type ExplanationMetric } from "./analysisMetricExplanationData";
import { finite, recordedRange } from "./analysisRunData";
import styles from "./AnalysisMetricExplanation.module.css";

export function AnalysisMetricExplanation({ kind, detail, run, returnTo }: {
  kind: ExplanationMetric; detail: FailureDetail; run: AnalysisRun | null; returnTo: string;
}) {
  const params = useSearchParams();
  const data = metricExplanation(kind, detail, run);
  const link = (section: "evidence" | "telemetry") => {
    const next = new URLSearchParams(params.toString());
    next.set("section", section); next.set("returnTo", returnTo);
    if (section === "telemetry") {
      next.delete("t"); // API has no timestamp of scalar min/impact/RMS; never invent one.
      const time = kind === "timeline" ? detail.metrics.aeb_activation_t
        : kind === "stopping" ? detail.metrics.brake_onset_t : null;
      const range = recordedRange(detail);
      if (finite(time) && range && time >= range.min && time <= range.max) next.set("t", String(time));
    }
    return `/analysis/failures/${detail.run_id}?${next}`;
  };
  return <details className={styles.explanation} data-metric-explanation={kind}>
    <summary aria-label={`Giải thích ${data.title}`}>Giải thích chỉ số</summary>
    <div className={styles.body}>
      <p><strong>{data.title}</strong> · {data.definition}</p>
      <p>Số đo đã lưu: <strong>{data.value}</strong>{data.value === "—" && " · Không có số đo hợp lệ hoặc không áp dụng; API chưa phân biệt mọi nguyên nhân thiếu dữ liệu."}</p>
      <p role="note"><strong>{data.profileStatus}</strong>. Giá trị được giữ theo response; trạng thái này không chứng minh số đo sai.</p>
      <p>{data.interpretation}</p>
      <details data-metric-technical><summary>Nguồn, đầu vào và giới hạn</summary>
      <p>Tham khảo theo source: {data.method}</p>
      <p>{data.conditions}</p>
      <div><h4>Dữ liệu API đang có</h4>
        {data.inputs.length ? <ul className={styles.inputs} data-explanation-inputs>{data.inputs.map((input, index) => <li key={`${input.field}-${index}`}>
          <span>{input.label}<code>{input.field}</code></span><strong>{input.value}</strong>
        </li>)}</ul> : <p>API chưa trả đủ đầu vào của phép tính; không hiển thị ví dụ thay số.</p>}
        <p>Giao diện giữ giá trị đã lưu, không tính lại metric từ các số đã làm tròn hoặc dữ liệu minh họa.</p>
      </div>
      <div><h4>Giới hạn</h4><ul>{data.limitations.map(text => <li key={text}>{text}</li>)}</ul></div>
      <div><h4>Nguồn của run đang xem</h4>
        <ul className={styles.source}>
          <li><span>Run / scenario</span><strong>#{detail.run_id} / #{detail.scenario_id}</strong></li>
          <li><span>Simulator</span><strong>{detail.simulator || "Chưa có simulator trong API"} · {data.engine}</strong></li>
          <li><span>Category theo API</span><strong>{data.category}</strong></li>
          <li><span>Nguồn / trường kết quả</span><strong>{data.source}<code>metrics.{data.field}</code></strong></li>
          <li><span>Hiệu chuẩn</span><strong>API chưa cung cấp phiên bản hiệu chuẩn từng run; không suy từ profile hoặc tên xe.</strong></li>
        </ul>
        <p>Đây là kết quả mô phỏng, không phải dữ liệu xe thực đã xác minh. Số liệu riêng lẻ không xác nhận nguyên nhân lỗi.</p>
      </div>
      </details>
      <div className={styles.links}><Link href={link("telemetry")}>Xem telemetry run #{detail.run_id}</Link><Link href={link("evidence")}>Xem bằng chứng run #{detail.run_id}</Link></div>
    </div>
  </details>;
}
