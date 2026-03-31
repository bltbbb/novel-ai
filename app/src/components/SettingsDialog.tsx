import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Settings2, Wifi, X } from 'lucide-react';
import { checkServerHealth } from '@/lib/server-health';
import { DEFAULT_SETTINGS } from '@/lib/runtime-config';
import { useServerStatusStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const modelPresets = ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.2', 'gpt-5.3-codex', 'gpt-5'];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const { toast } = useToast();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [modelName, setModelName] = useState(settings.modelName);
  const [temperature, setTemperature] = useState(settings.temperature);
  const [stylePrompt, setStylePrompt] = useState(settings.stylePrompt);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<string>('');

  const hasChanges = useMemo(() => {
    return (
      serverUrl !== settings.serverUrl ||
      modelName !== settings.modelName ||
      temperature !== settings.temperature ||
      stylePrompt !== settings.stylePrompt
    );
  }, [modelName, serverUrl, settings, stylePrompt, temperature]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setServerUrl(settings.serverUrl);
    setModelName(settings.modelName);
    setTemperature(settings.temperature);
    setStylePrompt(settings.stylePrompt);
    setTestStatus('');
  }, [open, settings]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      await updateSettings({
        serverUrl: serverUrl.trim(),
        modelName: modelName.trim(),
        temperature,
        stylePrompt,
      });
      await refreshServerStatus(serverUrl.trim());

      toast('设置已保存', 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存设置失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    const confirmed = window.confirm('确认恢复默认设置吗？');

    if (!confirmed) {
      return;
    }

    await resetSettings();
    await refreshServerStatus(DEFAULT_SETTINGS.serverUrl);
    toast('已恢复默认设置', 'info');
    onClose();
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestStatus('');

    try {
      const result = await checkServerHealth(serverUrl.trim());

      if (!result.ok) {
        throw new Error(result.message);
      }

      setTestStatus('连接成功');
      toast('服务端连接正常', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setTestStatus(`连接失败：${message}`);
      toast(`连接测试失败：${message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">系统设置</h2>
              <p className="text-sm text-neutral-500">管理服务地址、模型、温度和全局文风。</p>
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

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-200">后端地址</span>
              <input
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="http://localhost:3001"
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
              />
            </label>

            <div>
              <div className="mb-2 text-sm font-medium text-neutral-200">模型</div>
              <input
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="输入模型名"
                className="mb-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
              />
              <div className="flex flex-wrap gap-2">
                {modelPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setModelName(preset)}
                    className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                      modelName === preset
                        ? 'bg-indigo-500/15 text-indigo-300'
                        : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-neutral-200">
                <span>温度</span>
                <span className="text-neutral-400">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="mt-2 flex justify-between text-xs text-neutral-500">
                <span>更严谨</span>
                <span>更发散</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-200">全局文风 Prompt</span>
              <textarea
                value={stylePrompt}
                onChange={(event) => setStylePrompt(event.target.value)}
                placeholder="例如：保持冷峻克制的末法修仙风格，描写偏写实。"
                className="min-h-[220px] w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
              />
            </label>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Wifi size={15} className="text-indigo-400" />
                连接测试
              </div>
              <p className="text-xs leading-6 text-neutral-500">
                测试的是 `${serverUrl.replace(/\/+$/, '')}/api/health`，用于确认前端能否访问本地后端。
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleTestConnection()}
                  disabled={isTesting}
                  className="rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTesting ? '测试中...' : '测试连接'}
                </button>
                <span className={`text-xs ${testStatus.startsWith('连接成功') ? 'text-green-400' : 'text-neutral-500'}`}>
                  {testStatus || '尚未测试'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void handleReset()}
            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            <RotateCcw size={15} />
            恢复默认
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasChanges || isSaving}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={15} />
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
