"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  ChevronRight,
  Tag,
  BookmarkCheck,
  ClipboardCheck,
  Camera,
  CameraOff,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE = "http://127.0.0.1:8000";

// Isolated default officer identity for the persistent inspection registry.
// Can be replaced by real auth claims (JWT/session) in future phases.
const DEFAULT_OFFICER_NAME = "Officer #1042";

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
  compliance_status?: string;
  compliance_score: string;
  missing_mandatory_fields: string[];
  needs_secondary_image: boolean;
  secondary_image_hints: SecondaryHint[];
  warnings: string[];
  legal_basis: Record<string, string>;
};

type OCRSegment = {
  text: string;
  confidence?: number | null;
};

type AnalysisResult = {
  status: "complete" | "needs_secondary_image";
  compliance_status?: string;
  session_id?: string;
  message?: string;
  extracted_data: {
    standard_fields: Record<string, unknown>;
    raw_text_detected?: string[];
    raw_text_detected_primary?: string[];
    raw_text_detected_secondary?: string[];
    ocr_segments?: OCRSegment[];
    ocr_segments_primary?: OCRSegment[];
    ocr_segments_secondary?: OCRSegment[];
    ocr_confidence?: number | null;
  };
  compliance_report: ComplianceReport;
};

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): { text: string; isPlaceholder: boolean } {
  if (value === null || value === undefined || value === "") {
    return { text: "Not detected", isPlaceholder: false };
  }
  if (Array.isArray(value)) {
    return { text: value.join(", "), isPlaceholder: false };
  }
  const str = String(value);
  return { text: str, isPlaceholder: str.toUpperCase().startsWith("SEE ") };
}

