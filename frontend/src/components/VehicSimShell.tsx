"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <div className={`${jakarta.className} flex min-h-screen w-full bg-vehicsim-bg text-vehicsim-ink`}>
      <VehicSimContextProvider>
        <VehicSimSidebar />
        <main className="flex min-w-0 flex-1">{children}</main>
      </VehicSimContextProvider>
    </div>
  );
}
