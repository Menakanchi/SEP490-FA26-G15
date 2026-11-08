import type { Metadata } from "next";
import { AdminManagement } from "@/components/admin/AdminManagement";
export const metadata: Metadata = { title: "Tài liệu kỹ thuật" };

export default function Page() { return <AdminManagement resource="tech-references" />; }