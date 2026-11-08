"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Building2, RefreshCw, Users } from "lucide-react";
import { adminApi, type AdminResource } from "@/services/admin";
import styles from "./AdminDashboard.module.css";

const resources = [
  { resource: "users", title: "Tài khoản", scope: "Tất cả vai trò và trạng thái", empty: "Chưa có tài khoản.", action: "Quản lý tài khoản", icon: Users },
  { resource: "workspaces", title: "Workspace", scope: "Bao gồm workspace đã lưu trữ", empty: "Chưa có workspace. Mở danh sách để tạo workspace đầu tiên.", action: "Quản lý workspace", icon: Building2 },
  { resource: "tech-references", title: "Tài liệu kỹ thuật", scope: "Bao gồm tài liệu đang bật và đã tắt", empty: "Chưa có tài liệu kỹ thuật. Mở danh sách để bổ sung nguồn tham khảo.", action: "Quản lý tài liệu kỹ thuật", icon: BookOpen },
] satisfies { resource: AdminResource; title: string; scope: string; empty: string; action: string; icon: typeof Users }[];

type CountState = { status: "loading" } | { status: "ready"; total: number } | { status: "error"; message: string };
type Counts = Record<AdminResource, CountState>;
const loadingCounts = (): Counts => ({ users: { status: "loading" }, workspaces: { status: "loading" }, "tech-references": { status: "loading" } });

/** Reads existing list totals only; never derives statistics from the one returned row. */
export function AdminDashboard() {
  const [counts, setCounts] = useState<Counts>(loadingCounts);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    for (const { resource } of resources) {
      const query = new URLSearchParams({ page: "1", page_size: "1", sort: "newest" });
      adminApi.list(resource, query).then(data => {
        if (!Number.isSafeInteger(data?.total) || data.total < 0) throw new Error("Số lượng trả về không hợp lệ. Hãy tải lại dữ liệu.");
        if (live) setCounts(current => ({ ...current, [resource]: { status: "ready", total: data.total } }));
      }).catch((error: unknown) => {
        if (live) setCounts(current => ({ ...current, [resource]: { status: "error", message: error instanceof Error ? error.message : "Không tải được dữ liệu. Hãy thử lại." } }));
      });
    }
    return () => { live = false; };
  }, [revision]);
  const loading = Object.values(counts).some(count => count.status === "loading");
  const errors = Object.values(counts).filter(count => count.status === "error").length;
  function reload() {
    setCounts(loadingCounts());
    setRevision(current => current + 1);
  }

  return <div className={styles.dashboard}>
    <section aria-labelledby="admin-summary-heading">
      <div className={styles.sectionHeader}>
        <div><h2 id="admin-summary-heading">Số liệu quản trị</h2><p>Toàn hệ thống · Bao gồm mọi trạng thái</p></div>
        <button type="button" className={styles.refresh} disabled={loading} onClick={reload}>
          <RefreshCw size={15} aria-hidden="true" />{loading ? "Đang tải số liệu…" : "Làm mới số liệu"}
        </button>
      </div>
      <p role="status" className={styles.status}>
        {loading ? "Đang tải số lượng từ từng danh mục…" : errors ? `Không tải được ${errors}/3 danh mục. Bạn vẫn có thể mở danh sách hoặc làm mới số liệu.` : "Số liệu được tải khi mở trang hoặc khi bạn làm mới."}
      </p>
      <div className={styles.cards}>
        {resources.map(({ resource, title, scope, empty, action, icon: Icon }) => {
          const count = counts[resource];
          return <article key={resource} aria-labelledby={`admin-count-${resource}`} aria-busy={count.status === "loading"} className={styles.card}>
            <div className={styles.cardHeader}><span className={styles.icon}><Icon size={20} aria-hidden="true" /></span><h3 id={`admin-count-${resource}`}>{title}</h3></div>
            <p className={styles.value} aria-label={`Tổng số ${title.toLocaleLowerCase("vi-VN")}`}>{count.status === "ready" ? count.total.toLocaleString("vi-VN") : "—"}</p>
            <p className={styles.scope}>{scope}</p>
            <div className={styles.feedback}>
              {count.status === "loading" && <p>Đang tải…</p>}
              {count.status === "error" && <p role="alert">Không tải được số lượng. {count.message}</p>}
              {count.status === "ready" && count.total === 0 && <p>{empty}</p>}
            </div>
            <Link href={`/admin/${resource}`} className={styles.action}>{action}<ArrowRight size={16} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>
    </section>
    <section aria-labelledby="admin-workspace-guide" className={styles.guide}>
      <div className={styles.guideIntro}><p className={styles.eyebrow}>TRUY CẬP NHANH</p><h2 id="admin-workspace-guide">Thiết lập workspace</h2><p>Chuẩn bị tài khoản Manager đang hoạt động trước khi giao workspace phụ trách.</p></div>
      <ol className={styles.steps}>
        <li><span className={styles.stepNumber} aria-hidden="true">01</span><div><h3>Chuẩn bị tài khoản Manager</h3><p>Xem danh sách, tạo mới hoặc cập nhật tài khoản trong mục Tài khoản.</p><Link href="/admin/users">Mở danh sách tài khoản<ArrowRight size={14} aria-hidden="true" /></Link></div></li>
        <li><span className={styles.stepNumber} aria-hidden="true">02</span><div><h3>Tạo và phân công workspace</h3><p>Tạo workspace, chọn Manager hoặc cập nhật người quản lý workspace đang hoạt động.</p><Link href="/admin/workspaces">Mở danh sách workspace<ArrowRight size={14} aria-hidden="true" /></Link></div></li>
      </ol>
    </section>
  </div>;
}
