import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  dbHub,
  hubInitError,
  stripUndefinedDeep,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  Classroom,
  ClassEnrollment,
  HubBadge,
  HubLearningProfile,
  HubTestResult,
  StudentSubmission,
} from '../types';
import { normalizeExamCode } from '../utils/urlHelper';

export const HUB_CLASSES_COLLECTION = 'hub_classes';
export const HUB_LEARNING_PROFILES_COLLECTION = 'hub_learning_profiles';

export interface HubSyncOutcome {
  synced: boolean;
  profileDocId?: string;
  classCode?: string;
  stt?: number;
  xpEarned: number;
  error?: string;
}

function normalizeHubClassCode(raw?: string | null): string {
  const cleaned = normalizeExamCode(raw || '');
  if (cleaned) return cleaned;
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function parseSttNumber(raw: unknown, fallbackDocId?: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (fallbackDocId) {
    const tailMatch = fallbackDocId.match(/_(\d+)$/);
    if (tailMatch) {
      const parsed = Number.parseInt(tailMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
}

function toIsoStringSafe(raw: unknown, fallbackIso: string): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate?: unknown }).toDate === 'function') {
    try {
      return ((raw as { toDate: () => Date }).toDate()).toISOString();
    } catch {
      return fallbackIso;
    }
  }
  return fallbackIso;
}

export function buildHubProfileDocId(classCode: string, stt: number | string): string {
  const normCode = normalizeHubClassCode(classCode);
  const sttNum = parseSttNumber(stt);
  if (!normCode || sttNum <= 0) {
    throw new Error('Mã lớp hoặc số thứ tự (STT) không hợp lệ để định danh hồ sơ Hub.');
  }
  return `${normCode}_${sttNum}`;
}

export function sortHubProfilesByStt<T extends { stt?: number; studentName?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sttA = typeof a.stt === 'number' && a.stt > 0 ? a.stt : Number.MAX_SAFE_INTEGER;
    const sttB = typeof b.stt === 'number' && b.stt > 0 ? b.stt : Number.MAX_SAFE_INTEGER;
    if (sttA !== sttB) return sttA - sttB;
    return (a.studentName || '').localeCompare(b.studentName || '', 'vi');
  });
}

function mapDocToHubClassroom(docId: string, raw: Record<string, unknown>, fallbackOwnerId: string): Classroom {
  const nowIso = new Date().toISOString();
  const classCode = normalizeHubClassCode(
    String(raw.classCode || raw.code || docId)
  );
  const assignedRaw = Array.isArray(raw.assignedExamCodes)
    ? raw.assignedExamCodes
    : Array.isArray(raw.examCodes)
    ? raw.examCodes
    : [];
  const assignedExamCodes = Array.from(
    new Set(
      assignedRaw
        .map((c) => normalizeExamCode(String(c || '')))
        .filter(Boolean)
    )
  ).slice(0, 100);

  return {
    id: String(raw.id || docId),
    ownerId: String(raw.ownerId || raw.teacherId || fallbackOwnerId),
    teacherName: String(raw.teacherName || raw.ownerName || 'Giáo viên'),
    school: typeof raw.school === 'string' && raw.school.trim() ? raw.school.trim() : undefined,
    className: String(raw.className || raw.name || raw.title || classCode),
    classCode,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : undefined,
    assignedExamCodes,
    isActive: raw.isActive !== false && raw.status !== 'archived' && raw.status !== 'locked',
    source: 'hub',
    createdAt: toIsoStringSafe(raw.createdAt || raw.serverCreatedAt, nowIso),
    updatedAt: toIsoStringSafe(raw.updatedAt || raw.serverUpdatedAt, nowIso),
  };
}

