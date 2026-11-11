"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, PillButton, StatCard, Tag, fmt, cx } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES, WORKSPACE_MANAGER_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { vehicsimApi } from "@/services/vehicsim";
import type { WorkspaceDetail, WorkspaceMember, WorkspaceMemberCandidate, WorkspaceMemberRole, WorkspaceChatMessage } from "@/types/vehicsim";

const MEMBER_ROLE: Record<WorkspaceMemberRole, { label: string; tone: "info" | "warn" }> = {
  ENGINEER: { label: "Kỹ sư", tone: "info" },
  REVIEWER: { label: "Người duyệt", tone: "warn" },
};

function RoleTag({ role }: { role: WorkspaceMemberRole }) {
  const r = MEMBER_ROLE[role] ?? { label: role, tone: "info" as const };
  return <Tag tone={r.tone}>{r.label}</Tag>;
}

/** Số tin mỗi lần tải (lần mở trang và mỗi lần bấm "Xem tin cũ hơn"). */
const CHAT_PAGE = 50;
/** Kênh sống lâu hơn mức này rồi mới đóng = server đóng do hết hạn (10 phút), không phải lỗi: nối lại ngay. */
const NORMAL_STREAM_MS = 5000;

/** Chờ trước khi nối lại kênh realtime sau lỗi: 1 s, 2 s, 4 s… tối đa 30 s. */
const reconnectDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

type ChatLink = "connecting" | "live" | "offline";

const CHAT_LINK: Record<ChatLink, { label: string; dot: string }> = {
  connecting: { label: "Đang kết nối…", dot: "bg-vehicsim-warn" },
  live: { label: "Trực tiếp", dot: "bg-vehicsim-ok" },
  offline: { label: "Mất kết nối", dot: "bg-vehicsim-danger" },
};

/** Ghép tin mới vào cuối, bỏ tin đã có (tin vừa gửi có thể về lại qua lần hỏi định kỳ). */
function appendMessages(prev: WorkspaceChatMessage[], incoming: WorkspaceChatMessage[]): WorkspaceChatMessage[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh].sort((a, b) => a.id - b.id) : prev;
}

/**
 * M2 — chi tiết workspace và project, Manager sửa tên / mô tả; M3 — thành viên; M4 — thêm tài khoản Experiencer và cấp vai trò
 * (ADR-045); M5 — bớt; Chat — kênh trao đổi của Manager và thành viên.
 */
