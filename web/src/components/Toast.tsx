"use client";

/**
 * Lightweight toast system. No deps. Imperative API:
 *
 *   import { toast } from "@/components/Toast";
 *   toast.success("Listing saved");
 *   toast.error("Couldn't save");
 *
 * Mount <ToastViewport /> once in the root layout; calls render into it.
 */

import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; message: string }

let counter = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  for (const l of listeners) l(items);
}

function push(kind: ToastKind, message: string, ttlMs = 4000) {
  const id = ++counter;
  items = [...items, { id, kind, message }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttlMs);
}

export const toast = {
  success: (msg: string) => push("success", msg),
  error: (msg: string) => push("error", msg, 6000),
  info: (msg: string) => push("info", msg),
};

export function ToastViewport() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ${
            t.kind === "success"
              ? "bg-green-50 text-green-900 ring-green-200"
              : t.kind === "error"
              ? "bg-red-50 text-red-900 ring-red-200"
              : "bg-ink-900 text-white ring-ink-700"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
