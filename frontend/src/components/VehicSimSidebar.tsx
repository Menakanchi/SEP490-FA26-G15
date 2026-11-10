"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, FolderOpen, House, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { cx } from "@/components/VehicSimUi";
import { MEMBER_ROLES, WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { JOURNEY_STEPS, stepSummary, statusOf } from "@/components/project/journey";
import { useJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectSwitcher } from "@/components/project/ProjectShell";
import { PROJECT_CONTEXT_CLASS, ProjectIdentity, StepStatusIcon } from "@/components/project/ProjectUi";
import { teamJourneyLinks } from "@/components/vehicsimFlow";
import { vehicsimApi } from "@/services/vehicsim";
import type { JourneyStepKey } from "@/types/vehicsim";

/**
 * Điều hướng theo project và vai trò của tài khoản.
 * Mục chưa có trong đợt MVP hiển thị mờ, không bấm được, có chú thích lý do.
 */

type Child = { label: string; href?: string; note?: string };
type Group = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  prefix?: string;
  /** Chỉ coi là đang mở khi pathname đúng bằng prefix (dùng cho trang Tổng quan "/"). */
  exact?: boolean;
  children?: Child[];
  note?: string;
  /** Chỉ hiện với các mã role này (bỏ trống = mọi role). */
  roles?: string[];
  hint?: string;
  active?: boolean;
};

const svgIcon = (src: string) => (
  // eslint-disable-next-line @next/next/no-img-element -- icon SVG tĩnh lấy từ Figma
  <img alt="" src={src} width={18} height={18} className="block size-[18px]" />
);

const gridIcon = (
  <span className="relative block size-[18px]">
    {[
      "left-[1.5px] top-[1.5px]",
      "left-[10px] top-[1.5px]",
      "left-[1.5px] top-[10px]",
      "left-[10px] top-[10px]",
    ].map((pos) => (
      <span key={pos} className={`absolute ${pos} size-[6.5px] rounded-[2px] border-[1.6px] border-solid border-vehicsim-muted`} />
    ))}
  </span>
);

const barsIcon = (
  <span className="relative block size-[18px]">
    <span className="absolute left-[2px] top-[10px] h-[6.5px] w-[3.4px] rounded-[1px] bg-vehicsim-muted" />
    <span className="absolute left-[7.3px] top-[6px] h-[10.5px] w-[3.4px] rounded-[1px] bg-vehicsim-muted" />
    <span className="absolute left-[12.6px] top-[2px] h-[14.5px] w-[3.4px] rounded-[1px] bg-vehicsim-muted" />
  </span>
);

