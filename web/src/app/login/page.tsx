"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, type SessionUser } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Channel = "email" | "phone";
type Step = "contact" | "code" | "profile";
type Role = "TENANT" | "AGENT" | "LANDLORD";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("contact");
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("TENANT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);

  const contact = channel === "email" ? email : phone;

  function switchChannel(next: Channel) {
    setChannel(next);
    setCode("");
    setDevCode(null);
    setError(null);
  }

  function afterSignIn(nextRole: Role | "ADMIN") {
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next ?? (nextRole === "AGENT" || nextRole === "LANDLORD" ? "/agent" : "/"));
  }

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevCode(null);
    try {
      const r = await api<{ expiresAt: string; devCode?: string }>(
        channel === "email" ? "/v1/auth/email/request" : "/v1/auth/otp/request",
        {
          method: "POST",
          body: channel === "email" ? { email } : { phone },
          auth: false,
        },
      );
      if (r.devCode) setDevCode(r.devCode);
      setStep("code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: SessionUser; isNewUser: boolean }>(
        channel === "email" ? "/v1/auth/email/verify" : "/v1/auth/otp/verify",
        {
          method: "POST",
          body: channel === "email" ? { email, code } : { phone, code },
          auth: false,
        },
      );
      setToken(r.token);
      if (r.isNewUser) {
        setIsNewUser(true);
        setStep("profile");
      } else {
        afterSignIn(r.user.role);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: SessionUser }>("/v1/auth/me", {
        method: "PATCH",
        body: { name, role },
      });
      setToken(r.token);
      afterSignIn(r.user.role);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl bg-surface p-8 shadow-sm">
      <h1 className="text-2xl font-bold">{t("login.title")}</h1>

      {step === "contact" && (
        <form onSubmit={requestOtp} className="space-y-4">
          <div className="grid grid-cols-2 rounded-lg bg-ink-100 p-1 text-sm font-medium">
            {(["email", "phone"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => switchChannel(c)}
                className={`rounded-md px-3 py-2 ${channel === c ? "bg-surface text-brand-700 shadow-sm" : "text-ink-600 hover:text-ink-900"}`}
              >
                {c === "email" ? t("login.emailTab") : t("login.phoneTab")}
              </button>
            ))}
          </div>

          {channel === "email" ? (
            <label className="block">
              <span className="text-sm text-ink-600">{t("login.emailLabel")}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm text-ink-600">{t("login.phoneLabel")}</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="0712 345 678"
                className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          )}

          <button disabled={loading} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t("login.sending") : t("login.sendCode")}
          </button>
          <p className="text-xs text-ink-500">{channel === "email" ? t("login.emailNote") : t("login.smsNote")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <p className="text-sm text-ink-600">{t("login.codeSentTo")} <strong>{contact}</strong>.</p>
          {devCode && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Dev mode: code is <strong>{devCode}</strong>
            </div>
          )}
          <label className="block">
            <span className="text-sm text-ink-600">{t("login.codeLabel")}</span>
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
            {loading ? t("login.verifying") : t("login.signIn")}
          </button>
          <button type="button" onClick={() => setStep("contact")} className="w-full text-sm text-ink-500 hover:underline">
            {t("login.differentContact")}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {step === "profile" && isNewUser && (
        <form onSubmit={saveProfile} className="space-y-4">
          <p className="text-sm text-ink-600">{t("login.welcome")}</p>
          <label className="block">
            <span className="text-sm text-ink-600">{t("login.yourName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-ink-200 px-4 py-3"
            />
          </label>
          <fieldset>
            <legend className="text-sm text-ink-600">{t("login.iAm")}</legend>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {(["TENANT", "AGENT", "LANDLORD"] as const).map((r) => (
                <label key={r} className={`cursor-pointer rounded-lg border px-3 py-2 text-center ${role === r ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200"}`}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                  {r === "TENANT" ? t("login.tenant") : r === "AGENT" ? t("login.agent") : t("login.landlord")}
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={loading} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {t("login.continue")}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
