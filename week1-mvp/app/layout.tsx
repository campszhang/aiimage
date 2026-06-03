import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "./_components/providers";
import { GlobalShell } from "./_components/global-shell";
import { getCurrentUser, ensureInitialAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "家居软品AI生图工具",
  description: "枕头、枕套、眼罩、发圈、凉感被、夏被、羽绒被电商团队内部 AI 批量图像工具",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 确保初始管理员存在（幂等）
  await ensureInitialAdmin();

  // 未登录时 user 为 null —— GlobalShell 会检测 /login 不套 shell
  const user = await getCurrentUser();

  return (
    <html lang="zh-CN">
      <body className="bg-bg-primary min-h-screen text-fg-primary">
        <AppProviders>
          {user ? (
            <GlobalShell user={user}>{children}</GlobalShell>
          ) : (
            children
          )}
        </AppProviders>
      </body>
    </html>
  );
}
