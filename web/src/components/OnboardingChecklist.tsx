"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Panel, btnBrand } from "@/components/ui";

interface OnboardingStep {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

interface OnboardingProgress {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  nextStep: OnboardingStep | null;
  complete: boolean;
}

/**
 * Activation checklist for new agents. Renders nothing once every step is
 * done (or if the endpoint is unavailable) so it never nags active agents.
 */
export default function OnboardingChecklist() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<OnboardingProgress>("/v1/agent/onboarding")
      .then((p) => { if (!cancelled) setProgress(p); })
      .catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, []);

  if (!progress || progress.complete || progress.steps.length === 0) return null;

  const { steps, completedCount, totalCount, percentComplete, nextStep } = progress;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
            Get set up
          </p>
          <h2 className="mt-1 font-serif text-2xl text-ink-900">Finish your setup</h2>
          <p className="mt-1 text-sm text-ink-500">
            A few short steps and your properties go live to tenants.
          </p>
        </div>
        <p className="font-serif text-lg font-semibold text-ink-900">
          {completedCount} of {totalCount} complete
        </p>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      <ul className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                step.done
                  ? "bg-brand-500 text-white"
                  : "border border-ink-200 bg-surface text-ink-400"
              }`}
            >
              {step.done ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${step.done ? "text-ink-500 line-through" : "text-ink-900"}`}>
                {step.label}
              </p>
              {!step.done && <p className="mt-0.5 text-sm text-ink-600">{step.hint}</p>}
            </div>
          </li>
        ))}
      </ul>

      {nextStep && (
        <div className="mt-5">
          <Link href={nextStep.href} className={btnBrand}>
            {nextStep.label}
          </Link>
        </div>
      )}
    </Panel>
  );
}
