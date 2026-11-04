"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { VehicSimContextProvider } from "@/components/VehicSimContext";
import { VehicSimSidebar } from "@/components/VehicSimSidebar";
import { jakarta } from "@/components/vehicsimFonts";

/**
 * Khung của mọi trang VehicSim: chưa đăng nhập thì về /login; đã đăng nhập thì sidebar
 * theo Figma + ngữ cảnh dùng chung. `AppLayoutWrapper` gọi nó cho các URL VehicSim.
 */
export function VehicSimShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const adminPage = pathname.startsWith("/admin");
  const analysisPage = pathname === "/analysis/failures" || pathname.startsWith("/analysis/failures/");

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
    <div data-analysis-shell={analysisPage || undefined} className={`${jakarta.className} flex min-h-screen w-full bg-vehicsim-bg text-vehicsim-ink`}>
      <VehicSimContextProvider>
        {analysisPage ? <>
          <details className="analysis-mobile-menu" onClick={event => {
            if ((event.target as Element).closest("a")) event.currentTarget.open = false;
          }} onKeyDown={event => {
            if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
          }}>
            <summary>Menu VehicSim</summary>
            <VehicSimSidebar />
          </details>
          <div className="analysis-desktop-menu"><VehicSimSidebar /></div>
        </> : <VehicSimSidebar hideOnMobile={adminPage} />}
        <main className="flex min-w-0 flex-1">{children}</main>
      </VehicSimContextProvider>
    </div>
  );
}
