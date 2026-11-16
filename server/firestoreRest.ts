import type { Query } from 'firebase-admin/firestore';
import {
  getFirebaseAdminDb,
  getFirebaseAdminFieldValue,
  isFirebaseAdminReady,
} from './firebaseAdmin.ts';
import { resolveServerFirebaseConfig } from './firebaseServerAuth.ts';

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function stripUndefinedForAdmin(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedForAdmin(item))
      .filter((item) => item !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      const cleaned = stripUndefinedForAdmin(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
  }
  return out;
}

function normalizeAdminDocData(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return ((value as { toDate: () => Date }).toDate()).toISOString();
    } catch {
      return value;
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAdminDocData(item));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = normalizeAdminDocData(v);
  }
  return out;
}

export function encodeFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Number.isSafeInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => encodeFirestoreValue(v)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function decodeFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function decodeFirestoreDoc<T = Record<string, unknown>>(doc: FirestoreDocument): T {
  const out: Record<string, unknown> = {};
  const fields = doc.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out as T;
}

export function encodeFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return fields;
}

function getDatabaseBaseUrl(): string {
  const { projectId, databaseId } = resolveServerFirebaseConfig();
  if (!projectId) {
    throw new Error('Missing Firebase projectId configuration.');
  }
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`;
}

export async function firestoreGetDoc<T = Record<string, unknown>>(
  collectionName: string,
  docId: string,
  options?: { bearerToken?: string }
): Promise<T | null> {
  if (isFirebaseAdminReady()) {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(collectionName).doc(docId).get();
    if (!snap.exists) return null;
    return normalizeAdminDocData(snap.data()) as T;
  }

  if (!options?.bearerToken) {
    throw new Error('SERVER_CREDENTIALS_MISSING');
  }

  const base = getDatabaseBaseUrl();
  const url = `${base}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${options.bearerToken}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Firestore GET ${collectionName}/${docId} failed (${res.status}): ${txt}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const raw = (await res.json()) as FirestoreDocument;
  return decodeFirestoreDoc<T>(raw);
}

export async function firestoreSetDoc(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: { bearerToken?: string; serverTimestampFields?: string[] }
): Promise<void> {
  if (isFirebaseAdminReady()) {
    const db = getFirebaseAdminDb();
    const FieldValue = getFirebaseAdminFieldValue();
    const cleaned = stripUndefinedForAdmin(data) as Record<string, unknown>;
    for (const field of options?.serverTimestampFields || []) {
      cleaned[field] = FieldValue.serverTimestamp();
    }
    await db.collection(collectionName).doc(docId).set(cleaned);
    return;
  }

  if (!options?.bearerToken) {
    throw new Error('SERVER_CREDENTIALS_MISSING');
  }

  const authHeader = `Bearer ${options.bearerToken}`;
  const base = getDatabaseBaseUrl();
  const { projectId, databaseId } = resolveServerFirebaseConfig();
  const docPath = `projects/${projectId}/databases/${databaseId}/documents/${collectionName}/${docId}`;

  if (options?.serverTimestampFields && options.serverTimestampFields.length > 0) {
    const writes = [
      {
        update: {
          name: docPath,
          fields: encodeFirestoreFields(data),
        },
        updateTransforms: options.serverTimestampFields.map((fieldPath) => ({
          fieldPath,
          setToServerValue: 'REQUEST_TIME',
        })),
      },
    ];
    const res = await fetch(`${base}/documents:commit`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Firestore COMMIT ${collectionName}/${docId} failed (${res.status}): ${txt}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return;
  }

  const url = `${base}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: encodeFirestoreFields(data),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Firestore SET ${collectionName}/${docId} failed (${res.status}): ${txt}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
}

export async function firestorePatchFields(
  collectionName: string,
  docId: string,
  partialData: Record<string, unknown>,
  options?: { bearerToken?: string; serverTimestampFields?: string[] }
): Promise<void> {
  if (isFirebaseAdminReady()) {
    const db = getFirebaseAdminDb();
    const FieldValue = getFirebaseAdminFieldValue();
    const cleaned = stripUndefinedForAdmin(partialData) as Record<string, unknown>;
    for (const field of options?.serverTimestampFields || []) {
      cleaned[field] = FieldValue.serverTimestamp();
    }
    await db.collection(collectionName).doc(docId).update(cleaned);
    return;
  }

  if (!options?.bearerToken) {
    throw new Error('SERVER_CREDENTIALS_MISSING');
  }

  const authHeader = `Bearer ${options.bearerToken}`;
  const base = getDatabaseBaseUrl();
  const { projectId, databaseId } = resolveServerFirebaseConfig();
  const docPath = `projects/${projectId}/databases/${databaseId}/documents/${collectionName}/${docId}`;
  const fieldPaths = Object.keys(partialData);

  const writes = [
    {
      update: {
        name: docPath,
        fields: encodeFirestoreFields(partialData),
      },
      updateMask: {
        fieldPaths,
      },
      ...(options?.serverTimestampFields && options.serverTimestampFields.length > 0
        ? {
            updateTransforms: options.serverTimestampFields.map((fieldPath) => ({
              fieldPath,
              setToServerValue: 'REQUEST_TIME',
            })),
          }
        : {}),
    },
  ];

  const res = await fetch(`${base}/documents:commit`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Firestore PATCH ${collectionName}/${docId} failed (${res.status}): ${txt}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
}

export async function firestoreDeleteDoc(
  collectionName: string,
  docId: string,
  options?: { bearerToken?: string }
): Promise<void> {
  if (isFirebaseAdminReady()) {
    const db = getFirebaseAdminDb();
    await db.collection(collectionName).doc(docId).delete();
    return;
  }

  if (!options?.bearerToken) {
    throw new Error('SERVER_CREDENTIALS_MISSING');
  }

  const base = getDatabaseBaseUrl();
  const url = `${base}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${options.bearerToken}` },
  });

  if (res.status === 404) return;
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Firestore DELETE ${collectionName}/${docId} failed (${res.status}): ${txt}`);
  }
}

export async function firestoreQueryEquals<T = Record<string, unknown>>(
  collectionName: string,
  filters: Array<{ field: string; value: string | boolean | number }>,
  options?: { bearerToken?: string; limit?: number }
): Promise<T[]> {
  if (isFirebaseAdminReady()) {
    const db = getFirebaseAdminDb();
    let query: Query = db.collection(collectionName);
    for (const f of filters) {
      query = query.where(f.field, '==', f.value);
    }
    const snap = await query.limit(options?.limit ?? 100).get();
    return snap.docs.map((doc) => normalizeAdminDocData(doc.data()) as T);
  }

  if (!options?.bearerToken) {
    throw new Error('SERVER_CREDENTIALS_MISSING');
  }

  const base = getDatabaseBaseUrl();
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collectionName }],
    where:
      filters.length === 1
        ? {
            fieldFilter: {
              field: { fieldPath: filters[0].field },
              op: 'EQUAL',
              value: encodeFirestoreValue(filters[0].value),
            },
          }
        : {
            compositeFilter: {
              op: 'AND',
              filters: filters.map((f) => ({
                fieldFilter: {
                  field: { fieldPath: f.field },
                  op: 'EQUAL',
                  value: encodeFirestoreValue(f.value),
                },
              })),
            },
          },
    limit: options?.limit ?? 100,
  };

  const res = await fetch(`${base}/documents:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Firestore QUERY ${collectionName} failed (${res.status}): ${txt}`);
  }

  const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
  const results: T[] = [];
  for (const row of rows) {
    if (row.document) {
      results.push(decodeFirestoreDoc<T>(row.document));
    }
  }
  return results;
}
