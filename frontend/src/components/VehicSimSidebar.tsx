"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, FolderOpen, House, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { cx } from "@/components/VehicSimUi";
import { MEMBER_ROLES, WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { JOURNEY_STEPS, isVerifyEvidence, stepSummary, statusOf } from "@/components/project/journey";
import { useJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectSwitcher } from "@/components/project/ProjectShell";
import { PROJECT_CONTEXT_CLASS, ProjectIdentity, StepStatusIcon } from "@/components/project/ProjectUi";
import { teamJourneyLinks } from "@/components/vehicsimFlow";
import { vehicsimApi } from "@/services/vehicsim";
import type { JourneyStepKey } from "@/types/vehicsim";

/**
 * Điều hướng theo project và vai trò của tài khoản.
 * Thiết kế Sidebar rõ ràng, nổi bật, độ tương phản cao, định vị chính xác trang hiện tại.
 */

type Child = { label: string; href?: string; note?: string; matchPaths?: string[] };
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
  defaultExpanded?: boolean;
};

type NavSection = {
  id: string;
  title?: string;
  groups: Group[];
};

const svgIcon = (src: string) => (
  // eslint-disable-next-line @next/next/no-img-element -- icon SVG tĩnh lấy từ Figma
  <img alt="" src={src} width={18} height={18} className="block size-[18px] shrink-0 brightness-150 contrast-125" />
);

const gridIcon = (
  <span className="relative block size-[18px] shrink-0">
    {[
      "left-[1.5px] top-[1.5px]",
      "left-[10px] top-[1.5px]",
      "left-[1.5px] top-[10px]",
      "left-[10px] top-[10px]",
    ].map((pos) => (
      <span key={pos} className={`absolute ${pos} size-[6.5px] rounded-[2px] border-[1.6px] border-solid border-current`} />
    ))}
  </span>
);

const barsIcon = (
  <span className="relative block size-[18px] shrink-0">
    <span className="absolute left-[2px] top-[10px] h-[6.5px] w-[3.4px] rounded-[1px] bg-current" />
    <span className="absolute left-[7.3px] top-[6px] h-[10.5px] w-[3.4px] rounded-[1px] bg-current" />
    <span className="absolute left-[12.6px] top-[2px] h-[14.5px] w-[3.4px] rounded-[1px] bg-current" />
  </span>
);

