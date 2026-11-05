import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Quản trị | VehicSim", template: "%s | Quản trị VehicSim" },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
