"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { CinematicCarScene, KEYFRAMES } from "@/components/landing/CinematicCarScene";
import { jakarta } from "@/components/vehicsimFonts";
import { homeFor, useAuth } from "@/context/AuthContext";
import { VEHICLE_MODELS } from "@/components/vehicleModels";

// Model 3 đỏ: sơn sạch, hợp cảnh tối. (Model e-tron có vệt phản chiếu vẽ cứng vào texture, nhìn loang lổ dưới đèn studio.)
// Chiều dài lấy theo carla_vehicle_models để xe đúng tỉ lệ với vạch qua đường.
const HERO_MODEL = VEHICLE_MODELS["vehicle.tesla.model3"];
const HERO_LENGTH_M = 4.79;

/** 5 bước của vòng kiểm thử — chỉ ghi chức năng đã có trong code (MOBO / Pareto chưa làm nên không giới thiệu). */
const STEPS = [
  {
    n: "01",
    title: "Thiết kế kịch bản",
    body: "Mô tả bằng lời — ví dụ “xe chạy 50 km/h, người đi bộ băng ngang khi xe cách 30 m, trời mưa”. VehicSim trích ra kịch bản và sinh các biến thể theo tốc độ xe, khoảng cách kích hoạt, tốc độ người đi bộ, thời tiết và thời điểm trong ngày.",
  },
  {
    n: "02",
    title: "Chạy baseline",
    body: "Mỗi biến thể chạy với một seed cố định trên bộ động học hoặc CARLA 0.9.16. Ghi lại va chạm, TTC nhỏ nhất, vận tốc va chạm và quãng phanh — đo cả khi tắt AEB để đối chiếu.",
  },
  {
    n: "03",
    title: "Phân tích lỗi",
    body: "Gom các ca va chạm, suýt va chạm và phanh oan. Xem lại từng lượt chạy, chuỗi nguyên nhân từ nhận biết tới phanh, cùng dữ liệu cảm biến và ground truth của CARLA.",
  },
  {
    n: "04",
    title: "Tối ưu AEB",
    body: "Tạo phiên bản AEB ứng viên bằng 4 tham số: ngưỡng TTC, độ trễ kích hoạt phanh, giảm tốc tối đa và tốc độ tăng lực phanh — giới hạn phanh luôn theo đúng mẫu xe.",
  },
  {
    n: "05",
    title: "Kiểm chứng & phê duyệt",
    body: "Chạy hồi quy trên đúng biến thể và seed của baseline: không được thêm va chạm mới, phanh oan không tăng quá 5 điểm %. Người duyệt xem bằng chứng rồi chấp nhận hoặc từ chối.",
  },
];

const SECTIONS = KEYFRAMES.length; // mở đầu + 5 bước + lời mời

/**
 * Trang giới thiệu: khách chưa đăng nhập vào "/" thấy trang này (AppLayoutWrapper), cũng mở được ở "/gioi-thieu".
 * Khách bấm Đăng nhập / Tạo tài khoản mới sang trang xác thực; người đã đăng nhập thấy nút "Vào VehicSim".
 */