function getComplianceEvaluation(
  result: AnalysisResult | null,
  report: ComplianceReport | undefined,
  needsSecondary: boolean
): { isCompliant: boolean; statusText: string } {
  if (needsSecondary || result?.status === "needs_secondary_image" || report?.needs_secondary_image) {
    return { isCompliant: false, statusText: "Pending — 2nd image needed" };
  }

  if (!report) {
    return { isCompliant: false, statusText: "Non-Compliant" };
  }

  // 1. Explicit backend compliance_status check (preserving backend status, case-insensitive)
  const explicitStatus = result?.compliance_status || report.compliance_status;
  if (typeof explicitStatus === "string") {
    const normalized = explicitStatus.trim().toUpperCase();
    if (normalized === "COMPLIANT") {
      return { isCompliant: true, statusText: "Compliant" };
    }
    if (normalized === "NON_COMPLIANT" || normalized === "NON-COMPLIANT") {
      return { isCompliant: false, statusText: "Non-Compliant" };
    }
    if (normalized === "PENDING_SECONDARY") {
      return { isCompliant: false, statusText: "Pending — 2nd image needed" };
    }
  }

  // 2. Direct boolean is_compliant from backend compliance report
  if (report.is_compliant === true) {
    return { isCompliant: true, statusText: "Compliant" };
  }

  // 3. Score-derived & check-derived compliance:
  // A compliance score of 100% or 0 missing mandatory fields is treated as compliant.
  // Note: OCR confidence is an optical metric and has no bearing on regulatory compliance.
  const scoreNum = parseFloat(String(report.compliance_score || "").replace("%", "").trim());
  const has100Score = !isNaN(scoreNum) && scoreNum >= 100;
  const noMissingFields = Array.isArray(report.missing_mandatory_fields) && report.missing_mandatory_fields.length === 0;

  if ((has100Score || noMissingFields) && !report.needs_secondary_image) {
    return { isCompliant: true, statusText: "Compliant" };
  }

  return { isCompliant: false, statusText: "Non-Compliant" };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );

  // Camera Scanning State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturedViaCamera, setIsCapturedViaCamera] = useState(false);

  const [secondaryImage, setSecondaryImage] = useState<string | null>(null);
  const [secondaryFileName, setSecondaryFileName] = useState("");
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [secondaryAnalyzing, setSecondaryAnalyzing] = useState(false);

  const [showRawText, setShowRawText] = useState(false);

  // Inspection record saving state
  const [savingInspection, setSavingInspection] = useState(false);
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const needsSecondary =
    analysisResult?.status === "needs_secondary_image" &&
    !!analysisResult.session_id;

  // Camera Lifecycle: stop active MediaStream tracks to prevent hardware/resource leaks
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping camera track:", e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera access is not supported by your current browser. Please use Upload Image or try Chrome/Edge.",
      );
      return;
    }

    // Stop any existing stream before starting a new one
    stopCameraStream();

    try {
      let stream: MediaStream;
      try {
        // Preferred environment/rear camera for packaged commodities
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        // Graceful fallback for webcams / desktop without facingMode constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (err) {
          console.warn("Video play interrupted:", err);
        }
      }
    } catch (err: unknown) {
      console.error("Camera access error:", err);
      let msg =
        "Unable to access camera. Please check camera permissions or use Upload Image instead.";
      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          msg =
            "Camera access was denied. Please allow camera access in your browser settings or use Upload Image instead.";
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          msg =
            "No camera device was found on this system. Please connect a camera or use Upload Image instead.";
        } else if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          msg =
            "The camera is currently in use by another application or could not be accessed.";
        }
      }
      setCameraError(msg);
      stopCameraStream();
    }
  };

  const cancelCamera = () => {
    stopCameraStream();
    setIsCameraActive(false);
    setCameraError(null);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
          now.getDate(),
        )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const name = `scan_${timeStr}.jpg`;

        const capturedFile = new File([blob], name, { type: "image/jpeg" });

        // Immediately stop camera stream to release hardware
        stopCameraStream();
        setIsCameraActive(false);
        setCameraError(null);

        // Feed existing analysis state
        setFile(capturedFile);
        setFileName(name);
        setImage(URL.createObjectURL(blob));
        setIsCapturedViaCamera(true);
        setAnalyzed(false);
        setAnalysisResult(null);
        setSecondaryImage(null);
        setSecondaryFile(null);
        setSecondaryFileName("");
        setShowRawText(false);
        setSavedInspectionId(null);
        setSaveError(null);
      },
      "image/jpeg",
      0.95,
    );
  };

  const retake = () => {
    removeImage();
    startCamera();
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    stopCameraStream();
    setIsCameraActive(false);
    setCameraError(null);
    setIsCapturedViaCamera(false);
    setFile(f);
    setFileName(f.name);
    setImage(URL.createObjectURL(f));
    setAnalyzed(false);
    setAnalysisResult(null);
    setSecondaryImage(null);
    setSecondaryFile(null);
    setSecondaryFileName("");
    setShowRawText(false);
    setSavedInspectionId(null);
    setSaveError(null);
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
    setSavedInspectionId(null);
    setSaveError(null);

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
    setSavedInspectionId(null);
    setSaveError(null);

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

  const handleSaveInspection = async () => {
    if (!analysisResult || savingInspection || savedInspectionId) return;

    setSavingInspection(true);
    setSaveError(null);

    try {
      const standardFields =
        (analysisResult.extracted_data?.standard_fields as Record<
          string,
          string
        >) || {};
      const rep = analysisResult.compliance_report;

      const productName = standardFields.commodity_name || undefined;
      const companyName = standardFields.manufacturer || undefined;
      const productCategory = rep?.product_category || undefined;

      const { isCompliant: isInspectionCompliant } = getComplianceEvaluation(
        analysisResult,
        rep,
        needsSecondary,
      );
      const complianceStatus =
        analysisResult.status === "needs_secondary_image" || needsSecondary
          ? "PENDING_SECONDARY"
          : isInspectionCompliant
            ? "COMPLIANT"
            : "NON_COMPLIANT";

      const complianceScore = rep?.compliance_score || undefined;
      const violations = rep?.missing_mandatory_fields || [];

      const payload = {
        session_id: analysisResult.session_id || undefined,
        officer_name: DEFAULT_OFFICER_NAME,
        company_name: companyName,
        product_name: productName,
        product_category: productCategory,
        latitude: null,
        longitude: null,
        compliance_status: complianceStatus,
        compliance_score: complianceScore,
        extracted_data: analysisResult.extracted_data,
        compliance_report: rep,
        violations: violations,
        image_reference: fileName || undefined,
      };

      const response = await fetch(`${API_BASE}/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        const errData = await response.json().catch(() => ({}));
        setSaveError(
          errData.detail || "This inspection record has already been saved.",
        );
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.detail || `Failed to save inspection (${response.status})`,
        );
      }

      const saved = await response.json();
      setSavedInspectionId(saved.inspection_id || saved.id);
    } catch (err: unknown) {
      console.error("Save inspection error:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to save inspection record.";
      setSaveError(msg);
    } finally {
      setSavingInspection(false);
    }
  };

  const removeImage = () => {
    stopCameraStream();
    setIsCameraActive(false);
    setCameraError(null);
    setIsCapturedViaCamera(false);
    setImage(null);
    setFileName("");
    setFile(null);
    setAnalyzed(false);
    setAnalysisResult(null);
    setSecondaryImage(null);
    setSecondaryFile(null);
    setSecondaryFileName("");
    setShowRawText(false);
    setSavedInspectionId(null);
    setSaveError(null);

    if (inputRef.current) inputRef.current.value = "";
    if (secondaryInputRef.current) secondaryInputRef.current.value = "";
  };

  const report = analysisResult?.compliance_report;
  const fields = analysisResult?.extracted_data.standard_fields ?? {};
  const { isCompliant, statusText } = getComplianceEvaluation(
    analysisResult,
    report,
    needsSecondary,
  );

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
                  {isCapturedViaCamera && image && (
                    <span className="ml-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                      Camera Scan
                    </span>
                  )}
                  {isCameraActive && (
                    <span className="ml-1 flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      Live Viewfinder
                    </span>
                  )}
                </div>

                {(image || isCameraActive) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={isCameraActive ? cancelCamera : removeImage}
                    className="h-7 w-7 text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    title={isCameraActive ? "Cancel camera" : "Remove image"}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="p-5">
                {/* Hidden canvas used for high-res frame capture */}
                <canvas ref={canvasRef} className="hidden" />

                {/* 1. Live Camera Viewfinder Mode */}
                {isCameraActive ? (
                  <div className="space-y-4">
                    <div className="relative flex min-h-[380px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-white/20 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full max-h-[380px] w-full object-contain"
                      />

                      {/* Viewfinder Target Framing Overlay */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
                        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm">
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          <span>Field Scanner Active</span>
                        </div>

                        {/* Center Framing Reticle */}
                        <div className="relative h-44 w-64 max-w-[85%] rounded-lg border-2 border-dashed border-white/40">
                          <div className="absolute -top-1 -left-1 h-3.5 w-3.5 border-t-2 border-l-2 border-white" />
                          <div className="absolute -top-1 -right-1 h-3.5 w-3.5 border-t-2 border-r-2 border-white" />
                          <div className="absolute -bottom-1 -left-1 h-3.5 w-3.5 border-b-2 border-l-2 border-white" />
                          <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 border-b-2 border-r-2 border-white" />
                        </div>

                        <p className="rounded bg-black/60 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur-sm">
                          Align product declaration label within reticle
                        </p>
                      </div>

                      {/* Viewfinder Bottom Controls */}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelCamera}
                          className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5 cursor-pointer text-xs"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>

                        <Button
                          onClick={captureFrame}
                          className="h-10 px-5 gap-2 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 font-medium text-xs cursor-pointer shadow-lg transition-transform"
                        >
                          <Camera className="h-4 w-4" />
                          Capture Photo
                        </Button>

                        <div className="w-16" />
                      </div>
                    </div>

                    {cameraError && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
                        <div className="flex items-start gap-2.5">
                          <CameraOff className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-red-300">Camera Notice</p>
                            <p className="mt-0.5 leading-5 text-red-200/80">{cameraError}</p>
                            <div className="mt-2.5 flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={startCamera}
                                className="h-7 text-xs border-red-500/40 text-red-200 hover:bg-red-500/20 cursor-pointer"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelCamera}
                                className="h-7 text-xs text-white/60 hover:text-white cursor-pointer"
                              >
                                Use Upload Instead
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : image ? (
                  /* 2. Captured or Uploaded Image Preview Mode */
                  <div>
                    <div className="group relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-[#101010]">
                      <img
                        src={image}
                        alt="Product document"
                        className="h-full max-h-[380px] w-full object-contain"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <p className="text-xs font-medium text-white/80">
                          {isCapturedViaCamera ? "Captured via Camera Scanner" : "Uploaded document"}
                        </p>
                      </div>
                    </div>

                    {/* Action Bar for Captured / Uploaded Image */}
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-white/10 bg-[#141414] px-3.5 py-2">
                      <div className="flex items-center gap-2 text-xs text-white/60 min-w-0">
                        {isCapturedViaCamera ? (
                          <Camera className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                        ) : (
                          <FileImage className="h-3.5 w-3.5 shrink-0 text-white/50" />
                        )}
                        <span className="truncate">{fileName}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCapturedViaCamera && !analyzed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={retake}
                            className="h-7 px-2.5 text-xs text-white/70 hover:text-white hover:bg-white/10 gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retake
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={removeImage}
                          className="h-7 px-2 text-xs text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Remove image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Analyze Action */}
                    <Button
                      className="mt-4 h-11 w-full bg-white text-black transition-all duration-200 hover:bg-white/90 active:bg-white/80 font-medium cursor-pointer"
                      disabled={analyzing || needsSecondary}
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
                ) : (
                  /* 3. Empty State: Dual Action - Scan Product or Upload Image */
                  <div className="flex flex-col items-center justify-center min-h-[380px] rounded-lg border border-dashed border-white/20 bg-[#101010] p-6 text-center transition-all duration-300 hover:border-white/30 hover:bg-[#121212]">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-transform duration-300">
                      <ScanSearch className="h-7 w-7 text-white/60" />
                    </div>

                    <p className="text-base font-semibold text-white/90">
                      Add Product Image
                    </p>
                    <p className="mt-1.5 max-w-sm text-xs leading-5 text-white/50">
                      Scan the packaged commodity directly using your device camera or upload an existing photo from disk.
                    </p>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm">
                      <Button
                        onClick={startCamera}
                        className="w-full min-w-0 h-10 gap-2 bg-white text-black hover:bg-white/90 active:bg-white/80 font-medium text-xs cursor-pointer shadow-sm transition-all"
                      >
                        <Camera className="h-4 w-4 shrink-0" />
                        <span className="truncate">Scan Product</span>
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => inputRef.current?.click()}
                        className="w-full min-w-0 h-10 gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/25 text-xs cursor-pointer transition-all"
                      >
                        <Upload className="h-4 w-4 shrink-0" />
                        <span className="truncate">Upload Image</span>
                      </Button>
                    </div>

                    {cameraError && (
                      <div className="mt-5 w-full max-w-xs rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
                        <div className="flex items-start gap-2">
                          <CameraOff className="h-3.5 w-3.5 shrink-0 text-red-400 mt-0.5" />
                          <span className="text-left text-[11px] leading-snug">{cameraError}</span>
                        </div>
                      </div>
                    )}
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
                    Upload a package image on the left and click &quot;Analyze
                    Document&quot; to see results here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Overall Status */}
                  <div
                    className={`rounded-lg border p-5 transition-colors duration-300 ${
                      needsSecondary
                        ? "border-amber-500/20 bg-amber-500/5"
                        : isCompliant
                          ? "border-green-500/20 bg-green-500/5 hover:border-green-500/30"
                          : "border-red-500/20 bg-red-500/5 hover:border-red-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                          needsSecondary
                            ? "bg-amber-500/10"
                            : isCompliant
                              ? "bg-green-500/10"
                              : "bg-red-500/10"
                        }`}
                      >
                        {needsSecondary ? (
                          <ImagePlus className="h-6 w-6 text-amber-400" />
                        ) : isCompliant ? (
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
                              : isCompliant
                                ? "text-green-400"
                                : "text-red-400"
                          }`}
                        >
                          {statusText}
                        </p>

                        {report && (
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full ${
                                  isCompliant
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

                  {/* OCR Recognition Confidence Indicator */}
                  {analysisResult.extracted_data.ocr_confidence !== undefined &&
                    analysisResult.extracted_data.ocr_confidence !== null && (
                      <div className="mt-4 rounded-lg border border-white/10 bg-[#141414] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                                OCR Confidence
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                                  analysisResult.extracted_data.ocr_confidence >= 0.9
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : analysisResult.extracted_data.ocr_confidence >= 0.75
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : "border-red-500/30 bg-red-500/10 text-red-300"
                                }`}
                              >
                                {analysisResult.extracted_data.ocr_confidence >= 0.9
                                  ? "High (>= 90%)"
                                  : analysisResult.extracted_data.ocr_confidence >= 0.75
                                    ? "Moderate (75-89%)"
                                    : "Low (< 75%)"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
                              Mean optical recognition confidence across detected text segments.
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-2xl font-bold tracking-tight text-white">
                              {Math.round(analysisResult.extracted_data.ocr_confidence * 100)}%
                            </div>
                            <span className="text-[10px] text-white/40 block">
                              Recognition confidence
                            </span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              analysisResult.extracted_data.ocr_confidence >= 0.9
                                ? "bg-emerald-400"
                                : analysisResult.extracted_data.ocr_confidence >= 0.75
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Math.round(analysisResult.extracted_data.ocr_confidence * 100)
                                )
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/35">
                          <span>UI guidance threshold: High &ge;90% &bull; Moderate &ge;75% &bull; Low &lt;75%</span>
                          <span className="italic">Does not imply statutory compliance</span>
                        </div>
                      </div>
                    )}

                  {/* Inspection Record Action & Status Banner */}
                  <div className="mt-4 rounded-lg border border-white/10 bg-[#141414] p-4 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5">
                          <ClipboardCheck className="h-4 w-4 text-white/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                              Inspection Record
                            </span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/50">
                              {DEFAULT_OFFICER_NAME}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-white/45">
                            {savedInspectionId
                              ? "Saved to persistent compliance registry"
                              : "Log this analysis into the persistent inspection records"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {savedInspectionId ? (
                          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <span className="font-medium">Record ID:</span>
                            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200">
                              {savedInspectionId}
                            </code>
                          </div>
                        ) : (
                          <Button
                            onClick={handleSaveInspection}
                            disabled={savingInspection}
                            className="h-9 gap-1.5 bg-white text-black hover:bg-white/90 active:bg-white/80 transition-all font-medium text-xs px-4 cursor-pointer"
                          >
                            {savingInspection ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <BookmarkCheck className="h-3.5 w-3.5" />
                                Save Inspection
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {saveError && (
                      <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                        <span className="leading-snug">{saveError}</span>
                      </div>
                    )}

                    {savedInspectionId && (
                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-white/40">
                        <span>Protected against accidental duplicate saves.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSavedInspectionId(null);
                            setSaveError(null);
                          }}
                          className="text-white/60 hover:text-white transition-colors underline underline-offset-2 cursor-pointer"
                        >
                          Start New Inspection
                        </button>
                      </div>
                    )}
                  </div>

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
                        : isCompliant
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
                            segments={
                              analysisResult.extracted_data
                                .ocr_segments_primary ??
                              analysisResult.extracted_data.ocr_segments
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
                              segments={
                                analysisResult.extracted_data
                                  .ocr_segments_secondary
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

function RawTextBlock({
  title,
  lines,
  segments,
}: {
  title: string;
  lines: string[];
  segments?: OCRSegment[];
}) {
  const [viewMode, setViewMode] = useState<"detailed" | "compact">("detailed");

  const hasConfidence =
    segments &&
    segments.some(
      (s) => s.confidence !== undefined && s.confidence !== null
    );

  return (
    <div className="rounded-md border border-white/10 bg-[#101010] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          {title} {segments ? `(${segments.length} segments)` : `(${lines.length} lines)`}
        </p>
        {hasConfidence && (
          <button
            type="button"
            onClick={() =>
              setViewMode((m) => (m === "detailed" ? "compact" : "detailed"))
            }
            className="text-[10px] text-white/50 hover:text-white/80 transition-colors underline underline-offset-2 cursor-pointer"
          >
            {viewMode === "detailed"
              ? "Switch to compact view"
              : "Show recognition confidence"}
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-white/30">No text detected.</p>
      ) : viewMode === "detailed" && segments && segments.length > 0 ? (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {segments.map((seg, i) => {
            const confPercent =
              seg.confidence !== null && seg.confidence !== undefined
                ? Math.round(seg.confidence * 100)
                : null;

            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <span className="font-mono text-white/75 break-all select-text">
                  {seg.text}
                </span>
                {confPercent !== null ? (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border ${
                      confPercent >= 90
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : confPercent >= 75
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}
                    title={`PaddleOCR recognition score: ${seg.confidence}`}
                  >
                    {confPercent}%
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-white/30">
                    N/A
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lines.map((line, i) => (
            <span
              key={i}
              className="rounded bg-white/5 px-2 py-1 text-[11px] font-mono text-white/55"
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