function mapDocToHubLearningProfile(docId: string, raw: Record<string, unknown>): HubLearningProfile {
  const nowIso = new Date().toISOString();
  const inferredClassFromId = docId.includes('_') ? docId.slice(0, docId.lastIndexOf('_')) : '';
  const classCode = normalizeHubClassCode(
    String(raw.classCode || raw.class_code || inferredClassFromId)
  );
  const stt = parseSttNumber(raw.stt ?? raw.order ?? raw.studentOrder, docId);
  const studentUid =
    typeof raw.studentUid === 'string' && raw.studentUid.trim()
      ? raw.studentUid.trim()
      : typeof raw.uid === 'string' && raw.uid.trim()
      ? raw.uid.trim()
      : typeof raw.studentId === 'string' && raw.studentId.trim()
      ? raw.studentId.trim()
      : undefined;

  const rawTestResults = Array.isArray(raw.testResults) ? raw.testResults : [];
  const testResults: HubTestResult[] = rawTestResults
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, idx) => ({
      id: String(item.id || item.submissionId || `tr_${idx}`),
      submissionId: typeof item.submissionId === 'string' ? item.submissionId : undefined,
      examId: typeof item.examId === 'string' ? item.examId : undefined,
      examCode: String(item.examCode || ''),
      examTitle: String(item.examTitle || item.title || 'Bài kiểm tra'),
      score: typeof item.score === 'number' ? item.score : Number(item.totalScore || 0),
      maxScore: typeof item.maxScore === 'number' ? item.maxScore : 10,
      xpEarned: typeof item.xpEarned === 'number' ? item.xpEarned : 0,
      durationSeconds: typeof item.durationSeconds === 'number' ? item.durationSeconds : undefined,
      source: item.source === 'playground' ? 'playground' : 'exam_bank',
      badgeId: typeof item.badgeId === 'string' ? item.badgeId : undefined,
      badgeName: typeof item.badgeName === 'string' ? item.badgeName : undefined,
      submittedAt: toIsoStringSafe(item.submittedAt || item.createdAt, nowIso),
    }));

  const rawBadges = Array.isArray(raw.badges) ? raw.badges : [];
  const badges: HubBadge[] = rawBadges
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, idx) => ({
      id: String(item.id || `badge_${idx}`),
      name: String(item.name || item.title || 'Huy hiệu'),
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      xpReward: typeof item.xpReward === 'number' ? item.xpReward : undefined,
      earnedAt: toIsoStringSafe(item.earnedAt || item.createdAt, nowIso),
      source: item.source === 'exam_bank' ? 'exam_bank' : 'playground',
    }));

  return {
    id: docId,
    classId: typeof raw.classId === 'string' ? raw.classId : undefined,
    classCode,
    className:
      typeof raw.className === 'string' && raw.className.trim()
        ? raw.className.trim()
        : classCode,
    stt,
    studentUid,
    studentId: studentUid || docId,
    studentName: String(raw.studentName || raw.fullName || raw.name || `Học sinh #${stt || docId}`),
    studentEmail:
      typeof raw.studentEmail === 'string'
        ? raw.studentEmail
        : typeof raw.email === 'string'
        ? raw.email
        : '',
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : undefined,
    teacherId: typeof raw.teacherId === 'string' ? raw.teacherId : undefined,
    xp: typeof raw.xp === 'number' && Number.isFinite(raw.xp) ? raw.xp : Number(raw.xp || 0) || 0,
    badges,
    testResults,
    joinedAt: toIsoStringSafe(raw.joinedAt || raw.createdAt || raw.serverCreatedAt, nowIso),
    updatedAt: toIsoStringSafe(raw.updatedAt || raw.serverUpdatedAt, nowIso),
  };
}

export function mapHubProfileToEnrollment(
  profile: HubLearningProfile,
  classMeta?: Classroom
): ClassEnrollment {
  const resolvedClassId = classMeta?.id || profile.classId || profile.classCode;
  const resolvedClassName = classMeta?.className || profile.className || profile.classCode;
  const resolvedTeacherId = classMeta?.ownerId || profile.ownerId || profile.teacherId || '';
  const resolvedTeacherName = classMeta?.teacherName || 'Giáo viên';
  const canonicalDocId =
    profile.classCode && profile.stt > 0
      ? buildHubProfileDocId(profile.classCode, profile.stt)
      : profile.id;

  return {
    id: canonicalDocId,
    classId: resolvedClassId,
    classCode: profile.classCode,
    className: resolvedClassName,
    teacherId: resolvedTeacherId,
    teacherName: resolvedTeacherName,
    studentId: profile.studentUid || profile.studentId || canonicalDocId,
    studentUid: profile.studentUid,
    studentName: profile.studentName,
    studentEmail: profile.studentEmail || '',
    studentClassName: resolvedClassName,
    stt: profile.stt,
    xp: profile.xp,
    badges: profile.badges || [],
    testResults: profile.testResults || [],
    hubProfileDocId: canonicalDocId,
    source: 'hub',
    joinedAt: profile.joinedAt || new Date().toISOString(),
  };
}

