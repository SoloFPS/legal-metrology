"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type LocationPoint = {
  id: string;
  company_name: string;
  product_name: string;
  officer_name: string;
  compliance_status: string;
  compliance_score?: string;
  latitude: number;
  longitude: number;
  timestamp?: string;
  violations_count?: number;
};

interface InspectionMapProps {
  locations: LocationPoint[];
  withoutCoordsCount?: number;
  onSelectInspection?: (id: string) => void;
}

export function InspectionMap({
  locations,
  withoutCoordsCount = 0,
  onSelectInspection,
}: InspectionMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});

  const [activePoint, setActivePoint] = useState<LocationPoint | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as unknown as { L?: unknown }).L);
  });

  // Load Leaflet CSS and JS dynamically from CDN
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if Leaflet CSS already exists
    const cssId = "leaflet-css-cdn";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    // Check if Leaflet JS already exists
    if ((window as unknown as { L?: unknown }).L) {
      return;
    }

    const scriptId = "leaflet-js-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      const interval = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).L) {
          setLeafletLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    // Filter valid coordinates only
    const validLocations = locations.filter(
      (loc) =>
        typeof loc.latitude === "number" &&
        !isNaN(loc.latitude) &&
        typeof loc.longitude === "number" &&
        !isNaN(loc.longitude)
    );

    if (!mapInstanceRef.current) {
      // Default to Center of India
      const defaultCenter = [21.5, 78.9];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 5,
        attributionControl: false,
      });

      // Add standard OpenStreetMap tiles
      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }
      ).addTo(map);

      L.control
        .attribution({
          position: "bottomright",
          prefix: false,
        })
        .addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    Object.values(markersRef.current).forEach((m) => {
      try {
        map.removeLayer(m);
      } catch {
        // ignore
      }
    });
    markersRef.current = {};

    if (validLocations.length === 0) return;

    const bounds: [number, number][] = [];

    validLocations.forEach((loc) => {
      const isCompliant = loc.compliance_status.toUpperCase() === "COMPLIANT";
      const isPending = loc.compliance_status.toUpperCase().includes("PENDING");

      const markerColor = isCompliant
        ? "#10b981" // emerald
        : isPending
        ? "#f59e0b" // amber
        : "#f43f5e"; // rose

      const markerHtml = `
        <div style="
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: ${markerColor};
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px ${markerColor}aa;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 10px;
        ">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-inspection-pin",
        html: markerHtml,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });

      const marker = L.marker([loc.latitude, loc.longitude], {
        icon: customIcon,
      }).addTo(map);

      const popupContent = `
        <div style="min-width: 200px; color: #111; font-family: sans-serif; font-size: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="font-size: 13px;">${loc.company_name}</strong>
            <span style="
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 600;
              background: ${isCompliant ? "#d1fae5" : isPending ? "#fef3c7" : "#ffe4e6"};
              color: ${isCompliant ? "#065f46" : isPending ? "#92400e" : "#9f1239"};
            ">
              ${loc.compliance_status}
            </span>
          </div>
          <div style="color: #444; margin-bottom: 2px;"><strong>Product:</strong> ${loc.product_name}</div>
          <div style="color: #666; font-size: 11px;"><strong>Officer:</strong> ${loc.officer_name}</div>
          ${loc.compliance_score ? `<div style="color: #666; font-size: 11px;"><strong>Score:</strong> ${loc.compliance_score}</div>` : ""}
          <div style="color: #888; font-size: 10px; margin-top: 4px;">Coords: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}</div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on("click", () => {
        setActivePoint(loc);
        if (onSelectInspection) {
          onSelectInspection(loc.id);
        }
      });

      markersRef.current[loc.id] = marker;
      bounds.push([loc.latitude, loc.longitude]);
    });

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      } catch {
        // ignore
      }
    }
  }, [leafletLoaded, locations, onSelectInspection]);

  const handleFocusLocation = (loc: LocationPoint) => {
    setActivePoint(loc);
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([loc.latitude, loc.longitude], 13, {
      animate: true,
    });
    const marker = markersRef.current[loc.id];
    if (marker) {
      marker.openPopup();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#161616] p-4">
        <div>
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              Inspection Geographic Intelligence
            </h3>
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
              {locations.length} Sites Geo-Tagged
            </Badge>
          </div>
          <p className="mt-1 text-xs text-white/50">
            Latitude & Longitude coordinates recorded by field officers during packaged commodity inspections.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            Compliant
          </span>
          <span className="flex items-center gap-1.5 ml-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
            Violating
          </span>
          <span className="flex items-center gap-1.5 ml-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
            Pending
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map Container */}
        <div className="lg:col-span-2 relative h-[440px] rounded-lg border border-white/10 bg-[#111] overflow-hidden shadow-xl">
          <div ref={mapContainerRef} className="h-full w-full z-0" />

          {!leafletLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white/60 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <span>Initializing Geographic Map...</span>
              </div>
            </div>
          )}

          {/* Map Controls Overlay / Google Maps notice */}
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
            <div className="rounded-md border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-md">
              OpenStreetMap Active
            </div>
            {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-950/80 px-2 py-0.5 text-[9px] text-emerald-300">
                Google Maps Key Configured
              </div>
            )}
          </div>
        </div>

        {/* Geo-Tagged Inspection List */}
        <div className="flex flex-col h-[440px] rounded-lg border border-white/10 bg-[#161616] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Geo-Tagged Inspections ({locations.length})
            </span>
            <span className="text-[10px] text-white/40">Click to locate</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {locations.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-xs text-white/40">
                No GPS coordinates recorded in current selection.
              </div>
            ) : (
              locations.map((loc) => {
                const isSelected = activePoint?.id === loc.id;
                const isCompliant = loc.compliance_status.toUpperCase() === "COMPLIANT";

                return (
                  <button
                    key={loc.id}
                    onClick={() => handleFocusLocation(loc)}
                    className={`w-full text-left rounded-md border p-2.5 transition cursor-pointer ${
                      isSelected
                        ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                        : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white truncate">
                        {loc.company_name}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          isCompliant
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {loc.compliance_status}
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] text-white/50 truncate">
                      {loc.product_name}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-white/40">
                      <span>{loc.officer_name}</span>
                      <span className="font-mono text-emerald-400/80">
                        {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Graceful notice for records without coordinates */}
          {withoutCoordsCount > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2 text-[11px] text-white/50">
              <Info className="h-3.5 w-3.5 shrink-0 text-white/40 mt-0.5" />
              <span>
                <strong>{withoutCoordsCount} inspection(s)</strong> have no GPS coordinates and are safely excluded from map markers.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
