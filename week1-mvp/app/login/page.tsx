"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Sparkles, UserRound } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg-primary flex items-stretch">
      <section className="hidden lg:flex w-[360px] bg-bg-secondary border-r border-border-subtle flex-col justify-between px-8 py-8">
        <div>
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-md flex items-center justify-center text-white"
              style={{ background: "var(--brand-gradient)" }}
            >
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <div>
              <div className="text-[15px] font-bold text-fg-primary leading-tight">
                家居软品AI
              </div>
              <div className="text-[10px] text-fg-tertiary font-mono leading-tight">
                HOME TEXTILE AI STUDIO
              </div>
            </div>
          </div>

          <div className="mt-10 space-y-3">
            {["软品批量摄影", "家居场景图", "HEX 精准换色", "素材库管理"].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border-subtle bg-bg-card text-[12.5px] text-fg-secondary"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                  {item}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="text-[11px] text-fg-muted leading-relaxed">
          枕头、枕套、眼罩、发圈、凉感被、夏被、羽绒被电商团队内部工具
        </div>
      </section>

      <section className="flex-1 flex items-center justify-center px-4 py-8">
        <form
          method="post"
          onSubmit={handleSubmit}
          className="w-full max-w-[380px] bg-bg-secondary rounded-lg border border-border-default shadow-lg p-7"
        >
          <div className="lg:hidden flex items-center gap-3 mb-7">
            <span
              className="w-10 h-10 rounded-md flex items-center justify-center text-white"
              style={{ background: "var(--brand-gradient)" }}
            >
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <div>
              <div className="text-[15px] font-bold text-fg-primary leading-tight">
                家居软品AI
              </div>
              <div className="text-[10px] text-fg-tertiary font-mono leading-tight">
                HOME TEXTILE AI STUDIO
              </div>
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-[22px] font-bold text-fg-primary tracking-tight">
              登录工作台
            </h1>
            <p className="mt-1 text-[12px] text-fg-tertiary">
              使用内部账号进入家居软品 AI 生图工具
            </p>
          </div>

          <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-fg-secondary mb-1.5">
              用户名
            </label>
            <div className="relative">
              <UserRound
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
              />
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input pl-9"
                placeholder="admin"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-fg-secondary mb-1.5">
              密码
            </label>
            <div className="relative">
              <LockKeyhole
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
              />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-9"
                placeholder="请输入密码"
                required
              />
            </div>
          </div>

          {error && (
            <div
              className="p-3 rounded-md text-[13px] border"
              style={{
                background: "var(--danger-bg)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !hydrated}
            className="btn btn-primary btn-md w-full justify-center gap-2"
          >
            {loading || !hydrated ? "登录中..." : "登录"}
            {!loading && hydrated && <ArrowRight size={15} strokeWidth={2.2} />}
          </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <LoginForm />
    </Suspense>
  );
}