function logHubFirestoreWarning(err: unknown, op: OperationType, path: string): void {
  try {
    handleFirestoreError(err, op, `dbHub/${path}`);
  } catch (structuredErr) {
    console.warn(`[HQTest dbHub] ${op.toUpperCase()} ${path}:`, structuredErr);
  }
}

// ============================================================================
// 1. TEACHER: READ SHARED CLASSES (hub_classes) & STUDENT PROFILES (hub_learning_profiles)
// ============================================================================

export async function fetchHubClassesByOwner(
  ownerId: string,
  teacherEmail?: string
): Promise<Classroom[]> {
  if (hubInitError || !ownerId) return [];

  const classMap = new Map<string, Classroom>();
  const classesCol = collection(dbHub, HUB_CLASSES_COLLECTION);

  try {
    const snap = await getDocs(query(classesCol, where('ownerId', '==', ownerId)));
    snap.docs.forEach((d) => {
      const mapped = mapDocToHubClassroom(d.id, d.data() as Record<string, unknown>, ownerId);
      classMap.set(mapped.classCode || d.id, mapped);
    });
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.LIST, HUB_CLASSES_COLLECTION);
  }

  // Optional secondary match by teacherId / ownerEmail if no results matched ownerId
  if (classMap.size === 0) {
    try {
      const altSnap = await getDocs(query(classesCol, where('teacherId', '==', ownerId)));
      altSnap.docs.forEach((d) => {
        const mapped = mapDocToHubClassroom(d.id, d.data() as Record<string, unknown>, ownerId);
        classMap.set(mapped.classCode || d.id, mapped);
      });
    } catch {
      // ignore optional fallback query errors
    }
  }

  if (classMap.size === 0 && teacherEmail && teacherEmail.trim()) {
    try {
      const emailSnap = await getDocs(
        query(classesCol, where('ownerEmail', '==', teacherEmail.trim().toLowerCase()))
      );
      emailSnap.docs.forEach((d) => {
        const mapped = mapDocToHubClassroom(d.id, d.data() as Record<string, unknown>, ownerId);
        classMap.set(mapped.classCode || d.id, mapped);
      });
    } catch {
      // ignore optional fallback query errors
    }
  }

  return Array.from(classMap.values()).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
}

export async function fetchHubLearningProfilesByClassCodes(
  classCodes: string[],
  ownerId?: string
): Promise<HubLearningProfile[]> {
  if (hubInitError) return [];

  const normalizedCodes = Array.from(
    new Set(classCodes.map((c) => normalizeHubClassCode(c)).filter(Boolean))
  );
  const profilesCol = collection(dbHub, HUB_LEARNING_PROFILES_COLLECTION);
  const profileMap = new Map<string, HubLearningProfile>();

  // Firestore `in` supports max 10 values per query
  const chunks: string[][] = [];
  for (let i = 0; i < normalizedCodes.length; i += 10) {
    chunks.push(normalizedCodes.slice(i, i + 10));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const snap = await getDocs(
          chunk.length === 1
            ? query(profilesCol, where('classCode', '==', chunk[0]))
            : query(profilesCol, where('classCode', 'in', chunk))
        );
        snap.docs.forEach((d) => {
          const mapped = mapDocToHubLearningProfile(d.id, d.data() as Record<string, unknown>);
          profileMap.set(d.id, mapped);
        });
      } catch (err) {
        logHubFirestoreWarning(err, OperationType.LIST, HUB_LEARNING_PROFILES_COLLECTION);
      }
    })
  );

  // Fallback by ownerId if classCodes was empty
  if (normalizedCodes.length === 0 && ownerId) {
    try {
      const snap = await getDocs(query(profilesCol, where('ownerId', '==', ownerId)));
      snap.docs.forEach((d) => {
        const mapped = mapDocToHubLearningProfile(d.id, d.data() as Record<string, unknown>);
        profileMap.set(d.id, mapped);
      });
    } catch (err) {
      logHubFirestoreWarning(err, OperationType.LIST, HUB_LEARNING_PROFILES_COLLECTION);
    }
  }

  // Always sort ascending by `stt`
  return sortHubProfilesByStt(Array.from(profileMap.values()));
}

