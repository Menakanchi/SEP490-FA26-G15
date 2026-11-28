"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, Pagination, PillButton, cx } from "@/components/VehicSimUi";
import { ProjectCard } from "@/components/project/ProjectHome";
import { Welcome } from "@/components/project/ProjectShell";
import { useProjectActions } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import { useAuth } from "@/context/AuthContext";
import type { ProjectList, ProjectStatus } from "@/types/vehicsim";

const PAGE_SIZE = 9;

const TABS: { status: ProjectStatus; label: string; count: (list: ProjectList) => number }[] = [
  { status: "ACTIVE", label: "Đang hoạt động", count: (list) => list.active_count },
  { status: "ARCHIVED", label: "Lưu trữ", count: (list) => list.archived_count },
];

export default function ListProjectPage() {
  const router = useRouter();
  const { ctx, openProject, isExperiencer } = useVehicSimContext();
  const { user } = useAuth();
  const engineer = user?.roleCode === "ENGINEER";
  const [tab, setTab] = useState<ProjectStatus>("ACTIVE");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; list: ProjectList | null; error: string | null } | null>(null);
  const key = JSON.stringify([tab, search, page]);
  const list = result?.key === key ? result.list : null;
  const error = result?.key === key ? result.error : null;
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const current = ++requestId.current;
    return vehicsimApi
        .projects({ status: tab, q: search, page, pageSize: PAGE_SIZE })
        .then((loaded) => {
          if (current !== requestId.current) return;
          if (loaded.items.length === 0 && page > 1) setPage(page - 1);
          else setResult({ key, list: loaded, error: null });
        })
        .catch((err) => {
          if (current === requestId.current) setResult({ key, list: null, error: err instanceof Error ? err.message : "Không tải được danh sách project" });
        });
  }, [tab, search, page, key]);
  const actions = useProjectActions(reload);

  useEffect(() => {
    const requests = requestId;
    void reload();
    return () => { requests.current++; };
  }, [reload]);

  if (list && isExperiencer && !search && list.active_count + list.archived_count === 0) return <>{actions.view}<Welcome /></>;

  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const go = (id: number, href: string) => (ctx?.project.id === id ? router.push(href) : openProject(id, href));
  const changeTab = (status: ProjectStatus) => {
    if (status === tab && page === 1) return;
    setResult(null);
    setTab(status);
    setPage(1);
  };
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSearch = query.trim();
    if (nextSearch === search && page === 1) return;
    setResult(null);
    setSearch(nextSearch);
    setPage(1);
  };

  return (
    <VehicSimPage
      crumbs={[{ label: "Project của tôi" }]}
      hideMissingProjectError
      actions={
        (isExperiencer || engineer) && (
          <PillButton variant="dark" href="/projects/new">
            + Tạo project
          </PillButton>
        )
      }
    >
      <ErrorNote message={error} />
      {actions.view}

      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Trạng thái project" className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              role="tab"
              aria-selected={tab === t.status}
              onClick={() => changeTab(t.status)}
              className={cx(
                "rounded-full px-4 py-2 text-[14px] font-semibold",
                tab === t.status ? "bg-vehicsim-primary text-white" : "text-vehicsim-muted hover:bg-vehicsim-surface",
              )}
            >
              {t.label} ({list ? t.count(list) : "…"})
            </button>
          ))}
        </div>
        <form role="search" onSubmit={submitSearch} className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-4 sm:w-[280px] sm:flex-none">
            <Search aria-hidden className="size-4 shrink-0 text-vehicsim-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên project"
              aria-label="Tìm theo tên project"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-vehicsim-ink placeholder:text-vehicsim-muted focus:outline-none"
            />
          </label>
          <PillButton type="submit">Tìm</PillButton>
        </form>
      </div>

      {!list ? (
        error ? (
          <div><PillButton onClick={() => { setResult(null); void reload(); }}>Thử tải lại</PillButton></div>
        ) : (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )
      ) : list.items.length === 0 ? (
        <EmptyState title={search ? `Không có project nào khớp “${search}”` : tab === "ACTIVE" ? "Không có project đang hoạt động" : "Không có project lưu trữ"} />
      ) : (
        <>
          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {list.items.map((p) => engineer && p.workspace_id != null ? (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5">
                <strong className="min-w-0 [overflow-wrap:anywhere]">{p.name}</strong>
                <span className="text-sm text-vehicsim-muted">{p.vehicle_name ?? "Chưa chọn xe"} · {p.status === "ACTIVE" ? "Đang hoạt động" : "Lưu trữ"}</span>
                <div><PillButton onClick={() => go(p.id, "/")}>Mở project</PillButton></div>
              </div>
            ) : (
              <ProjectCard
                key={p.id}
                project={p}
                opened={isExperiencer && ctx?.project.id === p.id}
                readOnly={!isExperiencer}
                onContinue={(href) => go(p.id, href)}
                onAction={(kind) => actions.start(kind, p)}
              />
            ))}
          </div>
          <div className="flex w-full items-center justify-between">
            <span className="text-[13px] text-vehicsim-muted">
              {(list.page - 1) * list.page_size + 1}–{(list.page - 1) * list.page_size + list.items.length} / {list.total} project
            </span>
            {pages > 1 && <Pagination page={list.page} pages={pages} onPage={(nextPage) => { if (nextPage !== page) { setResult(null); setPage(nextPage); } }} />}
          </div>
        </>
      )}
    </VehicSimPage>
  );
}
