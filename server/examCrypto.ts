import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export interface ExamAccessTokenPayload {
  examCode: string;
  uid: string;
  pwdVer: string;
  iat: number;
  exp: number;
}

export function hashExamPassword(password: string): string {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Mật khẩu đề thi phải có ít nhất 6 ký tự.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export function verifyExamPassword(password: string, storedHash: string): boolean {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }

  try {
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const actualBuf = crypto.scryptSync(password, salt, expectedBuf.length, { N: n, r, p });
    if (actualBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

let ephemeralDevSecret: string | null = null;

export function getServerSigningSecret(): string {
  const configured = (process.env.EXAM_ACCESS_TOKEN_SECRET || '').trim();
  if (configured.length >= 16) {
    return configured;
  }
  const saRaw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (saRaw) {
    return crypto.createHash('sha256').update(`hqtest_token_key:${saRaw}`).digest('hex');
  }
  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralDevSecret;
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

export function signExamAccessToken(
  payload: Omit<ExamAccessTokenPayload, 'iat'>,
  secret: string = getServerSigningSecret()
): string {
  const fullPayload: ExamAccessTokenPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));
  const sig = crypto.createHmac('sha256', secret).update(encodedPayload).digest();
  return `${encodedPayload}.${toBase64Url(sig)}`;
}

export function verifyExamAccessToken(
  token: string,
  expectedExamCode: string,
  expectedUid: string,
  expectedPwdVer?: string | null,
  secret: string = getServerSigningSecret()
): ExamAccessTokenPayload | null {
  if (!token || typeof token !== 'string' || !expectedExamCode || !expectedUid) {
    return null;
  }
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encodedPayload = token.slice(0, dotIdx);
  const encodedSig = token.slice(dotIdx + 1);
  if (!encodedPayload || !encodedSig) return null;

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(encodedPayload).digest();
    const actualSig = fromBase64Url(encodedSig);
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const parsed = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as ExamAccessTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);

    if (
      !parsed ||
      parsed.examCode !== expectedExamCode ||
      parsed.uid !== expectedUid ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= nowSec
    ) {
      return null;
    }

    if (expectedPwdVer && parsed.pwdVer !== expectedPwdVer) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function signSubmissionGradeDigest(
  params: {
    submissionId: string;
    examCode: string;
    studentId: string;
    totalScore: number;
    part1Score: number;
    part2Score: number;
    part3Score: number;
  },
  secret: string = getServerSigningSecret()
): string {
  const canonical = [
    params.submissionId,
    params.examCode,
    params.studentId,
    params.totalScore.toFixed(2),
    params.part1Score.toFixed(2),
    params.part2Score.toFixed(2),
    params.part3Score.toFixed(2),
  ].join('|');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}
