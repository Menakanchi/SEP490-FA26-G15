import type { Metadata } from "next";
import { AdminManagement } from "@/components/admin/AdminManagement";
export const metadata: Metadata = { title: "Workspace" };

export default function Page() { return <AdminManagement resource="workspaces" />; }