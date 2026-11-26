"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AnalysisSelectionSummary } from "@/components/AnalysisSelectionSummary";
import { AnalysisActionError, AnalysisBadge, AnalysisLoading, AnalysisPager, AnalysisTableRegion, eligible } from "@/components/analysisUi";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import type { AnalysisRun } from "@/types/vehicsim";
import { sourceIdentity, type ChosenRun, type SelectionCheck, type SelectionRole } from "./analysisSelectionData";
import { formatObjective, formatRunImpact } from "./analysisMetricFormat";
import type { SavedSelection } from "./analysisSnapshotData";
import styles from "./AnalysisDatasetPreparation.module.css";

type Props = {
  selection: ChosenRun[]; checks: SelectionCheck[]; ready: boolean; canWrite: boolean; canSave: boolean;
  operation: "save" | "handoff" | null; operationError: string | null; errorKind: "save" | "handoff" | null;
  snapshotId: number; hasSnapshot: boolean; snapshot: SavedSelection | null; snapshotLoading: boolean; snapshotError: string | null;
  search: string; returnTo: string; renderSelection: (run: AnalysisRun) => ReactNode;
  onSearch: (value: string) => void; onOpenRuns: () => void; onRemove: (run: AnalysisRun) => void;
  checkedAt: string | null; onClear: () => void; onSave: () => void; onCheckHandoff: () => void; onOpenOptimizer: () => void; onRetrySnapshot: () => void;
};

