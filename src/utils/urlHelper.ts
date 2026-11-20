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

export const EXAM_LINK_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PUBLIC_CODE_NEW_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;
export const PUBLIC_CODE_LEGACY_NUMERIC_REGEX = /^[0-9]{6}$/;

/**
 * Generates a unified 6-character uppercase alphanumeric exam code
 * excluding visually ambiguous characters (0, O, 1, I).
 */
export function generateExamCode6(length = 6): string {
  const alphabet = EXAM_LINK_ALPHABET;
  const alphabetLen = alphabet.length; // 32 (exact power of 2 -> unbiased with byte & 31)
  let result = '';

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += alphabet[bytes[i] % alphabetLen];
    }
    return result;
  }

  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabetLen)];
  }
  return result;
}

/**
 * Generates a unique 6-character fallback exam code combining compact base-32
 * timestamp chars (3 chars) with random entropy (3 chars) from EXAM_LINK_ALPHABET
 * (excluding 0, O, 1, I). Always matches PUBLIC_CODE_NEW_REGEX.
 */
export function generateFallbackExamCode6(nowMs: number = Date.now()): string {
  const alphabet = EXAM_LINK_ALPHABET;
  const ts = Math.abs(Math.floor(nowMs));
  const t1 = alphabet[(ts >> 10) & 31];
  const t2 = alphabet[(ts >> 5) & 31];
  const t3 = alphabet[ts & 31];
  return `${t1}${t2}${t3}${generateExamCode6(3)}`;
}

export function isValidNewPublicCode(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return PUBLIC_CODE_NEW_REGEX.test(value.trim().toUpperCase());
}

export function isValidLegacyNumericPublicCode(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return PUBLIC_CODE_LEGACY_NUMERIC_REGEX.test(value.trim());
}

/**
 * Validates either the new 6-character unambiguous alphanumeric publicCode (^[A-HJ-NP-Z2-9]{6}$)
 * or a legacy 6-digit numeric publicCode (^[0-9]{6}$).
 */
export function isValidPublicExamCode(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return PUBLIC_CODE_LEGACY_NUMERIC_REGEX.test(trimmed) || PUBLIC_CODE_NEW_REGEX.test(trimmed.toUpperCase());
}

/**
 * Normalizes a valid publicCode (uppercases alphanumeric codes; preserves legacy 6-digit codes).
 */
export function normalizePublicExamCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^\/+/, '');
  if (PUBLIC_CODE_LEGACY_NUMERIC_REGEX.test(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  return PUBLIC_CODE_NEW_REGEX.test(upper) ? upper : '';
}

/**
 * Resolves the single unified room/access code for an exam, prioritizing
 * the 6-character short link code (shortId -> publicCode -> slug -> code)
 * so UI badges, copy buttons, and short URLs always match identically.
 */
export function getUnifiedExamCode(
  exam?: { shortId?: string; publicCode?: string; slug?: string; code?: string } | null
): string {
  if (!exam) return '';
  const unifiedPublic =
    normalizePublicExamCode(exam.shortId) ||
    normalizePublicExamCode(exam.publicCode) ||
    normalizePublicExamCode(exam.slug) ||
    normalizePublicExamCode(exam.code);
  if (unifiedPublic) return unifiedPublic;
  return normalizeExamCode(exam.code || '');
}

/**
 * Backward-compatible export name preserved across modules.
 */
export function isValidSixDigitPublicCode(value: unknown): value is string {
  return isValidPublicExamCode(value);
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
 * Returns the canonical short link: https://<PRODUCTION_DOMAIN>/<6_CHAR_CODE>
 * Supports both new 6-char alphanumeric codes (/H7K9P2) and legacy 6-digit codes (/004821).
 * Falls back to legacy ?examCode= only when an exam has not yet been assigned a publicCode.
 */
export function getExamShortUrl(
  examOrCode: { shortId?: string; publicCode?: string; slug?: string; code?: string } | string
): string {
  const domain = getPublicDomain();
  if (typeof examOrCode === 'string') {
    const pub = normalizePublicExamCode(examOrCode);
    if (pub) {
      return domain ? `${domain}/${pub}` : `/${pub}`;
    }
    return getExamDirectUrl(examOrCode);
  }
  const pub =
    normalizePublicExamCode(examOrCode?.shortId) ||
    normalizePublicExamCode(examOrCode?.publicCode) ||
    normalizePublicExamCode(examOrCode?.slug) ||
    normalizePublicExamCode(examOrCode?.code);
  if (pub) {
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

  // 1. Primary 6-char public code path: /{CODE} (supports new H7K9P2 and legacy 004821)
  if (pathname) {
    const sixCharMatch = pathname.match(/^\/([A-Za-z0-9]{6})\/?$/);
    if (sixCharMatch && sixCharMatch[1]) {
      const normalizedPublicCode = normalizePublicExamCode(sixCharMatch[1]);
      if (normalizedPublicCode) {
        return {
          kind: 'publicCode',
          value: normalizedPublicCode,
        };
      }
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
