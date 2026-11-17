import React from 'react';
import { Exam, Folder, StudentSubmission } from '../../types';
import { ExamFolderExplorer } from './ExamFolderExplorer';

interface ExamManagerProps {
  exams: Exam[];
  folders?: Folder[];
  submissions: StudentSubmission[];
  currentUserId?: string;
  mode?: 'all' | 'online';
  autoOpenShareExamId?: string | null;
  onClearAutoOpenShare?: () => void;
  onCreateNew: (folderId?: string | null) => void;
  onOpenResults: (examId: string) => void;
  onTakeExamAsPreview: (exam: Exam) => void;
  onTogglePublish: (examId: string) => void;
  onDeleteExam: (examId: string) => void;
  onExamUpdated?: (updatedExam: Exam) => void;
  onSaveFolders?: (folders: Folder[]) => void;
  onShareExam?: (exam: Exam) => void;
}

export const ExamManager: React.FC<ExamManagerProps> = ({
  exams,
  folders = [],
  submissions,
  currentUserId,
  mode = 'all',
  autoOpenShareExamId,
  onClearAutoOpenShare,
  onCreateNew,
  onOpenResults,
  onTakeExamAsPreview,
  onTogglePublish,
  onDeleteExam,
  onExamUpdated,
  onSaveFolders,
  onShareExam,
}) => {
  return (
    <ExamFolderExplorer
      exams={exams}
      folders={folders}
      submissions={submissions}
      currentUserId={currentUserId}
      mode={mode}
      autoOpenShareExamId={autoOpenShareExamId}
      onClearAutoOpenShare={onClearAutoOpenShare}
      onCreateNew={onCreateNew}
      onOpenResults={onOpenResults}
      onTakeExamAsPreview={onTakeExamAsPreview}
      onTogglePublish={onTogglePublish}
      onDeleteExam={onDeleteExam}
      onExamUpdated={onExamUpdated}
      onSaveFolders={onSaveFolders}
      onShareExam={onShareExam}
    />
  );
};
