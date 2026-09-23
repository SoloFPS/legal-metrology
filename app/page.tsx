"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react"; // add to your existing lucide-react import line

import { useRef, useState } from "react";
import {
  Upload,
  FileImage,
  X,
  ScanSearch,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  XCircle,
  ImagePlus,
  MapPin,
  ChevronDown,
  ChevronUp,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE = "http://127.0.0.1:8000";

// Mirrors MANDATORY_FIELDS in the Python backend (display_name -> field key)
// so extracted values can be looked up for whatever fields the backend
// says it actually checked for this product's category.
const FIELD_KEY_BY_LABEL: Record<string, string> = {
  "Common / Generic Name of Commodity": "commodity_name",
  "Net Quantity / Weight / Volume": "net_quantity",
  "Maximum Retail Price (MRP)": "mrp",
  "Batch / Lot / Code Number": "batch_lot_code",
  "Date of Manufacture / Packaging": "date_of_manufacture",
  "Expiry / Use By / Best Before Date": "date_of_expiry",
  "Manufacturer / Packer / Importer Name & Address": "manufacturer",
  "Consumer Care Contact (Name, Address, Phone/Email)": "consumer_care",
  "14-Digit FSSAI License Number": "fssai_license",
};

type SecondaryHint = {
  field_hint: string;
  location: string;
  source_text: string;
};

type ComplianceReport = {
  product_category: string;
  fields_checked: string[];
  is_compliant: boolean;
  compliance_score: string;
  missing_mandatory_fields: string[];
  needs_secondary_image: boolean;
  secondary_image_hints: SecondaryHint[];
  warnings: string[];
  legal_basis: Record<string, string>;
};

type AnalysisResult = {
  status: "complete" | "needs_secondary_image";
  session_id?: string;
  message?: string;
  extracted_data: {
    standard_fields: Record<string, any>;
    raw_text_detected?: string[];
    raw_text_detected_primary?: string[];
    raw_text_detected_secondary?: string[];
  };
  compliance_report: ComplianceReport;
};

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: any): { text: string; isPlaceholder: boolean } {
  if (value === null || value === undefined || value === "") {
    return { text: "Not detected", isPlaceholder: false };
  }
  if (Array.isArray(value)) {
    return { text: value.join(", "), isPlaceholder: false };
  }
  const str = String(value);
  return { text: str, isPlaceholder: str.toUpperCase().startsWith("SEE ") };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );

  const [secondaryImage, setSecondaryImage] = useState<string | null>(null);
  const [secondaryFileName, setSecondaryFileName] = useState("");
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [secondaryAnalyzing, setSecondaryAnalyzing] = useState(false);

  const [showRawText, setShowRawText] = useState(false);

  const needsSecondary =
    analysisResult?.status === "needs_secondary_image" &&
    !!analysisResult.session_id;

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    setFileName(f.name);
    setImage(URL.createObjectURL(f));
    setAnalyzed(false);
    setAnalysisResult(null);
    setSecondaryImage(null);
    setSecondaryFile(null);
    setSecondaryFileName("");
    setShowRawText(false);
  };

  const handleSecondaryFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    setSecondaryFile(f);
    setSecondaryFileName(f.name);
    setSecondaryImage(URL.createObjectURL(f));
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Analysis failed");

      const result: AnalysisResult = await response.json();
      setAnalysisResult(result);
      setAnalyzed(true);
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeSecondary = async () => {
    if (!secondaryFile || !analysisResult?.session_id) return;
    setSecondaryAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("session_id", analysisResult.session_id);
      formData.append("file", secondaryFile);

      const response = await fetch(`${API_BASE}/analyze/secondary`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Secondary analysis failed");

      const result: AnalysisResult = await response.json();
      setAnalysisResult(result);
      setAnalyzed(true);
    } catch (error) {
      console.error("Secondary analysis error:", error);
    } finally {
      setSecondaryAnalyzing(false);
    }
  };

  const removeImage = () => {
    setImage(null);
    setFileName("");
    setFile(null);
    setAnalyzed(false);
    setAnalysisResult(null);
    setSecondaryImage(null);
    setSecondaryFile(null);
    setSecondaryFileName("");
    setShowRawText(false);

    if (inputRef.current) inputRef.current.value = "";
    if (secondaryInputRef.current) secondaryInputRef.current.value = "";
  };

  const report = analysisResult?.compliance_report;
  const fields = analysisResult?.extracted_data.standard_fields ?? {};

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      {/* ─────────────────────────────────────────────
          TOP BAR
      ───────────────────────────────────────────── */}

      <header className="h-16 border-b border-white/10 bg-[#161616]">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-white/10 to-white/0">
              <ScanSearch className="h-4 w-4 text-white/75" />
            </div>

            <span className="text-sm font-semibold tracking-wide text-white">
              LEGAL METROLOGY
            </span>

            <span className="text-sm text-white/30">/</span>

            <span className="text-sm text-white/60">Compliance Checker</span>
          </div>

          <div className="text-xs font-medium text-white/50">SIH 2026</div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────
          MAIN CONTENT
      ───────────────────────────────────────────── */}

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Compliance Checker
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
            Upload a packaged commodity label to check its Legal Metrology
            declarations. Only the rules that apply to the detected product
            category are checked.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* ─────────────────────────────────────────
              LEFT — DOCUMENT(S)
          ───────────────────────────────────────── */}

          <div className="space-y-5">
            <Card className="overflow-hidden border-white/15 bg-[#1b1b1b] transition-colors duration-300 hover:border-white/25">
              <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-white/60" />
                  <span className="text-sm font-medium text-white/90">
                    Primary Image
                  </span>
                </div>

                {image && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={removeImage}
                    className="h-7 w-7 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="p-5">
                <div
                  className="group relative flex min-h-[380px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-[#101010] transition-all duration-300 hover:border-white/35 hover:bg-[#121212]"
                  onClick={() => !image && inputRef.current?.click()}
                >
                  {image ? (
                    <>
                      <img
                        src={image}
                        alt="Uploaded document"
                        className="h-full max-h-[380px] w-full object-contain"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <p className="text-xs font-medium text-white/80">
                          Uploaded document
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors duration-300 group-hover:border-white/20 group-hover:bg-white/10">
                        <Upload className="h-6 w-6 text-white/55 transition-transform duration-300 group-hover:-translate-y-0.5" />
                      </div>

                      <p className="text-sm font-medium text-white/85">
                        Select a package image
                      </p>

                      <p className="mt-2 max-w-xs text-xs leading-5 text-white/55">
                        Upload a clear image of the product packaging or
                        declaration label.
                      </p>

                      <Button
                        variant="outline"
                        className="mt-6 border-white/15 bg-white/5 text-white/85 transition-colors duration-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          inputRef.current?.click();
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Select Image
                      </Button>
                    </div>
                  )}
                </div>

                {fileName && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                    <FileImage className="h-3.5 w-3.5 text-white/50" />
                    <span className="truncate">{fileName}</span>
                  </div>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />

                <Button
                  className="mt-5 h-11 w-full bg-white text-black transition-all duration-200 hover:bg-white/90 active:bg-white/80"
                  disabled={!image || analyzing || needsSecondary}
                  onClick={handleAnalyze}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing document...
                    </>
                  ) : (
                    <>
                      <ScanSearch className="mr-2 h-4 w-4" />
                      Analyze Document
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* ─────────────────────────────────────────
                SECONDARY IMAGE — only shown once the backend
                says a field needs to be read off another part
                of the package (neck, cap, bottom, etc.)
            ───────────────────────────────────────── */}

            {needsSecondary && (
              <Card className="overflow-hidden border-amber-500/30 bg-amber-500/[0.04] transition-colors duration-300 animate-in fade-in slide-in-from-top-2">
                <div className="flex h-12 items-center justify-between border-b border-amber-500/20 px-4">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-300">
                      Additional Image Needed
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  {analysisResult?.message && (
                    <p className="mb-4 text-xs leading-5 text-amber-200/80">
                      {analysisResult.message}
                    </p>
                  )}

                  {report && report.secondary_image_hints.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {report.secondary_image_hints.map((hint, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"
                        >
                          <MapPin className="h-3 w-3" />
                          {hint.field_hint !== "unspecified"
                            ? humanize(hint.field_hint)
                            : "Field"}{" "}
                          — see {hint.location.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    className="group relative flex min-h-[220px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-amber-500/30 bg-[#101010] transition-all duration-300 hover:border-amber-500/50"
                    onClick={() =>
                      !secondaryImage && secondaryInputRef.current?.click()
                    }
                  >
                    {secondaryImage ? (
                      <img
                        src={secondaryImage}
                        alt="Secondary document"
                        className="h-full max-h-[220px] w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-center px-4">
                        <ImagePlus className="mb-3 h-6 w-6 text-amber-400/70" />
                        <p className="text-sm font-medium text-white/85">
                          Upload the secondary photo
                        </p>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-white/50">
                          e.g. the bottle neck, cap, or bottom of the pack
                        </p>
                      </div>
                    )}
                  </div>

                  {secondaryFileName && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                      <FileImage className="h-3.5 w-3.5 text-white/50" />
                      <span className="truncate">{secondaryFileName}</span>
                    </div>
                  )}

                  <input
                    ref={secondaryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSecondaryFile(f);
                    }}
                  />

                  <Button
                    className="mt-5 h-11 w-full bg-amber-400 text-black transition-all duration-200 hover:bg-amber-300 active:bg-amber-500"
                    disabled={!secondaryImage || secondaryAnalyzing}
                    onClick={handleAnalyzeSecondary}
                  >
                    {secondaryAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing secondary image...
                      </>
                    ) : (
                      <>
                        <ScanSearch className="mr-2 h-4 w-4" />
                        Analyze & Combine Results
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* ─────────────────────────────────────────
              RIGHT — RESULTS
          ───────────────────────────────────────── */}

          <Card className="overflow-hidden border-white/15 bg-[#1b1b1b] transition-colors duration-300 hover:border-white/25">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2">
                <ScanSearch className="h-4 w-4 text-white/60" />
                <span className="text-sm font-medium text-white/90">
                  Analysis Results
                </span>
              </div>

              <div className="flex items-center gap-2">
                {needsSecondary && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/5 text-amber-400"
                  >
                    Awaiting 2nd image
                  </Badge>
                )}
                {analyzed && report && !needsSecondary && (
                  <Badge
                    variant="outline"
                    className="border-green-500/30 bg-green-500/5 text-green-400"
                  >
                    Analyzed
                  </Badge>
                )}
              </div>
            </div>

            <div className="p-5">
              {!analysisResult ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <ScanSearch className="h-6 w-6 text-white/40" />
                  </div>
                  <p className="text-sm font-medium text-white/70">
                    No document analyzed yet
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-white/45">
                    Upload a package image on the left and click "Analyze
                    Document" to see results here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Overall Status */}
                  <div
                    className={`rounded-lg border p-5 transition-colors duration-300 ${
                      needsSecondary
                        ? "border-amber-500/20 bg-amber-500/5"
                        : report?.is_compliant
                          ? "border-green-500/20 bg-green-500/5 hover:border-green-500/30"
                          : "border-red-500/20 bg-red-500/5 hover:border-red-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                          needsSecondary
                            ? "bg-amber-500/10"
                            : report?.is_compliant
                              ? "bg-green-500/10"
                              : "bg-red-500/10"
                        }`}
                      >
                        {needsSecondary ? (
                          <ImagePlus className="h-6 w-6 text-amber-400" />
                        ) : report?.is_compliant ? (
                          <CheckCircle2 className="h-6 w-6 text-green-400" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                          Overall Status
                        </p>

                        <p
                          className={`mt-1 text-xl font-semibold ${
                            needsSecondary
                              ? "text-amber-400"
                              : report?.is_compliant
                                ? "text-green-400"
                                : "text-red-400"
                          }`}
                        >
                          {needsSecondary
                            ? "Pending — 2nd image needed"
                            : report?.is_compliant
                              ? "Compliant"
                              : "Non-Compliant"}
                        </p>

                        {report && (
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full ${
                                  report.is_compliant
                                    ? "bg-green-400"
                                    : "bg-red-400"
                                }`}
                                style={{ width: report.compliance_score }}
                              />
                            </div>
                            <span className="text-xs text-white/40">
                              {report.compliance_score} compliant
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Product Category */}
                  {report && (
                    <div className="mt-4 flex items-center gap-2 rounded-md border border-white/10 bg-[#141414] px-4 py-2.5">
                      <Tag className="h-3.5 w-3.5 shrink-0 text-white/45" />
                      <span className="text-xs text-white/50">
                        Detected category:
                      </span>
                      <span className="text-xs font-medium text-white/85">
                        {humanize(report.product_category)}
                      </span>
                    </div>
                  )}

                  {/* Declaration Checks — dynamic, based on whatever the
                      backend actually checked for this category */}
                  {report && report.fields_checked.length > 0 && (
                    <div className="mt-6">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/50">
                        Declaration Checks
                      </p>

                      <div className="space-y-2">
                        {report.fields_checked.map((label) => {
                          const key = FIELD_KEY_BY_LABEL[label];
                          const rawValue = key ? fields[key] : undefined;
                          const { text, isPlaceholder } = formatValue(rawValue);
                          const missing =
                            report.missing_mandatory_fields.includes(label);

                          return (
                            <FieldRow
                              key={label}
                              fieldKey={key}
                              label={label}
                              value={text}
                              missing={missing}
                              isPlaceholder={isPlaceholder}
                              legalBasis={report.legal_basis[label]}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {report && report.warnings.length > 0 && (
                    <div className="mt-6">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/50">
                        Warnings
                      </p>
                      <div className="space-y-2">
                        {report.warnings.map((w, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3"
                          >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <span className="text-xs leading-5 text-amber-200/85">
                              {w}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                      Summary
                    </p>

                    <p className="mt-3 text-sm leading-6 text-white/65">
                      {needsSecondary
                        ? "One or more declarations could only be found by referring to another part of the package. Upload the secondary image on the left to complete the check."
                        : report?.is_compliant
                          ? "All mandatory declarations for this product category were identified in the uploaded document(s)."
                          : `Some mandatory declarations were not identified. ${report?.missing_mandatory_fields.length} field(s) require further verification.`}
                    </p>
                  </div>

                  {/* Raw OCR text (collapsible) */}
                  {analysisResult.extracted_data && (
                    <div className="mt-6 border-t border-white/10 pt-4">
                      <button
                        className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-white/50 transition-colors hover:text-white/70"
                        onClick={() => setShowRawText((v) => !v)}
                      >
                        Raw OCR Text
                        {showRawText ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {showRawText && (
                        <div className="mt-3 space-y-3">
                          <RawTextBlock
                            title={
                              analysisResult.extracted_data
                                .raw_text_detected_primary
                                ? "Primary image"
                                : "Detected text"
                            }
                            lines={
                              analysisResult.extracted_data
                                .raw_text_detected_primary ??
                              analysisResult.extracted_data.raw_text_detected ??
                              []
                            }
                          />
                          {analysisResult.extracted_data
                            .raw_text_detected_secondary && (
                            <RawTextBlock
                              title="Secondary image"
                              lines={
                                analysisResult.extracted_data
                                  .raw_text_detected_secondary
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="mt-6 flex items-center justify-center">
          <p className="text-xs text-white/40">
            Supported formats: JPG, JPEG, PNG
          </p>
        </div>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────
   FIELD ROW
───────────────────────────────────────────── */

function FieldRow({
  label,
  value,
  missing,
  isPlaceholder,
  legalBasis,
  fieldKey,
}: {
  label: string;
  value: string;
  missing: boolean;
  isPlaceholder: boolean;
  legalBasis?: string;
  fieldKey?: string;
}) {
  const status: "pass" | "warning" = missing ? "warning" : "pass";

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/80">{label}</span>
        <div className="flex items-center gap-2">
          {status === "pass" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400" />
          )}
          {fieldKey && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span
          className={`truncate text-xs ${
            isPlaceholder
              ? "font-medium text-amber-400"
              : missing
                ? "text-white/35"
                : "text-white/55"
          }`}
        >
          {value}
        </span>
      </div>

      {legalBasis && (
        <p className="mt-1 truncate text-[10px] text-white/25">{legalBasis}</p>
      )}
    </>
  );

  const className =
    "group block rounded-md border border-white/10 bg-[#141414] px-4 py-3 transition-colors duration-200 hover:border-white/20 hover:bg-[#181818]";

  if (fieldKey) {
    return (
      <Link href={`/rules/${fieldKey}`} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
/* ─────────────────────────────────────────────
   RAW TEXT BLOCK
───────────────────────────────────────────── */

function RawTextBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#101010] p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/35">
        {title}
      </p>
      {lines.length === 0 ? (
        <p className="text-xs text-white/30">No text detected.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lines.map((line, i) => (
            <span
              key={i}
              className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/55"
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
