"use client";

/**
 * Client-side session state, derived from the stored JWT. The token is
 * decoded (not verified — that's the API's job) purely to drive UI: which
 * nav to show, the account menu, etc. The name is hydrated from
 * /v1/auth/me on mount.
 */

import { useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

export type Role = "TENANT" | "AGENT" | "LANDLORD" | "ADMIN";

export interface Session {
  role: Role;
  name: string | null;
}

function decodeRole(token: string): Role | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    const role = decodeRole(token);
    if (!role) {
      setReady(true);
      return;
    }
    setSession({ role, name: null });
    // Hydrate the display name (best-effort).
    api<{ role: Role; name: string | null }>("/v1/auth/me")
      .then((u) => setSession({ role: u.role, name: u.name }))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  function signOut() {
    setToken(null);
    setSession(null);
    window.location.href = "/";
  }

  return { session, ready, signOut };
}
