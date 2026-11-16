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

export function isValidSixDigitPublicCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value.trim());
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
 * Returns the canonical 6-digit short link: https://<PRODUCTION_DOMAIN>/<6_DIGITS>
 * Falls back to legacy ?examCode= only when an exam has not yet been assigned a 6-digit publicCode.
 */
export function getExamShortUrl(examOrCode: { publicCode?: string; code?: string } | string): string {
  const domain = getPublicDomain();
  if (typeof examOrCode === 'string') {
    const trimmed = examOrCode.trim();
    if (isValidSixDigitPublicCode(trimmed)) {
      return domain ? `${domain}/${trimmed}` : `/${trimmed}`;
    }
    return getExamDirectUrl(trimmed);
  }
  const pub = typeof examOrCode?.publicCode === 'string' ? examOrCode.publicCode.trim() : '';
  if (isValidSixDigitPublicCode(pub)) {
    return domain ? `${domain}/${pub}` : `/${pub}`;
  }
  return getExamDirectUrl(examOrCode?.code || '');
}

/**
 * Returns the legacy canonical share URL:
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

export interface ExamUrlEntry {
  kind: 'publicCode' | 'examCode' | 'invalidPublicUrl';
  value: string;
}

/**
 * Extracts either a 6-digit public link entry (/{6_digits}), a legacy examCode entry
 * (?examCode=, /c/:code, /exam/:code, #/c/:code), or flags an invalid short URL path.
 */
export function extractExamEntryFromLocation(locationLike?: {
  pathname?: string;
  search?: string;
  hash?: string;
}): ExamUrlEntry | null {
  const loc = locationLike || (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return null;

  const pathname = (loc.pathname || '').trim();
  const search = loc.search || '';
  const hash = loc.hash || '';

  // 1. Primary 6-digit short path: /{6_digits} (preserves leading zeros, e.g. /004821)
  if (pathname) {
    const sixDigitMatch = pathname.match(/^\/(\d{6})\/?$/);
    if (sixDigitMatch && sixDigitMatch[1]) {
      return {
        kind: 'publicCode',
        value: sixDigitMatch[1],
      };
    }
  }

  let targetCode: string | null = null;

  // 2. Legacy Query string (?examCode=, ?c=, ?exam=, ?code=)
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

  // 3. Legacy Path routing (/c/:code or /exam/:code)
  if (!targetCode && pathname) {
    const pathMatch = pathname.match(/^\/(?:c|exam)\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      targetCode = safeDecodeURIComponent(pathMatch[1]);
    }
  }

  // 4. Legacy Hash routing (#/c/:code, #/exam/:code, or #?examCode=)
  if (!targetCode && hash) {
    const hashMatch =
      hash.match(/^#\/?(?:c|exam)\/([^/?#]+)/i) ||
      hash.match(/[?&#](?:examCode|c|exam|code)=([^&#]+)/i);
    if (hashMatch && hashMatch[1]) {
      targetCode = safeDecodeURIComponent(hashMatch[1]);
    }
  }

  if (targetCode && targetCode.trim()) {
    const normalized = normalizeExamCode(targetCode);
    if (normalized) {
      return {
        kind: 'examCode',
        value: normalized,
      };
    }
  }

  // 5. Invalid non-root path detection (e.g. /12345, /1234567, /58ab21, /unknown)
  if (
    pathname &&
    pathname !== '/' &&
    pathname !== '/index.html' &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/assets/') &&
    !pathname.startsWith('/__') &&
    !/\.[a-zA-Z0-9]{1,8}$/.test(pathname)
  ) {
    const cleanInvalid = safeDecodeURIComponent(pathname.replace(/^\/+|\/+$/g, ''));
    if (cleanInvalid) {
      return {
        kind: 'invalidPublicUrl',
        value: cleanInvalid,
      };
    }
  }

  return null;
}

/**
 * Legacy-compatible helper returning normalized exam code or 6-digit publicCode when valid.
 */
export function extractExamCodeFromLocation(locationLike?: {
  pathname?: string;
  search?: string;
  hash?: string;
}): string | null {
  const entry = extractExamEntryFromLocation(locationLike);
  if (!entry || entry.kind === 'invalidPublicUrl') return null;
  return entry.value;
}