const peopleIcon = (
  <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="none" className="block size-[18px] shrink-0">
    <circle cx="6.5" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M1.8 15c.5-2.6 2.4-4 4.7-4s4.2 1.4 4.7 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12.6" cy="6.6" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12.4 10.9c2 .1 3.4 1.3 3.8 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const taskIcon = (
  <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="none" className="block size-[18px] shrink-0">
    <rect x="2.5" y="2.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 9.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SOON = "Chưa có trong đợt MVP";

const GROUPS: Group[] = [
  { key: "dashboard", label: "Tổng quan", icon: gridIcon, href: "/", prefix: "/", exact: true },
  { key: "vehicles", label: "Phương tiện & Cấu hình", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
  {
    key: "scenarios",
    label: "Kịch bản",
    icon: svgIcon("/vehicsim/icon-route.svg"),
    prefix: "/scenarios",
    exact: true,
    children: [
      { label: "Danh sách họ kịch bản", href: "/scenarios" },
      { label: "Sinh từ mô tả", href: "/scenarios/new" },
      { label: "Nhập tham số", href: "/scenarios?new=1" },
    ],
  },
  {
    key: "simulation",
    label: "Chạy baseline",
    icon: svgIcon("/vehicsim/icon-play.svg"),
    prefix: "/scenarios/run",
    children: [
      { label: "Chạy baseline", href: "/scenarios/run" },
      { label: "Dữ liệu CARLA", href: "/analysis/carla" },
    ],
  },
  {
    key: "aeb",
    label: "Phanh khẩn cấp (AEB)",
    icon: svgIcon("/vehicsim/icon-shield.svg"),
    prefix: "/aeb",
    children: [
      { label: "Tổng quan cải tiến", href: "/aeb" },
      { label: "Tối ưu tự động (MOBO)", href: "/aeb/mobo" },
      { label: "Chỉnh tay tham số", href: "/aeb/manual" },
      { label: "Danh sách phiên bản", href: "/aeb/versions", matchPaths: ["/aeb/candidates"] },
      { label: "Đối chiếu thông số", href: "/aeb/compare" },
    ],
  },
  {
    key: "analysis",
    label: "Phân tích kết quả",
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
    label: "Workspace nhóm",
    icon: peopleIcon,
    href: "/workspace",
    prefix: "/workspace",
    roles: WORKSPACE_ROLES,
  },
  {
    key: "my-work",
    label: "Nhiệm vụ & Báo cáo",
    icon: taskIcon,
    href: "/my-work",
    prefix: "/my-work",
    roles: MEMBER_ROLES,
  },
  {
    key: "admin",
    label: "Quản trị hệ thống",
    icon: svgIcon("/vehicsim/icon-sliders.svg"),
    prefix: "/admin",
    roles: ["ADMIN"],
    defaultExpanded: true,
    children: [
      { label: "Tài khoản", href: "/admin/users" },
      { label: "Workspace", href: "/admin/workspaces" },
      { label: "Tài liệu kỹ thuật", href: "/admin/tech-references" },
    ],
  },
];

const lucideIcon = (Icon: typeof House) => <Icon aria-hidden className="size-[18px] shrink-0 text-current" />;

/**
 * Tính điểm khớp độ cụ thể của href đối với pathname và search params hiện tại.
 * Đảm bảo phân biệt chính xác tuyệt đối giữa các biến thể như:
 * /scenarios vs /scenarios?new=1 vs /scenarios/run vs /scenarios/new
 */
export function getMatchScore(
  href: string | undefined,
  pathname: string,
  search: URLSearchParams
): number {
  if (!href) return 0;
  const [targetPath, queryString] = href.split("?");
  const targetParams = new URLSearchParams(queryString || "");
  const hasTargetQuery = queryString !== undefined && queryString.length > 0;

  // 1. Khớp chính xác pathname
  if (pathname === targetPath) {
    if (hasTargetQuery) {
      // Bắt buộc khớp tất cả query params đã chỉ định
      const allMatch = Array.from(targetParams.entries()).every(
        ([key, val]) => search.get(key) === val
      );
      if (allMatch) {
        return 120 + targetParams.size * 10;
      }
      return 0; // Đường dẫn đích yêu cầu query nhưng URL hiện tại không có
    } else {
      // Đích không có query: nếu search params cũng rỗng -> khớp tuyệt đối 100 điểm
      if (search.toString().length === 0) {
        return 100;
      }
      // Nếu URL có query phân nhánh (vd: ?new=1), URL đích không query chỉ nhận 75 để nhường ưu tiên
      return 75;
    }
  }

  // 2. Khớp subpath (vd: /aeb/mobo khớp với /aeb/mobo/123)
  if (pathname.startsWith(`${targetPath}/`)) {
    if (targetPath === "/" || targetPath === "") return 0;
    return 50 + targetPath.length;
  }

  return 0;
}

interface NavGroupsProps {
  groups?: Group[];
  sections?: NavSection[];
}

function NavGroups({ groups, sections }: NavGroupsProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const navSections: NavSection[] = sections ?? (groups ? [{ id: "default", groups }] : []);
  const allGroups = navSections.flatMap((s) => s.groups);

  // Tìm child có điểm khớp cao nhất trong tất cả các nhóm
  const candidateChildren = allGroups
    .flatMap((g) =>
      (g.children ?? []).map((c) => {
        let score = getMatchScore(c.href, pathname, search);
        if (score === 0 && c.matchPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
          score = 60;
        }
        return {
          child: c,
          groupKey: g.key,
          score,
        };
      })
    )
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestChild = candidateChildren[0]?.child ?? null;
  const activeGroupKey = candidateChildren[0]?.groupKey ?? null;

  return (
    <nav aria-label="Điều hướng VehicSim" className="flex flex-col gap-3">
      {navSections.map((sec, secIdx) => (
        <div key={sec.id} className="flex flex-col gap-1">
          {sec.title && (
            <div className={`flex items-center gap-2 px-3 pb-2 pt-1 ${secIdx > 0 ? "mt-3 border-t border-slate-800/80 pt-3.5" : ""}`}>
              <span className="h-3.5 w-1 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[12px] font-black tracking-wider text-slate-200 uppercase">
                {sec.title}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            {sec.groups.map((g) => {
              const hasChildren = Boolean(g.children && g.children.length > 0);
              const isChildActive = activeGroupKey === g.key;
              const directGroupScore = getMatchScore(g.href, pathname, search);
              const isDirectActive = g.active ?? (!hasChildren && directGroupScore > 0);

              // Tự động mở nhóm nếu có child đang active hoặc trực tiếp active
              const isExpanded = expandedKeys[g.key] !== undefined
                ? expandedKeys[g.key]
                : (isChildActive || isDirectActive || Boolean(g.defaultExpanded));

              const isHighlighted = isDirectActive || isChildActive;

              const header = (
                <div
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] transition-all duration-150 ${
                    isDirectActive
                      ? "relative bg-emerald-500/25 font-black text-emerald-300 shadow-sm before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[4px] before:rounded-r-full before:bg-emerald-400"
                      : isChildActive
                      ? "bg-white/10 font-extrabold text-white shadow-xs"
                      : "font-bold text-slate-100 hover:bg-white/10 hover:text-white"
                  } ${g.note ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span className={`shrink-0 ${isDirectActive ? "text-emerald-400" : isChildActive ? "text-white" : "text-slate-300"}`}>
                    {g.icon}
                  </span>

                  {g.hint ? (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`text-[14.5px] leading-snug ${isHighlighted ? "font-black text-white" : "font-bold text-slate-100"}`}>
                        {g.label}
                      </span>
                      <span className="truncate text-[12px] font-medium text-slate-400">{g.hint}</span>
                    </span>
                  ) : (
                    <span className={`flex-1 leading-snug ${isDirectActive ? "font-black text-emerald-300" : isChildActive ? "font-extrabold text-white" : "font-bold text-slate-100"}`}>
                      {g.label}
                    </span>
                  )}

                  {hasChildren && (
                    <button
                      type="button"
                      aria-label={`${isExpanded ? "Thu gọn" : "Mở rộng"} ${g.label}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedKeys((prev) => ({ ...prev, [g.key]: !isExpanded }));
                      }}
                      className="grid size-6 place-items-center rounded-md hover:bg-white/15 text-slate-300 hover:text-white"
                    >
                      {isExpanded ? (
                        <ChevronDown aria-hidden className={`size-4 shrink-0 ${isHighlighted ? "text-emerald-400 stroke-[2.5]" : "text-slate-300"}`} />
                      ) : (
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>
              );

              const target = g.href ?? g.children?.find((c) => c.href)?.href;

              return (
                <div key={g.key} className="flex flex-col">
                  {g.note ? (
                    <span title={g.note} className="cursor-not-allowed">
                      {header}
                    </span>
                  ) : target && !hasChildren ? (
                    <Link href={target} aria-current={isDirectActive ? "page" : undefined}>
                      {header}
                    </Link>
                  ) : hasChildren ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedKeys((prev) => ({ ...prev, [g.key]: !isExpanded }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedKeys((prev) => ({ ...prev, [g.key]: !isExpanded }));
                        }
                      }}
                      className="cursor-pointer select-none"
                    >
                      {header}
                    </div>
                  ) : (
                    <span className="cursor-not-allowed">{header}</span>
                  )}

                  {/* Submenu con */}
                  {isExpanded && g.children && (
                    <div className="flex pb-1.5 pl-4 pt-1">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 border-l-2 border-slate-700/80 pl-3">
                        {g.children.map((c) => {
                          const active = bestChild === c;
                          return c.href ? (
                            <Link
                              key={c.label}
                              href={c.href}
                              aria-current={active ? "page" : undefined}
                              className={`relative flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors duration-150 ${
                                active
                                  ? "bg-emerald-500/25 font-black text-emerald-300 shadow-xs before:absolute before:-left-[14px] before:bottom-1.5 before:top-1.5 before:w-[4px] before:rounded-full before:bg-emerald-400"
                                  : "group font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <span
                                className={`shrink-0 rounded-full transition-colors ${
                                  active
                                    ? "size-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                                    : "size-1.5 bg-slate-500 group-hover:bg-slate-300"
                                }`}
                              />
                              <span className="flex-1 leading-snug">{c.label}</span>
                            </Link>
                          ) : (
                            <span
                              key={c.label}
                              title={c.note}
                              className="flex min-h-[38px] w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold text-slate-500 opacity-60"
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-slate-700" />
                              <span className="flex-1 leading-snug">{c.label}</span>
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-400">
                                Sắp có
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function TeamNav({ role }: { role: string }) {
  const [personal, setPersonal] = useState(0);
  const { ctx } = useVehicSimContext();
  const pathname = usePathname();
  const search = useSearchParams();
  const verifyEvidence = isVerifyEvidence(pathname, search.get("returnTo"));

  useEffect(() => {
    if (role === "MANAGER" || role === "ADMIN") return;
    vehicsimApi
      .projects()
      .then((list) => setPersonal(list.active_count + list.archived_count))
      .catch(() => setPersonal(0));
  }, [role, ctx?.project.id]);

  const reviewer = role === "REVIEWER";
  const team = reviewer || role === "ENGINEER";
  const stepLinks = teamJourneyLinks(reviewer);
  const steps: Group[] = JOURNEY_STEPS.map(({ key, n, title }) => ({
    key,
    label: title,
    icon: <StepStatusIcon status="TODO" n={n} size="sm" />,
    children: stepLinks[key],
    // Cùng luật với thanh bước (stepOfPath): bằng chứng mở từ trang kiểm chứng thuộc bước ⑤.
    active: verifyEvidence ? key === "VERIFY" : undefined,
  }));

  const personalGroup: Group = {
    key: "personal",
    label: `${role === "ENGINEER" ? "Project của tôi" : "Project cá nhân"} (${personal})`,
    icon: lucideIcon(FolderOpen),
    href: "/projects",
    prefix: "/projects",
  };

  const sections: NavSection[] = role === "ADMIN"
    ? [{
        id: "admin",
        title: "Hệ thống & Quản trị",
        groups: GROUPS.filter((g) => g.key === "admin"),
      }]
    : role === "MANAGER"
    ? [
        {
          id: "general",
          title: "Tổng quan & Thiết bị",
          groups: GROUPS.filter((g) => g.key === "vehicles"),
        },
        {
          id: "workspace",
          title: "Hệ thống & Quản trị",
          groups: GROUPS.filter((g) => g.key === "workspace"),
        },
      ]
    : team
    ? [
        {
          id: "general",
          title: "Tổng quan & Thiết bị",
          groups: [
            { key: "dashboard", label: "Tổng quan", icon: gridIcon, href: "/", prefix: "/", exact: true },
            { key: "vehicles", label: "Phương tiện & Cấu hình", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
          ],
        },
        {
          id: "workflow",
          title: "Quy trình kiểm thử (5 bước)",
          groups: steps,
        },
        {
          id: "workspace",
          title: "Không gian làm việc",
          groups: [
            { key: "workspace", label: "Workspace nhóm", icon: peopleIcon, href: "/workspace", prefix: "/workspace" },
            { key: "my-work", label: "Nhiệm vụ & Báo cáo", icon: taskIcon, href: "/my-work", prefix: "/my-work" },
            ...(role === "ENGINEER" || personal > 0 ? [personalGroup] : []),
          ],
        },
      ]
    : [
        {
          id: "general",
          title: "Tổng quan & Thiết bị",
          groups: GROUPS.filter((g) => ["dashboard", "vehicles"].includes(g.key)),
        },
        {
          id: "simulation",
          title: "Chức năng mô phỏng & AEB",
          groups: GROUPS.filter((g) =>
            ["scenarios", "simulation", "aeb", "analysis", "optimization", "validation"].includes(g.key)
          ),
        },
        {
          id: "workspace",
          title: "Hệ thống & Quản trị",
          groups: GROUPS.filter((g) => ["workspace", "my-work", "admin"].includes(g.key)),
        },
      ];

  return <NavGroups sections={sections} />;
}

function TeamProjectContext({ reviewer }: { reviewer: boolean }) {
  const { ctx, selectProject } = useVehicSimContext();
  if (!ctx) return null;

  return (
    <div className={cx(PROJECT_CONTEXT_CLASS, "flex flex-col gap-2")}>
      <div className="flex items-center gap-3">
        <ProjectIdentity project={ctx.project} label="Project đang mở" fallback="Chưa có project" />
      </div>
      {ctx.reviewer_projects.length > 1 && (
        <select
          aria-label="Project đang xem"
          value={ctx.project.id}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[12px] font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          onChange={(event) => selectProject(Number(event.target.value))}
        >
          {ctx.reviewer_projects.map((project) => (
            <option key={project.id} value={project.id} className="bg-slate-900 text-slate-200">
              {project.workspace_name} · {project.name}{project.can_decide ? "" : reviewer ? " (chỉ xem)" : " (lưu trữ)"}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ExperiencerNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const verifyEvidence = isVerifyEvidence(pathname, search.get("returnTo"));
  const { ctx } = useVehicSimContext();
  const { journey } = useJourney();
  const id = ctx?.project.id ?? null;

  if (id === null) {
    const common: Group[] = [
      { key: "vehicles", label: "Phương tiện & Cấu hình", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
      { key: "projects", label: "Project của tôi", icon: lucideIcon(FolderOpen), href: "/projects", active: pathname === "/projects" || pathname === "/projects/new" },
    ];
    return <NavGroups groups={common} />;
  }

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
  const sections: NavSection[] = [
    {
      id: "overview",
      title: "Tổng quan Project",
      groups: [
        { key: "home", label: "Trang chủ project", icon: lucideIcon(House), href: home, active: pathname === home },
        { key: "vehicles", label: "Phương tiện & Cấu hình", icon: svgIcon("/vehicsim/icon-car.svg"), href: "/vehicles", prefix: "/vehicles" },
      ],
    },
    {
      id: "journey",
      title: "Hành trình kiểm thử (5 bước)",
      groups: [
        step("SCENARIO", 1, "Thiết kế kịch bản", [
          { label: "Kịch bản mẫu", href: `${home}/start` },
          { label: "Danh sách họ kịch bản", href: "/scenarios" },
          { label: "Sinh từ mô tả", href: "/scenarios/new" },
          { label: "Nhập tham số", href: "/scenarios?new=1" },
        ]),
        step("BASELINE", 2, "Chạy baseline", [
          { label: "Chạy baseline", href: "/scenarios/run" },
          { label: "Dữ liệu CARLA", href: "/analysis/carla" },
        ]),
        step("RESULTS", 3, "Xem kết quả", [
          { label: "Tóm tắt kết quả", href: `${home}/results` },
          { label: "Phân tích chi tiết", href: "/analysis/failures" },
        ], verifyEvidence ? false : undefined),
        step("IMPROVE", 4, "Cải tiến AEB", [
          { label: "Tổng quan cải tiến", href: "/aeb" },
          { label: "Tối ưu tự động (MOBO)", href: "/aeb/mobo" },
          { label: "Chỉnh tay tham số", href: "/aeb/manual" },
          { label: "Danh sách phiên bản", href: "/aeb/versions", matchPaths: ["/aeb/candidates"] },
          { label: "Đối chiếu thông số", href: "/aeb/compare" },
        ]),
        step(
          "VERIFY",
          5,
          "Kiểm chứng",
          [
            { label: "Kiểm thử hồi quy", href: "/validation/regression" },
            { label: "Tạo kiểm thử", href: "/validation/regression/new" },
            ...(last === null ? [] : [{ label: "Kết luận vòng", href: `${home}/rounds/${last}` }]),
          ],
          pathname.startsWith(`${home}/rounds/`) || verifyEvidence || undefined
        ),
      ],
    },
    {
      id: "system",
      title: "Hệ thống & Cài đặt",
      groups: [
        { key: "projects", label: "Project của tôi", icon: lucideIcon(FolderOpen), href: "/projects", active: pathname === "/projects" || pathname === "/projects/new" },
        { key: "settings", label: "Cài đặt project", icon: lucideIcon(Settings), href: `${home}/settings`, active: pathname === `${home}/settings` },
      ],
    },
  ];

  return <NavGroups sections={sections} />;
}

export function VehicSimSidebar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <aside className="flex flex-col gap-4 px-3.5 py-4 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto">
      {user?.roleCode === "EXPERIENCER" ? (
        <>
          <ProjectSwitcher />
          <ExperiencerNav />
        </>
      ) : (
        <>
          {(user?.roleCode === "ENGINEER" || user?.roleCode === "REVIEWER") && (
            <TeamProjectContext reviewer={user.roleCode === "REVIEWER"} />
          )}
          <TeamNav role={user?.roleCode ?? ""} />
        </>
      )}

      <div className="border-t border-slate-800 pt-2.5">
        <button
          type="button"
          title="Đăng xuất khỏi phiên làm việc"
          aria-label="Đăng xuất"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-[14px] font-bold text-slate-300 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
        >
          <LogOut aria-hidden className="size-4.5 shrink-0" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
