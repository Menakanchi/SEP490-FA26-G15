"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ErrorNote, Tag, cx } from "@/components/VehicSimUi";
import { loadAssistantChat, saveAssistantChat } from "@/services/assistantHistory";
import { vehicsimApi } from "@/services/vehicsim";
import type { AssistantAnswer, AssistantSource, AssistantStatus, AssistantTraceStep, AssistantTurn } from "@/types/vehicsim";

/**
 * Trợ lý dự án (RAG, chỉ đọc) — cửa sổ hội thoại nổi ở góc trang Tổng quan (ADR-028).
 *
 * Nút tròn góc phải dưới mở/đóng cửa sổ; đóng rồi mở lại vẫn giữ cuộc trò chuyện. Trả lời
 * chỉ từ dữ liệu project + tài liệu repo, kèm nguồn [S#] bấm được về đúng màn hình. Không
 * thao tác gì: muốn đổi tham số thì kỹ sư tự làm ở /aeb, /validation/...
 */

const SUGGESTIONS = [
  "Ca lỗi nào va chạm mạnh nhất?",
  "TTC_THRESHOLD được phép trong khoảng nào?",
  "Regression nào đạt và vì sao?",
  "Vì sao dùng bộ mô phỏng động học thay vì CARLA?",
];
const MAX_QUESTION = 1000;
const HISTORY_TURNS = 6;

interface Message {
  role: "user" | "assistant";
  content: string;
  reply?: AssistantAnswer;
}

/** Nhãn tiếng Việt cho nguồn — backend trả mã + loại, giao diện tự đặt tên (TD-08). */
function sourceLabel(s: AssistantSource): string {
  switch (s.type) {
    case "FAILURE":
      return s.ref === "stats" ? "Thống kê ca lỗi" : `Lượt chạy ${s.ref}`;
    case "REGRESSION":
      return `Regression ${s.ref}`;
    case "AEB":
      return s.ref === "parameters" ? "Danh mục tham số AEB" : `AEB ${s.ref}`;
    case "FAMILY":
      return `Họ kịch bản ${s.ref}`;
    case "PROJECT":
      return "Tổng quan project";
    default:
      return s.ref.split("/").pop() ?? s.ref;
  }
}

/** Bước ReAct → nhãn ngắn tiếng Việt: "Lượt chạy #1055", "Thống kê ca lỗi (theo outcome)". */
function traceLabel(step: AssistantTraceStep): string {
  const a = step.args;
  switch (step.tool) {
    case "get_run":
      return `Lượt chạy #${a.run_id}`;
    case "list_failures":
      return "Lọc ca lỗi";
    case "failure_stats":
      return a.group_by ? `Thống kê ca lỗi (theo ${a.group_by})` : "Thống kê ca lỗi";
    case "get_parameters":
      return "Tham số AEB";
    case "get_aeb_version":
      return a.code ? `AEB ${a.code}` : "Các AEB version";
    case "get_family":
      return a.code ? `Họ kịch bản ${a.code}` : "Các họ kịch bản";
    case "get_regression":
      return a.code ? `Regression ${a.code}` : "Các regression";
    case "project_overview":
      return "Tổng quan project";
    case "search_knowledge":
      return "Tìm trong tài liệu";
    default:
      return step.tool;
  }
}

function SourceChip({ source, compact }: { source: AssistantSource; compact?: boolean }) {
  const text = compact ? source.id : `${source.id} · ${sourceLabel(source)}`;
  const cls = cx(
    "inline-flex items-center rounded-full border border-solid border-vehicsim-line px-2 py-[2px] text-[11px] font-semibold",
    source.link ? "text-vehicsim-decision hover:bg-vehicsim-decision-bg" : "text-vehicsim-muted",
  );
  return source.link ? (
    <Link href={source.link} title={source.title} className={cls}>
      {text}
    </Link>
  ) : (
    <span title={source.title} className={cls}>
      {text}
    </span>
  );
}

