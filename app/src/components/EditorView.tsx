import { EditorWorkspace } from '@/components/EditorWorkspace';
import type { Id } from '@/types';

interface EditorViewProps {
  projectId: Id;
  projectTitle: string;
  projectDescription?: string;
  onOpenSettings: () => void;
  onOpenForeshadow: () => void;
}

export function EditorView({
  projectId,
  projectTitle,
  projectDescription,
  onOpenSettings,
  onOpenForeshadow,
}: EditorViewProps) {
  return (
    <EditorWorkspace
      projectId={projectId}
      projectTitle={projectTitle}
      projectDescription={projectDescription}
      onOpenSettings={onOpenSettings}
      onOpenForeshadow={onOpenForeshadow}
      hideChapterSidebar
      hideAiWritingEntry
    />
  );
}
