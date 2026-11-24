"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Menu, Search, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext, VehicSimContextProvider } from "@/components/VehicSimContext";
import { NotificationBell } from "@/components/NotificationBell";
import { VehicSimSidebar } from "@/components/VehicSimSidebar";
import { ProjectGate } from "@/components/project/ProjectShell";
import { ProjectJourneyProvider } from "@/components/project/ProjectJourneyContext";
import { initials, ROLE_LABELS } from "@/components/VehicSimUi";
import { jakarta } from "@/components/vehicsimFonts";

/** Khung chung cho các trang sau đăng nhập. */
export function VehicSimShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className={`${jakarta.className} flex min-h-dvh w-full items-center justify-center bg-vehicsim-bg`}>
        <Loader2 aria-label="Đang tải phiên đăng nhập" className="size-6 motion-safe:animate-spin text-vehicsim-muted" />
      </div>
    );
  }

  return (
    <VehicSimContextProvider>
      <ProjectJourneyProvider>
        <WorkspaceFrame>{children}</WorkspaceFrame>
      </ProjectJourneyProvider>
    </VehicSimContextProvider>
  );
}

function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const { ctx } = useVehicSimContext();
  const pathname = usePathname();
  const router = useRouter();
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const analysis = pathname === "/analysis/failures" || pathname.startsWith("/analysis/failures/");
  const menuOpen = openMenuPath === pathname;
  const name = user?.full_name || user?.name || "";
  const roleLabel = ROLE_LABELS[role ?? ""];

  function onMenuKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && menuOpen) {
      setOpenMenuPath(null);
      menuButton.current?.focus();
    }
  }

  return (
    <div data-analysis-shell={analysis || undefined} className={`${jakarta.className} vehicsim-shell flex min-h-dvh w-full flex-col bg-vehicsim-bg text-vehicsim-ink`}>
      {/* Trang quản trị dùng chung header và sidebar: bấm Tài khoản / Workspace / Tài liệu kỹ thuật chỉ đổi phần nội dung. */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800 bg-[#0f141c] text-white px-4 py-2 sm:px-6 lg:pl-0 lg:pr-8 print:hidden shadow-sm">
        <a href="#vehicsim-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:p-3 text-white">
          Đến nội dung chính
        </a>
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2.5 font-bold lg:w-[272px] lg:px-6">
          <Image src="/vehicsim/logo.svg" alt="" width={26} height={26} />
          <span className="text-[18px] font-black tracking-tight text-white">VehicSim</span>
        </Link>
        {ctx?.workspace && (
          <span className="hidden min-w-0 max-w-[220px] truncate rounded-md border border-white/10 bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-slate-200 md:block" title={ctx.workspace.name}>
            {ctx.workspace.name}
          </span>
        )}
        <form
          role="search"
          className="order-last flex min-w-0 basis-full items-center rounded-lg border border-slate-700 bg-slate-900/90 text-slate-100 sm:order-none sm:ml-auto sm:basis-auto focus-within:ring-2 focus-within:ring-emerald-500/50"
          onSubmit={(event) => {
            event.preventDefault();
            const run = String(new FormData(event.currentTarget).get("run") ?? "").trim().replace(/^#/, "");
            if (/^\d+$/.test(run)) router.push(`/analysis/failures/${run}`);
          }}
        >
          <input type="search" name="run" aria-label="Mã lượt chạy" placeholder="Tìm lượt chạy, vd. #1023"
            className="h-10 min-w-0 flex-1 rounded-l-lg bg-transparent px-3 text-[13px] text-slate-100 placeholder:text-slate-400 focus:outline-none sm:w-[184px]" />
          <button type="submit" aria-label="Tìm lượt chạy" className="grid size-10 shrink-0 place-items-center rounded-r-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
            <Search aria-hidden className="size-4" />
          </button>
        </form>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <NotificationBell />
          <Link href="/profile" aria-label="Hồ sơ cá nhân" title={name} className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2 text-white hover:bg-white/10 transition-colors sm:px-2.5">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh đại diện người dùng
              <img
                src={user.avatar_url}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover ring-1 ring-white/30"
              />
            ) : (
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-400/40">{initials(name)}</span>
            )}
            <span className="hidden text-xs font-bold text-slate-200 sm:block">{roleLabel}</span>
          </Link>
          <button type="button" ref={menuButton} onKeyDown={onMenuKeyDown}
            aria-expanded={menuOpen} aria-controls="vehicsim-navigation"
            onClick={() => setOpenMenuPath(menuOpen ? null : pathname)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[13px] font-semibold text-slate-200 hover:bg-slate-800 lg:hidden">
            {menuOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
            Menu
          </button>
        </div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <div id="vehicsim-navigation"
          className={`${menuOpen ? "block" : "hidden"} shrink-0 border-b border-slate-800 bg-[#0f141c] text-white lg:block lg:w-[272px] lg:border-r lg:border-slate-800 lg:border-b-0 print:hidden`}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => {
            if (menuOpen && (event.target as Element).closest("a")) setOpenMenuPath(null);
          }}
        >
          <VehicSimSidebar />
        </div>
        <ProjectGate>{children}</ProjectGate>
      </div>
    </div>
  );
}
