#!/usr/bin/env node
/**
 * Server-side Firebase Admin recovery & verification script for HQTest.
 *
 * Security notes:
 * - Run ONLY in a trusted local/server terminal with a Google Service Account JSON
 *   (GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json).
 * - NEVER place service account credentials in src/, public/, VITE_* env vars, or Git.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/restore-admin-profile.mjs --check-only
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/restore-admin-profile.mjs --name="Họ Tên Đã Xác Nhận"
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    uid: 'un8mVgjoiVf5urYuFWv1Uff5ajq1',
    email: 'hohuyquanhtq@gmail.com',
    name: '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    checkOnly: false,
    setClaim: false,
  };
  for (const raw of argv) {
    if (raw === '--check-only') args.checkOnly = true;
    else if (raw === '--set-claim') args.setClaim = true;
    else if (raw.startsWith('--uid=')) args.uid = raw.slice(6).trim();
    else if (raw.startsWith('--email=')) args.email = raw.slice(8).trim().toLowerCase();
    else if (raw.startsWith('--name=')) args.name = raw.slice(7).trim();
    else if (raw.startsWith('--credentials=')) args.credentials = raw.slice(14).trim();
  }
  return args;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(serviceAccount) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/datastore',
      'https://www.googleapis.com/auth/identitytoolkit',
    ].join(' '),
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64UrlEncode(signer.sign(serviceAccount.private_key));
  const assertion = `${signingInput}.${signature}`;

  const tokenResp = await fetch(claimSet.aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    throw new Error(`OAuth2 token request failed (${tokenResp.status}): ${errText}`);
  }
  const tokenJson = await tokenResp.json();
  return tokenJson.access_token;
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields || {});
  return undefined;
}

function fromFirestoreFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

async function getFirestoreDoc(baseDocUrl, docPath, accessToken) {
  const resp = await fetch(`${baseDocUrl}/${docPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return { exists: false, data: null };
  if (!resp.ok) {
    throw new Error(`Firestore GET ${docPath} failed (${resp.status}): ${await resp.text()}`);
  }
  const json = await resp.json();
  return { exists: true, data: fromFirestoreFields(json.fields || {}), raw: json };
}

async function commitFirestoreWrite(commitUrl, fullDocName, fieldsObj, accessToken, serverTimestampFields = []) {
  const firestoreFields = {};
  for (const [k, v] of Object.entries(fieldsObj)) {
    if (v !== undefined) firestoreFields[k] = toFirestoreValue(v);
  }

  const writes = [
    {
      update: {
        name: fullDocName,
        fields: firestoreFields,
      },
    },
  ];

  if (serverTimestampFields.length > 0) {
    writes[0].updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }

  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!resp.ok) {
    throw new Error(`Firestore COMMIT ${fullDocName} failed (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

  console.log('=== HQTest Admin Profile Inspection & Recovery ===');
  console.log(`Project ID  : ${projectId}`);
  console.log(`Database ID : ${databaseId}`);
  console.log(`Target UID  : ${args.uid}`);
  console.log(`Target Email: ${args.email}`);
  console.log(`Mode        : ${args.checkOnly ? 'CHECK ONLY (read-only)' : 'RECOVER & VERIFY'}`);

  if (!args.credentials) {
    console.error('\n[ERROR] Missing Service Account JSON path.');
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json or pass --credentials=/path/to/sa.json');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(args.credentials), 'utf8'));
  const accessToken = await getAccessToken(serviceAccount);

  // 1. Verify Firebase Auth user exists with expected UID & email (NO duplicate account creation)
  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
  const authResp = await fetch(lookupUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: [args.uid] }),
  });

  if (!authResp.ok) {
    throw new Error(`Auth lookup failed (${authResp.status}): ${await authResp.text()}`);
  }
  const authJson = await authResp.json();
  const authUser = authJson.users?.[0];
  if (!authUser) {
    throw new Error(`Firebase Auth user with UID "${args.uid}" NOT FOUND in project "${projectId}".`);
  }

  const actualEmail = (authUser.email || '').trim().toLowerCase();
  console.log('\n[1] Firebase Auth User:');
  console.log(`  - localId       : ${authUser.localId}`);
  console.log(`  - email         : ${authUser.email}`);
  console.log(`  - emailVerified : ${Boolean(authUser.emailVerified)}`);
  console.log(`  - displayName   : ${authUser.displayName || '(none)'}`);
  console.log(`  - customClaims  : ${authUser.customAttributes || '(none)'}`);

  if (actualEmail !== args.email) {
    throw new Error(`Email mismatch! Expected "${args.email}", found "${authUser.email}". Aborting.`);
  }

  // 2. Inspect Firestore admins/{uid} and users/{uid}
  const dbPathPrefix = `projects/${projectId}/databases/${databaseId}`;
  const baseDocUrl = `https://firestore.googleapis.com/v1/${dbPathPrefix}/documents`;
  const commitUrl = `https://firestore.googleapis.com/v1/${dbPathPrefix}/documents:commit`;

  const adminDoc = await getFirestoreDoc(baseDocUrl, `admins/${args.uid}`, accessToken);
  const userDoc = await getFirestoreDoc(baseDocUrl, `users/${args.uid}`, accessToken);

  console.log('\n[2] Firestore Current State:');
  console.log(`  - admins/${args.uid}: ${adminDoc.exists ? JSON.stringify(adminDoc.data) : 'NOT FOUND'}`);
  console.log(`  - users/${args.uid} : ${userDoc.exists ? JSON.stringify(userDoc.data) : 'NOT FOUND'}`);

  if (args.checkOnly) {
    console.log('\nCheck completed (read-only mode, no writes executed).');
    return;
  }

  const nowIso = new Date().toISOString();

  // 3. Ensure admins/{uid} marker exists cleanly without destroying existing valid fields
  const existingAdmin = adminDoc.exists ? adminDoc.data : {};
  const nextAdminFields = {
    ...existingAdmin,
    uid: args.uid,
    email: actualEmail,
    role: 'admin',
    active: true,
    updatedAt: nowIso,
    createdAt: existingAdmin.createdAt || nowIso,
  };
  await commitFirestoreWrite(
    commitUrl,
    `${dbPathPrefix}/documents/admins/${args.uid}`,
    nextAdminFields,
    accessToken
  );

  // 4. Create or backfill missing fields on users/{uid}, preserving existing valid data
  const existingUser = userDoc.exists ? userDoc.data : {};
  const resolvedName =
    (existingUser.name && String(existingUser.name).trim()) ||
    args.name ||
    (authUser.displayName && String(authUser.displayName).trim()) ||
    actualEmail.split('@')[0];

  const nextUserFields = {
    ...existingUser,
    uid: args.uid,
    email: actualEmail,
    name: resolvedName,
    role: 'admin',
    status: 'active',
    createdAt: existingUser.createdAt || nowIso,
    updatedAt: nowIso,
  };

  // Preserve existing serverCreatedAt timestamp if already set; otherwise use REQUEST_TIME
  const serverTsFields = ['serverUpdatedAt'];
  if (!existingUser.serverCreatedAt) {
    serverTsFields.push('serverCreatedAt');
  }

  await commitFirestoreWrite(
    commitUrl,
    `${dbPathPrefix}/documents/users/${args.uid}`,
    nextUserFields,
    accessToken,
    serverTsFields
  );

  // 5. Optional: sync custom claims if requested
  if (args.setClaim) {
    let existingClaims = {};
    try {
      existingClaims = authUser.customAttributes ? JSON.parse(authUser.customAttributes) : {};
    } catch {
      existingClaims = {};
    }
    const mergedClaims = { ...existingClaims, role: 'admin', admin: true };
    const updateUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`;
    const claimResp = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        localId: args.uid,
        customAttributes: JSON.stringify(mergedClaims),
      }),
    });
    if (!claimResp.ok) {
      throw new Error(`Failed setting custom claims (${claimResp.status}): ${await claimResp.text()}`);
    }
  }

  // 6. Verify by reading back from Firestore
  const verifyAdmin = await getFirestoreDoc(baseDocUrl, `admins/${args.uid}`, accessToken);
  const verifyUser = await getFirestoreDoc(baseDocUrl, `users/${args.uid}`, accessToken);

  console.log('\n[3] Verified Firestore State After Recovery:');
  console.log(`  - admins/${args.uid}: ${verifyAdmin.exists ? JSON.stringify(verifyAdmin.data) : 'MISSING'}`);
  console.log(`  - users/${args.uid} : ${verifyUser.exists ? JSON.stringify(verifyUser.data) : 'MISSING'}`);
}

main().catch((err) => {
  console.error('\n[FAILED]', err instanceof Error ? err.message : err);
  process.exit(1);
});
