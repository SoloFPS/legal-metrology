import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Scale,
  Lightbulb,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Info,
} from "lucide-react";

import { RULES, type RuleKey } from "@/lib/legal-rules";

export function generateStaticParams() {
  return Object.keys(RULES).map((ruleKey) => ({
    ruleKey,
  }));
}

export default async function RulePage({
  params,
}: {
  params: Promise<{ ruleKey: string }>;
}) {
  const { ruleKey } = await params;

  const rule = RULES[ruleKey as RuleKey];

  if (!rule) {
    notFound();
  }

  const isUniversal = rule.scope === "universal";

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 h-16 border-b border-white/10 bg-[#0d0d0d]/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Compliance Checker
          </Link>

          <div className="hidden items-center gap-2 text-xs text-white/30 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            Rule reference
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Scope */}
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              isUniversal
                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-purple-500/30 bg-purple-500/10 text-purple-400"
            }`}
          >
            {isUniversal
              ? "Applies to packaged commodities"
              : "Applies to food & beverage"}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {rule.label}
        </h1>

        {/* Legal basis */}
        <div className="mt-4 flex items-start gap-2 text-sm text-white/50">
          <Scale className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="text-white/35">Legal reference: </span>
            <span>{rule.legalBasis}</span>
          </div>
        </div>

        {/* Summary */}
        <p className="mt-6 text-base leading-7 text-white/75">
          {rule.summary}
        </p>

        {/* Important notice */}
        <section className="mt-7 rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />

            <div>
              <h2 className="text-sm font-medium text-blue-300">
                How to interpret this rule
              </h2>

              <p className="mt-1.5 text-sm leading-6 text-blue-100/60">
                This page explains the requirement in plain language. The
                compliance checker uses OCR and rule-based checks to identify
                declarations on a package, but an automated result should be
                treated as an indication for review rather than a final legal
                determination.
              </p>
            </div>
          </div>
        </section>

        {/* What it means */}
        <section className="mt-6 rounded-lg border border-white/10 bg-[#161616] p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-white/50" />

            <h2 className="text-xs font-medium uppercase tracking-wider text-white/50">
              What it means
            </h2>
          </div>

          <p className="text-sm leading-6 text-white/70">
            {rule.whatItMeans}
          </p>
        </section>

        {/* Why it matters */}
        <section className="mt-4 rounded-lg border border-white/10 bg-[#161616] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-white/50" />

            <h2 className="text-xs font-medium uppercase tracking-wider text-white/50">
              Why it matters
            </h2>
          </div>

          <p className="text-sm leading-6 text-white/70">
            {rule.whyItMatters}
          </p>
        </section>

        {/* Example */}
        <section className="mt-4 rounded-lg border border-white/10 bg-[#141414] p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/50">
            Example
          </h2>

          <div className="rounded-md border border-white/5 bg-black/30 p-3">
            <p className="font-mono text-sm leading-6 text-green-400/90">
              {rule.example}
            </p>
          </div>
        </section>

        {/* Common mistakes */}
        <section className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />

            <h2 className="text-xs font-medium uppercase tracking-wider text-amber-300">
              Common mistakes
            </h2>
          </div>

          <ul className="space-y-2">
            {rule.commonMistakes.map((mistake, index) => (
              <li
                key={index}
                className="flex gap-2 text-sm leading-6 text-amber-200/80"
              >
                <span className="text-amber-400">•</span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Back to checker */}
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Compliance Checker
          </Link>
        </div>

        {/* Legal disclaimer */}
        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="text-xs leading-5 text-white/30">
            <strong className="font-medium text-white/40">
              Important:
            </strong>{" "}
            This page is a plain-language educational summary of selected
            labelling requirements. It is not legal advice and does not
            replace the applicable legislation, regulations, amendments,
            notifications, or official guidance. Requirements can vary
            according to the product, packaging, intended market, and
            applicable regulations. Always consult the current official
            regulatory text when making a legal or commercial determination.
          </p>
        </div>
      </div>
    </main>
  );
}