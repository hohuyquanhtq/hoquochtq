import React from 'react';
import { Exam, Folder, StudentSubmission } from '../../types';
import { ExamFolderExplorer } from './ExamFolderExplorer';

interface ExamManagerProps {
  exams: Exam[];
  folders?: Folder[];
  submissions: StudentSubmission[];
  currentUserId?: string;
  userRole?: 'admin' | 'teacher';
  mode?: 'all' | 'online';
  activeFolderId?: string | null;
  onActiveFolderChange?: (folderId: string | null) => void;
  autoOpenShareExamId?: string | null;
  onClearAutoOpenShare?: () => void;
  onCreateNew: (folderId?: string | null) => void;
  onOpenResults: (examId: string) => void;
  onTakeExamAsPreview: (exam: Exam) => void;
  onTogglePublish: (examId: string) => void;
  onDeleteExam: (examId: string) => void;
  onExamUpdated?: (updatedExam: Exam) => void;
  onSaveFolders?: (folders: Folder[]) => void;
  onCreateFolder?: (input: { name: string; parentId: string | null; description?: string }) => Promise<void>;
  onRenameFolder?: (folder: Folder, updates: { name: string; description?: string }) => Promise<void>;
  onMoveFolder?: (folder: Folder, targetParentId: string | null) => Promise<void>;
  onDeleteFolder?: (folder: Folder) => Promise<void>;
  onMoveExam?: (
    exam: Exam,
    targetFolderId: string | null,
    updates?: { title?: string; description?: string }
  ) => Promise<void>;
  onShareExam?: (exam: Exam) => void;
}

export const ExamManager: React.FC<ExamManagerProps> = ({
  exams,
  folders = [],
  submissions,
  currentUserId,
  userRole,
  mode = 'all',
  activeFolderId,
  onActiveFolderChange,
  autoOpenShareExamId,
  onClearAutoOpenShare,
  onCreateNew,
  onOpenResults,
  onTakeExamAsPreview,
  onTogglePublish,
  onDeleteExam,
  onExamUpdated,
  onSaveFolders,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onMoveExam,
  onShareExam,
}) => {
  return (
    <ExamFolderExplorer
      exams={exams}
      folders={folders}
      submissions={submissions}
      currentUserId={currentUserId}
      userRole={userRole}
      mode={mode}
      activeFolderId={activeFolderId}
      onActiveFolderChange={onActiveFolderChange}
      autoOpenShareExamId={autoOpenShareExamId}
      onClearAutoOpenShare={onClearAutoOpenShare}
      onCreateNew={onCreateNew}
      onOpenResults={onOpenResults}
      onTakeExamAsPreview={onTakeExamAsPreview}
      onTogglePublish={onTogglePublish}
      onDeleteExam={onDeleteExam}
      onExamUpdated={onExamUpdated}
      onSaveFolders={onSaveFolders}
      onCreateFolder={onCreateFolder}
      onRenameFolder={onRenameFolder}
      onMoveFolder={onMoveFolder}
      onDeleteFolder={onDeleteFolder}
      onMoveExam={onMoveExam}
      onShareExam={onShareExam}
    />
  );
};
