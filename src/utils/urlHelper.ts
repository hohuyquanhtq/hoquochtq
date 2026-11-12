/**
 * Helper to determine the real, public production URL for HQTest exams
 * Handles Google AI Studio preview environments, Cloud Run URLs, and custom domains.
 */

export function getPublicDomain(): string {
  // 1. If running in a browser with a real public hostname (not localhost or loopback)
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.internal')) {
      return window.location.origin;
    }
  }

  // 2. If injected at build/runtime via __APP_URL__ (AI Studio Cloud Run Development URL)
  if (typeof __APP_URL__ !== 'undefined' && __APP_URL__ && !__APP_URL__.includes('localhost')) {
    return __APP_URL__.replace(/\/+$/, '');
  }

  // 3. Fallback to production Cloud Run URL
  return 'https://ais-dev-oo4zxgd2cngrm3egycshsk-120327851336.asia-southeast1.run.app';
}

/**
 * Returns the canonical exam direct link: https://<domain>/c/<EXAM_CODE>
 */
export function getExamDirectUrl(examCode: string): string {
  const domain = getPublicDomain();
  const cleanCode = (examCode || '').trim().replace(/^(?:#|\/?c\/)/i, '').replace(/[\s\-_]/g, '').toUpperCase();
  return `${domain}/c/${cleanCode}`;
}

/**
 * Returns fallback query param URL: https://<domain>/?c=<EXAM_CODE>
 */
export function getExamQueryUrl(examCode: string): string {
  const domain = getPublicDomain();
  const cleanCode = (examCode || '').trim().replace(/^(?:#|\/?c\/)/i, '').replace(/[\s\-_]/g, '').toUpperCase();
  return `${domain}/?c=${cleanCode}`;
}
