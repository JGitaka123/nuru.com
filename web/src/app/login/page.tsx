"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, type SessionUser } from "@/lib/api";

type Step = "phone" | "code" | "profile";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"TENANT" | "AGENT" | "LANDLORD">("TENANT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ expiresAt: string; devCode?: string }>(
        "/v1/auth/otp/request",
        { method: "POST", body: { phone }, auth: false },
      );
      if (r.devCode) setDevCode(r.devCode);
      setStep("code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: SessionUser; isNewUser: boolean }>(
        "/v1/auth/otp/verify",
        { method: "POST", body: { phone, code }, auth: false },
      );
      setToken(r.token);
      if (r.isNewUser) {
        setIsNewUser(true);
        setStep("profile");
      } else {
        router.push(r.user.role === "AGENT" || r.user.role === "LANDLORD" ? "/agent" : "/");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Re-call verify with name/role to update; cleaner way is a /me PATCH but
      // verify already accepts the optional fields.
      await api<unknown>("/v1/auth/otp/verify", {
        method: "POST",
        body: { phone, code, name, role },
        auth: false,
      }).catch(() => undefined);
      router.push(role === "AGENT" || role === "LANDLORD" ? "/agent" : "/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Sign in to Nuru</h1>

      {step === "phone" && (
        <form onSubmit={requestOtp} className="space-y-4">
          <label className="block">
            <span className="text-sm text-ink-600">Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="0712 345 678"
              className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <button disabled={loading} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? "Sending…" : "Send code"}
          </button>
          <p className="text-xs text-ink-500">We&apos;ll text you a 6-digit code. Standard SMS rates apply.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <p className="text-sm text-ink-600">Code sent to <strong>{phone}</strong>.</p>
          {devCode && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Dev mode: code is <strong>{devCode}</strong>
            </div>
          )}
          <label className="block">
            <span className="text-sm text-ink-600">Verification code</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3 text-2xl tracking-widest"
            />
          </label>
          <button disabled={loading || code.length !== 6} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? "Verifying…" : "Sign in"}
          </button>
          <button type="button" onClick={() => setStep("phone")} className="w-full text-sm text-ink-500 hover:underline">
            Use a different number
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {step === "profile" && isNewUser && (
        <form onSubmit={saveProfile} className="space-y-4">
          <p className="text-sm text-ink-600">Welcome to Nuru! Just a couple of details:</p>
          <label className="block">
            <span className="text-sm text-ink-600">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3"
            />
          </label>
          <fieldset>
            <legend className="text-sm text-ink-600">I am a…</legend>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {(["TENANT", "AGENT", "LANDLORD"] as const).map((r) => (
                <label key={r} className={`cursor-pointer rounded-lg border px-3 py-2 text-center ${role === r ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200"}`}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                  {r === "TENANT" ? "Tenant" : r === "AGENT" ? "Agent" : "Landlord"}
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={loading} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            Continue
          </button>
        </form>
      )}
    </div>
  );
}
