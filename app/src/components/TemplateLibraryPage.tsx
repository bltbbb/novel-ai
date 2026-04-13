import { ArrowLeft } from 'lucide-react';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';

interface TemplateLibraryPageProps {
  onClose: () => void;
}

export function TemplateLibraryPage({ onClose }: TemplateLibraryPageProps) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-6 py-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between rounded-3xl border border-neutral-800 bg-neutral-900/70 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">模板库页面</p>
            <p className="mt-2 text-sm text-neutral-400">
              拆书、查看任务、编辑模板与模板导入导出入口。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          >
            <ArrowLeft size={16} />
            返回
          </button>
        </div>

        <TemplateLibraryDialog open onClose={onClose} variant="page" />
      </div>
    </div>
  );
}

