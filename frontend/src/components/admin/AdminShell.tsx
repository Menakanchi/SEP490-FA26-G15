"use client";

import { usePathname } from "next/navigation";
import { BookOpen, Building2, Users } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { VehicSimPage } from "@/components/VehicSimPage";
import tokens from "./AdminTokens.module.css";

const sections = [
  { href: "/admin/users", title: "Tài khoản", caption: "Người dùng và vai trò", description: "Quản lý thông tin, vai trò và trạng thái hoạt động của tài khoản.", icon: Users },
  { href: "/admin/workspaces", title: "Workspace", caption: "Không gian và người quản lý", description: "Quản lý workspace và phân công Manager phụ trách.", icon: Building2 },
  { href: "/admin/tech-references", title: "Tài liệu kỹ thuật", caption: "Danh mục và nguồn tham khảo", description: "Quản lý nguyên lý, hằng số, tiêu chuẩn và các nguồn tham khảo kỹ thuật.", icon: BookOpen },
];

/** Shared presentation only; CRUD and its permission gate remain in AdminManagement. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sections.find(item => item.href === pathname);

  return (
    <AuthGate allowedRoles={["admin"]}>
      <div className={`${tokens.scope} flex flex-1 flex-col min-w-0`} data-admin-frame>
        <VehicSimPage
          crumbs={[
            { label: "Quản trị hệ thống", href: "/admin/users" },
            ...(section ? [{ label: section.title }] : []),
          ]}
          title={section?.title ?? "Quản trị"}
          subtitle={section?.description}
          showContext={false}
        >
          {children}
        </VehicSimPage>
      </div>
    </AuthGate>
  );
}
