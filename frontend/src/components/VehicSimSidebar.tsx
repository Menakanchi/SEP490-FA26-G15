"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS, initials } from "@/components/VehicSimUi";

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

const SOON = "Chưa có trong đợt MVP";

const GROUPS: Group[] = [
  { key: "dashboard", label: "Tổng quan", icon: gridIcon, href: "/", prefix: "/", exact: true },
  { key: "vehicles", label: "Phương tiện", icon: svgIcon("/vehicsim/icon-car.svg"), note: `${SOON} (FE-05)` },
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
  { key: "admin", label: "Quản trị", icon: svgIcon("/vehicsim/icon-sliders.svg"), note: `${SOON} (FE-10)` },
];

export function VehicSimSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <aside className="sticky top-0 flex print:hidden h-screen w-[248px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-solid border-vehicsim-line bg-white px-4 py-6">
      <Link href="/" className="flex items-center gap-[10px] px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
        <img alt="" src="/vehicsim/logo.svg" width={28} height={28} className="size-7" />
        <span className="text-[19px] font-extrabold tracking-[-0.38px] text-vehicsim-ink">VehicSim</span>
      </Link>

      <nav className="flex flex-col gap-[2px]">
        {GROUPS.map((g) => {
          const open = !!g.prefix && (g.exact ? pathname === g.prefix : pathname.startsWith(g.prefix));
          const header = (
            <span
              className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-[9px] ${open ? "bg-vehicsim-bg" : ""} ${
                g.note ? "opacity-55" : "hover:bg-vehicsim-soft"
              }`}
            >
              {g.icon}
              <span className={`flex-1 text-[14px] ${open ? "font-bold text-vehicsim-ink" : "font-medium text-vehicsim-muted"}`}>
                {g.label}
              </span>
              {(g.children || g.href || g.note) && (
                <span className={`font-semibold ${open ? "text-[13px] text-vehicsim-ink" : "text-[16px] text-vehicsim-faint"}`}>
                  {open ? "▾" : "›"}
                </span>
              )}
            </span>
          );
          const target = g.href ?? g.children?.find((c) => c.href)?.href;
          return (
            <div key={g.key} className="flex flex-col gap-[2px]">
              {g.note || !target ? (
                <span title={g.note} className="cursor-not-allowed">
                  {header}
                </span>
              ) : (
                <Link href={target}>{header}</Link>
              )}
              {open && g.children && (
                <div className="flex pb-1 pl-5 pt-[2px]">
                  <div className="flex flex-1 flex-col gap-[2px] border-l-[1.5px] border-solid border-vehicsim-line pl-[10px]">
                    {g.children.map((c, _i, all) => {
                      // Mục con khớp dài nhất mới sáng: /scenarios/new không làm sáng /scenarios.
                      const matches = (href?: string) => !!href && (pathname === href || pathname.startsWith(`${href}/`));
                      const best = all.filter((x) => matches(x.href)).sort((x, y) => (y.href?.length ?? 0) - (x.href?.length ?? 0))[0];
                      const active = best === c;
                      const cls = `flex w-full items-center rounded-full px-3 py-2 text-[13px] ${
                        active ? "bg-vehicsim-ink font-semibold text-white" : "font-medium text-vehicsim-muted"
                      }`;
                      return c.href ? (
                        <Link key={c.label} href={c.href} className={`${cls} ${active ? "" : "hover:bg-vehicsim-soft"}`}>
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

      <div className="flex-1" />

      <div className="flex items-center gap-[10px] rounded-[16px] bg-vehicsim-soft p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[16px] bg-vehicsim-avatar text-[12px] font-bold text-vehicsim-decision">
          {initials(user?.full_name || user?.name || "U")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-semibold text-vehicsim-ink">{user?.full_name || user?.name}</span>
          <span className="truncate text-[12px] text-vehicsim-faint">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</span>
        </span>
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
