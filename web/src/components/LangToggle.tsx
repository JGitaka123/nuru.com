"use client";

import { useI18n } from "@/lib/i18n";

export default function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-ink-200 text-xs font-medium">
      {(["en", "sw"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 uppercase ${lang === l ? "bg-ink-900 text-surface" : "text-ink-600 hover:bg-ink-100"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
