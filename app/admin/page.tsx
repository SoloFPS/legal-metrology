"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, DEMO_OFFICERS } from "@/lib/auth-context";
import { InspectionMap, LocationPoint } from "@/components/admin/inspection-map";
import {
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  Users,
  AlertTriangle,
  Building2,
  MapPin,
  FileText,
  Search,
  ExternalLink,
  RotateCcw,
  LogOut,
  ScanSearch,
  X,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_BASE = "http://127.0.0.1:8000";

const RULE_KEY_LOOKUP: Record<string, string> = {
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

const LEGAL_BASIS_LOOKUP: Record<string, string> = {
  "Common / Generic Name of Commodity": "LM Rule 6(1)(b); FSSAI Reg 5(1)",
  "Net Quantity / Weight / Volume": "LM Rule 6(1)(c), Rule 12-13; FSSAI Reg 5(8)",
  "Maximum Retail Price (MRP)": "LM Rule 6(1)(e), Rule 2(m); FSSAI Reg 5(8)",
  "Batch / Lot / Code Number": "FSSAI Reg 5(9)",
  "Date of Manufacture / Packaging": "LM Rule 6(1)(d); FSSAI Reg 5(10)(a)",
  "Expiry / Use By / Best Before Date": "FSSAI Reg 5(10)(a)",
  "Manufacturer / Packer / Importer Name & Address": "LM Rule 6(1)(a), Rule 10; FSSAI Reg 5(6)(a)",
  "Consumer Care Contact (Name, Address, Phone/Email)": "LM Rule 6(2); FSSAI Reg 5(8)",
  "14-Digit FSSAI License Number": "FSSAI Reg 5(7)",
};

type AnalyticsData = {
  overview: {
    total_inspections: number;
    compliant_inspections: number;
    non_compliant_inspections: number;
    pending_secondary_inspections: number;
    unknown_inspections: number;
    total_violations: number;
    violating_inspections: number;
    average_compliance_score: number;
  };
  officer_statistics: Array<{
    officer: string;
    inspections: number;
    compliant: number;
    non_compliant: number;
    compliance_rate: number;
  }>;
  violation_intelligence: Array<{
    rule_name: string;
    count: number;
    percentage: number;
  }>;
  company_statistics: Array<{
    company: string;
    inspections: number;
    violating_inspections: number;
    violations: number;
    compliance_rate: number;
  }>;
  locations: LocationPoint[];
  locations_with_coords_count: number;
  locations_without_coords_count: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectionRecord = Record<string, any>;

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isAdmin, isLoading, logout, loginAsDemo } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "overview" | "officers" | "violations" | "map" | "inspections"
  >("overview");

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Inspections Registry & Filters State
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [inspectionsLoading, setInspectionsLoading] = useState(false);
  const [filterOfficer, setFilterOfficer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");

  // Selected inspection modal
  const [selectedInspection, setSelectedInspection] = useState<InspectionRecord | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    fetch(`${API_BASE}/admin/analytics`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load analytics (${res.status})`);
        }
        return res.json();
      })
      .then((data: AnalyticsData) => {
        if (!ignore) {
          setAnalytics(data);
          setAnalyticsError(null);
          setAnalyticsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setAnalyticsError(
            err instanceof Error ? err.message : "Failed to load admin analytics"
          );
          setAnalyticsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    if (filterCompany.trim()) params.append("company", filterCompany.trim());
    if (filterStatus !== "all") params.append("status", filterStatus);
    if (filterOfficer !== "all") params.append("officer", filterOfficer);

    if (filterDateRange === "today") {
      const todayStr = new Date().toISOString().split("T")[0];
      params.append("start_date", todayStr);
    } else if (filterDateRange === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      params.append("start_date", d.toISOString());
    } else if (filterDateRange === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      params.append("start_date", d.toISOString());
    }

    params.append("limit", "100");

    fetch(`${API_BASE}/inspections?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to query inspections");
        return res.json();
      })
      .then((data: InspectionRecord[]) => {
        if (!ignore) {
          setInspections(data);
          setInspectionsLoading(false);
        }
      })
      .catch((e: unknown) => {
        console.warn("Failed to fetch filtered inspections", e);
        if (!ignore) {
          setInspectionsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [filterCompany, filterStatus, filterOfficer, filterDateRange, refreshKey]);

  const handleRefresh = () => {
    setAnalyticsLoading(true);
    setInspectionsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  // Auth gate check
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-white">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>Verifying Administrator Identity...</span>
        </div>
      </div>
    );
  }

  // If unauthenticated: redirect to login
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] p-4 text-white">
        <Card className="max-w-md border-white/10 bg-[#161616] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="mt-2 text-xs text-white/60 leading-relaxed">
            The Inspection Intelligence Panel requires authorized access. Please sign in with your Legal Metrology credentials.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              onClick={() => loginAsDemo("ADM-001")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2"
            >
              Sign In as Prithvi S (Chief Controller)
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/login?redirect=/admin")}
              className="border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
            >
              Go to Full Login Screen
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      {/* ─────────────────────────────────────────────
          ADMIN TOP BAR
      ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#161616]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>

            <span className="text-sm font-semibold tracking-wide text-white">
              LEGAL METROLOGY
            </span>

            <span className="text-sm text-white/30">/</span>

            <span className="text-sm text-white/60">Inspection Intelligence Panel</span>

            <Badge className="ml-2 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
              CONFIDENTIAL • ADMIN
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ScanSearch className="h-3.5 w-3.5 text-white/60" />
              <span>Inspection Scanner</span>
            </Link>

            <div className="flex items-center gap-2 pl-3 border-l border-white/10">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-medium text-white">{user?.name}</span>
                <span className="text-[10px] text-white/40">{user?.badge_number}</span>
              </div>

              <Badge
                className={
                  user?.role === "admin"
                    ? "border-amber-500/30 bg-amber-500/20 text-[10px] text-amber-300"
                    : "border-emerald-500/30 bg-emerald-500/20 text-[10px] text-emerald-300"
                }
              >
                {user?.role === "admin" ? "ADMIN" : "OFFICER"}
              </Badge>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-7 w-7 p-0 text-white/40 hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Role Notice if logged in as standard officer */}
      {!isAdmin && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5">
          <div className="mx-auto flex max-w-7xl items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-400" />
              <span>
                You are currently signed in with field officer credentials (<strong>{user?.name}</strong>). To test administrative overrides and full intelligence actions, you may switch to Prithvi S (Chief Controller).
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => loginAsDemo("ADM-001")}
              className="h-6 bg-amber-500/20 border border-amber-500/40 text-amber-100 hover:bg-amber-500/30 text-[11px] px-2"
            >
              Switch to Chief Controller (Admin)
            </Button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────
          MAIN BODY
      ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Navigation Tabs */}
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "overview"
                ? "bg-white text-black shadow-md"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Executive Overview
          </button>

          <button
            onClick={() => setActiveTab("officers")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "officers"
                ? "bg-white text-black shadow-md"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Officer Performance
          </button>

          <button
            onClick={() => setActiveTab("violations")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "violations"
                ? "bg-white text-black shadow-md"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Violation Intelligence
          </button>

          <button
            onClick={() => setActiveTab("map")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "map"
                ? "bg-white text-black shadow-md"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Geographic Map
          </button>

          <button
            onClick={() => setActiveTab("inspections")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "inspections"
                ? "bg-white text-black shadow-md"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Inspections Registry & Filters
          </button>

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="h-7 border-white/10 bg-white/5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Loading / Error state */}
        {analyticsLoading && !analytics && (
          <div className="flex h-64 items-center justify-center text-sm text-white/50">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <span>Aggregating SQLite Inspection Intelligence...</span>
            </div>
          </div>
        )}

        {analyticsError && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {analyticsError}
          </div>
        )}

        {/* ─────────────────────────────────────────────
            TAB 1: EXECUTIVE OVERVIEW
        ───────────────────────────────────────────── */}
        {activeTab === "overview" && analytics && (
          <div className="space-y-6">
            {/* Overview KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="border-white/10 bg-[#161616] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Total Inspections
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-white">
                    {analytics.overview.total_inspections}
                  </span>
                  <span className="text-xs text-white/40">Registered</span>
                </div>
                <div className="mt-2 text-[10px] text-white/40">
                  Across all active zones
                </div>
              </Card>

              <Card className="border-white/10 bg-[#161616] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Compliant Inspections
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-emerald-400">
                    {analytics.overview.compliant_inspections}
                  </span>
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                    {analytics.overview.total_inspections > 0
                      ? Math.round(
                          (analytics.overview.compliant_inspections /
                            analytics.overview.total_inspections) *
                            100
                        )
                      : 0}
                    %
                  </Badge>
                </div>
                <div className="mt-2 text-[10px] text-white/40">
                  Fully verified packages
                </div>
              </Card>

              <Card className="border-white/10 bg-[#161616] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Non-Compliant
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-rose-400">
                    {analytics.overview.non_compliant_inspections}
                  </span>
                  <Badge className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300">
                    {analytics.overview.total_inspections > 0
                      ? Math.round(
                          (analytics.overview.non_compliant_inspections /
                            analytics.overview.total_inspections) *
                            100
                        )
                      : 0}
                    %
                  </Badge>
                </div>
                <div className="mt-2 text-[10px] text-white/40">
                  Mandatory declarations missing
                </div>
              </Card>

              <Card className="border-white/10 bg-[#161616] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Total Violations
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-amber-400">
                    {analytics.overview.total_violations}
                  </span>
                  <span className="text-xs text-white/40">Infractions</span>
                </div>
                <div className="mt-2 text-[10px] text-white/40">
                  Across {analytics.overview.violating_inspections} packages
                </div>
              </Card>

              <Card className="border-white/10 bg-[#161616] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Avg Compliance Score
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-cyan-400">
                    {analytics.overview.average_compliance_score}%
                  </span>
                  <span className="text-xs text-white/40">Grade</span>
                </div>
                <div className="mt-2 text-[10px] text-white/40">
                  Weighted declaration match
                </div>
              </Card>
            </div>

            {/* Officer Performance Snippet & Top Violations Snippet */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Officer Stats Table */}
              <Card className="border-white/10 bg-[#161616] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Officer Inspection Activity</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("officers")}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    View All →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-white/40">
                        <th className="pb-2 font-medium">Officer</th>
                        <th className="pb-2 font-medium text-center">Inspections</th>
                        <th className="pb-2 font-medium text-center">Compliant</th>
                        <th className="pb-2 font-medium text-center">Non-Compliant</th>
                        <th className="pb-2 font-medium text-right">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {analytics.officer_statistics.slice(0, 5).map((stat) => (
                        <tr key={stat.officer} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 font-medium text-white">{stat.officer}</td>
                          <td className="py-2.5 text-center text-white/80">{stat.inspections}</td>
                          <td className="py-2.5 text-center text-emerald-400 font-mono">
                            {stat.compliant}
                          </td>
                          <td className="py-2.5 text-center text-rose-400 font-mono">
                            {stat.non_compliant}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className="inline-block rounded px-2 py-0.5 text-[11px] font-mono font-semibold bg-white/5 text-white/90">
                              {stat.compliance_rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Top Violations Snippet */}
              <Card className="border-white/10 bg-[#161616] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Top Violated Rules</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("violations")}
                    className="text-xs text-amber-400 hover:underline"
                  >
                    Intelligence Breakdown →
                  </button>
                </div>

                <div className="space-y-3">
                  {analytics.violation_intelligence.slice(0, 4).map((rule, idx) => (
                    <div
                      key={rule.rule_name}
                      className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white">
                          #{idx + 1} {rule.rule_name}
                        </span>
                        <span className="font-mono text-amber-400 font-semibold">
                          {rule.count} violations ({rule.percentage}%)
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${Math.min(rule.percentage * 2, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Geographic Preview Snippet */}
            <Card className="border-white/10 bg-[#161616] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Geographic Inspection Distribution</h3>
                </div>
                <button
                  onClick={() => setActiveTab("map")}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  Open Full Map →
                </button>
              </div>

              <InspectionMap
                locations={analytics.locations}
                withoutCoordsCount={analytics.locations_without_coords_count}
                onSelectInspection={(id) => {
                  const match = inspections.find((i) => i.id === id);
                  if (match) setSelectedInspection(match);
                }}
              />
            </Card>
          </div>
        )}

        {/* ─────────────────────────────────────────────
            TAB 2: OFFICER PERFORMANCE
        ───────────────────────────────────────────── */}
        {activeTab === "officers" && analytics && (
          <div className="space-y-6">
            <Card className="border-white/10 bg-[#161616] p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-white">
                  Officer Enforcement & Inspection Statistics
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Individual performance metrics sorted by total inspections conducted. Data is derived directly from SQLite inspection persistence.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40">
                      <th className="pb-3 font-medium">Officer Name</th>
                      <th className="pb-3 font-medium">Identity / Zone</th>
                      <th className="pb-3 font-medium text-center">Total Inspections</th>
                      <th className="pb-3 font-medium text-center">Compliant</th>
                      <th className="pb-3 font-medium text-center">Non-Compliant</th>
                      <th className="pb-3 font-medium text-right">Compliance Rate</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {analytics.officer_statistics.map((stat) => {
                      const demoMatch = DEMO_OFFICERS.find((d) => d.name === stat.officer);
                      return (
                        <tr key={stat.officer} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 font-medium text-white flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/70">
                              <Users className="h-3.5 w-3.5" />
                            </span>
                            <span>{stat.officer}</span>
                          </td>
                          <td className="py-3.5 text-white/50">
                            {demoMatch?.zone || "Central Inspection Registry"}
                          </td>
                          <td className="py-3.5 text-center font-bold text-white">
                            {stat.inspections}
                          </td>
                          <td className="py-3.5 text-center text-emerald-400 font-mono font-semibold">
                            {stat.compliant}
                          </td>
                          <td className="py-3.5 text-center text-rose-400 font-mono font-semibold">
                            {stat.non_compliant}
                          </td>
                          <td className="py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden hidden sm:block">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${stat.compliance_rate}%` }}
                                />
                              </div>
                              <span className="font-mono font-semibold text-white">
                                {stat.compliance_rate}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFilterOfficer(stat.officer);
                                setActiveTab("inspections");
                              }}
                              className="h-6 text-[10px] border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            >
                              Filter Records
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ─────────────────────────────────────────────
            TAB 3: VIOLATION INTELLIGENCE
        ───────────────────────────────────────────── */}
        {activeTab === "violations" && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Most Violated Rules */}
              <Card className="border-white/10 bg-[#161616] p-6">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h3 className="text-base font-semibold text-white">Most Violated Rules & Declarations</h3>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Ranked by frequency of infringement across all analyzed packages. Links lead to statutory rule explanations.
                  </p>
                </div>

                <div className="space-y-3.5">
                  {analytics.violation_intelligence.map((rule, idx) => {
                    const ruleKey = RULE_KEY_LOOKUP[rule.rule_name];
                    const legalBasis = LEGAL_BASIS_LOOKUP[rule.rule_name];

                    return (
                      <div
                        key={rule.rule_name}
                        className="rounded-lg border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10 text-[10px] font-bold text-amber-400">
                                #{idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-white">
                                {rule.rule_name}
                              </span>
                            </div>
                            {legalBasis && (
                              <p className="mt-1 text-[11px] text-white/40 pl-7">{legalBasis}</p>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-bold text-amber-400 font-mono">
                              {rule.count}
                            </span>
                            <span className="block text-[10px] text-white/40 font-mono">
                              {rule.percentage}% of all
                            </span>
                          </div>
                        </div>

                        {/* Frequency Bar */}
                        <div className="mt-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${Math.min(rule.percentage * 2.5, 100)}%` }}
                          />
                        </div>

                        {/* Link to rule explanation */}
                        {ruleKey && (
                          <div className="mt-2 text-right">
                            <Link
                              href={`/rules/${ruleKey}`}
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                            >
                              Inspect Statutory Rule <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Companies With Most Violations */}
              <Card className="border-white/10 bg-[#161616] p-6">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-rose-400" />
                    <h3 className="text-base font-semibold text-white">
                      Companies With Most Violations
                    </h3>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Identifying repeat non-compliant manufacturers and packers across market surveillance runs.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-white/40">
                        <th className="pb-3 font-medium">Company / Packer</th>
                        <th className="pb-3 font-medium text-center">Inspections</th>
                        <th className="pb-3 font-medium text-center">Violations</th>
                        <th className="pb-3 font-medium text-right">Compliance Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {analytics.company_statistics.map((comp) => (
                        <tr key={comp.company} className="hover:bg-white/[0.02]">
                          <td className="py-3 font-medium text-white max-w-[200px] truncate">
                            {comp.company}
                          </td>
                          <td className="py-3 text-center text-white/80">
                            <span className="font-mono">{comp.inspections}</span>
                            <span className="text-[10px] text-white/40 block">
                              ({comp.violating_inspections} violating)
                            </span>
                          </td>
                          <td className="py-3 text-center font-bold font-mono text-rose-400">
                            {comp.violations}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-mono font-semibold ${
                                comp.compliance_rate >= 80
                                  ? "bg-emerald-500/10 text-emerald-300"
                                  : comp.compliance_rate >= 50
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "bg-rose-500/10 text-rose-300"
                              }`}
                            >
                              {comp.compliance_rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 rounded border border-white/5 bg-white/[0.02] p-3 text-[11px] text-white/40">
                  <strong className="text-white/60">Metric Clarification:</strong> &quot;Inspections&quot; represents total package audits, &quot;Violating Inspections&quot; counts packages failing at least 1 rule, and &quot;Violations&quot; is the sum total of distinct missing declarations.
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────
            TAB 4: GEOGRAPHIC MAP
        ───────────────────────────────────────────── */}
        {activeTab === "map" && analytics && (
          <div className="space-y-6">
            <InspectionMap
              locations={analytics.locations}
              withoutCoordsCount={analytics.locations_without_coords_count}
              onSelectInspection={(id) => {
                const match = inspections.find((i) => i.id === id);
                if (match) setSelectedInspection(match);
              }}
            />
          </div>
        )}

        {/* ─────────────────────────────────────────────
            TAB 5: INSPECTIONS REGISTRY & FILTERS
        ───────────────────────────────────────────── */}
        {activeTab === "inspections" && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <Card className="border-white/10 bg-[#161616] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Search Company */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-white/50">
                    Search Company / Manufacturer
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={filterCompany}
                      onChange={(e) => setFilterCompany(e.target.value)}
                      placeholder="e.g. Hindustan, Apex, Moon"
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <Search className="pointer-events-none absolute right-2.5 top-2 h-3.5 w-3.5 text-white/30" />
                  </div>
                </div>

                {/* Filter Officer */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-white/50">
                    Filter by Officer
                  </label>
                  <select
                    value={filterOfficer}
                    onChange={(e) => setFilterOfficer(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="all">All Officers</option>
                    <option value="Officer #1042">Officer #1042 (Default Legacy)</option>
                    {DEMO_OFFICERS.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name} ({o.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Compliance Status */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-white/50">
                    Compliance Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="COMPLIANT">Compliant</option>
                    <option value="NON_COMPLIANT">Non-Compliant</option>
                    <option value="PENDING_SECONDARY">Pending Secondary Image</option>
                  </select>
                </div>

                {/* Date Range Filter */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-white/50">
                    Date Range
                  </label>
                  <select
                    value={filterDateRange}
                    onChange={(e) => setFilterDateRange(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                  </select>
                </div>
              </div>

              {/* Active filters pill list */}
              {(filterCompany || filterStatus !== "all" || filterOfficer !== "all" || filterDateRange !== "all") && (
                <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2 text-xs">
                  <span className="text-[11px] text-white/40">Active Filters:</span>
                  {filterCompany && (
                    <Badge variant="outline" className="border-white/10 text-[10px] text-white/70">
                      Company: {filterCompany}
                    </Badge>
                  )}
                  {filterOfficer !== "all" && (
                    <Badge variant="outline" className="border-white/10 text-[10px] text-white/70">
                      Officer: {filterOfficer}
                    </Badge>
                  )}
                  {filterStatus !== "all" && (
                    <Badge variant="outline" className="border-white/10 text-[10px] text-white/70">
                      Status: {filterStatus}
                    </Badge>
                  )}
                  {filterDateRange !== "all" && (
                    <Badge variant="outline" className="border-white/10 text-[10px] text-white/70">
                      Range: {filterDateRange}
                    </Badge>
                  )}
                  <button
                    onClick={() => {
                      setFilterCompany("");
                      setFilterOfficer("all");
                      setFilterStatus("all");
                      setFilterDateRange("all");
                    }}
                    className="ml-auto text-[11px] text-emerald-400 hover:underline"
                  >
                    Reset All Filters
                  </button>
                </div>
              )}
            </Card>

            {/* Inspections Table */}
            <Card className="border-white/10 bg-[#161616] p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Inspection Records ({inspections.length})
                </span>
                {inspectionsLoading && (
                  <span className="text-xs text-white/40 flex items-center gap-1.5">
                    <div className="h-3 w-3 animate-spin rounded-full border border-emerald-500 border-t-transparent" />
                    Querying records...
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40">
                      <th className="pb-3 font-medium">Inspection ID</th>
                      <th className="pb-3 font-medium">Date / Time</th>
                      <th className="pb-3 font-medium">Officer</th>
                      <th className="pb-3 font-medium">Company</th>
                      <th className="pb-3 font-medium">Product</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                      <th className="pb-3 font-medium text-center">Score</th>
                      <th className="pb-3 font-medium text-center">GPS</th>
                      <th className="pb-3 font-medium text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {inspections.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-xs text-white/40">
                          No inspections match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      inspections.map((insp) => {
                        const isCompliant =
                          insp.compliance_status?.toUpperCase() === "COMPLIANT";
                        const isPending =
                          insp.compliance_status?.toUpperCase().includes("PENDING");
                        const hasCoords =
                          insp.latitude !== null &&
                          insp.longitude !== null &&
                          insp.latitude !== undefined;

                        return (
                          <tr key={insp.id} className="hover:bg-white/[0.02]">
                            <td className="py-3 font-mono font-medium text-white/90">
                              {insp.id}
                            </td>
                            <td className="py-3 text-white/50 text-[11px]">
                              {new Date(insp.timestamp || insp.created_at).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="py-3 text-white/80">{insp.officer_name}</td>
                            <td className="py-3 text-white/70 max-w-[160px] truncate">
                              {insp.company_name || "Unbranded / Unknown"}
                            </td>
                            <td className="py-3 text-white/70 max-w-[140px] truncate">
                              {insp.product_name || "Unspecified"}
                            </td>
                            <td className="py-3 text-center">
                              <Badge
                                className={
                                  isCompliant
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300"
                                    : isPending
                                    ? "border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                                    : "border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300"
                                }
                              >
                                {insp.compliance_status}
                              </Badge>
                            </td>
                            <td className="py-3 text-center font-mono font-semibold text-white/80">
                              {insp.compliance_score || "—"}
                            </td>
                            <td className="py-3 text-center">
                              {hasCoords ? (
                                <span
                                  title={`Lat: ${insp.latitude}, Lng: ${insp.longitude}`}
                                  className="inline-flex text-emerald-400"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <span title="No GPS coordinates" className="text-white/20">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedInspection(insp)}
                                className="h-6 text-[10px] border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                              >
                                View Record
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ─────────────────────────────────────────────
            INSPECTION RECORD DETAIL MODAL
        ───────────────────────────────────────────── */}
        {selectedInspection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-white/15 bg-[#161616] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">
                      {selectedInspection.id}
                    </span>
                    <Badge
                      className={
                        selectedInspection.compliance_status?.toUpperCase() === "COMPLIANT"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px]"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-300 text-[10px]"
                      }
                    >
                      {selectedInspection.compliance_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    Recorded on {new Date(selectedInspection.timestamp || selectedInspection.created_at).toLocaleString()}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedInspection(null)}
                  className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 space-y-5 text-xs">
                {/* Officer & Location Details */}
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-3.5">
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Inspecting Officer</span>
                    <span className="font-medium text-white text-sm">{selectedInspection.officer_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Compliance Score</span>
                    <span className="font-bold text-emerald-400 text-sm font-mono">
                      {selectedInspection.compliance_score || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Company / Packer</span>
                    <span className="text-white/80">{selectedInspection.company_name || "Unbranded / Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Commodity Product</span>
                    <span className="text-white/80">{selectedInspection.product_name || "Unspecified"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Geographic Coordinates</span>
                    <span className="text-white/80 font-mono">
                      {selectedInspection.latitude !== null && selectedInspection.latitude !== undefined
                        ? `${selectedInspection.latitude}° N, ${selectedInspection.longitude}° E`
                        : "No GPS coordinates recorded (Legacy)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/40 block">Image Reference</span>
                    <span className="text-white/60 truncate block">{selectedInspection.image_reference || "scan.jpg"}</span>
                  </div>
                </div>

                {/* Violations List */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 block mb-2">
                    Detected Infringements / Missing Declarations ({selectedInspection.violations?.length || 0})
                  </span>
                  {selectedInspection.violations?.length > 0 ? (
                    <div className="space-y-2">
                      {selectedInspection.violations.map((v: string) => {
                        const ruleKey = RULE_KEY_LOOKUP[v];
                        return (
                          <div
                            key={v}
                            className="flex items-center justify-between rounded border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-rose-300"
                          >
                            <span className="font-medium">{v}</span>
                            {ruleKey && (
                              <Link
                                href={`/rules/${ruleKey}`}
                                className="text-[11px] text-rose-400 hover:underline flex items-center gap-1"
                              >
                                Rule Detail <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-300">
                      ✓ No statutory violations identified. Package conforms to checked Legal Metrology declarations.
                    </div>
                  )}
                </div>

                {/* Extracted Fields Breakdown */}
                {selectedInspection.extracted_data?.standard_fields && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 block mb-2">
                      Extracted Package Declarations
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(selectedInspection.extracted_data.standard_fields).map(
                        ([k, v]) => (
                          <div key={k} className="rounded border border-white/5 bg-white/[0.02] p-2">
                            <span className="text-white/40 block text-[10px] uppercase">{k}</span>
                            <span className="text-white/80 font-mono truncate block">
                              {v ? String(v) : "—"}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end border-t border-white/10 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedInspection(null)}
                  className="border-white/10 text-white/70 hover:bg-white/10"
                >
                  Close Record
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Prototype Legal Disclaimer Footer */}
        <footer className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-white/30">
          <p>
            Legal Metrology (Packaged Commodities) Rules, 2011 & FSSAI prototype compliance intelligence system.
          </p>
          <p className="mt-1 text-[11px] text-white/25">
            This administrative dashboard is intended for regulatory demonstration and enforcement prototyping.
          </p>
        </footer>
      </div>
    </main>
  );
}
