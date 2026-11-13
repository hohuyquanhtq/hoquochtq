/**
 * Helper to determine the real, public production URL for HQTest exams
 * Prioritizes explicit Production URL / Vercel Production URL over Preview/Dev URLs,
 * and standardizes canonical exam URLs (`https://DOMAIN/?examCode=CODE`) + SPA paths (`/c/CODE`).
 */

const PRODUCTION_DOMAIN_STORAGE_KEY = 'hqtest_production_domain_override';

export function normalizeOrigin(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function isPreviewOrLocalOrigin(origin: string): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.internal') ||
      host.startsWith('ais-dev-') ||
      // Vercel branch/commit preview subdomains typically contain '-git-' or deployment hash suffixes
      (host.endsWith('.vercel.app') && host.includes('-git-'))
    ) {
      return true;
    }

    // If canonical production URL is configured at build time and differs from current vercel.app host,
    // treat the current host as a Vercel Preview deployment URL.
    const buildProd =
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_APP_URL) ||
      (typeof __PRODUCTION_APP_URL__ !== 'undefined' ? __PRODUCTION_APP_URL__ : '');
    if (buildProd && host.endsWith('.vercel.app')) {
      try {
        const prodHost = new URL(normalizeOrigin(buildProd)).hostname.toLowerCase();
        if (prodHost && host !== prodHost) {
          return true;
        }
      } catch {
        // ignore invalid buildProd
      }
    }

    return false;
  } catch {
    return true;
  }
}

export function getSavedProductionDomainOverride(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    return normalizeOrigin(window.localStorage.getItem(PRODUCTION_DOMAIN_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function setSavedProductionDomainOverride(domain: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const normalized = normalizeOrigin(domain);
    if (normalized) {
      window.localStorage.setItem(PRODUCTION_DOMAIN_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(PRODUCTION_DOMAIN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getPublicDomain(): string {
  // 1. Explicit teacher-configured production domain override (if set in browser)
  const savedOverride = getSavedProductionDomainOverride();
  if (savedOverride && !isPreviewOrLocalOrigin(savedOverride)) {
    return savedOverride;
  }

  // 2. Build-time configured canonical production URL (VITE_PUBLIC_APP_URL or Vercel VERCEL_PROJECT_PRODUCTION_URL)
  const envProdUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_APP_URL) ||
    (typeof __PRODUCTION_APP_URL__ !== 'undefined' ? __PRODUCTION_APP_URL__ : '');
  if (envProdUrl && !isPreviewOrLocalOrigin(envProdUrl)) {
    return normalizeOrigin(envProdUrl);
  }

  // 3. Real browser origin if running on a live production domain (e.g. Vercel custom domain or *.vercel.app)
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (origin && !isPreviewOrLocalOrigin(origin)) {
      return origin.replace(/\/+$/, '');
    }
  }

  // 4. Build-time non-dev APP_URL fallback (e.g. Shared App URL in AI Studio)
  if (typeof __APP_URL__ !== 'undefined' && __APP_URL__ && !isPreviewOrLocalOrigin(__APP_URL__)) {
    return normalizeOrigin(__APP_URL__);
  }

  // 5. If running in AI Studio dev preview (ais-dev-*), prefer shared origin (ais-pre-*) over dev origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '');
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  }

  return '';
}

/**
 * Canonical exam code normalization:
 * Preserves uppercase alphanumeric characters and hyphens cleanly so codes like
 * HQ50, CHEM12, and HOA12-DE5 normalize deterministically across URLs, UI, and DB.
 * Also supports matching stripped hyphen forms in lookup helpers.
 */
export function normalizeExamCode(rawCode: string): string {
  return (rawCode || '')
    .trim()
    .replace(/^(?:#?\/?(?:c|exam)\/|#)/i, '')
    .replace(/[\s_]/g, '')
    .toUpperCase();
}

export function normalizeExamCodeCompact(rawCode: string): string {
  return normalizeExamCode(rawCode).replace(/-/g, '');
}

/**
 * Returns the canonical share URL prioritized for Vercel + GitHub production:
 * https://<PRODUCTION_DOMAIN>/?examCode=<EXAM_CODE>
 */
export function getExamDirectUrl(examCode: string): string {
  const domain = getPublicDomain();
  const cleanCode = normalizeExamCode(examCode);
  if (!domain) {
    return `/?examCode=${encodeURIComponent(cleanCode)}`;
  }
  return `${domain}/?examCode=${encodeURIComponent(cleanCode)}`;
}

/**
 * Returns clean SPA path link: https://<PRODUCTION_DOMAIN>/c/<EXAM_CODE>
 * (Supported seamlessly via vercel.json rewrite rules)
 */
export function getExamPathUrl(examCode: string): string {
  const domain = getPublicDomain();
  const cleanCode = normalizeExamCode(examCode);
  if (!domain) {
    return `/c/${encodeURIComponent(cleanCode)}`;
  }
  return `${domain}/c/${encodeURIComponent(cleanCode)}`;
}

/**
 * Returns fallback short query param URL: https://<PRODUCTION_DOMAIN>/?c=<EXAM_CODE>
 */
export function getExamQueryUrl(examCode: string): string {
  return getExamDirectUrl(examCode);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extracts exam code from query params (?examCode=, ?c=, ?exam=, ?code=),
 * SPA paths (/c/:code, /exam/:code), or hash routes (#/c/:code).
 */
export function extractExamCodeFromLocation(locationLike?: {
  pathname?: string;
  search?: string;
  hash?: string;
}): string | null {
  const loc = locationLike || (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return null;

  const pathname = loc.pathname || '';
  const search = loc.search || '';
  const hash = loc.hash || '';

  let targetCode: string | null = null;

  // 1. Query string (?examCode=, ?c=, ?exam=, ?code=)
  if (search) {
    try {
      const searchParams = new URLSearchParams(search);
      targetCode =
        searchParams.get('examCode') ||
        searchParams.get('c') ||
        searchParams.get('exam') ||
        searchParams.get('code');
    } catch {
      targetCode = null;
    }
  }

  // 2. Path routing (/c/:code or /exam/:code)
  if (!targetCode && pathname) {
    const pathMatch = pathname.match(/^\/(?:c|exam)\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      targetCode = safeDecodeURIComponent(pathMatch[1]);
    }
  }

  // 3. Hash routing (#/c/:code, #/exam/:code, or #?examCode=)
  if (!targetCode && hash) {
    const hashMatch =
      hash.match(/^#\/?(?:c|exam)\/([^/?#]+)/i) ||
      hash.match(/[?&#](?:examCode|c|exam|code)=([^&#]+)/i);
    if (hashMatch && hashMatch[1]) {
      targetCode = safeDecodeURIComponent(hashMatch[1]);
    }
  }

  if (!targetCode || !targetCode.trim()) return null;
  const normalized = normalizeExamCode(targetCode);
  return normalized || null;
}
