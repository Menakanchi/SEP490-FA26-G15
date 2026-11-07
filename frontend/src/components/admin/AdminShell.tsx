"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Building2, ChevronDown, ChevronRight, LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { NotificationBell } from "@/components/NotificationBell";
import { initials } from "@/components/VehicSimUi";
import { useAuth } from "@/context/AuthContext";
import styles from "./AdminShell.module.css";
import tokens from "./AdminTokens.module.css";

const sections = [
  { href: "/admin/users", title: "Tài khoản", caption: "Người dùng và vai trò", description: "Quản lý thông tin, vai trò và trạng thái hoạt động của tài khoản.", icon: Users },
  { href: "/admin/workspaces", title: "Workspace", caption: "Không gian và người quản lý", description: "Quản lý workspace và phân công Manager phụ trách.", icon: Building2 },
  { href: "/admin/tech-references", title: "Tài liệu kỹ thuật", caption: "Danh mục và nguồn tham khảo", description: "Quản lý nguyên lý, hằng số, tiêu chuẩn và các nguồn tham khảo kỹ thuật.", icon: BookOpen },
];

function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Quản trị hệ thống" className={styles.navigation}>
    <p className={styles.navLabel}>QUẢN LÝ</p>
    {sections.map(({ href, title, caption, icon: Icon }) => <Link key={href} href={href}
      aria-current={pathname === href ? "page" : undefined} className={styles.navLink}>
      <Icon size={19} aria-hidden="true" />
      <span><strong>{title}</strong><small>{caption}</small></span>
    </Link>)}
  </nav>;
}

function AdminExitLinks() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return <div className={styles.exitLinks}>
    <Link href="/"><ArrowLeft size={16} aria-hidden="true" />Tổng quan VehicSim</Link>
    <div className={styles.account}>
      <span className={styles.avatar} aria-hidden="true">{initials(user?.full_name || user?.name || "U")}</span>
      <span className={styles.accountName}><strong>{user?.full_name || user?.name}</strong><small>Quản trị viên</small></span>
      <button type="button" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => { logout(); router.push("/login"); }}>
        <LogOut size={17} aria-hidden="true" />
      </button>
    </div>
  </div>;
}

/** Only replaces the sidebar while the existing authenticated shell is on an Admin route. */
export function AdminSidebar() {
  const { role } = useAuth();
  if (role !== "admin") return null;
  return <aside aria-label="Khu vực quản trị" className={styles.sidebar + " " + tokens.scope}>
    <Link href="/admin" className={styles.brand}>
      {/* eslint-disable-next-line @next/next/no-img-element -- existing static product logo */}
      <img src="/vehicsim/logo.svg" alt="" width={32} height={32} />
      <span>VehicSim<small>QUẢN TRỊ HỆ THỐNG</small></span>
    </Link>
    <AdminNavigation />
    <AdminExitLinks />
  </aside>;
}

/** Shared presentation only; CRUD and its permission gate remain in AdminManagement. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  return <AuthGate allowedRoles={["admin"]}><Frame>{children}</Frame></AuthGate>;
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sections.find(item => item.href === pathname);
  return <div className={styles.frame + " " + tokens.scope} data-admin-frame>
    <a className={styles.skipLink} href="#admin-content" onClick={event => {
      event.preventDefault();
      document.getElementById("admin-content")?.focus();
    }}>Đến nội dung quản trị</a>
    <header className={styles.topbar}>
      <nav aria-label="Đường dẫn" className={styles.breadcrumb}>
        <ol><li><Link href="/admin">Quản trị hệ thống</Link></li>
          {section && <li><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{section.title}</span></li>}
        </ol>
      </nav>
      <div className={styles.headerActions}>
        <span className={styles.role}><ShieldCheck size={15} aria-hidden="true" />Quản trị viên</span>
        <Link href="/profile" className={styles.profile}><UserRound size={17} aria-hidden="true" /><span>Hồ sơ / Mật khẩu</span></Link>
        <NotificationBell />
      </div>
    </header>
    <div className={styles.content}>
      <details className={styles.mobileMenu} onClick={event => {
        if ((event.target as Element).closest("a")) event.currentTarget.open = false;
      }} onKeyDown={event => {
        if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }}>
        <summary>Điều hướng quản trị<ChevronDown size={18} aria-hidden="true" /></summary>
        <AdminNavigation /><AdminExitLinks />
      </details>
      <section id="admin-content" tabIndex={-1} aria-labelledby="admin-page-title" className={styles.page}>
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
