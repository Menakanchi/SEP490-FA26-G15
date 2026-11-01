"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { NewProjectCard, ProjectCard } from "@/components/project/ProjectHome";
import { Welcome } from "@/components/project/ProjectShell";
import { useProjectActions } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { ProjectList, ProjectStatus } from "@/types/vehicsim";

const TABS: { status: ProjectStatus; label: string }[] = [
  { status: "ACTIVE", label: "Đang hoạt động" },
  { status: "ARCHIVED", label: "Lưu trữ" },
];

/** Project của tôi: trang đầu của EXPERIENCER sau khi đăng nhập. Chưa có project nào thì hiện màn chào mừng. */
export default function ListProjectPage() {
  const router = useRouter();
  const { ctx, openProject, isExperiencer } = useVehicSimContext();
  const [list, setList] = useState<ProjectList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProjectStatus>("ACTIVE");

  const reload = useCallback(
    () =>
      vehicsimApi
        .projects()
        .then(setList)
        .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách project")),
    [],
  );
  const actions = useProjectActions(reload);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (list && list.items.length === 0 && isExperiencer) return <Welcome />;

  const full = !!list && list.active_count >= list.active_limit;
  const limitReason = list && full ? `Đã có ${list.active_count}/${list.active_limit} project đang hoạt động; lưu trữ hoặc xoá bớt trước.` : undefined;
  const visible = list?.items.filter((p) => p.status === tab) ?? [];
  const count = (status: ProjectStatus) => list?.items.filter((p) => p.status === status).length ?? 0;
  const go = (id: number, href: string) => (ctx?.project.id === id ? router.push(href) : openProject(id, href));

  return (
    <VehicSimPage
      crumbs={[{ label: "Project của tôi" }]}
      title="Project của tôi"
      subtitle={
        isExperiencer
          ? "Mỗi project là một câu hỏi thử nghiệm về AEB, đi qua 5 bước từ kịch bản tới kiểm chứng. Chọn một project để làm tiếp."
          : "Project cá nhân tạo khi bạn còn là Experiencer. Tài khoản đã đổi role nên chỉ xem được, không mở để làm việc."
      }
      actions={
        list &&
        isExperiencer && (
          <>
            <div className="flex flex-col items-end gap-1" aria-label={`${list.active_count}/${list.active_limit} project đang hoạt động`}>
              <div className="flex gap-1">
                {Array.from({ length: list.active_limit }, (_, i) => (
                  <span key={i} className={cx("h-2 w-8 rounded-full", i < list.active_count ? "bg-vehicsim-ink" : "bg-vehicsim-line-strong")} />
                ))}
              </div>
              <span className="text-[13px] text-vehicsim-muted">
                {list.active_count}/{list.active_limit} đang hoạt động
              </span>
            </div>
            <PillButton variant="dark" href={full ? undefined : "/projects/new"} disabled={full} title={limitReason}>
              + Tạo project
            </PillButton>
          </>
        )
      }
    >
      <ErrorNote message={error} />
      {actions.view}

      <div role="tablist" aria-label="Trạng thái project" className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            role="tab"
            aria-selected={tab === t.status}
            onClick={() => setTab(t.status)}
            className={cx(
              "rounded-full px-4 py-2 text-[14px] font-semibold",
              tab === t.status ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted hover:bg-white",
            )}
          >
            {t.label} ({count(t.status)})
          </button>
        ))}
      </div>

      {list && list.items.length === 0 && <EmptyState title="Bạn không có project cá nhân nào" />}

      {!list ? (
        !error && (
          <div className="flex justify-center py-16">
            <Loader2 aria-label="Đang tải" className="size-6 animate-spin text-vehicsim-muted" />
          </div>
        )
      ) : (
        <div className="grid w-full grid-cols-3 gap-5">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              opened={isExperiencer && ctx?.project.id === p.id}
              readOnly={!isExperiencer}
              limitReason={limitReason}
              onContinue={(href) => go(p.id, href)}
              onAction={(kind) => actions.start(kind, p)}
            />
          ))}
          {tab === "ACTIVE" && !full && isExperiencer && <NewProjectCard remaining={list.active_limit - list.active_count} />}
          {visible.length === 0 && tab === "ARCHIVED" && <p className="col-span-3 py-10 text-center text-[14px] text-vehicsim-muted">Không có project lưu trữ.</p>}
        </div>
      )}
    </VehicSimPage>
  );
}
