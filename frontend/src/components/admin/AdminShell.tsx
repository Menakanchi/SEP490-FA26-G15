"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import styles from "./AdminShell.module.css";
import tokens from "./AdminTokens.module.css";

const sections = [
  { href: "/admin/users", title: "Tài khoản", description: "Quản lý thông tin, vai trò và trạng thái hoạt động của tài khoản." },
  { href: "/admin/workspaces", title: "Workspace", description: "Quản lý workspace và phân công Manager phụ trách." },
  { href: "/admin/tech-references", title: "Tài liệu kỹ thuật", description: "Quản lý nguyên lý, hằng số, tiêu chuẩn và các nguồn tham khảo kỹ thuật." },
];

/** Shared presentation only; CRUD and its permission gate remain in AdminManagement. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  return <AuthGate allowedRoles={["admin"]}><Frame>{children}</Frame></AuthGate>;
}

/**
 * Phần nội dung của trang quản trị. Header, sidebar (nhóm "Quản trị hệ thống") và menu mobile là của khung chung
 * `VehicSimShell`, nên chuyển giữa Tài khoản / Workspace / Tài liệu kỹ thuật không thay sidebar.
 */
function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sections.find(item => item.href === pathname);
  return <div className={styles.frame + " " + tokens.scope} data-admin-frame>
    <div className={styles.content}>
      <section id="admin-content" tabIndex={-1} aria-labelledby="admin-page-title" className={styles.page}>
        <nav aria-label="Đường dẫn" className={styles.breadcrumb}>
          <ol><li><Link href="/admin">Quản trị hệ thống</Link></li>
            {section && <li><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{section.title}</span></li>}
          </ol>
        </nav>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>QUẢN TRỊ HỆ THỐNG</p>
          <h1 id="admin-page-title">{section?.title ?? "Quản trị"}</h1>
          {section && <p className={styles.description}>{section.description}</p>}
        </div>
        {children}
      </section>
    </div>
  </div>;
}