export function LandingPage() {
  const progress = useRef(0);
  const [section, setSection] = useState(0);
  const { isAuthenticated, role } = useAuth();
  const appHome = isAuthenticated && role ? homeFor(role) : null;

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY / max) * (SECTIONS - 1) : 0;
      progress.current = p;
      setSection(Math.round(p));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className={`${jakarta.className} relative isolate w-full text-white`}>
      <CinematicCarScene progress={progress} modelSrc={HERO_MODEL.src} carLengthM={HERO_LENGTH_M} />

      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 font-black tracking-tight">
          <Image src="/vehicsim/logo.svg" alt="" width={26} height={26} />
          <span className="text-[18px]">VehicSim</span>
        </Link>
        <nav className="flex items-center gap-2">
          {appHome ? (
            <Link href={appHome} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13.5px] font-semibold backdrop-blur hover:bg-white/20">
              Vào VehicSim <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <>
              <Link href="/register" className="hidden rounded-lg px-4 py-2 text-[13.5px] font-semibold text-slate-300 hover:text-white sm:block">
                Tạo tài khoản
              </Link>
              <Link href="/login" className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13.5px] font-semibold backdrop-blur hover:bg-white/20">
                Đăng nhập
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Chỉ báo 5 bước bên phải: bước đang xem sáng lên. */}
      <ol aria-hidden className={`fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 transition-opacity duration-500 lg:flex ${section >= 1 && section <= STEPS.length ? "opacity-100" : "opacity-0"}`}>
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center justify-end gap-2 text-[11px] font-bold tracking-widest">
            <span className={section === i + 1 ? "text-white" : "text-white/30"}>{s.n}</span>
            <span className={`block h-[2px] rounded-full transition-all duration-500 ${section === i + 1 ? "w-8 bg-emerald-400" : "w-3 bg-white/30"}`} />
          </li>
        ))}
      </ol>

      <main>
        <section className="relative flex min-h-[100svh] items-end px-5 pb-24 sm:px-10 lg:items-center lg:pb-0">
          {/* Điện thoại: chữ nằm dưới xe, thêm nền tối dần để đọc được trên cảnh 3D. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#07090d] via-[#07090d]/85 to-transparent lg:hidden" />
          <div className="relative max-w-xl">
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.25em] text-emerald-400">Kiểm thử AEB cho người đi bộ</p>
            <h1 className="text-[clamp(34px,5.4vw,64px)] font-black leading-[1.05] tracking-tight">
              Phanh kịp trước khi
              <br />
              người đi bộ bước ra.
            </h1>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-slate-300">
              Mô tả tình huống, chạy mô phỏng trên bộ động học và CARLA, tìm ra ca phanh hỏng và kiểm chứng phiên bản AEB mới trước khi duyệt.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-[14.5px] font-bold text-[#04130c] hover:bg-emerald-400">
                Bắt đầu miễn phí <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-[14.5px] font-semibold backdrop-blur hover:bg-white/15">
                Đăng nhập
              </Link>
            </div>
          </div>
          <a href="#buoc-01" aria-label="Cuộn xuống" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-white/60 motion-safe:animate-bounce sm:block">
            <ChevronDown className="size-6" />
          </a>
        </section>

        {STEPS.map((s, i) => (
          // Điện thoại: khung chữ nằm đáy màn để xe hiện ở nửa trên; từ lg đặt giữa, xen kẽ trái / phải.
          <section key={s.n} id={`buoc-${s.n}`} className={`flex min-h-[100svh] items-end px-5 pb-16 sm:px-10 lg:items-center lg:pb-0 ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
            <article className="max-w-md rounded-2xl border border-white/10 bg-black/40 p-7 backdrop-blur-md">
              <p className="text-[12px] font-bold tracking-[0.25em] text-emerald-400">BƯỚC {s.n}</p>
              <h2 className="mt-2 text-[clamp(26px,3.2vw,38px)] font-black leading-tight tracking-tight">{s.title}</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{s.body}</p>
            </article>
          </section>
        ))}

        <section className="flex min-h-[100svh] flex-col items-center justify-center px-5 text-center">
          <h2 className="max-w-2xl text-[clamp(30px,4.4vw,52px)] font-black leading-tight tracking-tight">Bắt đầu vòng kiểm thử của bạn</h2>
          <p className="mt-4 max-w-lg text-[15.5px] text-slate-300">
            Tạo project cá nhân, chọn xe, mô tả tình huống đầu tiên — VehicSim lo phần mô phỏng và chấm điểm.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-[14.5px] font-bold text-[#04130c] hover:bg-emerald-400">
              Tạo tài khoản <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-[14.5px] font-semibold backdrop-blur hover:bg-white/15">
              Đăng nhập
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-5 pb-6 text-center text-[11.5px] text-white/45">
        SEP490-FA26-G15 · Model 3D:{" "}
        <a href={HERO_MODEL.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">
          {HERO_MODEL.title}
        </a>{" "}
        — {HERO_MODEL.author},{" "}
        <a href={HERO_MODEL.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">
          {HERO_MODEL.license}
        </a>
      </footer>
    </div>
  );
}