export async function syncClassroomToHub(
  cls: Classroom,
  ownerId: string,
  ownerEmail?: string
): Promise<boolean> {
  if (hubInitError || !ownerId) return false;
  const normalizedCode = normalizeHubClassCode(cls.classCode);
  if (!normalizedCode) return false;

  const nowIso = new Date().toISOString();
  const docId = cls.source === 'hub' && cls.id ? cls.id : normalizedCode;
  const ref = doc(dbHub, HUB_CLASSES_COLLECTION, docId);
  try {
    await setDoc(
      ref,
      stripUndefinedDeep({
        id: docId,
        ownerId,
        teacherId: ownerId,
        ...(ownerEmail ? { ownerEmail: ownerEmail.trim().toLowerCase() } : {}),
        teacherName: (cls.teacherName || 'Giáo viên').slice(0, 150),
        ...(cls.school ? { school: cls.school.slice(0, 200) } : {}),
        className: cls.className.trim().slice(0, 120),
        classCode: normalizedCode,
        ...(cls.description ? { description: cls.description.slice(0, 500) } : {}),
        assignedExamCodes: Array.from(
          new Set((cls.assignedExamCodes || []).map((c) => normalizeExamCode(c)).filter(Boolean))
        ).slice(0, 100),
        isActive: cls.isActive !== false,
        createdAt: cls.createdAt || nowIso,
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    return true;
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.WRITE, `${HUB_CLASSES_COLLECTION}/${docId}`);
    return false;
  }
}

export async function deleteClassroomFromHub(cls: Classroom): Promise<boolean> {
  if (hubInitError) return false;
  const normalizedCode = normalizeHubClassCode(cls.classCode);
  const candidateIds = Array.from(new Set([cls.id, normalizedCode].filter(Boolean)));
  let deleted = false;
  for (const id of candidateIds) {
    try {
      await deleteDoc(doc(dbHub, HUB_CLASSES_COLLECTION, id));
      deleted = true;
    } catch (err) {
      logHubFirestoreWarning(err, OperationType.DELETE, `${HUB_CLASSES_COLLECTION}/${id}`);
    }
  }
  return deleted;
}

export async function saveHubStudentProfile(params: {
  classCode: string;
  classId?: string;
  className?: string;
  stt: number;
  studentName: string;
  studentEmail?: string;
  studentUid?: string;
  ownerId: string;
}): Promise<HubLearningProfile> {
  const normalizedCode = normalizeHubClassCode(params.classCode);
  const stt = parseSttNumber(params.stt);
  const docId = buildHubProfileDocId(normalizedCode, stt);
  const nowIso = new Date().toISOString();
  const ref = doc(dbHub, HUB_LEARNING_PROFILES_COLLECTION, docId);

  try {
    const existingSnap = await getDoc(ref).catch(() => null);
    const existingData = existingSnap?.exists()
      ? (existingSnap.data() as Record<string, unknown>)
      : null;

    const payload = stripUndefinedDeep({
      id: docId,
      classId: params.classId || normalizedCode,
      classCode: normalizedCode,
      className: (params.className || normalizedCode).slice(0, 120),
      stt,
      studentName: params.studentName.trim().slice(0, 150),
      ...(params.studentEmail?.trim()
        ? { studentEmail: params.studentEmail.trim().toLowerCase().slice(0, 200) }
        : {}),
      ...(params.studentUid?.trim()
        ? {
            studentUid: params.studentUid.trim().slice(0, 128),
            studentId: params.studentUid.trim().slice(0, 128),
          }
        : {}),
      ownerId: params.ownerId,
      teacherId: params.ownerId,
      xp: typeof existingData?.xp === 'number' ? existingData.xp : 0,
      badges: Array.isArray(existingData?.badges) ? existingData.badges : [],
      testResults: Array.isArray(existingData?.testResults) ? existingData.testResults : [],
      joinedAt:
        typeof existingData?.joinedAt === 'string' && existingData.joinedAt
          ? existingData.joinedAt
          : nowIso,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
      ...(existingData?.serverCreatedAt ? {} : { serverCreatedAt: serverTimestamp() }),
    });

    await setDoc(ref, payload, { merge: true });
    return mapDocToHubLearningProfile(docId, payload as unknown as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${HUB_LEARNING_PROFILES_COLLECTION}/${docId}`);
  }
}

export async function deleteHubStudentProfile(docId: string): Promise<boolean> {
  if (hubInitError || !docId) return false;
  try {
    await deleteDoc(doc(dbHub, HUB_LEARNING_PROFILES_COLLECTION, docId));
    return true;
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.DELETE, `${HUB_LEARNING_PROFILES_COLLECTION}/${docId}`);
    return false;
  }
}

// ============================================================================
// 2. STUDENT: LOOKUP & LINK PROFILE (${classCode}_${stt}) BY studentUid
// ============================================================================

export async function fetchStudentHubProfilesByUid(
  studentUid: string,
  studentEmail?: string
): Promise<HubLearningProfile[]> {
  if (hubInitError || !studentUid) return [];

  const profilesCol = collection(dbHub, HUB_LEARNING_PROFILES_COLLECTION);
  const found = new Map<string, HubLearningProfile>();

  try {
    const snap = await getDocs(query(profilesCol, where('studentUid', '==', studentUid)));
    snap.docs.forEach((d) => {
      found.set(d.id, mapDocToHubLearningProfile(d.id, d.data() as Record<string, unknown>));
    });
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.LIST, HUB_LEARNING_PROFILES_COLLECTION);
  }

  if (found.size === 0) {
    try {
      const snapByStudentId = await getDocs(
        query(profilesCol, where('studentId', '==', studentUid))
      );
      snapByStudentId.docs.forEach((d) => {
        found.set(d.id, mapDocToHubLearningProfile(d.id, d.data() as Record<string, unknown>));
      });
    } catch {
      // ignore fallback error
    }
  }

  if (found.size === 0 && studentEmail && studentEmail.trim()) {
    try {
      const snapByEmail = await getDocs(
        query(profilesCol, where('studentEmail', '==', studentEmail.trim().toLowerCase()))
      );
      snapByEmail.docs.forEach((d) => {
        found.set(d.id, mapDocToHubLearningProfile(d.id, d.data() as Record<string, unknown>));
      });
    } catch {
      // ignore fallback error
    }
  }

  return sortHubProfilesByStt(Array.from(found.values()));
}

export async function linkStudentUidToHubProfile(params: {
  classCode: string;
  stt: number;
  studentUid: string;
  studentName: string;
  studentEmail?: string;
}): Promise<HubLearningProfile> {
  const normalizedCode = normalizeHubClassCode(params.classCode);
  const stt = parseSttNumber(params.stt);
  const docId = buildHubProfileDocId(normalizedCode, stt);
  const nowIso = new Date().toISOString();
  const profileRef = doc(dbHub, HUB_LEARNING_PROFILES_COLLECTION, docId);

  try {
    let className = normalizedCode;
    let ownerId: string | undefined;
    try {
      const clsSnap = await getDoc(doc(dbHub, HUB_CLASSES_COLLECTION, normalizedCode));
      if (clsSnap.exists()) {
        const clsData = clsSnap.data() as Record<string, unknown>;
        className = String(clsData.className || clsData.name || normalizedCode);
        ownerId = typeof clsData.ownerId === 'string' ? clsData.ownerId : undefined;
      }
    } catch {
      // class lookup is optional when linking directly by classCode + stt
    }

    const existingSnap = await getDoc(profileRef).catch(() => null);
    const existingData = existingSnap?.exists()
      ? (existingSnap.data() as Record<string, unknown>)
      : null;

    const payload = stripUndefinedDeep({
      id: docId,
      classCode: normalizedCode,
      className: String(existingData?.className || className),
      stt,
      studentUid: params.studentUid,
      studentId: params.studentUid,
      studentName: String(existingData?.studentName || params.studentName || 'Học sinh').slice(0, 150),
      ...(params.studentEmail?.trim()
        ? { studentEmail: params.studentEmail.trim().toLowerCase().slice(0, 200) }
        : {}),
      ...(existingData?.ownerId || ownerId ? { ownerId: existingData?.ownerId || ownerId } : {}),
      xp: typeof existingData?.xp === 'number' ? existingData.xp : 0,
      badges: Array.isArray(existingData?.badges) ? existingData.badges : [],
      testResults: Array.isArray(existingData?.testResults) ? existingData.testResults : [],
      joinedAt:
        typeof existingData?.joinedAt === 'string' && existingData.joinedAt
          ? existingData.joinedAt
          : nowIso,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
      ...(existingData?.serverCreatedAt ? {} : { serverCreatedAt: serverTimestamp() }),
    });

    await setDoc(profileRef, payload, { merge: true });
    return mapDocToHubLearningProfile(docId, payload as unknown as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${HUB_LEARNING_PROFILES_COLLECTION}/${docId}`);
  }
}

async function resolveTargetStudentHubProfile(params: {
  studentUid: string;
  studentEmail?: string;
  preferredClassCode?: string;
}): Promise<HubLearningProfile | null> {
  const profiles = await fetchStudentHubProfilesByUid(params.studentUid, params.studentEmail);
  if (profiles.length === 0) return null;

  const preferredCode = normalizeHubClassCode(params.preferredClassCode);
  if (preferredCode) {
    const exact = profiles.find((p) => normalizeHubClassCode(p.classCode) === preferredCode);
    if (exact) return exact;
  }

  // Prefer profiles with valid classCode & stt
  return profiles.find((p) => p.classCode && p.stt > 0) || profiles[0];
}

// ============================================================================
// 3. WRITE testResults & INCREMENT xp INTO hub_learning_profiles/${classCode}_${stt}
// ============================================================================

export function calculateExamXpReward(score: number, maxScore = 10): number {
  const safeMax = maxScore > 0 ? maxScore : 10;
  const ratio = Math.max(0, Math.min(1, score / safeMax));
  // 20 base XP for completing + up to 80 performance XP (100 XP for a perfect 10)
  return Math.max(10, Math.round(20 + ratio * 80));
}

export async function recordExamResultToHubProfile(params: {
  studentUid: string;
  studentEmail?: string;
  studentName?: string;
  preferredClassCode?: string;
  submission: StudentSubmission;
  maxScore?: number;
  source?: 'exam_bank' | 'playground';
  xpEarned?: number;
}): Promise<HubSyncOutcome> {
  const { studentUid, studentEmail, preferredClassCode, submission } = params;
  const resolvedMaxScore =
    typeof params.maxScore === 'number' && params.maxScore > 0 ? params.maxScore : 10;
  const xpEarned =
    typeof params.xpEarned === 'number' && params.xpEarned >= 0
      ? Math.round(params.xpEarned)
      : calculateExamXpReward(submission.totalScore, resolvedMaxScore);

  if (hubInitError || !studentUid || studentUid === 'guest_student') {
    return { synced: false, xpEarned, error: 'Chưa đăng nhập tài khoản học sinh để đồng bộ Hub.' };
  }

  try {
    const profile = await resolveTargetStudentHubProfile({
      studentUid,
      studentEmail,
      preferredClassCode,
    });

    if (!profile || !profile.classCode || profile.stt <= 0) {
      return {
        synced: false,
        xpEarned,
        error: 'Chưa tìm thấy hồ sơ hub_learning_profiles khớp studentUid đang đăng nhập.',
      };
    }

    const docId = buildHubProfileDocId(profile.classCode, profile.stt);
    const profileRef = doc(dbHub, HUB_LEARNING_PROFILES_COLLECTION, docId);
    const nowIso = new Date().toISOString();

    const testResultEntry: HubTestResult = {
      id: submission.id || `exam_${Date.now()}`,
      submissionId: submission.id,
      examId: submission.examId,
      examCode: normalizeExamCode(submission.examCode || ''),
      examTitle: (submission.examTitle || 'Bài kiểm tra HQTest').slice(0, 200),
      score: Number((submission.totalScore ?? 0).toFixed(2)),
      maxScore: resolvedMaxScore,
      xpEarned,
      durationSeconds: submission.durationSeconds || 0,
      source: params.source || 'exam_bank',
      submittedAt: submission.submittedAt || nowIso,
    };

    try {
      await updateDoc(
        profileRef,
        stripUndefinedDeep({
          studentUid,
          testResults: arrayUnion(testResultEntry),
          xp: increment(xpEarned),
          updatedAt: nowIso,
          serverUpdatedAt: serverTimestamp(),
        })
      );
    } catch {
      // Fallback if document was newly initialized under canonical `${classCode}_${stt}`
      await setDoc(
        profileRef,
        stripUndefinedDeep({
          id: docId,
          classCode: profile.classCode,
          className: profile.className || profile.classCode,
          stt: profile.stt,
          studentUid,
          studentId: studentUid,
          studentName: profile.studentName || params.studentName || submission.studentName || 'Học sinh',
          ...(studentEmail ? { studentEmail: studentEmail.trim().toLowerCase() } : {}),
          testResults: arrayUnion(testResultEntry),
          xp: increment(xpEarned),
          updatedAt: nowIso,
          serverUpdatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    }

    return {
      synced: true,
      profileDocId: docId,
      classCode: profile.classCode,
      stt: profile.stt,
      xpEarned,
    };
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.UPDATE, HUB_LEARNING_PROFILES_COLLECTION);
    return {
      synced: false,
      xpEarned,
      error: err instanceof Error ? err.message : 'Không thể ghi kết quả vào hub_learning_profiles.',
    };
  }
}

export async function awardPlaygroundRewardToHubProfile(params: {
  studentUid: string;
  studentEmail?: string;
  studentName?: string;
  preferredClassCode?: string;
  activityCode: string;
  activityTitle: string;
  score: number;
  maxScore: number;
  xpReward: number;
  badge?: {
    id: string;
    name: string;
    icon?: string;
  };
}): Promise<HubSyncOutcome> {
  const { studentUid, studentEmail, preferredClassCode } = params;
  const xpEarned = Math.max(0, Math.round(params.xpReward));

  if (hubInitError || !studentUid || studentUid === 'guest_student') {
    return { synced: false, xpEarned, error: 'Vui lòng đăng nhập để nhận điểm thưởng XP và huy hiệu.' };
  }

  try {
    const profile = await resolveTargetStudentHubProfile({
      studentUid,
      studentEmail,
      preferredClassCode,
    });

    if (!profile || !profile.classCode || profile.stt <= 0) {
      return {
        synced: false,
        xpEarned,
        error: 'Chưa liên kết hồ sơ học sinh (${classCode}_${stt}) trong hub_learning_profiles.',
      };
    }

    const docId = buildHubProfileDocId(profile.classCode, profile.stt);
    const profileRef = doc(dbHub, HUB_LEARNING_PROFILES_COLLECTION, docId);
    const nowIso = new Date().toISOString();

    const testResultEntry: HubTestResult = {
      id: `play_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      examCode: normalizeExamCode(params.activityCode || 'SANCHOI'),
      examTitle: params.activityTitle.slice(0, 200),
      score: Number(params.score.toFixed(2)),
      maxScore: params.maxScore,
      xpEarned,
      source: 'playground',
      ...(params.badge ? { badgeId: params.badge.id, badgeName: params.badge.name } : {}),
      submittedAt: nowIso,
    };

    const badgeEntry: HubBadge | undefined = params.badge
      ? {
          id: params.badge.id,
          name: params.badge.name,
          icon: params.badge.icon,
          xpReward: xpEarned,
          earnedAt: nowIso,
          source: 'playground',
        }
      : undefined;

    const updatePayload = stripUndefinedDeep({
      studentUid,
      testResults: arrayUnion(testResultEntry),
      xp: increment(xpEarned),
      ...(badgeEntry ? { badges: arrayUnion(badgeEntry) } : {}),
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
    });

    try {
      await updateDoc(profileRef, updatePayload);
    } catch {
      await setDoc(
        profileRef,
        stripUndefinedDeep({
          id: docId,
          classCode: profile.classCode,
          className: profile.className || profile.classCode,
          stt: profile.stt,
          studentId: studentUid,
          studentName: profile.studentName || params.studentName || 'Học sinh',
          ...(studentEmail ? { studentEmail: studentEmail.trim().toLowerCase() } : {}),
          ...updatePayload,
        }),
        { merge: true }
      );
    }

    return {
      synced: true,
      profileDocId: docId,
      classCode: profile.classCode,
      stt: profile.stt,
      xpEarned,
    };
  } catch (err) {
    logHubFirestoreWarning(err, OperationType.UPDATE, HUB_LEARNING_PROFILES_COLLECTION);
    return {
      synced: false,
      xpEarned,
      error: err instanceof Error ? err.message : 'Không thể cộng XP và huy hiệu vào hub_learning_profiles.',
    };
  }
}
