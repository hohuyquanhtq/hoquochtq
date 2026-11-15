import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

interface ServiceAccountJson {
  project_id?: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

interface AccessTokenCache {
  token: string;
  expiresAtMs: number;
  clientEmail: string;
}

let certCache: CertCache | null = null;
let serviceAccountTokenCache: AccessTokenCache | null = null;

function readBundledFirebaseConfig(): { projectId: string; firestoreDatabaseId: string } {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '..', 'firebase-applet-config.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
          projectId: typeof parsed.projectId === 'string' ? parsed.projectId.trim() : '',
          firestoreDatabaseId:
            typeof parsed.firestoreDatabaseId === 'string' ? parsed.firestoreDatabaseId.trim() : '',
        };
      }
    } catch {
      // ignore invalid config read
    }
  }
  return { projectId: '', firestoreDatabaseId: '' };
}

export function resolveServerFirebaseConfig(): FirebaseConfigSummary {
  const bundled = readBundledFirebaseConfig();
  const projectId =
    (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || bundled.projectId || '').trim();
  const databaseId =
    (
      process.env.FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      bundled.firestoreDatabaseId ||
      '(default)'
    ).trim() || '(default)';

  return { projectId, databaseId };
}

function loadServiceAccountFromEnv(): ServiceAccountJson | null {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      const normalized = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(normalized) as ServiceAccountJson;
      if (parsed?.client_email && parsed?.private_key) {
        return {
          ...parsed,
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch (err) {
      console.warn('[HQTest Server] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err);
    }
  }

  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (credPath && fs.existsSync(credPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credPath, 'utf8')) as ServiceAccountJson;
      if (parsed?.client_email && parsed?.private_key) {
        return {
          ...parsed,
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function hasServiceAccountConfigured(): boolean {
  return loadServiceAccountFromEnv() !== null;
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

export async function getServiceAccountAccessToken(): Promise<string | null> {
  const sa = loadServiceAccountFromEnv();
  if (!sa) return null;

  const nowMs = Date.now();
  if (
    serviceAccountTokenCache &&
    serviceAccountTokenCache.clientEmail === sa.client_email &&
    serviceAccountTokenCache.expiresAtMs > nowMs + 60_000
  ) {
    return serviceAccountTokenCache.token;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = toBase64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );

  const signingInput = `${header}.${claimSet}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
  const assertion = `${signingInput}.${toBase64Url(signature)}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Không thể cấp OAuth token từ Service Account (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Phản hồi OAuth Service Account thiếu access_token.');
  }

  serviceAccountTokenCache = {
    token: data.access_token,
    clientEmail: sa.client_email,
    expiresAtMs: nowMs + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
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

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdToken | null> {
  if (!idToken || typeof idToken !== 'string') return null;
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
    auth_time?: number;
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

  const { projectId } = resolveServerFirebaseConfig();
  if (!projectId) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  if (
    payload.aud !== projectId ||
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
    const isValid = verifier.verify(pem, sigBuf);
    if (!isValid) return null;

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
