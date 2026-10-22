import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppLayoutWrapper } from "@/components/AppLayoutWrapper";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VehicSim — Mô phỏng & kiểm định AEB/FCW",
  description:
    "Mô tả kịch bản → sinh biến thể → mô phỏng → phân tích lỗi → kiểm định hồi quy; kỹ sư quyết định mọi thay đổi cấu hình AEB.",
};

const themeInitializationScript = `(function(){try{var t=localStorage.getItem("forge_theme");document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

/**
 * Extension trình duyệt (Bitdefender: `bis_skin_checked`, `bis_register`, `__processed_*`;
 * Grammarly; ColorZilla) chèn thuộc tính vào HTML **trước khi React hydrate**, nên dev overlay báo
 * "A tree hydrated but some attributes ... didn't match". `suppressHydrationWarning` chỉ có tác dụng
 * một cấp, không phủ được các `div` sâu bên trong. Script này chạy lúc đọc `<head>`, gỡ đúng các
 * thuộc tính đó (kể cả cái chèn sau) và tự dừng 5 giây sau `load`, khi React đã hydrate xong.
 *
 * Riêng hai thẻ `<script>` dưới đây có `suppressHydrationWarning` vì có extension (vd. Urban VPN)
 * xoá rỗng nội dung script inline sau khi chạy và gắn `bis_use` — React thấy `__html` server là ""
 * và báo lệch. Script đã chạy xong rồi, React cũng không bao giờ vá lại script, nên bỏ qua là đúng.
 */
const stripExtensionAttributesScript = `(function(){try{
var P=["bis_","__processed_"],X={"cz-shortcut-listen":1,"data-new-gr-c-s-check-loaded":1,"data-gr-ext-installed":1};
function bad(n){if(X[n])return true;for(var i=0;i<P.length;i++){if(n.indexOf(P[i])===0)return true}return false}
function clean(el){var a=el.attributes;for(var i=a.length-1;i>=0;i--){if(bad(a[i].name))el.removeAttribute(a[i].name)}}
function sweep(root){if(root.nodeType!==1)return;clean(root);var all=root.getElementsByTagName("*");for(var i=0;i<all.length;i++)clean(all[i])}
var mo=new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];if(m.type==="attributes"){if(bad(m.attributeName))m.target.removeAttribute(m.attributeName)}else{for(var j=0;j<m.addedNodes.length;j++)sweep(m.addedNodes[j])}}});
mo.observe(document.documentElement,{attributes:true,childList:true,subtree:true});
function stop(){setTimeout(function(){mo.disconnect()},5000)}
if(document.readyState==="complete"){stop()}else{addEventListener("load",stop)}
}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: stripExtensionAttributesScript }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>
            <AppLayoutWrapper>{children}</AppLayoutWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
