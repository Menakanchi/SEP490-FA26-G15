import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scenario Forge — Sinh kịch bản OpenSCENARIO",
  description:
    "Hệ thống AI sinh file OpenSCENARIO 1.0 từ mô tả tiếng Việt, với HITL Review và thư viện ngữ nghĩa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 ml-[260px] min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
