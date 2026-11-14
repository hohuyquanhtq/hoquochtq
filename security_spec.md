# HQTest Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: Every unmatched path is denied (`allow read, write: if false`).
2. **Email/Password Authentication Only**: All Firebase Authentication uses `EmailAuthProvider` (email + password). Google Sign-In / OAuth is disallowed.
3. **Non-Escalatable User Accounts (`/users/{userId}`)**:
   - Public registration may only create `/users/{uid}` with `role == 'student'` (`status == 'active'`) or `role == 'teacher'` (`status == 'pending'`).
   - Users can never self-assign `role: 'admin'`, self-approve `'teacher'`, or unlock themselves (`status: 'locked'`).
   - Only verified Admins (`isAdmin()`) may `list` users or update `role`, `status`, `approvedBy`, `approvedAt`.
4. **Teacher Isolated Workspaces (`/questions`, `/folders`, `/exams`, `/classes`, `/uploadRecords`)**:
   - All private teacher resources require `isActiveTeacher()` (`role == 'teacher' && status == 'active'` or Admin) and `ownerId == request.auth.uid`.
   - Teachers with `status == 'pending'`, `'locked'`, or `'rejected'` cannot create, read, or publish private exams/questions.
   - Teacher A cannot read, list, edit, or delete Teacher B's private questions, folders, classes, upload records, or exams.
5. **No Question/Answer Leak on Public Exam Lookup (`/examStatus/{examCode}` vs `/publicExams/{examCode}` vs `/examKeys/{examCode}`)**:
   - `/examStatus/{examCode}` allows single-doc `get` (NO `list`) and exposes only non-sensitive metadata (`title`, `isPublished`, `openAt`, `closeAt`, `durationMinutes`, `totalQuestions`, `authorName`).
   - `/publicExams/{examCode}` allows single-doc `get` (NO `list`) ONLY when `resource.data.isPublished == true`. Its `questions` array is sanitized client-side to strip all answer keys and solutions.
   - `/examKeys/{examCode}` allows single-doc `get` (NO `list`) ONLY for the owner teacher, Admin, or post-submission when `isPublished == true && showAnswersAfterSubmit == true`.
6. **Class Membership Privacy (`/classes`, `/classJoinCodes`, `/classEnrollments`)**:
   - `/classJoinCodes/{classCode}` allows signed-in `get` (NO `list`) so students can join by exact code without listing all classes.
   - `/classEnrollments/{classId}_{studentUid}` strictly scopes `get` and `list` to `studentId == request.auth.uid`, `teacherId == request.auth.uid`, or `isAdmin()`.
7. **Submission Privacy (`/submissions/{submissionId}`)**:
   - Allows `create` only for an existing published `/publicExams/{examCode}` matching `ownerId`, and when signed in requires `studentId == request.auth.uid` (unless Admin/Teacher).
   - `get` and `list` are scoped to the exam's `ownerId` teacher, the submitting active student (`studentId == request.auth.uid`), or `isAdmin()`. Students cannot alter scores or status.

## 2. Adversarial Scenarios Covered
1. Self-registration attempting `role: 'admin'` or `role: 'teacher', status: 'active'` -> `PERMISSION_DENIED`.
2. Pending/locked teacher attempting to read or write `/exams`, `/questions`, `/folders`, or `/publicExams` -> `PERMISSION_DENIED`.
3. Teacher A querying `/questions`, `/folders`, `/classes`, `/exams`, or `/submissions` belonging to Teacher B -> `PERMISSION_DENIED`.
4. Student attempting `update` on `/users/{uid}` to change `role` or `status`, or `list` on `/users` -> `PERMISSION_DENIED`.
5. Unauthenticated or student caller attempting `get`/`list` on `/exams/{examId}` or `/questions/{questionId}` -> `PERMISSION_DENIED`.
6. Scraping `list` query on `/examStatus`, `/publicExams`, `/examKeys`, or `/classJoinCodes` -> `PERMISSION_DENIED`.
7. Student reading `/submissions` belonging to another student or tampering with `totalScore` -> `PERMISSION_DENIED`.
8. Email verification alone or client-side claims attempting to write `/admins/{uid}` or self-assign `role: 'admin'` -> `PERMISSION_DENIED`.
9. Client timestamp tampering (`serverCreatedAt != request.time` / `serverUpdatedAt != request.time`) -> `PERMISSION_DENIED`.
10. Document ID poisoning or shadow field injection (`hasOnly()` gate) -> `PERMISSION_DENIED`.
