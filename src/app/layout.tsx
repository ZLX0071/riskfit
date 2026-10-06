import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiskFit · 组合风险体检台",
  description:
    "输入持仓组合，30 秒拿到一份说人话的风险体检报告（风险教育用途，不构成投资建议）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
