# HQTest Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: Every unmatched path is denied (`allow read, write: if false`).
2. **Teacher Master Isolation (`/exams/{examId}`)**: Complete exam definitions (with correctOptionId, true/false keys, acceptable short answers, explanations, and internal metadata) are strictly owned by `ownerId == request.auth.uid` and require verified Google authentication. Students and unauthenticated callers can NEVER read or list `/exams`.
3. **No Question/Answer Leak on Unpublished Exams (`/examStatus/{examCode}` vs `/publicExams/{examCode}`)**:
   - `/examStatus/{examCode}` allows `get` (NO `list`) and exposes only non-sensitive metadata (`title`, `isPublished`, `openAt`, `closeAt`, `durationMinutes`, `totalQuestions`, `authorName`) so students receive accurate status messages (`not_published`, `not_started`, `expired`) without receiving questions or answers.
   - `/publicExams/{examCode}` allows `get` (NO `list`) ONLY when `resource.data.isPublished == true`. Its `questions` array is sanitized client-side before upload to strip all answer keys, solutions, and teacher-only properties.
4. **Answer Key Isolation (`/examKeys/{examCode}`)**: Answer keys and optional explanations are stored separately. Non-owners can `get` (NEVER `list`) ONLY when BOTH `resource.data.isPublished == true` AND `resource.data.showAnswersAfterSubmit == true`. When `showAnswersAfterSubmit == false`, students are completely blocked at Firestore level from reading answer keys.
5. **Submission Privacy (`/submissions/{submissionId}`)**: Students can submit (`create`) answers ONLY for an existing published exam whose `ownerId` matches the parent `/publicExams/{examCode}` document, with strict field/size checks and server timestamp (`createdAt == request.time`). Only the exam's `ownerId` teacher or verified Admin can `read`, `update`, or `delete` submissions.
6. **Zero Blanket List Queries**: `allow list` on `/exams` and `/submissions` strictly enforces `resource.data.ownerId == request.auth.uid` (or `isAdmin()`). `allow list` on `/examStatus`, `/publicExams`, `/examKeys`, and `/admins` is `false`.

## 2. "Dirty Dozen" Adversarial Payloads
1. Unauthenticated `get` or `list` on `/exams/{examId}` -> `PERMISSION_DENIED`.
2. Authenticated student (`uid != ownerId`) attempting `get` on `/exams/{examId}` -> `PERMISSION_DENIED`.
3. `list` query on `/publicExams` or `/examStatus` or `/examKeys` to scrape all exam codes -> `PERMISSION_DENIED`.
4. `get` on `/publicExams/{examCode}` when `isPublished == false` -> `PERMISSION_DENIED`.
5. `get` on `/examKeys/{examCode}` when `showAnswersAfterSubmit == false` -> `PERMISSION_DENIED`.
6. Shadow field injection (`isAdmin: true` or `extraGhostField: 1`) on `/exams` or `/submissions` create -> `PERMISSION_DENIED` (`hasOnly()` gate).
7. Identity spoofing (`ownerId: "victim_uid"`) during `/exams` or `/publicExams` create -> `PERMISSION_DENIED` (`ownerId == request.auth.uid`).
8. Unverified email claim spoofing admin email (`email_verified: false`) -> `PERMISSION_DENIED`.
9. Client timestamp tampering (`createdAt` != `request.time`) on `/exams` or `/submissions` -> `PERMISSION_DENIED`.
10. Document ID poisoning (200-char or invalid characters in `{examId}` / `{examCode}` / `{submissionId}`) -> `PERMISSION_DENIED` (`isValidId`).
11. Submission spoofing non-existent or unpublished `examCode`, or mismatched `ownerId` -> `PERMISSION_DENIED` (`exists` + `get` parent gate).
12. Student attempting `get`, `list`, `update`, or `delete` on `/submissions/{submissionId}` -> `PERMISSION_DENIED`.
