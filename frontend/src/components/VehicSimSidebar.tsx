"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, House, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ROLE_LABELS, initials } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { stepSummary, statusOf } from "@/components/project/journey";
import { useJourney } from "@/components/project/ProjectJourneyContext";
import { ProjectSwitcher } from "@/components/project/ProjectShell";
import { StepStatusIcon } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { JourneyStepKey } from "@/types/vehicsim";

/**
 * Sidebar VehicSim theo Figma "VehicSim — FE-12/13/14 UI (Trung)".
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
      { label: "Họ kịch bản", href: "/scenarios" },
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
      { label: "Ca lỗi", href: "/analysis/failures" },
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
  { key: "admin", label: "Quản trị", icon: svgIcon("/vehicsim/icon-sliders.svg"), prefix: "/admin", roles: ["ADMIN"], children: [{ label: "Tài khoản", href: "/admin/users" }, { label: "Workspace", href: "/admin/workspaces" }, { label: "Tài liệu kỹ thuật", href: "/admin/tech-references" }] },
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
    <nav className="flex flex-col gap-[2px]">
      {groups.map((g) => {
        const here = g.active ?? (!!g.prefix && (g.exact ? pathname === g.prefix : pathname.startsWith(g.prefix)));
        const expanded = here || (!!best && !!g.children?.includes(best));
        const header = (
          <span
            className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-[9px] ${expanded ? "bg-vehicsim-bg" : ""} ${
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
              <span className={`flex-1 text-[14px] ${expanded ? "font-bold text-vehicsim-ink" : "font-medium text-vehicsim-muted"}`}>
                {g.label}
              </span>
            )}
            {(g.children || g.href || g.note) && (
              <span className={`font-semibold ${expanded ? "text-[13px] text-vehicsim-ink" : "text-[16px] text-vehicsim-faint"}`}>
                {expanded ? "▾" : "›"}
              </span>
            )}
          </span>
        );
        const target = g.href ?? g.children?.find((c) => c.href)?.href;
        return (
          <div key={g.key} className="flex flex-col gap-[2px]">
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
                    const cls = `flex w-full items-center rounded-full px-3 py-2 text-[13px] ${
                      active ? "bg-vehicsim-ink font-semibold text-white" : "font-medium text-vehicsim-muted"
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
  const personalGroup: Group = { key: "personal", label: `Project cá nhân (${personal})`, icon: lucideIcon(FolderOpen), href: "/projects", prefix: "/projects" };
  return <NavGroups groups={personal > 0 ? [...groups, personalGroup] : groups} />;
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

export function VehicSimSidebar({ hideOnMobile = false }: { hideOnMobile?: boolean }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <aside className={`${hideOnMobile ? "hidden md:flex" : "flex"} sticky top-0 print:hidden h-screen w-[248px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-solid border-vehicsim-line bg-white px-4 py-6`}>
      <Link href="/" className="flex items-center gap-[10px] px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
        <img alt="" src="/vehicsim/logo.svg" width={28} height={28} className="size-7" />
        <span className="text-[19px] font-extrabold tracking-[-0.38px] text-vehicsim-ink">VehicSim</span>
      </Link>

      {user?.roleCode === "EXPERIENCER" ? (
        <>
          <ProjectSwitcher />
          <ExperiencerNav />
        </>
      ) : (
        <TeamNav role={user?.roleCode ?? ""} />
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-[10px] rounded-[16px] bg-vehicsim-soft p-3">
        <Link href="/profile" title="Hồ sơ cá nhân" className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[12px] hover:opacity-80">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[16px] bg-vehicsim-avatar text-[12px] font-bold text-vehicsim-decision">
            {initials(user?.full_name || user?.name || "U")}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="truncate text-[13px] font-semibold text-vehicsim-ink">{user?.full_name || user?.name}</span>
            <span className="truncate text-[12px] text-vehicsim-faint">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</span>
          </span>
        </Link>
        <button
          type="button"
          title="Đăng xuất"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-vehicsim-faint hover:bg-white hover:text-vehicsim-ink"
        >
          ⎋
        </button>
      </div>
    </aside>
  );
}
