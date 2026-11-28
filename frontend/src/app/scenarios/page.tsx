"use client";

import React, { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Play, Trash2, X } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { FamilyForm } from "@/components/FamilyForm";
import { EmptyState, ErrorNote, Pagination, PillButton, Tag, cx, fmt, simulatorLabel, TableScroll, VehicSimSelect } from "@/components/VehicSimUi";
import { vi, viSummary, viTime, viWeather } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { ActiveFamilyRun, FamilyItem, FamilyVariantList, FamilyVersion, RiskLabel, TimeOfDay, Weather } from "@/types/vehicsim";

export default function ScenarioFamiliesPage() {
  const { refresh, canWrite, error: contextError } = useVehicSimContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const [items, setItems] = useState<FamilyItem[] | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil((items?.length ?? 0) / PAGE_SIZE));
  const pagedItems = items?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  const createdCode = searchParams.get("created");
  const queuedCount = Number(searchParams.get("queued") || 0);
  const variantsCount = searchParams.get("variants");
  const [notice, setNotice] = useState<string | null>(() =>
    createdCode
      ? `Đã tạo ${createdCode} với ${variantsCount ?? ""} biến thể${queuedCount ? `, đã xếp ${queuedCount} lượt chạy cơ sở` : ""}.`
      : null,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<number | "create" | null>(null);

  // Họ vừa được bàn giao từ màn thiết kế (?family=<id>) hoặc vừa tạo bằng form: tô sáng và cuộn tới dòng của nó.
  const paramFamily = Number(searchParams.get("family"));
  const [focusId, setFocusId] = useState<number | null>(
    Number.isInteger(paramFamily) && paramFamily > 0 ? paramFamily : null,
  );

  // Sửa họ = tạo bản gốc mới (task 4): họ đang sửa, lịch sử bản đã tải, bản cũ đang xem của từng họ (chỉ xem).
  const [editing, setEditing] = useState<FamilyItem | null>(null);
  const [versions, setVersions] = useState<Record<number, FamilyVersion[]>>({});
  const [viewing, setViewing] = useState<Record<number, number>>({});
  // Danh sách biến thể + nhãn tập thử (task 5) của họ đang mở, theo bản đang xem.
  const [openVariants, setOpenVariants] = useState<number | null>(null);
  const [variantList, setVariantList] = useState<FamilyVariantList | null>(null);
  const [labelBusy, setLabelBusy] = useState<number | null>(null);
  // Danh sách run đang chờ/đang chạy của họ đang mở, để hủy từng run (TD-37).
  const [openRuns, setOpenRuns] = useState<number | null>(null);
  const [activeRuns, setActiveRuns] = useState<ActiveFamilyRun[] | null>(null);
  const [runBusy, setRunBusy] = useState<number | null>(null);
  const loadSequence = useRef(0);
  const deletedFamilies = useRef(new Set<number>());

  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    vehicsimApi.families()
      .then((list) => {
        if (sequence !== loadSequence.current) return;
        // GET có thể dùng chung request được gửi trước DELETE; không để dữ liệu cũ hiện lại.
        const visible = list.filter((family) => !deletedFamilies.current.has(family.id));
        for (const id of deletedFamilies.current) if (!list.some((family) => family.id === id)) deletedFamilies.current.delete(id);
        setItems(visible);
      })
      .catch((err) => { if (sequence === loadSequence.current) setError(err instanceof Error ? err.message : "Không tải được họ kịch bản"); });
  }, []);
  useEffect(load, [load]);

  const scrolledRef = useRef(false);
  const focused = focusId ? (items ?? []).find((f) => f.id === focusId) : undefined;
  useEffect(() => {
    if (!focused || scrolledRef.current) return;
    scrolledRef.current = true;
    document.getElementById(`family-${focused.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  // Có run đang xếp hàng/chạy → tải lại định kỳ để số liệu tự cập nhật.
  const active = (items ?? []).some((f) => (f.runs.PENDING ?? f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0) > 0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [active, load]);

  const pickVersion = async (f: FamilyItem, version: number) => {
    if (version === f.version) {
      setViewing((prev) => without(prev, f.id));
      return;
    }
    setError(null);
    try {
      if (!versions[f.id]) {
        const list = await vehicsimApi.familyVersions(f.id);
        setVersions((prev) => ({ ...prev, [f.id]: list }));
      }
      setViewing((prev) => ({ ...prev, [f.id]: version }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được lịch sử bản");
    }
  };

  // Bản đang xem của họ đang mở danh sách biến thể (undefined = bản hiện hành).
  const openBase = openVariants
    ? versions[openVariants]?.find((v) => v.version === viewing[openVariants])?.base_version_id
    : undefined;
  useEffect(() => {
    if (!openVariants) return;
    let alive = true;
    vehicsimApi
      .familyVariants(openVariants, openBase)
      .then((list) => alive && setVariantList(list))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Không tải được biến thể"));
    return () => {
      alive = false;
    };
  }, [openVariants, openBase]);

  const toggleVariants = (f: FamilyItem) => {
    setVariantList(null);
    setOpenVariants((cur) => (cur === f.id ? null : f.id));
  };

  const changeLabel = async (f: FamilyItem, variantId: number, label: RiskLabel | "AUTO") => {
    setLabelBusy(variantId);
    setError(null);
    try {
      await vehicsimApi.setRiskLabel(f.id, variantId, label);
      setVariantList(await vehicsimApi.familyVariants(f.id, openBase));
      setVersions((prev) => without(prev, f.id));
      setViewing((prev) => without(prev, f.id));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đổi được nhãn");
    } finally {
      setLabelBusy(null);
    }
  };

  const startEdit = (f: FamilyItem) => {
    setFormOpen(false);
    setEditing(f);
    setFocusId(f.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteFamily = async (f: FamilyItem) => {
    if (!window.confirm(`Xóa họ kịch bản “${f.code} · ${f.name}” cùng các phiên bản và biến thể? Họ đã có lượt chạy hoặc dữ liệu phân tích, tối ưu, kiểm chứng liên quan sẽ không thể xóa.`)) return;
    setBusy(f.id);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.deleteFamily(f.id);
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không xóa được họ kịch bản");
      setBusy(null);
      return;
    }
    // Đã xóa thành công: lỗi làm mới ngữ cảnh không được báo nhầm là lỗi xóa.
    try {
      // Bỏ qua các request tải danh sách đã bắt đầu trước khi xóa.
      ++loadSequence.current;
      deletedFamilies.current.add(f.id);
      setItems((current) => current?.filter((item) => item.id !== f.id) ?? null);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(((items?.length ?? 1) - 1) / PAGE_SIZE))));
      setFocusId((current) => current === f.id ? null : current);
      setEditing((current) => current?.id === f.id ? null : current);
      setOpenVariants((current) => current === f.id ? null : current);
      setOpenRuns((current) => current === f.id ? null : current);
      setVersions((current) => without(current, f.id));
      setViewing((current) => without(current, f.id));
      setNotice(`Đã xóa họ kịch bản ${f.code} · ${f.name}.`);
      await refresh();
    } catch {
      setError("Đã xóa họ kịch bản nhưng không cập nhật được ngữ cảnh. Hãy tải lại trang.");
    } finally {
      setBusy(null);
    }
  };

  const loadActiveRuns = useCallback((scenarioId: number) => {
    vehicsimApi.activeFamilyRuns(scenarioId)
      .then((list) => setActiveRuns(list))
      .catch((err) => setError(err instanceof Error ? vi(err.message) : "Không tải được lượt chạy đang chờ"));
  }, []);

  const toggleRuns = (f: FamilyItem) => {
    if (openRuns === f.id) {
      setOpenRuns(null);
      return;
    }
    setOpenRuns(f.id);
    setActiveRuns(null);
    loadActiveRuns(f.id);
  };

  // Bảng run đang mở: tải lại cùng nhịp 3 giây với số liệu họ để trạng thái chờ → chạy → xong tự cập nhật.
  useEffect(() => {
    if (openRuns === null) return;
    const id = setInterval(() => loadActiveRuns(openRuns), 3000);
    return () => clearInterval(id);
  }, [openRuns, loadActiveRuns]);

  const cancelOneRun = async (f: FamilyItem, run: ActiveFamilyRun, index: number) => {
    setRunBusy(run.run_id);
    setError(null);
    try {
      const res = await vehicsimApi.cancelRun(run.run_id);
      setNotice(`${f.code}: ${res.status === "STOPPED" ? "đã hủy" : "đang dừng"} lượt chạy #${index + 1} (mã ${run.run_id}).`);
      loadActiveRuns(f.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không hủy được lượt chạy");
    } finally {
      setRunBusy(null);
    }
  };

  return (
    <VehicSimPage
      step={1}
      crumbs={
        isNew
          ? [{ label: "Thiết kế kịch bản", href: "/scenarios" }, { label: "Nhập tham số" }]
          : [{ label: "Thiết kế kịch bản" }, { label: "Danh sách họ kịch bản" }]
      }
      actions={
        isNew ? (
          <>
            {canWrite && <PillButton variant="dark" href="/scenarios/new">
              + Sinh từ mô tả (AI)
            </PillButton>}
            <PillButton variant="light" href="/scenarios">
              ← Xem danh sách họ kịch bản
            </PillButton>
          </>
        ) : (
          <>
            {canWrite && <PillButton variant="dark" href="/scenarios/new">
              + Sinh từ mô tả (AI)
            </PillButton>}
            {canWrite && <PillButton variant="light" href="/scenarios?new=1">
              + Nhập tham số
            </PillButton>}
          </>
        )
      }
    >
      <ErrorNote message={error === contextError ? null : error} />
      {notice && <p className="rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">{notice}</p>}
      {!isNew && focused && !notice && (
        <p className="rounded-[16px] bg-vehicsim-decision-bg px-4 py-3 text-[13px] text-vehicsim-decision">
          {focused.code} · {focused.name}:{" "}
          {(focused.runs.PENDING ?? 0) + (focused.runs.RUNNING ?? 0) > 0
            ? "các lượt chạy cơ sở đang chạy — số liệu tự cập nhật bên dưới."
            : (focused.runs.COMPLETED ?? 0) > 0
              ? "đã có kết quả chạy cơ sở — bấm “Chạy baseline” hoặc “Phân tích”."
              : "chưa chạy cơ sở — bấm “Chạy baseline” để thực thi thử nghiệm."}
        </p>
      )}
      {!isNew && focusId && items && !focused && (
        <ErrorNote message={`Không tìm thấy họ kịch bản #${focusId} trong project hiện tại.`} />
      )}
      {isNew && !canWrite && <p role="status">Tài khoản này chỉ có quyền xem kịch bản; hãy nhờ kỹ sư tạo kịch bản mới.</p>}
      {editing && canWrite && (
        <div className="flex flex-col gap-2">
          <FamilyForm
            key={`${editing.id}-v${editing.version}`}
            busy={busy === "create"}
            title={`Sửa ${editing.code} · tạo bản v${editing.version + 1}`}
            hint={
              <>
                Bản v{editing.version} cùng các lượt chạy của nó giữ nguyên để baseline cũ vẫn tái lập được. Bản v{editing.version + 1} có
                bộ biến thể mới và cần chạy cơ sở lại; từ đây chạy cơ sở, regression và tối ưu dùng bản mới.
              </>
            }
            submitLabel={`Tạo bản v${editing.version + 1}`}
            lockName
            initial={initialFrom(editing)}
            onSubmit={async (body) => {
              const f = editing;
              setBusy("create");
              setError(null);
              try {
                const res = await vehicsimApi.createFamilyVersion(f.id, body);
                setNotice(
                  `Đã tạo ${res.code} v${res.version} với ${res.variants} biến thể${res.queued_runs ? ` và xếp ${res.queued_runs} lượt chạy cơ sở` : ""}.`,
                );
                setEditing(null);
                setFocusId(f.id);
                setVersions((prev) => without(prev, f.id));
                setViewing((prev) => without(prev, f.id));
                load();
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Không tạo được bản mới");
              } finally {
                setBusy(null);
              }
            }}
          />
          <button type="button" onClick={() => setEditing(null)} className="self-end text-[12px] font-semibold text-vehicsim-muted hover:underline">
            Hủy sửa
          </button>
        </div>
      )}
      {canWrite && (isNew || formOpen) && (
        <FamilyForm
          busy={busy === "create"}
          onSubmit={async (body) => {
            setBusy("create");
            setError(null);
            try {
              const res = await vehicsimApi.createFamily(body);
              setNotice(
                `Đã tạo ${res.code} với ${res.variants} biến thể${res.queued_runs ? ` và xếp ${res.queued_runs} lượt chạy cơ sở` : ""}.`,
              );
              setFormOpen(false);
              setFocusId(res.scenario_id);
              load();
              await refresh();
              router.push(`/scenarios?family=${res.scenario_id}&created=${res.code}&variants=${res.variants}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Không tạo được họ kịch bản");
            } finally {
              setBusy(null);
            }
          }}
        />
      )}

      {!isNew && (
        <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
        <div className="flex items-center px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{items ? `${items.length} họ kịch bản` : "…"}</span>
        </div>
        {items && items.length === 0 && (
          <EmptyState title="Chưa có họ kịch bản nào">Tạo họ đầu tiên (ví dụ người đi bộ băng ngang) rồi chạy cơ sở để có ca lỗi.</EmptyState>
        )}
        {!!pagedItems?.length && (
          <TableScroll label="Bảng họ kịch bản" minWidth={985}>
            <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
              <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
              <span className="w-[200px] shrink-0 pr-4">Họ kịch bản</span>
              <span className="min-w-[190px] flex-1 pr-4">Không gian tham số</span>
              <span className="w-[85px] shrink-0">Biến thể</span>
              <span className="w-[95px] shrink-0">Lượt chạy</span>
              <span className="w-[120px] shrink-0 pr-2">Lỗi baseline</span>
              <span className="w-[85px] shrink-0">Ngày tạo</span>
              <span className="w-[215px] shrink-0 text-center">Thao tác</span>
            </div>
            {pagedItems?.map((f, idx) => {
              const pending = (f.runs.PENDING ?? f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0) + (f.runs.PAUSED ?? 0);
              // Đang xem bản cũ: cột tham số / biến thể / lượt chạy lấy của bản đó, chỉ xem.
              const old = viewing[f.id] ? versions[f.id]?.find((v) => v.version === viewing[f.id]) : undefined;
              const shown = old ?? f;
              return (
                <Fragment key={f.id}>
                <div
                  id={`family-${f.id}`}
                  className={cx(
                    "flex min-h-[76px] items-center border-b border-solid border-vehicsim-line px-5 py-3",
                    f.id === focusId && "bg-vehicsim-decision-bg/50 ring-2 ring-inset ring-vehicsim-decision/40",
                  )}
                >
                  <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </span>
                  <span className="flex w-[200px] shrink-0 flex-col gap-1 pr-3">
                    <span className="text-[13.5px] font-bold text-vehicsim-ink">
                      {f.code} <span className="font-semibold">· {f.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {f.version_count > 1 ? (
                        <select
                          value={viewing[f.id] ?? f.version}
                          onChange={(e) => pickVersion(f, Number(e.target.value))}
                          aria-label={`Bản của ${f.code}`}
                          className="rounded-full border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-2 py-[2px] text-[11px] font-semibold text-vehicsim-ink"
                        >
                          {Array.from({ length: f.version_count }, (_, i) => f.version_count - i).map((v) => (
                            <option key={v} value={v}>
                              v{v}
                              {v === f.version ? " · hiện hành" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Tag className="px-2 py-[2px] text-[10px]">v{f.version}</Tag>
                      )}
                      {old && <Tag tone="warn" className="px-2 py-[2px] text-[10px]">bản cũ · chỉ xem</Tag>}
                    </span>
                    {f.description && <p className="text-[11.5px] leading-[1.4] text-vehicsim-muted line-clamp-2" title={f.description}>{f.description}</p>}
                  </span>
                  <span className="flex min-w-[200px] flex-1 flex-wrap gap-1 pr-3">
                    {Object.entries(shown.parameter_space).map(([axis, values]) => (
                      <Tag key={axis} className="px-2 py-[2px] text-[10.5px]">
                        {axisLabel(axis)}: {values.map((v) => axisValue(axis, v)).join(" / ")}
                      </Tag>
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleVariants(f)}
                    aria-expanded={openVariants === f.id}
                    title="Bấm để xem danh sách biến thể"
                    className="group flex w-[85px] shrink-0 cursor-pointer flex-col gap-[2px] text-left"
                  >
                    <span className="text-[13px] font-bold text-vehicsim-ink group-hover:text-vehicsim-decision group-hover:underline">
                      {shown.variants} biến thể
                    </span>
                    {shown.risk_counts && (
                      <span className="text-[10.5px] font-normal leading-[1.3] text-vehicsim-muted">
                        <span className="font-semibold text-vehicsim-danger">{shown.risk_counts.DANGEROUS} nguy hiểm</span>
                        <br />
                        <span className="font-semibold text-vehicsim-ok">{shown.risk_counts.SAFE} an toàn</span>
                      </span>
                    )}
                  </button>
                  <span className="flex w-[95px] shrink-0 flex-col text-[12px] text-vehicsim-muted">
                    <span>
                      <b className="text-vehicsim-ink font-bold">{shown.runs.COMPLETED ?? 0}</b> đã xong
                    </span>
                    <span className="text-[10.5px] text-vehicsim-faint" title="Gồm lượt baseline, lượt AEB tắt, lượt của tối ưu MOBO và kiểm thử hồi quy">
                      gồm mọi loại lượt chạy
                    </span>
                    {!old && pending > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleRuns(f)}
                        aria-expanded={openRuns === f.id}
                        title="Bấm để xem và hủy từng lượt đang chờ / đang chạy"
                        className="cursor-pointer text-left font-semibold text-vehicsim-decision hover:underline text-[11px]"
                      >
                        {waitingRunsLines(f.runs).map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </button>
                    )}
                    {(shown.runs.FAILED ?? 0) > 0 &&
                      (old ? (
                        <span className="text-vehicsim-danger font-medium text-[11px]">{shown.runs.FAILED} lỗi</span>
                      ) : (
                        <Link
                          href={`/analysis/failures?view=runs&scenario_id=${f.id}&status=FAILED`}
                          title="Xem lý do lỗi của từng lượt chạy cơ sở"
                          className="text-vehicsim-danger hover:underline font-medium text-[11px]"
                        >
                          {shown.runs.FAILED} lỗi · xem lý do
                        </Link>
                      ))}
                    {(shown.runs.STOPPED ?? 0) > 0 && <span className="text-[11px]">{shown.runs.STOPPED} đã hủy</span>}
                  </span>
                  <span className="flex w-[120px] shrink-0 flex-col pr-2">
                    {old ? (
                      <span className="text-[12px] text-vehicsim-faint" title="Lỗi trên bản cơ sở chỉ tính cho bản hiện hành">—</span>
                    ) : (
                      <>
                        {baselineRan(f) ? (
                          <span className={cx("text-[13px] font-bold", f.failures ? "text-vehicsim-danger" : "text-vehicsim-faint")}>
                            {f.failures} / {f.variants}
                          </span>
                        ) : (
                          // Chưa biến thể nào chạy xong với bản cơ sở hiện hành: "0 / N" sẽ bị đọc thành "chạy rồi, không lỗi".
                          <span className="text-[12px] font-semibold text-vehicsim-faint" title="Chưa có lượt baseline hoàn tất với bản cơ sở hiện hành">
                            Chưa chạy
                          </span>
                        )}
                        {f.baseline && <span className="text-[10.5px] text-vehicsim-faint">AEB {f.baseline}</span>}
                      </>
                    )}
                  </span>
                  <span className="w-[85px] shrink-0 text-[11.5px] text-vehicsim-faint">{fmt.date(old ? old.created_at : f.created_at)}</span>
                  <div className="grid w-[215px] shrink-0 grid-cols-2 gap-1.5">
                    {canWrite && <Link
                      href={`/scenarios/run?scenario_id=${f.id}`}
                      title="Chuyển sang màn Chạy baseline với họ kịch bản này"
                      className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md bg-vehicsim-primary px-1.5 text-[11.5px] font-bold text-white hover:bg-vehicsim-primary-hover transition shadow-xs"
                    >
                      <Play className="size-2.5 fill-current shrink-0" />
                      <span>Chạy</span>
                    </Link>}

                    <Link
                      href={`/analysis/failures?scenario_id=${f.id}`}
                      title="Chuyển sang phân tích kết quả ca lỗi"
                      className="inline-flex h-7 w-full items-center justify-center rounded-md border border-solid border-vehicsim-decision/40 bg-vehicsim-decision-bg px-1.5 text-[11.5px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition"
                    >
                      <span>Phân tích</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => toggleVariants(f)}
                      aria-expanded={openVariants === f.id}
                      className={cx(
                        "inline-flex h-7 w-full items-center justify-center rounded-md border border-solid px-1.5 text-[11px] font-semibold transition",
                        openVariants === f.id
                          ? "border-vehicsim-primary bg-vehicsim-primary text-white"
                          : "border-vehicsim-line-strong bg-vehicsim-soft text-vehicsim-ink hover:bg-vehicsim-line hover:border-vehicsim-line-strong",
                      )}
                    >
                      <span>{openVariants === f.id ? "Đóng" : "Biến thể"}</span>
                    </button>

                    {canWrite && <button
                      type="button"
                      disabled={busy !== null || !canWrite}
                      onClick={() => startEdit(f)}
                      title="Tạo phiên bản mới cho họ kịch bản này"
                      className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-1.5 text-[11px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft disabled:opacity-40"
                    >
                      <Pencil className="size-2.5 shrink-0" />
                      <span>Sửa v{f.version + 1}</span>
                    </button>}
                    {canWrite && <button
                      type="button"
                      disabled={busy !== null || !canWrite}
                      onClick={() => void deleteFamily(f)}
                      title={canWrite ? "Xóa họ kịch bản chưa có dữ liệu liên quan" : "Tài khoản chỉ có quyền xem"}
                      aria-label={`Xóa họ kịch bản ${f.code} · ${f.name}`}
                      className="col-span-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-solid border-vehicsim-danger/40 bg-vehicsim-surface px-1.5 text-[11px] font-semibold text-vehicsim-danger hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="size-3 shrink-0" />
                      {busy === f.id ? "Đang xóa…" : "Xóa"}
                    </button>}
                  </div>
                </div>
                {openRuns === f.id && !old && (
                  <ActiveRuns
                    runs={activeRuns}
                    canWrite={canWrite}
                    busy={runBusy}
                    onCancel={(run, index) => cancelOneRun(f, run, index)}
                    onClose={() => setOpenRuns(null)}
                  />
                )}
                {openVariants === f.id && (
                  <VariantLabels
                    list={variantList?.scenario_id === f.id ? variantList : null}
                    canWrite={canWrite}
                    busy={labelBusy}
                    onChange={(variantId, label) => changeLabel(f, variantId, label)}
                  />
                )}
                </Fragment>
              );
            })}
          </TableScroll>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-solid border-vehicsim-line px-5 py-3">
            <span className="text-[12px] font-medium text-vehicsim-muted">
              Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, items?.length ?? 0)} trên {items?.length ?? 0} họ kịch bản
            </span>
            <Pagination page={page} pages={totalPages} onPage={setPage} />
          </div>
        )}
      </section>
      )}
    </VehicSimPage>
  );
}

const RISK: Record<RiskLabel, { label: string; tone: "danger" | "ok" }> = {
  DANGEROUS: { label: "Nguy hiểm", tone: "danger" },
  SAFE: { label: "An toàn", tone: "ok" },
};

/** Danh sách biến thể của bản đang xem với nhãn tập thử: nhãn tự suy (dừng ở lề = an toàn) hoặc sửa tay. */
function VariantLabels({
  list,
  canWrite,
  busy,
  onChange,
}: {
  list: FamilyVariantList | null;
  canWrite: boolean;
  busy: number | null;
  onChange: (variantId: number, label: RiskLabel | "AUTO") => void;
}) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const variants = list?.variants ?? [];
  const total = variants.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagedVariants = variants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="border-b border-solid border-vehicsim-line bg-vehicsim-soft px-5 py-4">
      {list && !list.current && (
        <p className="mb-3 text-[12px] leading-[1.5] text-vehicsim-muted">
          Đang xem bản cũ v{list.version}.
        </p>
      )}
      {!list ? (
        <p className="text-[12px] text-vehicsim-faint">Đang tải biến thể…</p>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-surface">
          {pagedVariants.map((v, idx) => {
            const index = (page - 1) * PAGE_SIZE + idx;
            return (
              <div
                key={v.scenario_version_id}
                data-variant={v.scenario_version_id}
                className="flex h-[44px] items-center border-b border-solid border-vehicsim-line px-4 text-[12px] last:border-b-0"
              >
                <span className="w-[60px] font-bold text-vehicsim-ink" title={`Mã lưu trữ: #${v.scenario_version_id}`}>#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-vehicsim-ink">
                  {v.stops_at_curb == null ? viSummary(v.summary) : [
                    `${v.ego_speed_kmh} km/h`,
                    `kích hoạt ${v.trigger_distance_m} m`,
                    `người đi bộ ${v.pedestrian_speed_mps} m/s`,
                    v.stops_at_curb ? "dừng ở lề" : "băng qua",
                    viWeather(v.weather), viTime(v.time_of_day),
                  ].join(" · ")}
                </span>
                <span className="flex w-[110px] justify-center">
                  <Tag tone={RISK[v.risk_label].tone} className="px-2 py-[2px] text-[10px]">
                    {RISK[v.risk_label].label}
                    {v.manual ? " · sửa tay" : ""}
                  </Tag>
                </span>
                <VehicSimSelect
                  aria-label={`Nhãn biến thể #${index + 1}`}
                  value={v.manual ? v.risk_label : "AUTO"}
                  disabled={!canWrite || busy !== null}
                  onChange={(val) => onChange(v.scenario_version_id, val as RiskLabel | "AUTO")}
                  options={[
                    { value: "AUTO", label: `Tự suy (${RISK[v.auto_label].label.toLowerCase()})` },
                    { value: "DANGEROUS", label: "Nguy hiểm" },
                    { value: "SAFE", label: "An toàn" },
                  ]}
                  buttonClassName="h-8 rounded-full px-2.5 text-[12px]"
                  className="w-[170px]"
                />
              </div>
            );
          })}
          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-4 py-3">
              <span className="text-[12px] font-medium text-vehicsim-muted">
                Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} trên {total} biến thể
              </span>
              <Pagination page={page} pages={pages} onPage={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RUN_STATUS: Record<ActiveFamilyRun["status"], { label: string; tone: "warn" | "info" }> = {
  PENDING: { label: "Đang chờ", tone: "warn" },
  RUNNING: { label: "Đang chạy", tone: "info" },
};

/** Lượt đang chờ / đang chạy của họ, mỗi lượt có nút Hủy riêng (run của regression / tối ưu chỉ dừng theo cả test / đợt). */
function ActiveRuns({
  runs,
  canWrite,
  busy,
  onCancel,
  onClose,
}: {
  runs: ActiveFamilyRun[] | null;
  canWrite: boolean;
  busy: number | null;
  onCancel: (run: ActiveFamilyRun, index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-solid border-vehicsim-line bg-vehicsim-soft px-5 py-4">
      <div className="mb-3 flex items-center justify-end">
        <button type="button" onClick={onClose} className="shrink-0 text-[12px] font-semibold text-vehicsim-muted hover:text-vehicsim-ink">
          Đóng
        </button>
      </div>
      {!runs ? (
        <p className="text-[12px] text-vehicsim-faint">Đang tải lượt chạy…</p>
      ) : runs.length === 0 ? (
        <p className="text-[12px] text-vehicsim-faint">Không còn lượt nào đang chờ hoặc đang chạy.</p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-surface">
          {runs.map((run, index) => {
            const v = run.variant;
            const status = RUN_STATUS[run.status];
            return (
              <div
                key={run.run_id}
                data-run={run.run_id}
                className="flex h-[48px] items-center gap-3 border-b border-solid border-vehicsim-line px-4 text-[12px] last:border-b-0"
              >
                <span className="w-[60px] font-bold text-vehicsim-ink" title={`Mã lượt chạy: ${run.run_id}`}>#{index + 1}</span>
                <span className="flex w-[90px] justify-center">
                  <Tag tone={status.tone} className="px-2 py-[2px] text-[10px]">{status.label}</Tag>
                </span>
                <span className="min-w-0 flex-1 truncate text-vehicsim-ink">
                  {[
                    v.ego_speed_kmh != null ? `${v.ego_speed_kmh} km/h` : null,
                    v.trigger_distance_m != null ? `kích hoạt ${v.trigger_distance_m} m` : null,
                    v.pedestrian_speed_mps != null ? `người đi bộ ${v.pedestrian_speed_mps} m/s` : null,
                    v.stops_at_curb == null ? null : v.stops_at_curb ? "dừng ở lề" : "băng qua",
                    v.weather ? viWeather(v.weather) : null,
                    v.time_of_day ? viTime(v.time_of_day) : null,
                  ].filter(Boolean).join(" · ")}
                  {run.aeb_mode === "OFF" ? " · AEB tắt" : ""}
                </span>
                <span className="w-[230px] truncate text-vehicsim-faint" title={run.simulator_version}>{simulatorLabel(run.simulator_version)}</span>
                <span className="flex w-[110px] justify-end">
                  {run.cancellable ? (
                    <button
                      type="button"
                      onClick={() => onCancel(run, index)}
                      disabled={!canWrite || busy !== null}
                      title={canWrite ? `Hủy lượt chạy #${index + 1}` : "Tài khoản người xem chỉ có quyền xem"}
                      aria-label={`Hủy lượt chạy #${index + 1}`}
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-vehicsim-danger px-3 text-[12px] font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <X className="size-3 shrink-0" />
                      {busy === run.run_id ? "Hủy…" : "Hủy"}
                    </button>
                  ) : (
                    <span className="text-[11px] text-vehicsim-faint">
                      {run.blocked_by === "REGRESSION" ? "Thuộc regression" : "Thuộc tối ưu"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tách lượt đang chạy khỏi lượt đang chờ (PENDING/QUEUED, PAUSED), mỗi loại một dòng để cột hẹp không cắt chữ. */
/** Đã có biến thể chạy xong với bản cơ sở hiện hành (mọi bộ mô phỏng) chưa; backend chỉ đếm lượt baseline AEB bật của xe đang dùng. */
function baselineRan(f: FamilyItem): boolean {
  return Object.values(f.baseline_progress ?? {}).some((p) => p.completed_variants > 0);
}

function waitingRunsLines(runs: Record<string, number>): string[] {
  const running = runs.RUNNING ?? 0;
  const waiting = (runs.PENDING ?? runs.QUEUED ?? 0) + (runs.PAUSED ?? 0);
  return [running > 0 ? `${running} đang chạy` : "", waiting > 0 ? `${waiting} đang chờ` : ""].filter(Boolean);
}

function without<T>(map: Record<number, T>, key: number): Record<number, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/** Không gian tham số hiện hành của họ → giá trị ban đầu của form sửa. */
function initialFrom(f: FamilyItem) {
  const ps = f.parameter_space;
  return {
    name: f.name,
    description: f.description ?? "",
    ego_speeds_kmh: (ps.ego_speed_kmh ?? []) as number[],
    trigger_distances_m: (ps.trigger_distance_m ?? []) as number[],
    pedestrian_speeds_mps: (ps.pedestrian_speed_mps ?? []) as number[],
    stops_at_curb: (ps.stops_at_curb ?? []) as boolean[],
    // Họ xe phía trước (ADR-050): sửa họ giữ nguyên category, nạp lại các trục của nó.
    category: f.category,
    target_speeds_kmh: (ps.target_speed_kmh ?? undefined) as number[] | undefined,
    initial_distances_m: (ps.initial_distance_m ?? undefined) as number[] | undefined,
    target_decels_mps2: (ps.target_decel_mps2 ?? undefined) as number[] | undefined,
    lateral_overlaps_pct: (ps.lateral_overlap_pct ?? undefined) as number[] | undefined,
    weathers: (ps.weather ?? []) as Weather[],
    times_of_day: (ps.time_of_day ?? []) as TimeOfDay[],
  };
}

function axisLabel(axis: string): string {
  const map: Record<string, string> = {
    ego_speed_kmh: "tốc độ xe km/h",
    ego_speeds_kmh: "tốc độ xe km/h",
    trigger_distance_m: "khoảng cách m",
    trigger_distances_m: "khoảng cách m",
    pedestrian_speed_mps: "người đi bộ m/s",
    pedestrian_speeds_mps: "người đi bộ m/s",
    target_speed_kmh: "xe phía trước km/h",
    initial_distance_m: "khoảng cách ban đầu m",
    target_decel_mps2: "giảm tốc xe trước m/s²",
    lateral_overlap_pct: "độ chồng lấn %",
    stops_at_curb: "hành vi",
    weather: "thời tiết",
    weathers: "thời tiết",
    time_of_day: "thời điểm",
    times_of_day: "thời điểm",
  };
  return map[axis] ?? axis;
}

function axisValue(axis: string, value: number | boolean | string): string {
  if (typeof value === "boolean") return value ? "dừng" : "băng qua";
  if (typeof value === "string" && (axis === "weather" || axis === "weathers")) return viWeather(value);
  if (typeof value === "string" && (axis === "time_of_day" || axis === "times_of_day")) return viTime(value);
  return String(value);
}
