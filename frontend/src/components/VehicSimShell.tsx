"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { VehicSimContextProvider } from "@/components/VehicSimContext";
import { AdminSidebar } from "@/components/admin/AdminShell";
import { VehicSimSidebar } from "@/components/VehicSimSidebar";
import { ProjectGate } from "@/components/project/ProjectShell";
import { ProjectJourneyProvider } from "@/components/project/ProjectJourneyContext";
import { jakarta } from "@/components/vehicsimFonts";

/**
 * Khung của mọi trang VehicSim: chưa đăng nhập thì về /login; đã đăng nhập thì sidebar
 * theo Figma + ngữ cảnh dùng chung. `AppLayoutWrapper` gọi nó cho các URL VehicSim.
 */
export function VehicSimShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const adminPage = pathname.startsWith("/admin");
  const analysisPage = pathname === "/analysis/failures" || pathname.startsWith("/analysis/failures/");
  const responsiveMenu = analysisPage || (!adminPage && (role === "engineer" || role === "reviewer" || role === "experience"));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className={`${jakarta.className} flex min-h-screen w-full items-center justify-center bg-vehicsim-bg`}>
        <Loader2 className="size-6 animate-spin text-vehicsim-muted" />
      </div>
    );
  }

  return (
    <div data-analysis-shell={analysisPage || undefined} className={`${jakarta.className} flex min-h-screen w-full bg-vehicsim-bg text-vehicsim-ink ${responsiveMenu ? "flex-col md:flex-row" : ""}`}>
      <VehicSimContextProvider>
        <ProjectJourneyProvider>
          {responsiveMenu ? <>
            <details className={`w-full border-b border-vehicsim-line bg-white md:hidden print:hidden ${analysisPage ? "analysis-mobile-menu" : ""}`} onClick={event => {
              if ((event.target as Element).closest("a")) event.currentTarget.open = false;
            }} onKeyDown={event => {
              if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
            }}>
              <summary className="cursor-pointer px-5 py-3.5 text-[14px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vehicsim-decision">Menu VehicSim</summary>
              <VehicSimSidebar mobile />
            </details>
            <VehicSimSidebar hideOnMobile />
          </> : adminPage && role === "admin" ? <AdminSidebar /> : <VehicSimSidebar hideOnMobile={adminPage} />}
          <ProjectGate>{children}</ProjectGate>
        </ProjectJourneyProvider>
      </VehicSimContextProvider>
    </div>
  );
}