export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const id = Number(workspaceId);
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");
  const isManagerOrAdmin = WORKSPACE_MANAGER_ROLES.includes(user?.roleCode ?? "");

  const [messages, setMessages] = useState<WorkspaceChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages.length ? messages[messages.length - 1].id : undefined;
  const lastMessageRef = useRef<number | undefined>(undefined);
  const [chatLink, setChatLink] = useState<ChatLink>("connecting");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const chatLoadedRef = useRef(false);
  /** Vị trí cuộn trước khi chèn tin cũ lên đầu, để khung chat không nhảy. */
  const keepScrollRef = useRef<{ height: number; top: number } | null>(null);
  /** Người dùng đang ở cuối khung chat (tin mới thì cuộn theo); đang đọc tin cũ thì không kéo xuống. */
  const atBottomRef = useRef(true);
  const lastIsMine = messages.length > 0 && String(messages[messages.length - 1].sender.id) === String(user?.id);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<WorkspaceMemberCandidate[] | null>(null);
  const [picked, setPicked] = useState<Record<number, WorkspaceMemberRole>>({});
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m, msgs] = await Promise.all([
        vehicsimApi.workspace(id),
        vehicsimApi.workspaceMembers(id),
        vehicsimApi.workspaceMessages(id, CHAT_PAGE).catch(() => [] as WorkspaceChatMessage[])
      ]);
      setDetail(d);
      setMembers(m);
      // Tải lại sau khi thêm / bớt thành viên thì ghép vào, không xoá tin cũ người dùng đã mở xem.
      setMessages((prev) => (prev.length ? appendMessages(prev, msgs) : msgs));
      if (!chatLoadedRef.current) {
        chatLoadedRef.current = true;
        setHasOlder(msgs.length >= CHAT_PAGE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được workspace");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu workspace khi mở trang
    if (allowed) void load();
  }, [allowed, load]);

  const search = async (e?: React.FormEvent, q = query) => {
    e?.preventDefault();
    // Server chỉ trả người có email trùng khớp hoàn toàn; ô trống thì không gọi.
    if (!q.trim()) {
      setCandidates(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setCandidates(await vehicsimApi.workspaceMemberCandidates(id, q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tìm được người dùng");
    } finally {
      setSearching(false);
    }
  };

  const add = async (c: WorkspaceMemberCandidate) => {
    const role = picked[c.user_id];
    if (!role) return;
    setBusy(c.user_id);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.addWorkspaceMember(id, c.user_id, role);
      setNotice(`Đã thêm ${c.full_name} vào workspace với vai trò ${MEMBER_ROLE[role].label}.`);
      // Xong một người thì trả khung tìm về trạng thái ban đầu, để khỏi còn email cũ kèm dòng "không có tài khoản nào".
      setQuery("");
      setCandidates(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thêm được thành viên");
    } finally {
      setBusy(null);
    }
  };

  /** Mở khung thêm ngay trên bảng thành viên; không liệt kê ai, Manager phải nhập đúng email người cần thêm. */
  const toggleAdding = () => {
    if (adding) {
      setAdding(false);
      return;
    }
    setAdding(true);
    setQuery("");
    setCandidates(null);
  };

  useEffect(() => {
    lastMessageRef.current = lastMessageId;
  }, [lastMessageId]);

  // Chat realtime (SSE): tin mới tới ngay khi có người gửi. Mỗi lần nối (kể cả nối lại sau khi kênh hết hạn / mạng rớt)
  // tải bù các tin gửi sau tin cuối đang có, nên không mất tin trong lúc đứt. 401/403/404 = không còn quyền: dừng hẳn.
  const loaded = detail !== null;
  useEffect(() => {
    if (!allowed || !loaded) return;
    const ctrl = new AbortController();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms);
        ctrl.signal.addEventListener("abort", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    const run = async () => {
      let attempt = 0;
      while (!ctrl.signal.aborted) {
        const openedAt = Date.now();
        try {
          await vehicsimApi.streamWorkspaceMessages(
            id,
            {
              onReady: () => {
                attempt = 0;
                setChatLink("live");
                vehicsimApi
                  .workspaceMessages(id, 200, lastMessageRef.current)
                  .then((missed) => setMessages((prev) => appendMessages(prev, missed)))
                  .catch(() => undefined);
              },
              onMessage: (m) => setMessages((prev) => appendMessages(prev, [m])),
            },
            ctrl.signal,
          );
          // Server đóng kênh vì hết hạn (kiểm lại quyền định kỳ): nối lại ngay, vẫn là "Trực tiếp", không chớp trạng thái.
          if (Date.now() - openedAt >= NORMAL_STREAM_MS) {
            attempt = 0;
            continue;
          }
        } catch (err) {
          if (ctrl.signal.aborted) return;
          if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
            setChatLink("offline");
            return;
          }
        }
        if (ctrl.signal.aborted) return;
        setChatLink(attempt > 2 ? "offline" : "connecting");
        await wait(reconnectDelay(attempt++));
      }
    };
    void run();
    return () => ctrl.abort();
  }, [allowed, loaded, id]);

  // Có tin mới thì cuộn xuống cuối nếu đang ở cuối hoặc tin do mình gửi; đang đọc tin cũ thì giữ nguyên.
  useEffect(() => {
    const box = chatBoxRef.current;
    if (box && (atBottomRef.current || lastIsMine)) box.scrollTop = box.scrollHeight;
  }, [lastMessageId, lastIsMine]);

  // Chèn tin cũ lên đầu: bù phần chiều cao mới để tin đang đọc đứng yên.
  useLayoutEffect(() => {
    const box = chatBoxRef.current;
    const keep = keepScrollRef.current;
    if (box && keep) {
      box.scrollTop = box.scrollHeight - keep.height + keep.top;
      keepScrollRef.current = null;
    }
  }, [messages]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await vehicsimApi.workspaceMessages(id, CHAT_PAGE, undefined, first.id);
      const box = chatBoxRef.current;
      if (box) keepScrollRef.current = { height: box.scrollHeight, top: box.scrollTop };
      setMessages((prev) => appendMessages(prev, older));
      setHasOlder(older.length >= CHAT_PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được tin nhắn cũ");
    } finally {
      setLoadingOlder(false);
    }
  };

  const startEdit = () => {
    setEditName(detail?.workspace.name ?? "");
    setEditDescription(detail?.workspace.description ?? "");
    setEditing(true);
    setError(null);
    setNotice(null);
  };

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editName.trim();
    if (!name || savingInfo) return;
    setSavingInfo(true);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.updateWorkspaceInfo(id, { name, description: editDescription.trim() || null });
      setEditing(false);
      setNotice("Đã lưu thông tin workspace.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được thông tin workspace");
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() || sendingChat) return;
    setSendingChat(true);
    try {
      const sent = await vehicsimApi.sendWorkspaceMessage(id, { message: chatText.trim() });
      setMessages((prev) => appendMessages(prev, [sent]));
      setChatText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được tin nhắn");
    } finally {
      setSendingChat(false);
    }
  };

  const remove = async (m: WorkspaceMember) => {
    const ok = window.confirm(
      `Bớt ${m.full_name} khỏi workspace?` +
        (m.project_count ? `\nNgười này sẽ tự rời ${m.project_count} project của workspace.` : "") +
        (m.open_task_count ? `\n${m.open_task_count} task chưa xong của họ sẽ chuyển về “chưa giao”.` : ""),
    );
    if (!ok) return;
    setBusy(m.user_id);
    setError(null);
    setNotice(null);
    try {
      const r = await vehicsimApi.removeWorkspaceMember(id, m.user_id);
      const parts = [
        r.removed_project_memberships ? `rời ${r.removed_project_memberships} project` : "",
        r.unassigned_tasks ? `${r.unassigned_tasks} task chưa xong chuyển về “chưa giao”` : "",
        r.role_reverted ? "tài khoản trở lại Experiencer" : "",
      ].filter(Boolean);
      setNotice(`Đã bớt ${m.full_name} khỏi workspace${parts.length ? `; ${parts.join(", ")}` : ""}.`);
      setCandidates(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không bớt được thành viên");
    } finally {
      setBusy(null);
    }
  };

  const ws = detail?.workspace;
  const active = ws?.status === "ACTIVE";
  const count = (role: WorkspaceMemberRole) => (members ?? []).filter((m) => m.role === role).length;

  return (
    <VehicSimPage
      crumbs={[{ label: "Workspace", href: "/workspace" }, { label: ws?.name ?? "…" }]}
      title={ws?.name ?? "Workspace"}
      badges={ws && <Tag tone={active ? "ok" : "neutral"}>{active ? "Hoạt động" : "Đã lưu trữ"}</Tag>}
      subtitle={ws ? `${(ws.description || "Chưa có mô tả").replace(/[.\s]+$/, "")}. Quản lý: ${ws.manager.full_name}.` : undefined}
      actions={
        allowed && ws ? (
          <>
            {isManagerOrAdmin && active && !editing && <PillButton onClick={startEdit}>Sửa thông tin</PillButton>}
            <PillButton href={`/workspace/${id}/reports`}>
              Báo cáo{ws.pending_report_count ? ` (${ws.pending_report_count} chờ duyệt)` : ""}
            </PillButton>
            <PillButton href={`/workspace/${id}/tasks`}>Task của workspace</PillButton>
          </>
        ) : undefined
      }
    >
      {!allowed ? (
        <EmptyState title="Chỉ Quản lý, Kỹ sư và Người duyệt của workspace được vào màn này. Quản trị viên sử dụng mục Quản trị → Workspace." />
      ) : (
        <>
          <ErrorNote message={error} />
          {notice && (
            <div role="status" className="rounded-[16px] border border-solid border-vehicsim-ok/30 bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
              {notice}
            </div>
          )}
          {editing && (
            <Card className="flex flex-col gap-4 p-5">
              <CardTitle>Sửa thông tin workspace</CardTitle>
              <form onSubmit={saveInfo} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-vehicsim-muted">
                  Tên workspace
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={150}
                    required
                    autoFocus
                    className="rounded-full border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-2 text-[13px] font-normal text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-vehicsim-muted">
                  Mô tả
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={10000}
                    rows={3}
                    placeholder="Mục tiêu, phạm vi kiểm thử của workspace…"
                    className="rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-2 text-[13px] font-normal text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                  />
                </label>
                <p className="text-[12px] text-vehicsim-faint">
                  Tên không được trùng workspace khác. Đổi Quản lý hoặc lưu trữ workspace do Quản trị viên thực hiện.
                </p>
                <div className="flex items-center gap-2">
                  <PillButton type="submit" variant="dark" disabled={savingInfo || !editName.trim()}>
                    {savingInfo ? "Đang lưu…" : "Lưu"}
                  </PillButton>
                  <PillButton type="button" disabled={savingInfo} onClick={() => setEditing(false)}>
                    Huỷ
                  </PillButton>
                </div>
              </form>
            </Card>
          )}
          <div className="rounded-[16px] border border-solid border-vehicsim-line bg-vehicsim-soft px-4 py-3 text-[12px] text-vehicsim-muted">
            Ứng dụng hiện vẫn chạy trên một project chung (TD-30): thêm hoặc bớt thành viên được lưu lại nhưng chưa thay đổi dữ liệu
            mà người đó nhìn thấy.
          </div>

          <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Thành viên" value={members ? members.length : "…"} />
            <StatCard label="Kỹ sư" value={members ? count("ENGINEER") : "…"} tone="info" note="tạo project, chạy mô phỏng" />
            <StatCard label="Người duyệt" value={members ? count("REVIEWER") : "…"} tone="warn" note="Accept / Reject khuyến nghị" />
            <StatCard label="Project" value={detail ? detail.projects.length : "…"} />
          </div>

          <Card className="flex flex-col gap-4 p-5">
            <CardTitle
              aside={
                <span className="flex items-center gap-3">
                  <span className="text-[12px] text-vehicsim-faint">{members ? `${members.length} người` : "…"}</span>
                  {isManagerOrAdmin && (
                    <PillButton
                      variant={adding ? "light" : "dark"}
                      className="px-4 py-2"
                      disabled={!active}
                      title={!active ? "Workspace đã lưu trữ, không thêm được thành viên" : undefined}
                      aria-expanded={adding}
                      onClick={toggleAdding}
                    >
                      {adding ? "Đóng" : "+ Thêm thành viên"}
                    </PillButton>
                  )}
                </span>
              }
            >
              Thành viên
            </CardTitle>
            {active && adding && (
              <div className="flex flex-col gap-3 rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4">
                <p className="text-[13px] text-vehicsim-muted">
                  Nhập đúng email đầy đủ của người cần thêm; hệ thống không liệt kê người dùng. Chỉ thêm được tài khoản tự đăng ký
                  (Experiencer) đang hoạt động. Chọn vai trò: tài khoản đổi sang vai trò đó, và trở lại Experiencer khi bị bớt khỏi
                  workspace cuối cùng.
                </p>
                <form onSubmit={search} className="flex items-center gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={254}
                    autoFocus
                    autoComplete="off"
                    inputMode="email"
                    placeholder="Nhập đúng email đầy đủ, ví dụ ten@example.com"
                    aria-label="Email của người dùng cần thêm"
                    className="min-w-0 flex-1 rounded-lg border border-vehicsim-line-strong bg-vehicsim-surface px-3.5 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                  />
                  <PillButton type="submit" disabled={searching}>
                    {searching ? "Đang tìm…" : "Tìm"}
                  </PillButton>
                </form>
                {candidates === null && (
                  <p className="text-[13px] text-vehicsim-faint">Nhập email rồi bấm “Tìm”.</p>
                )}
                {candidates && candidates.length === 0 && (
                  <p className="text-[13px] text-vehicsim-faint">
                    Không có tài khoản Experiencer nào có email này để thêm. Người đó cần tự đăng ký trước, và chưa ở workspace.
                  </p>
                )}
                {candidates && candidates.length > 0 && (
                  <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-surface">
                    {candidates.map((c) => (
                      <div key={c.user_id} className="flex h-[52px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                        <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                          <span className="truncate text-[13px] font-bold text-vehicsim-ink">{c.full_name}</span>
                          <span className="truncate text-[12px] text-vehicsim-faint">{c.email}</span>
                        </span>
                        <Tag tone="neutral">Experiencer</Tag>
                        <select
                          value={picked[c.user_id] ?? ""}
                          onChange={(e) => setPicked((p) => ({ ...p, [c.user_id]: e.target.value as WorkspaceMemberRole }))}
                          aria-label={`Vai trò cấp cho ${c.full_name}`}
                          className="mx-3 w-[150px] rounded-full border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                        >
                          <option value="" disabled>
                            Chọn vai trò…
                          </option>
                          {(Object.keys(MEMBER_ROLE) as WorkspaceMemberRole[]).map((r) => (
                            <option key={r} value={r}>
                              {MEMBER_ROLE[r].label}
                            </option>
                          ))}
                        </select>
                        <PillButton
                          variant="dark"
                          className="px-4 py-2"
                          disabled={busy !== null || !picked[c.user_id]}
                          title={!picked[c.user_id] ? "Chọn vai trò trước khi thêm" : undefined}
                          onClick={() => add(c)}
                        >
                          {busy === c.user_id ? "Đang thêm…" : "Thêm"}
                        </PillButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
              <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-4 text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
                <span className="min-w-0 flex-1">Người dùng</span>
                <span className="w-[130px]">Vai trò</span>
                <span className="w-[90px]">Project</span>
                <span className="w-[90px]">Task mở</span>
                <span className="w-[180px]">Thêm bởi</span>
                <span className="w-[100px]">Ngày vào</span>
                <span className="w-[90px]" />
              </div>
              {members && members.length === 0 && (
                <EmptyState title="Workspace chưa có thành viên">Bấm “+ Thêm thành viên” để tìm tài khoản và cấp vai trò.</EmptyState>
              )}
              {(members ?? []).map((m) => {
                const owner = m.owned_project_count > 0;
                return (
                  <div key={m.user_id} className="flex h-[58px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                      <span className="flex items-center gap-2 truncate text-[13px] font-bold text-vehicsim-ink">
                        {m.full_name}
                        {!m.is_active && <Tag tone="danger">Đã khoá</Tag>}
                      </span>
                      <span className="truncate text-[12px] text-vehicsim-faint">{m.email}</span>
                    </span>
                    <span className="w-[130px]">
                      <RoleTag role={m.role} />
                    </span>
                    <span className="w-[90px] text-[13px] text-vehicsim-ink">
                      {m.project_count}
                      {owner && <span className="text-vehicsim-faint"> · chủ {m.owned_project_count}</span>}
                    </span>
                    <span className="w-[90px] text-[13px] text-vehicsim-ink">{m.open_task_count}</span>
                    <span className="w-[180px] truncate pr-3 text-[13px] text-vehicsim-muted">{m.added_by?.full_name ?? "—"}</span>
                    <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(m.joined_at)}</span>
                    <span className="flex w-[90px] justify-end">
                      {isManagerOrAdmin ? (
                        <button
                          type="button"
                          disabled={!active || owner || busy !== null}
                          title={owner ? "Đang là chủ project trong workspace, chưa bớt được" : !active ? "Workspace đã lưu trữ" : undefined}
                          onClick={() => remove(m)}
                          className="rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-danger hover:bg-vehicsim-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busy === m.user_id ? "…" : "Bớt"}
                        </button>
                      ) : (
                        <span className="text-[12px] text-vehicsim-faint">Thành viên</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <CardTitle>Project trong workspace</CardTitle>
            <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
              <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-4 text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
                <span className="min-w-0 flex-1">Project</span>
                <span className="w-[200px]">Chủ project</span>
                <span className="w-[110px]">Thành viên</span>
                <span className="w-[110px]">Trạng thái</span>
                <span className="w-[100px]">Ngày tạo</span>
              </div>
              {detail && detail.projects.length === 0 && (
                <EmptyState title="Chưa có project">Kỹ sư trong workspace tự tạo project; Quản lý không tạo project.</EmptyState>
              )}
              {(detail?.projects ?? []).map((p) => (
                <div key={p.id} className="flex h-[52px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate pr-3 text-[13px] font-bold text-vehicsim-ink">{p.name}</span>
                  <span className="w-[200px] truncate pr-3 text-[13px] text-vehicsim-muted">{p.owner.full_name}</span>
                  <span className="w-[110px] text-[13px] text-vehicsim-ink">{p.member_count}</span>
                  <span className="w-[110px]">
                    <Tag tone={p.status === "ACTIVE" ? "ok" : "neutral"}>{p.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</Tag>
                  </span>
                  <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(p.created_date)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <CardTitle
              aside={
                <span className="flex items-center gap-3 text-[12px] text-vehicsim-faint">
                  <span className="flex items-center gap-[6px]" role="status" aria-label={`Kênh chat: ${CHAT_LINK[chatLink].label}`}>
                    <span className={cx("inline-block h-2 w-2 rounded-full", CHAT_LINK[chatLink].dot)} />
                    {CHAT_LINK[chatLink].label}
                  </span>
                  <span>{messages.length} trao đổi</span>
                </span>
              }
            >
              Trao đổi kỹ thuật (Workspace Chat)
            </CardTitle>
            <div className="flex flex-col gap-3 rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-soft p-4">
              <div
                ref={chatBoxRef}
                aria-live="polite"
                onScroll={(e) => {
                  const box = e.currentTarget;
                  atBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
                }}
                className="flex max-h-[360px] min-h-[140px] flex-col gap-3 overflow-y-auto pr-1"
              >
                {hasOlder ? (
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="self-center rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-decision hover:bg-vehicsim-surface disabled:opacity-50"
                  >
                    {loadingOlder ? "Đang tải…" : "Xem tin cũ hơn"}
                  </button>
                ) : (
                  messages.length >= CHAT_PAGE && <p className="self-center text-[12px] text-vehicsim-faint">Đầu cuộc trò chuyện</p>
                )}
                {messages.length === 0 ? (
                  <p className="text-center text-[13px] text-vehicsim-faint py-6">
                    Chưa có tin nhắn nào trong kênh. Hãy gửi tin nhắn để bắt đầu trao đổi kỹ thuật với team.
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMe = String(msg.sender.id) === String(user?.id);
                    return (
                      <div
                        key={msg.id}
                        className={cx(
                          "flex flex-col rounded-[12px] p-3 max-w-[85%]",
                          isMe
                            ? "self-end bg-vehicsim-decision/10 border border-vehicsim-decision/30 text-vehicsim-ink"
                            : "self-start bg-vehicsim-surface border border-vehicsim-line text-vehicsim-ink"
                        )}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-vehicsim-muted font-medium mb-1">
                          <span className="font-bold text-vehicsim-ink">{msg.sender.full_name}</span>
                          <span>·</span>
                          <span>{fmt.date(msg.created_date)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.message_text}</p>
                      </div>
                    );
                  })
                )}
              </div>
              {active && (
                <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-solid border-vehicsim-line">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    maxLength={2000}
                    placeholder="Nhập nội dung trao đổi kỹ thuật (kịch bản, kết quả CARLA, tối ưu AEB...)..."
                    className="flex-1 rounded-full border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                  />
                  <PillButton type="submit" variant="dark" disabled={sendingChat || !chatText.trim()}>
                    {sendingChat ? "Đang gửi…" : "Gửi"}
                  </PillButton>
                </form>
              )}
            </div>
          </Card>

        </>
      )}
    </VehicSimPage>
  );
}
