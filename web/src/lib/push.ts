/**
 * Browser-side Web Push subscription helpers.
 *
 * Flow:
 *   1. Ask permission.
 *   2. Subscribe via the service worker's PushManager with the VAPID key.
 *   3. POST the subscription to /v1/push/subscribe.
 *
 * Skip silently if the browser doesn't support Web Push or VAPID isn't set.
 */

import { api } from "./api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && !!VAPID_PUBLIC_KEY;
}

/**
 * Request permission and register the current device for push.
 * Returns true if subscribed (or already was), false if denied/unsupported.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    });
  }

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/v1/push/subscribe", {
    method: "POST",
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    },
  });
  return true;
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api("/v1/push/subscribe", {
    method: "DELETE",
    body: { endpoint: sub.endpoint },
  }).catch(() => undefined);
  await sub.unsubscribe();
}
