"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { APP_VERSION } from "@/lib/version";
import LoadingScreen from "@/components/loading-screen";

function Barcode() {
  const bars = [2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1];
  return (
    <div className="flex items-stretch gap-[1.5px] h-full">
      {bars.map((w, i) => (
        <div
          key={i}
          className="rounded-[0.5px] bg-primary-foreground"
          style={{ width: `${w * 1.5}px`, opacity: i % 3 === 0 ? 0.9 : 0.5 }}
        />
      ))}
    </div>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/" });
  };

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 60% 50% at 50% 50%,",
            "hsl(var(--primary) / 0.06) 0%,",
            "hsl(var(--primary) / 0.03) 30%,",
            "hsl(var(--primary) / 0.01) 60%,",
            "transparent 100%)",
          ].join(" "),
        }}
      />

      <div className="flex flex-col items-center">
        {/* Badge card — vertical card (54/86 aspect) */}
        <div
          className="relative aspect-[54/86] w-72 overflow-hidden rounded-2xl bg-card flex flex-col ring-1 ring-black/[0.08] dark:ring-white/[0.06]"
          style={{
            boxShadow: [
              "0 1px 2px rgba(0,0,0,0.06)",
              "0 4px 8px rgba(0,0,0,0.04)",
              "0 12px 24px rgba(0,0,0,0.06)",
              "0 24px 48px rgba(0,0,0,0.04)",
            ].join(", "),
          }}
        >
          {/* Header strip with barcode */}
          <div className="relative bg-primary px-5 py-4">
            <div className="flex items-center justify-between">
              {/* Punch hole */}
              <div
                className="h-4 w-8 rounded-full bg-background/80"
                style={{
                  boxShadow:
                    "inset 0 1.5px 3px rgba(0,0,0,0.35), inset 0 -0.5px 1px rgba(255,255,255,0.1)",
                }}
              />
              <div className="flex items-center gap-2">
                <img
                  src="/favicon-32.png"
                  alt="Gecko"
                  width={16}
                  height={16}
                />
                <span className="text-sm font-semibold text-primary-foreground">
                  Gecko
                </span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-primary-foreground/60">
                v{APP_VERSION}
              </span>
            </div>
            {/* Barcode row */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[9px] font-mono text-primary-foreground/40 tracking-wider">
                ID 2026-{today.slice(4)}
              </span>
              <div className="h-6">
                <Barcode />
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col items-center px-6 pt-6 pb-14">
            {/* Logo */}
            <div className="h-24 w-24 overflow-hidden rounded-full bg-secondary dark:bg-[#171717] ring-1 ring-border p-2.5">
              <img
                src="/logo-login.png"
                alt="Gecko"
                width={256}
                height={256}
                className="h-full w-full object-contain"
              />
            </div>

            <p className="mt-5 text-lg font-semibold text-foreground">
              Welcome
            </p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              Sign in to view your screen time analytics
            </p>

            {/* Error message */}
            {error && (
              <div className="mt-4 w-full rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive text-center">
                {error === "AccessDenied"
                  ? "Access denied. Your account is not on the allowlist."
                  : "Authentication failed. Please try again."}
              </div>
            )}

            {/* Divider */}
            <div className="mt-5 h-px w-full bg-border" />

            {/* Push button toward bottom */}
            <div className="flex-1" />

            {/* Google Sign-in button */}
            <button
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>

            {/* Footer note */}
            <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground/60">
              Only authorized email addresses can access this application
            </p>
          </div>

          {/* Footer strip */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center border-t border-border bg-secondary/50 py-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground font-mono">
                Secure Connection
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