export function AnalysisDatasetPreparation(p: Props) {
  const busy = p.operation !== null, editable = p.ready && p.canWrite && !busy;
  const groups = ["OPTIMIZATION", "VALIDATION"] as const;
  const query = p.search.trim().toLocaleLowerCase("vi");
  const identities = new Set(p.selection.map(({run}) => sourceIdentity(run)));
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Trạng thái bản nháp">
      <div className="analysis-toolbar"><div><h2>Bản nháp đang chọn</h2><p className="analysis-caption">Giữ trong phiên trình duyệt theo tài khoản và dự án; chưa phải snapshot đã được máy chủ xác minh.</p></div><PillButton disabled={!p.ready || busy} onClick={p.onOpenRuns}>Thêm lượt chạy</PillButton></div>
      {!p.ready ? <AnalysisLoading /> : <>
        <div className={styles.counts}>{groups.map(role => {
          const chosen = p.selection.filter(item => item.role === role), safe = chosen.filter(({run}) => run.outcome === "SAFE").length;
          return <article key={role} aria-label={`Thống kê bản nháp ${role === "OPTIMIZATION" ? "tối ưu" : "xác minh"}`}><h3>{role === "OPTIMIZATION" ? "Tập tối ưu" : "Tập xác minh độc lập"}</h3><strong>{chosen.length}<small> run đã chọn</small></strong><p>{safe} ca an toàn · {chosen.length - safe} kết quả khác</p></article>;
        })}</div>
        <p className="analysis-caption">{p.selection.length} run trong bản nháp · {identities.size} nhóm họ/baseline/xe/simulator/dt. Đổi bộ lọc danh sách giữ nguyên lựa chọn; bản nháp có thể khác snapshot đang mở bên dưới.</p>
        {p.selection.length === 0 ? <div className="analysis-state"><strong>Chưa có run trong bản nháp.</strong><p>Mở Lượt chạy, chọn Tối ưu hoặc Xác minh cho từng run. Giữ ca an toàn trong cả hai tập.</p><button className="analysis-button" onClick={p.onOpenRuns}>Chọn run từ baseline →</button></div> : <div className={styles.search}><label>Tìm trong bản nháp<input type="search" aria-label="Tìm trong bản nháp" placeholder="Mã run, biến thể, họ hoặc seed…" value={p.search} onChange={event => p.onSearch(event.target.value)} /></label>{p.search && <button className="analysis-button" onClick={() => p.onSearch("")}>Xóa tìm kiếm bản nháp</button>}</div>}
      </>}
    </section>
    {p.ready && p.selection.length > 0 && <div className={styles.groups}>{groups.map(role => <DraftGroup key={role} role={role} items={p.selection.filter(item => item.role === role)} query={query} returnTo={p.returnTo} editable={editable} renderSelection={p.renderSelection} onRemove={p.onRemove} />)}</div>}
    <section className={`analysis-panel ${styles.stack}`} aria-label="Kiểm tra bản nháp">
      <div><h2>Kiểm tra và chốt</h2><p className="analysis-caption">Kiểm tra dưới đây dựa trên thông tin run đã chọn. Số đo và chỉ số mục tiêu lấy từ kết quả đã lưu.</p></div>
      <div className={styles.validation}>
        <ul className={styles.checks}>{p.checks.map(check => <li key={check.label} data-passed={p.ready && check.ok}><span aria-label={!p.ready ? "Chưa tải lựa chọn" : check.ok ? "Đã đủ metadata" : "Còn thiếu metadata"}>{p.ready && check.ok ? "✓" : "○"}</span><div><strong>{check.label}</strong>{(!p.ready || !check.ok) && <p>{check.help}</p>}</div></li>)}</ul>
        <div className={styles.actions}>
          <h3>{!p.ready ? "Đang khôi phục lựa chọn" : p.canSave ? "Bản nháp đủ metadata để gửi" : "Bản nháp chưa thể chốt"}</h3>
          <p>Máy chủ xác minh thêm baseline hiện hành, telemetry, số đo, revision và artifact trước khi lưu snapshot bất biến. Dấu kiểm metadata chưa xác nhận các điều kiện này.</p>
          {!p.canWrite && <p>Bạn có quyền đọc; chỉnh lựa chọn và chốt tập cần quyền ghi.</p>}
          <PillButton variant="dark" disabled={!p.canSave || busy} onClick={p.onSave}>{p.operation === "save" ? "Đang chốt hai tập…" : "Chốt tập"}</PillButton>
          <button className="analysis-button" disabled={!editable || !p.selection.length} onClick={p.onClear}>Bỏ lựa chọn</button>
          <p>Bỏ hoặc chuyển run chỉ sửa bản nháp. Snapshot đã chốt vẫn giữ bằng chứng đã lưu.</p>
        </div>
      </div>
      {p.errorKind === "save" && <AnalysisActionError message={p.operationError} nextAction="Bản nháp và revision đã xem được giữ nguyên. Rà lại lựa chọn; nếu nguồn thay đổi, tải lại lượt chạy rồi chọn lại run trước khi chủ động chốt." />}
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Snapshot và bàn giao">
      <div><h2>Tập đã chốt và bàn giao</h2><p className="analysis-caption">Snapshot bất biến được mở từ liên kết hoặc sau khi chốt. Chỉnh bản nháp không đổi snapshot đang xem.</p></div>
      {p.snapshotLoading ? <AnalysisLoading /> : p.snapshotError ? <><ErrorNote message={p.snapshotError} /><div><button className="analysis-button" disabled={!p.snapshotId} onClick={p.onRetrySnapshot}>Thử tải lại tập đã chốt</button></div></> : p.snapshot ? <>
        <div className={styles.savedStatus} role="status"><strong>Đã lưu snapshot #{p.snapshot.id}</strong><span>{p.snapshot.baseline_current === true ? "Snapshot đã lưu; baseline hiện hành theo lần tải này. Nguồn được kiểm tra riêng ở bước bên dưới." : "Snapshot lưu trữ: baseline đã đổi hoặc chưa được xác nhận. Chỉ đọc; rà lại nguồn và chốt tập mới nếu cần bàn giao."}</span></div>
        <AnalysisSelectionSummary key={p.snapshot.id} dataset={p.snapshot} returnTo={p.returnTo} />
        <div className={styles.handoff}><div><h3>Kiểm tra trước bàn giao</h3><p className="analysis-caption">Máy chủ kiểm tra lại run, baseline và artifact. Kiểm tra thành công không tự chuyển màn hoặc khởi chạy tối ưu. Đây là dataset v2; chưa xác nhận optimizer tiêu thụ frozen cohort.</p></div>
          <PillButton variant="dark" disabled={busy || p.snapshot.baseline_current !== true} onClick={p.onCheckHandoff}>{p.operation === "handoff" ? "Đang kiểm tra bàn giao…" : "Kiểm tra trước bàn giao"}</PillButton>
        </div>
        {p.checkedAt && <div className={styles.savedStatus} role="status" data-handoff-checked><strong>Đã kiểm tra snapshot #{p.snapshot.id} lúc {p.checkedAt}</strong><span>Chỉ xác nhận theo lần kiểm tra này. Tải lại trang hoặc snapshot cần kiểm tra lại; không xác nhận MOBO sẵn sàng chạy.</span><PillButton onClick={p.onOpenOptimizer} disabled={busy || p.snapshot.baseline_current !== true}>Mở module tối ưu →</PillButton></div>}
        {p.errorKind === "handoff" && <AnalysisActionError message={p.operationError} nextAction="Snapshot vẫn được giữ để đọc. Tải lại tập đã chốt và đối chiếu nguồn/baseline trước khi kiểm tra lại; chưa chuyển sang module tối ưu." />}
      </> : !p.hasSnapshot && <div className="analysis-state">Chưa mở tập đã chốt. Chọn đủ hai tập và chốt để nhận dataset ID.</div>}
    </section>
  </div>;
}

function DraftGroup({ role, items, query, returnTo, editable, renderSelection, onRemove }: {
  role: SelectionRole; items: ChosenRun[]; query: string; returnTo: string; editable: boolean;
  renderSelection: (run: AnalysisRun) => ReactNode; onRemove: (run: AnalysisRun) => void;
}) {
  const [requestedPage, setPage] = useState(1), [size, setSize] = useState(10);
  const matches = items.filter(({run}) => `${run.run_id} ${run.family} ${run.variant} ${run.seed}`.toLocaleLowerCase("vi").includes(query));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(matches.length / size)));
  const name = role === "OPTIMIZATION" ? "Tập tối ưu trong bản nháp" : "Tập xác minh trong bản nháp";
  return <section className={`analysis-panel ${styles.stack}`} aria-label={name}>
    <div><h2>{name}</h2><p className="analysis-caption">{matches.length} / {items.length} run · {role === "OPTIMIZATION" ? "Dùng để tìm tham số AEB." : "Giữ độc lập để xác minh ứng viên AEB."} Tìm kiếm không bỏ run khỏi lựa chọn.</p></div>
    {matches.length > 0 ? <AnalysisTableRegion className={styles.tableWrap} label={`Bảng ${name.toLocaleLowerCase("vi")}, cuộn ngang`}><table className={`analysis-table ${styles.table}`}>
      <caption className="sr-only">{name}, seed, nguồn và số đo đã lưu</caption><thead><tr><th scope="col">Run / biến thể / nguồn</th><th scope="col">Kết quả / bằng chứng</th><th scope="col">Tập / thao tác</th></tr></thead>
      <tbody>{matches.slice((page - 1) * size, page * size).map(({run}) => <tr key={run.run_id} data-draft-run={run.run_id}>
        <td><Link href={`/analysis/failures/${run.run_id}?returnTo=${encodeURIComponent(returnTo)}`} aria-label={`Chi tiết run đã chọn ${run.run_id}`}>#{run.run_id} · {run.variant}</Link><small>{run.family} · seed {run.seed}</small><small>Baseline #{run.baseline_id} · xe #{run.vehicle_id}</small><small>{run.simulator} · dt {run.dt} s</small><details><summary>Revision và điều kiện chọn</summary><small className={styles.revision}>Revision nguồn: {run.revision || "Chưa có revision"}</small><small>Thực thi: {run.status} · telemetry: {run.trace_available === true ? "Có" : run.trace_available === false ? "Không có" : "Chưa xác định"}</small><small>Điều kiện từ metadata: {eligible(run) ? "Có thể gửi máy chủ kiểm tra" : "Cần rà lại run"}. Máy chủ quyết định điều kiện sử dụng.</small></details></td>
        <td><AnalysisBadge value={run.outcome} /><small>Kết quả theo luật đã lưu</small><small>{eligible(run) ? "Hoàn tất · có telemetry" : "Cần xem lại điều kiện của run"}</small><details><summary>Số đo đã lưu</summary><p className="analysis-caption">Dấu —: thiếu hoặc không áp dụng; API chưa phân biệt đủ. Có scalar chưa xác nhận đủ điều kiện chốt.</p><dl className={styles.metrics}><div><dt>RMS jerk (m/s³)</dt><dd>{formatObjective(run.metrics.rms_jerk_mps3)}</dd></div><div><dt>Va chạm (m/s)</dt><dd>{formatRunImpact(run.metrics.impact_speed_mps, run)}</dd></div><div><dt>Quãng phanh (m)</dt><dd>{formatObjective(run.metrics.stopping_distance_m)}</dd></div></dl></details></td>
        <td><div className={styles.rowActions}>{renderSelection(run)}<button className="analysis-button" disabled={!editable} aria-label={`Bỏ run ${run.run_id} khỏi bản nháp`} onClick={() => onRemove(run)}>Bỏ run</button></div></td>
      </tr>)}</tbody>
    </table></AnalysisTableRegion> : <div className="analysis-state">{items.length ? "Không có run khớp từ khóa trong tập này." : "Chưa chọn run cho tập này."}</div>}
    {items.length > 0 && <AnalysisPager label={role === "OPTIMIZATION" ? "Phân trang tập tối ưu" : "Phân trang tập xác minh"} page={page} size={size} total={matches.length} onPage={setPage} onSize={value => { setPage(1); setSize(value); }} />}
  </section>;
}
