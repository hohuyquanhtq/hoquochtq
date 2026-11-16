import crypto from 'node:crypto';
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
  getFirebaseAdminAuth,
  isFirebaseAdminReady,
} from './firebaseAdmin.ts';

export interface FirebaseConfigSummary {
  projectId: string;
  databaseId: string;
}

export interface VerifiedFirebaseIdToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;

export function resolveServerFirebaseConfig(): FirebaseConfigSummary {
  return {
    projectId: EXPECTED_FIREBASE_PROJECT_ID,
    databaseId: EXPECTED_FIRESTORE_DATABASE_ID,
  };
}

export function hasServiceAccountConfigured(): boolean {
  return isFirebaseAdminReady();
}

function fromBase64Url(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

async function fetchGoogleFirebaseCerts(): Promise<Record<string, string>> {
  const nowMs = Date.now();
  if (certCache && certCache.expiresAtMs > nowMs) {
    return certCache.certs;
  }

  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error(`Không thể tải public certificates của Firebase Auth (${res.status}).`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;

  certCache = {
    certs,
    expiresAtMs: nowMs + ttlSec * 1000,
  };
  return certs;
}

async function verifyIdTokenWithPublicCerts(
  idToken: string
): Promise<VerifiedFirebaseIdToken | null> {
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  try {
    header = JSON.parse(fromBase64Url(headerB64).toString('utf8'));
    payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${EXPECTED_FIREBASE_PROJECT_ID}`;

  if (
    payload.aud !== EXPECTED_FIREBASE_PROJECT_ID ||
    payload.iss !== expectedIssuer ||
    typeof payload.sub !== 'string' ||
    !payload.sub.trim() ||
    payload.sub.length > 128 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 300
  ) {
    return null;
  }

  try {
    let certs = await fetchGoogleFirebaseCerts();
    let pem = certs[header.kid];
    if (!pem) {
      certCache = null;
      certs = await fetchGoogleFirebaseCerts();
      pem = certs[header.kid];
    }
    if (!pem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();

    const sigBuf = fromBase64Url(sigB64);
    if (!verifier.verify(pem, sigBuf)) return null;

    return {
      uid: payload.sub.trim(),
      email: typeof payload.email === 'string' ? payload.email : '',
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseIdToken | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  const trimmed = idToken.trim();
  if (!trimmed) return null;

  if (isFirebaseAdminReady()) {
    try {
      const decoded = await getFirebaseAdminAuth().verifyIdToken(trimmed);
      if (!decoded || !decoded.uid) return null;
      return {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : '',
        emailVerified: decoded.email_verified === true,
        name: typeof decoded.name === 'string' ? decoded.name : undefined,
      };
    } catch {
      return null;
    }
  }

  return verifyIdTokenWithPublicCerts(trimmed);
}
