"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { VehicSimPage } from "@/components/VehicSimPage";
import tokens from "./AdminTokens.module.css";

const sections = [
  { href: "/admin/users", title: "Tài khoản" },
  { href: "/admin/workspaces", title: "Workspace" },
  { href: "/admin/tech-references", title: "Tài liệu kỹ thuật" },
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
          showContext={false}
        >
          <section id="admin-content" tabIndex={-1} aria-label={section?.title ?? "Quản trị"}>{children}</section>
        </VehicSimPage>
      </div>
    </AuthGate>
  );
}
