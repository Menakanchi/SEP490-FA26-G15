"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Menu, Search, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext, VehicSimContextProvider } from "@/components/VehicSimContext";
import { AdminSidebar } from "@/components/admin/AdminShell";
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
  const admin = pathname.startsWith("/admin") && role === "admin";
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
      {!admin && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-vehicsim-line bg-vehicsim-surface px-4 py-2 sm:px-6 lg:pl-0 lg:pr-8 print:hidden">
          <a href="#vehicsim-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-vehicsim-surface focus:p-3">
            Đến nội dung chính
          </a>
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2.5 font-bold lg:w-[232px] lg:px-6">
            <Image src="/vehicsim/logo.svg" alt="" width={26} height={26} />
            VehicSim
          </Link>
          {ctx?.workspace && <span className="hidden min-w-0 max-w-[220px] truncate text-[13px] font-medium text-vehicsim-muted md:block" title={ctx.workspace.name}>{ctx.workspace.name}</span>}
          <form
            role="search"
            className="order-last flex min-w-0 basis-full items-center rounded-lg border border-vehicsim-line-strong bg-vehicsim-surface sm:order-none sm:ml-auto sm:basis-auto"
            onSubmit={(event) => {
              event.preventDefault();
              const run = String(new FormData(event.currentTarget).get("run") ?? "").trim().replace(/^#/, "");
              if (/^\d+$/.test(run)) router.push(`/analysis/failures/${run}`);
            }}
          >
            <input type="search" name="run" aria-label="Mã lượt chạy" placeholder="Tìm lượt chạy, vd. #1023"
              className="h-11 min-w-0 flex-1 rounded-l-lg px-3 text-[13px] placeholder:text-vehicsim-faint sm:w-[184px]" />
            <button type="submit" aria-label="Tìm lượt chạy" className="grid size-11 shrink-0 place-items-center rounded-r-lg text-vehicsim-muted hover:bg-vehicsim-soft">
              <Search aria-hidden className="size-4" />
            </button>
          </form>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <NotificationBell />
            <Link href="/profile" aria-label="Hồ sơ cá nhân" title={name} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-1.5 hover:bg-vehicsim-soft sm:px-2.5">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-vehicsim-primary-bg text-[11px] font-bold text-vehicsim-primary">{initials(name)}</span>
              <span className="hidden text-xs font-semibold sm:block">{roleLabel}</span>
            </Link>
            <button type="button" ref={menuButton} onKeyDown={onMenuKeyDown}
              aria-expanded={menuOpen} aria-controls="vehicsim-navigation"
              onClick={() => setOpenMenuPath(menuOpen ? null : pathname)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-vehicsim-line px-2.5 text-[13px] font-semibold hover:bg-vehicsim-soft lg:hidden">
              {menuOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
              Menu
            </button>
          </div>
        </header>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        {admin ? <AdminSidebar /> : (
          <div id="vehicsim-navigation"
            className={`${menuOpen ? "block" : "hidden"} shrink-0 border-b border-vehicsim-line bg-vehicsim-surface lg:block lg:w-[232px] lg:border-r lg:border-b-0 print:hidden`}
            onKeyDown={onMenuKeyDown}
            onClick={(event) => {
              if (menuOpen && (event.target as Element).closest("a")) setOpenMenuPath(null);
            }}
          >
            <VehicSimSidebar />
          </div>
        )}
        <ProjectGate>{children}</ProjectGate>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-vehicsim-line bg-vehicsim-surface px-4 py-4 text-xs text-vehicsim-muted sm:px-6 lg:px-8 print:hidden">
        <span><strong className="font-bold text-vehicsim-ink">VehicSim</strong> · Kiểm thử AEB/FCW</span>
        <span>Kết quả mô phỏng dùng để phân tích và kiểm chứng cấu hình.</span>
      </footer>
    </div>
  );
}