/** Markdown tối thiểu: gạch đầu dòng, **đậm**, `mã`, và [S#] thành chip nguồn. */
function Inline({ text, sources }: { text: string; sources: AssistantSource[] }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[S\d+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="rounded bg-vehicsim-soft px-1 font-mono text-[12px]">
              {part.slice(1, -1)}
            </code>
          );
        const cite = part.match(/^\[(S\d+)\]$/);
        if (cite) {
          const source = sources.find((s) => s.id === cite[1]);
          return source ? <SourceChip key={i} source={source} compact /> : null;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function Answer({ text, sources }: { text: string; sources: AssistantSource[] }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-4 flex list-disc flex-col gap-1">
          {bullets.map((b, i) => (
            <li key={i}>
              <Inline text={b} sources={sources} />
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim())
      blocks.push(
        <p key={`p-${blocks.length}`}>
          <Inline text={line} sources={sources} />
        </p>,
      );
  }
  flush();
  return <div className="flex flex-col gap-2 text-[13px] leading-[1.6] text-vehicsim-ink">{blocks}</div>;
}

/** Linh vật: chú mèo "hỏi chấm" — ảnh đầy đủ ở màn chào, avatar cắt quanh mặt ở các chỗ nhỏ. */
const MASCOT = "/vehicsim/assistant-mascot.jpg";
const AVATAR = "/vehicsim/assistant-avatar.jpg";

function MascotAvatar({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      alt=""
      src={AVATAR}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cx("block shrink-0 rounded-full object-cover", className)}
    />
  );
}

/** Lượt của trợ lý: avatar linh vật bên trái bong bóng. */
function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[94%] items-start gap-2">
      <MascotAvatar size={28} className="mt-1 ring-1 ring-vehicsim-line" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function ProjectAssistant() {
  const { user } = useAuth();
  const canAsk = (user?.roles ?? []).some((r) => r === "ENGINEER" || r === "ADMIN");
  const userKey = user?.id ?? user?.email ?? "";
  // key theo tài khoản: đổi người đăng nhập là dựng lại cửa sổ với đúng lịch sử của người đó.
  return <AssistantWindow key={userKey} userKey={userKey} canAsk={canAsk} />;
}

function AssistantWindow({ userKey, canAsk }: { userKey: string; canAsk: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  // Khôi phục hội thoại khi quay lại trang (chỉ xoá khi đăng xuất — services/assistantHistory.ts).
  // Lúc đóng, cửa sổ không hiển thị tin nhắn nên nạp ngay ở lần render đầu không lệch hydration.
  const [messages, setMessages] = useState<Message[]>(() => loadAssistantChat<Message>(userKey));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || status) return;
    vehicsimApi.assistantStatus().then(setStatus).catch(() => setStatus(null));
  }, [open, status]);

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    saveAssistantChat(userKey, messages);
  }, [userKey, messages]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: AssistantTurn[] = messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.content }));
    const asked: Message[] = [...messages, { role: "user", content: q }];
    setMessages(asked);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const reply = await vehicsimApi.assistantAsk(q, history);
      const answered: Message[] = [...asked, { role: "assistant", content: reply.answer, reply }];
      // Lưu ngay: kỹ sư có thể đã chuyển trang trong lúc chờ, khi đó setMessages không còn tác dụng.
      saveAssistantChat(userKey, answered);
      setMessages(answered);
      if (!status?.chunks) vehicsimApi.assistantStatus().then(setStatus).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trợ lý không trả lời được");
    } finally {
      setBusy(false);
    }
  }

  const indexNote = status
    ? status.chunks
      ? `${status.chunks} đoạn tri thức · chỉ đọc`
      : "Câu hỏi đầu tiên sẽ dựng chỉ mục (~20 giây)"
    : "Chỉ đọc · dữ liệu project + tài liệu repo";

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Meomeo Agent"
          className="fixed bottom-[92px] right-6 z-50 flex h-[min(640px,calc(100vh-120px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-[22px] border border-solid border-vehicsim-line bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
        >
          <header className="flex items-center gap-3 bg-vehicsim-ink px-4 py-3 text-white">
            <MascotAvatar size={38} className="ring-2 ring-white/40" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold leading-tight">Meomeo Agent</h2>
              <p className="truncate text-[11px] text-white/70">{indexNote}</p>
            </div>
            {messages.length > 0 && (
              <IconButton label="Cuộc trò chuyện mới" onClick={() => setMessages([])} disabled={busy}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </IconButton>
            )}
            <IconButton label="Thu nhỏ" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </IconButton>
          </header>

          {!canAsk ? (
            <p className="m-4 rounded-[14px] bg-vehicsim-soft px-4 py-3 text-[12px] text-vehicsim-muted">
              Trợ lý dành cho kỹ sư (quyền ENGINEER hoặc ADMIN).
            </p>
          ) : (
            <>
              <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-vehicsim-bg px-4 py-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-2 pb-1 pt-2 text-center">
                    <Image
                      alt="Linh vật Trợ lý dự án"
                      src={MASCOT}
                      width={112}
                      height={112}
                      className="size-28 rounded-[24px] object-cover shadow-vehicsim-card ring-4 ring-white"
                    />
                    <span className="text-[12px] font-semibold text-vehicsim-muted">Có gì thắc mắc về project? Hỏi mình nhé.</span>
                  </div>
                )}
                <AssistantRow>
                  <div className="rounded-[16px] rounded-tl-[4px] border border-solid border-vehicsim-line bg-white px-4 py-3 text-[13px] leading-[1.6] text-vehicsim-ink">
                    Chào bạn! Mình tra cứu họ kịch bản, lượt chạy, ca lỗi, 10 tham số AEB, regression, khuyến nghị và cách hệ
                    thống hoạt động — <b>chỉ đọc</b>, luôn kèm nguồn để bạn kiểm tra.
                  </div>
                </AssistantRow>
                {messages.length === 0 && (
                  <div className="flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void ask(s)}
                        className="rounded-full border border-solid border-vehicsim-line bg-white px-3 py-[7px] text-left text-[12px] font-medium text-vehicsim-ink hover:border-vehicsim-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[16px] rounded-br-[4px] bg-vehicsim-ink px-4 py-[10px] text-[13px] text-white">
                      {m.content}
                    </div>
                  ) : (
                    <AssistantRow key={i}>
                    <div
                      className={cx(
                        "rounded-[16px] rounded-tl-[4px] border border-solid px-4 py-3",
                        m.reply?.scope === "in_scope" ? "border-vehicsim-line bg-white" : "border-transparent bg-vehicsim-soft",
                      )}
                    >
                      {m.reply?.scope === "out_of_scope" && <Tag className="mb-2">Ngoài phạm vi project</Tag>}
                      {m.reply?.scope === "blocked" && (
                        <Tag tone="danger" className="mb-2">
                          Đã chặn vì an toàn
                        </Tag>
                      )}
                      {m.reply && m.reply.trace.length > 0 && (
                        <p className="mb-2 text-[11px] leading-[1.5] text-vehicsim-faint">
                          Đã tra cứu: {m.reply.trace.map(traceLabel).join(" · ")}
                        </p>
                      )}
                      {m.reply?.scope === "not_found" && (
                        <Tag tone="warn" className="mb-2">
                          Không có trong dữ liệu
                        </Tag>
                      )}
                      {m.reply?.scope === "in_scope" && !m.reply.grounded && (
                        <Tag tone="warn" className="mb-2">
                          Chưa có nguồn kèm theo — kiểm tra lại
                        </Tag>
                      )}
                      <Answer text={m.content} sources={m.reply?.sources ?? []} />
                      {m.reply && m.reply.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-[6px] border-t border-solid border-vehicsim-line pt-2">
                          <span className="text-[11px] text-vehicsim-faint">Nguồn:</span>
                          {m.reply.sources.map((s) => (
                            <SourceChip key={s.id} source={s} />
                          ))}
                        </div>
                      )}
                    </div>
                    </AssistantRow>
                  ),
                )}
                {busy && (
                  <AssistantRow>
                    <div className="w-fit rounded-[16px] rounded-tl-[4px] border border-solid border-vehicsim-line bg-white px-4 py-3 text-[13px] text-vehicsim-muted">
                      Đang tra cứu dữ liệu project…
                    </div>
                  </AssistantRow>
                )}
              </div>

              <footer className="flex flex-col gap-2 border-t border-solid border-vehicsim-line bg-white px-3 pb-3 pt-3">
                <ErrorNote message={error} />
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(input);
                  }}
                >
                  <textarea
                    ref={box}
                    value={input}
                    maxLength={MAX_QUESTION}
                    rows={1}
                    placeholder="Hỏi về project, vd. Lượt chạy #1055 lỗi gì?"
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void ask(input);
                      }
                    }}
                    className="max-h-[120px] min-h-[42px] flex-1 resize-none rounded-[14px] border border-solid border-vehicsim-line-strong px-3 py-[10px] text-[13px] text-vehicsim-ink focus:border-vehicsim-ink focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Gửi câu hỏi"
                    className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-full bg-vehicsim-ink text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </form>
                <p className="px-1 text-[10.5px] leading-[1.45] text-vehicsim-faint">
                  Do LLM soạn từ dữ liệu đã lưu, có thể sai — mở nguồn để kiểm tra trước khi quyết định. Mô phỏng không phải
                  chứng nhận an toàn.
                </p>
              </footer>
            </>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Đóng trợ lý dự án" : "Mở trợ lý dự án"}
        title="Meomeo Agent"
        className={cx(
          "fixed bottom-6 right-6 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-vehicsim-ink pr-5 text-[13px] font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.3)] transition hover:bg-black/85",
          open ? "pl-4" : "pl-[7px]",
        )}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <MascotAvatar size={42} className="ring-2 ring-white" />
        )}
        {open ? "Đóng" : "Meomeo Agent"}
      </button>
    </>
  );
}
