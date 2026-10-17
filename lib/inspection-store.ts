/**
 * In-memory client store to preserve inspection state across
 * Next.js client-side navigations (e.g. navigating from "/" to "/rules/[ruleKey]"
 * and returning back).
 *
 * Preserves live File objects, object URLs, OCR results, confidence,
 * extracted declarations, compliance score/status, and save state without
 * triggering redundant OCR requests or hitting sessionStorage size limits.
 */

export type InspectionImageItem = {
  id: string;
  name: string;
  url: string;
  file: File;
  isCapturedViaCamera: boolean;
};

export type StoredInspectionState<TResult = unknown> = {
  images: InspectionImageItem[];
  analyzed: boolean;
  analysisResult: TResult | null;
  savedInspectionId: string | null;
  showRawText: boolean;
};

let storedInspectionState: StoredInspectionState = {
  images: [],
  analyzed: false,
  analysisResult: null,
  savedInspectionId: null,
  showRawText: false,
};

export function getStoredInspectionState<TResult = unknown>(): StoredInspectionState<TResult> {
  return storedInspectionState as StoredInspectionState<TResult>;
}

export function setStoredInspectionState<TResult = unknown>(
  partial: Partial<StoredInspectionState<TResult>>
): void {
  storedInspectionState = {
    ...storedInspectionState,
    ...partial,
  };
}

export function clearStoredInspectionState(): void {
  // Revoke object URLs to avoid memory leaks
  storedInspectionState.images.forEach((img) => {
    try {
      if (img.url && img.url.startsWith("blob:")) {
        URL.revokeObjectURL(img.url);
      }
    } catch {
      // Ignore cleanup error in non-browser or already-revoked cases
    }
  });

  storedInspectionState = {
    images: [],
    analyzed: false,
    analysisResult: null,
    savedInspectionId: null,
    showRawText: false,
  };
}