const peopleIcon = (
  <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="none" className="block size-[18px] text-vehicsim-muted">
    <circle cx="6.5" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M1.8 15c.5-2.6 2.4-4 4.7-4s4.2 1.4 4.7 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12.6" cy="6.6" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12.4 10.9c2 .1 3.4 1.3 3.8 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const taskIcon = (
  <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="none" className="block size-[18px] text-vehicsim-muted">
    <rect x="2.5" y="2.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 9.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SOON = "Chưa có trong đợt MVP";

const GROUPS: Group[] = [
  { key: "dashboard", label: "Tổng quan", icon: gridIcon, href: "/", prefix: "/", exact: true },
  { key: "vehicles", label: "Phương tiện", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
  {
    key: "scenarios",
    label: "Kịch bản",
    icon: svgIcon("/vehicsim/icon-route.svg"),
    prefix: "/scenarios",
    children: [
      { label: "Danh sách họ kịch bản", href: "/scenarios" },
      // FE-06: câu mô tả → LLM → Scenario IR (dùng lại hạ tầng LLM của Generator cũ).
      { label: "Sinh từ mô tả", href: "/scenarios/new" },
    ],
  },
  { key: "simulation", label: "Mô phỏng", icon: svgIcon("/vehicsim/icon-play.svg"), note: `${SOON} (FE-08)` },
  { key: "aeb", label: "Phanh khẩn cấp", icon: svgIcon("/vehicsim/icon-shield.svg"), href: "/aeb", prefix: "/aeb" },
  {
    key: "analysis",
    label: "Phân tích",
    icon: svgIcon("/vehicsim/icon-search.svg"),
    prefix: "/analysis",
    children: [
      { label: "Kết quả & phân tích", href: "/analysis/failures" },
      { label: "Dữ liệu CARLA", href: "/analysis/carla" },
      { label: "Độ nhạy tham số", note: `${SOON} (SHAP)` },
      { label: "Tương tác tham số", note: SOON },
      { label: "Tra cứu lịch sử", note: SOON },
    ],
  },
  { key: "optimization", label: "Tối ưu hóa", icon: barsIcon, note: `${SOON} (FE-13)` },
  {
    key: "validation",
    label: "Kiểm định",
    icon: svgIcon("/vehicsim/icon-check.svg"),
    prefix: "/validation",
    children: [
      { label: "Kiểm thử hồi quy", href: "/validation/regression" },
      { label: "Khuyến nghị", href: "/validation/recommendations" },
      { label: "Lịch sử quyết định", href: "/validation/decisions" },
      { label: "Kho tri thức", note: SOON },
    ],
  },
  {
    key: "workspace",
    label: "Workspace",
    icon: peopleIcon,
    href: "/workspace",
    prefix: "/workspace",
    roles: WORKSPACE_ROLES,
  },
  {
    key: "my-work",
    label: "Nhiệm vụ & báo cáo",
    icon: taskIcon,
    href: "/my-work",
    prefix: "/my-work",
    roles: MEMBER_ROLES,
  },
  { key: "admin", label: "Quản trị", icon: svgIcon("/vehicsim/icon-sliders.svg"), prefix: "/admin", roles: ["ADMIN"], children: [{ label: "Tổng quan quản trị", href: "/admin" }, { label: "Tài khoản", href: "/admin/users" }, { label: "Workspace", href: "/admin/workspaces" }, { label: "Tài liệu kỹ thuật", href: "/admin/tech-references" }] },
];

const lucideIcon = (Icon: typeof House) => <Icon aria-hidden className="size-[18px] text-vehicsim-muted" />;

function matches(href: string | undefined, pathname: string, search: URLSearchParams): boolean {
  if (!href) return false;
  const [path, query] = href.split("?");
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  return !query || [...new URLSearchParams(query)].every(([key, value]) => search.get(key) === value);
}

function NavGroups({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const best = groups
    .flatMap((g) => g.children ?? [])
    .filter((c) => matches(c.href, pathname, search))
    .sort((x, y) => (y.href?.length ?? 0) - (x.href?.length ?? 0))[0];

  return (
    <nav aria-label="Điều hướng VehicSim" className="flex flex-col gap-0.5">
      {groups.map((g) => {
        const here = g.active ?? (!!g.prefix && (g.exact ? pathname === g.prefix : pathname.startsWith(g.prefix)));
        const expanded = here || (!!best && !!g.children?.includes(best));
        const header = (
          <span
            className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 ${expanded ? "bg-vehicsim-primary-bg" : ""} ${
              g.note ? "opacity-55" : "hover:bg-vehicsim-soft"
            }`}
          >
            {g.icon}
            {g.hint ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`text-[14px] ${expanded ? "font-bold" : "font-semibold"} text-vehicsim-ink`}>{g.label}</span>
                <span className="truncate text-[12px] text-vehicsim-muted">{g.hint}</span>
              </span>
            ) : (
              <span className={`flex-1 text-[13px] ${expanded ? "font-bold text-vehicsim-primary" : "font-medium text-vehicsim-ink"}`}>
                {g.label}
              </span>
            )}
            {g.children && (
              expanded
                ? <ChevronDown aria-hidden className="size-3.5 shrink-0 text-vehicsim-primary" />
                : <ChevronRight aria-hidden className="size-3.5 shrink-0 text-vehicsim-faint" />
            )}
          </span>
        );
        const target = g.href ?? g.children?.find((c) => c.href)?.href;
        return (
          <div key={g.key} className="flex flex-col gap-[2px]">
            {(g.key === "SCENARIO" || (g.key === "vehicles" && groups.some((item) => item.key === "SCENARIO"))) && (
              <p className="mt-2 border-t border-vehicsim-line px-2.5 pb-0.5 pt-2.5 text-xs font-semibold text-vehicsim-muted">
                {g.key === "SCENARIO" ? "Quy trình kiểm thử" : "Quản lý dự án"}
              </p>
            )}
            {g.note ? (
              <span title={g.note} className="cursor-not-allowed">
                {header}
              </span>
            ) : target ? (
              <Link href={target} aria-current={here ? "page" : undefined}>
                {header}
              </Link>
            ) : (
              <span className="cursor-not-allowed">{header}</span>
            )}
            {expanded && g.children && (
              <div className="flex pb-1 pl-5 pt-[2px]">
                <div className="flex min-w-0 flex-1 flex-col gap-[2px] border-l-[1.5px] border-solid border-vehicsim-line pl-[10px]">
                  {g.children.map((c) => {
                    const active = best === c;
                    const cls = `flex w-full items-center rounded-md px-3 py-2 text-[13px] ${
                      active ? "bg-vehicsim-primary-bg font-semibold text-vehicsim-primary" : "font-medium text-vehicsim-muted"
                    }`;
                    return c.href ? (
                      <Link key={c.label} href={c.href} aria-current={active ? "page" : undefined} className={`${cls} ${active ? "" : "hover:bg-vehicsim-soft"}`}>
                        {c.label}
                      </Link>
                    ) : (
                      <span key={c.label} title={c.note} className={`${cls} cursor-not-allowed opacity-55`}>
                        {c.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function TeamNav({ role }: { role: string }) {
  const [personal, setPersonal] = useState(0);

  useEffect(() => {
    vehicsimApi
      .projects()
      .then((list) => setPersonal(list.active_count + list.archived_count))
      .catch(() => setPersonal(0));
  }, []);

  const groups = GROUPS.filter((g) => !g.roles || g.roles.includes(role));
  const reviewer = role === "REVIEWER";
  const team = reviewer || role === "ENGINEER";
  const stepLinks = teamJourneyLinks(reviewer);
  const steps: Group[] = JOURNEY_STEPS.map(({ key, n, title }) => ({
    key,
    label: title,
    icon: <StepStatusIcon status="TODO" n={n} size="sm" />,
    children: stepLinks[key],
  }));
  const navigation = team ? [
    ...groups.filter((g) => g.key === "dashboard"),
    ...steps,
    ...groups.filter((g) => ["vehicles", "workspace", "my-work"].includes(g.key)),
  ] : groups;
  const personalGroup: Group = { key: "personal", label: `Project cá nhân (${personal})`, icon: lucideIcon(FolderOpen), href: "/projects", prefix: "/projects" };
  return <NavGroups groups={personal > 0 ? [...navigation, personalGroup] : navigation} />;
}

function TeamProjectContext({ reviewer }: { reviewer: boolean }) {
  const { ctx, selectProject } = useVehicSimContext();
  if (!ctx) return null;

  return (
    <div className={cx(PROJECT_CONTEXT_CLASS, "flex flex-col gap-2")}>
      <div className="flex items-center gap-3">
        <ProjectIdentity project={ctx.project} label="Project đang mở" fallback="Chưa có project" />
      </div>
      {reviewer && ctx.reviewer_projects.length > 1 && (
        <select
          aria-label="Project đang xem"
          value={ctx.project.id}
          className="w-full rounded-lg border border-vehicsim-line-strong bg-vehicsim-surface px-2 py-2 text-[12px]"
          onChange={(event) => selectProject(Number(event.target.value))}
        >
          {ctx.reviewer_projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.workspace_name} · {project.name}{project.can_decide ? "" : " (chỉ xem)"}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ExperiencerNav() {
  const pathname = usePathname();
  const { ctx } = useVehicSimContext();
  const { journey } = useJourney();
  const id = ctx?.project.id ?? null;
  const common: Group[] = [
    { key: "vehicles", label: "Phương tiện", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
    { key: "projects", label: "Project của tôi", icon: lucideIcon(FolderOpen), href: "/projects", active: pathname === "/projects" || pathname === "/projects/new" },
  ];
  if (id === null) return <NavGroups groups={common} />;

  const home = `/projects/${id}`;
  const last = journey?.counts.last_regression_id ?? null;
  const step = (key: JourneyStepKey, n: number, label: string, children: Child[], active?: boolean): Group => ({
    key,
    label,
    active,
    icon: journey ? <StepStatusIcon status={statusOf(journey, key)} n={n} current={journey.next === key} size="sm" /> : null,
    hint: journey ? stepSummary(key, journey) : undefined,
    children,
  });
  const groups: Group[] = [
    { key: "home", label: "Trang chủ project", icon: lucideIcon(House), href: home, active: pathname === home },
    step("SCENARIO", 1, "Thiết kế kịch bản", [
      { label: "Kịch bản mẫu", href: `${home}/start` },
      { label: "Sinh từ mô tả", href: "/scenarios/new" },
      { label: "Nhập tham số", href: "/scenarios?new=1" },
    ]),
    step("BASELINE", 2, "Chạy baseline", [
      { label: "Họ kịch bản & chạy baseline", href: "/scenarios" },
      { label: "Dữ liệu CARLA", href: "/analysis/carla" },
    ]),
    step("RESULTS", 3, "Xem kết quả", [
      { label: "Tóm tắt kết quả", href: `${home}/results` },
      { label: "Phân tích chi tiết", href: "/analysis/failures" },
    ]),
    step("IMPROVE", 4, "Cải tiến AEB", [
      { label: "Chọn cách cải tiến", href: `${home}/improve` },
      { label: "Tối ưu tự động (MOBO)", href: "/aeb" },
      { label: "Chỉnh tay", href: "/aeb?tab=manual" },
      { label: "Phiên bản AEB", href: "/aeb?tab=versions" },
    ]),
    step("VERIFY", 5, "Kiểm chứng", [
      { label: "Kiểm thử hồi quy", href: "/validation/regression" },
      { label: "Tạo kiểm thử", href: "/validation/regression/new" },
      ...(last === null ? [] : [{ label: "Kết luận vòng", href: `${home}/rounds/${last}` }]),
    ], pathname.startsWith(`${home}/rounds/`) || undefined),
    ...common,
    { key: "settings", label: "Cài đặt project", icon: lucideIcon(Settings), href: `${home}/settings`, active: pathname === `${home}/settings` },
  ];
  return <NavGroups groups={groups} />;
}

export function VehicSimSidebar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <aside className="flex flex-col gap-4 px-4 py-5 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto">
      {user?.roleCode === "EXPERIENCER" ? (
        <>
          <ProjectSwitcher />
          <ExperiencerNav />
        </>
      ) : (
        <>
          {(user?.roleCode === "ENGINEER" || user?.roleCode === "REVIEWER") && <TeamProjectContext reviewer={user.roleCode === "REVIEWER"} />}
          <TeamNav role={user?.roleCode ?? ""} />
        </>
      )}

      <div className="border-t border-vehicsim-line pt-2">
        <button
          type="button"
          title="Đăng xuất"
          aria-label="Đăng xuất"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-vehicsim-muted hover:bg-vehicsim-soft hover:text-vehicsim-ink"
        >
          <LogOut aria-hidden className="size-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
