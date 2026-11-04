import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = { title: { absolute: "Tổng quan quản trị | Quản trị VehicSim" } };

export default function AdminPage() { return <AdminDashboard />; }
