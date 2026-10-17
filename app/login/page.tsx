"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, DEMO_OFFICERS } from "@/lib/auth-context";
import { ShieldCheck, UserCheck, Lock, ArrowRight, ShieldAlert, LogOut, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const { user, login, loginAsDemo, logout, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please provide both username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await login(username, password);
    setLoading(false);

    if (res.success) {
      router.push(redirectPath);
    } else {
      setError(res.error || "Login failed");
    }
  };

  const handleDemoLogin = async (userId: string) => {
    setLoading(true);
    setError(null);
    const success = await loginAsDemo(userId);
    setLoading(false);

    if (success) {
      if (userId === "ADM-001" && redirectPath === "/") {
        router.push("/admin");
      } else {
        router.push(redirectPath);
      }
    } else {
      setError("Failed to sign in with demo credentials.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] p-4 text-white">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="relative w-full max-w-xl">
        {/* Header Header Emblem */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-md">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
          </div>
          <Badge variant="outline" className="mb-2 border-white/15 bg-white/5 text-white/70">
            OFFICIAL ENFORCEMENT PORTAL
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Legal Metrology Inspection System
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Authorized Officer & Administrative Intelligence Authentication
          </p>
        </div>

        {/* If user is already authenticated */}
        {isAuthenticated && user && (
          <Card className="mb-6 border-emerald-500/30 bg-[#161616]/90 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{user.name}</span>
                    <Badge className={user.role === "admin" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}>
                      {user.role === "admin" ? "ADMINISTRATOR" : "FIELD OFFICER"}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/50">{user.zone} • {user.badge_number}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(user.role === "admin" ? "/admin" : "/")}
                  className="border-white/10 bg-white/5 text-xs hover:bg-white/10"
                >
                  Continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className="border-rose-500/20 bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Manual Login Card */}
        <Card className="border-white/10 bg-[#161616]/80 p-6 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                Officer Username / ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. officer.chandru or admin"
                  disabled={loading}
                  className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:border-emerald-500/60 focus:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                />
                <UserCheck className="pointer-events-none absolute right-3.5 top-2.5 h-4 w-4 text-white/30" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="e.g. officer123 or admin123"
                  disabled={loading}
                  className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:border-emerald-500/60 focus:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                />
                <Lock className="pointer-events-none absolute right-3.5 top-2.5 h-4 w-4 text-white/30" />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white font-medium hover:bg-emerald-500 py-2.5"
            >
              {loading ? "Authenticating..." : "Sign In to Inspection System"}
            </Button>
          </form>

          {/* Seeded One-Click Demo Accounts */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-white/50 uppercase">
                Prototype Quick Sign-In (Demo Officers)
              </span>
              <span className="text-[10px] text-white/30">Click to authenticate instantly</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {DEMO_OFFICERS.map((officer) => (
                <button
                  key={officer.id}
                  type="button"
                  onClick={() => handleDemoLogin(officer.id)}
                  disabled={loading}
                  className="flex flex-col items-start rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-emerald-500/40 hover:bg-white/[0.07]"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-medium text-white">{officer.name}</span>
                    <Badge
                      className={
                        officer.role === "admin"
                          ? "border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                          : "border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300"
                      }
                    >
                      {officer.role === "admin" ? "ADMIN" : "OFFICER"}
                    </Badge>
                  </div>
                  <span className="mt-1 text-[11px] text-white/40">{officer.zone}</span>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/30">
                    <span className="font-mono text-emerald-400/80">{officer.username}</span>
                    <span>/</span>
                    <span className="font-mono text-white/40">{officer.role === "admin" ? "admin123" : "officer123"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Prototype Disclaimer */}
        <p className="mt-6 text-center text-xs text-white/30">
          Local inspection prototype for Legal Metrology (Packaged Commodities) compliance.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center text-white/50">Loading Portal...</div>}>
      <LoginContent />
    </Suspense>
  );
}
