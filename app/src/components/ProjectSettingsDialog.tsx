import { useEffect, useState } from 'react';
import { Palette, Save, X } from 'lucide-react';
import { useProjectStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';

interface ProjectSettingsDialogProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
}

export function ProjectSettingsDialog({ open, projectId, onClose }: ProjectSettingsDialogProps) {
  const currentProject = useProjectStore((state) =>
    projectId ? state.projects.find((project) => project.id === projectId) ?? null : null,
  );
  const updateProject = useProjectStore((state) => state.updateProject);
  const globalStylePrompt = useSettingsStore((state) => state.settings.stylePrompt);
  const { toast } = useToast();
  const [stylePrompt, setStylePrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !currentProject) {
      return;
    }

    setStylePrompt(currentProject.stylePrompt || globalStylePrompt || '');
  }, [currentProject, globalStylePrompt, open]);

  if (!open || !currentProject) {
    return null;
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      await updateProject(currentProject.id, {
        stylePrompt,
      });
      toast('项目文风已保存', 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存项目设置失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">项目设置</h2>
              <p className="text-sm text-neutral-500">当前仅保留项目级文风设置，影响本项目的生成与风格转译。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-200">项目文风 Prompt</span>
            <textarea
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
              placeholder="例如：保持冷峻克制、短句推进、情绪内敛，避免解释腔。"
              className="min-h-[240px] w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-amber-500"
            />
          </label>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-xs leading-6 text-neutral-500">
            <p>这里的文风只作用于当前项目。</p>
            <p>模板绑定自带的正文约束、模板文风和负面约束仍会继续叠加。</p>
            {!currentProject.stylePrompt && globalStylePrompt.trim() ? <p>当前已预填历史全局文风，保存后会固化到本项目。</p> : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-800 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={15} />
            {isSaving ? '保存中...' : '保存项目设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
