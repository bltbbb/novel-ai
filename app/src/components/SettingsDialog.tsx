import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Settings2, Wifi, X } from 'lucide-react';
import {
  applyLightweightRecallPreset,
  DEFAULT_GENERATION_GATE_CONFIG,
  findMatchingLightweightRecallPreset,
  LIGHTWEIGHT_RECALL_PRESETS,
  normalizeGenerationGateConfig,
} from '@/lib/generation-gate-defaults';
import { fetchGenerationGateConfig, saveGenerationGateConfig } from '@/lib/server-config-client';
import { checkServerHealth } from '@/lib/server-health';
import { DEFAULT_SETTINGS } from '@/lib/runtime-config';
import { useServerStatusStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { GenerationGateConfig, ReviewSeverity } from '@/types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const modelPresets = ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.2', 'gpt-5.3-codex', 'gpt-5'];
const severityOptions: ReviewSeverity[] = ['critical', 'high', 'medium', 'low'];

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
  const [gateConfig, setGateConfig] = useState<GenerationGateConfig>(DEFAULT_GENERATION_GATE_CONFIG);
  const [savedGateConfig, setSavedGateConfig] = useState<GenerationGateConfig | null>(null);
  const [isGateConfigLoading, setIsGateConfigLoading] = useState(false);
  const [isGateConfigSaving, setIsGateConfigSaving] = useState(false);
  const [gateConfigStatus, setGateConfigStatus] = useState('');

  const hasChanges = useMemo(() => {
    return (
      serverUrl !== settings.serverUrl ||
      modelName !== settings.modelName ||
      temperature !== settings.temperature ||
      stylePrompt !== settings.stylePrompt
    );
  }, [modelName, serverUrl, settings, stylePrompt, temperature]);
  const hasGateConfigChanges = useMemo(() => {
    if (!savedGateConfig) {
      return false;
    }

    return (
      gateConfig.reviewRewriteMinSeverity !== savedGateConfig.reviewRewriteMinSeverity ||
      gateConfig.reviewMaxRewriteCount !== savedGateConfig.reviewMaxRewriteCount ||
      gateConfig.reviewScoreThresholds.consistency !== savedGateConfig.reviewScoreThresholds.consistency ||
      gateConfig.reviewScoreThresholds.continuity !== savedGateConfig.reviewScoreThresholds.continuity ||
      gateConfig.reviewScoreThresholds.reader_pull !== savedGateConfig.reviewScoreThresholds.reader_pull ||
      gateConfig.polishFailBlockReady !== savedGateConfig.polishFailBlockReady ||
      gateConfig.lightweightRecall.minScore !== savedGateConfig.lightweightRecall.minScore ||
      gateConfig.lightweightRecall.topK !== savedGateConfig.lightweightRecall.topK ||
      gateConfig.lightweightRecall.phraseWeight !== savedGateConfig.lightweightRecall.phraseWeight ||
      gateConfig.lightweightRecall.entityWeight !== savedGateConfig.lightweightRecall.entityWeight ||
      gateConfig.lightweightRecall.recencyWeight !== savedGateConfig.lightweightRecall.recencyWeight
    );
  }, [gateConfig, savedGateConfig]);
  const matchedLightweightRecallPreset = useMemo(
    () => findMatchingLightweightRecallPreset(gateConfig.lightweightRecall),
    [gateConfig.lightweightRecall],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setServerUrl(settings.serverUrl);
    setModelName(settings.modelName);
    setTemperature(settings.temperature);
    setStylePrompt(settings.stylePrompt);
    setTestStatus('');
    setGateConfigStatus('');
    void loadGateConfig(settings.serverUrl);
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

  async function loadGateConfig(targetServerUrl: string) {
    setIsGateConfigLoading(true);
    setGateConfigStatus('');

    try {
      const config = normalizeGenerationGateConfig(await fetchGenerationGateConfig(targetServerUrl.trim()));
      setGateConfig(config);
      setSavedGateConfig(config);
      setGateConfigStatus('已读取后端门控配置');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setSavedGateConfig(null);
      setGateConfig(DEFAULT_GENERATION_GATE_CONFIG);
      setGateConfigStatus(`读取失败：${message}`);
    } finally {
      setIsGateConfigLoading(false);
    }
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

  async function handleSaveGateConfig() {
    setIsGateConfigSaving(true);
    setGateConfigStatus('');

    try {
      const saved = normalizeGenerationGateConfig(
        await saveGenerationGateConfig(serverUrl.trim(), normalizeGenerationGateConfig(gateConfig)),
      );
      setGateConfig(saved);
      setSavedGateConfig(saved);
      setGateConfigStatus('后端门控配置已保存');
      toast('后端门控配置已保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setGateConfigStatus(`保存失败：${message}`);
      toast(`保存后端门控配置失败：${message}`, 'error');
    } finally {
      setIsGateConfigSaving(false);
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

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-neutral-200">后端门控策略</div>
                  <p className="mt-1 text-xs leading-6 text-neutral-500">
                    直接读写 `${serverUrl.replace(/\/+$/, '')}/api/runtime/generation-gate`，会覆盖服务端运行时门控配置。
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-neutral-300">Review 自动重写最低级别</span>
                  <select
                    value={gateConfig.reviewRewriteMinSeverity}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        reviewRewriteMinSeverity: event.target.value as ReviewSeverity,
                      }))
                    }
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    {severityOptions.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-neutral-300">最大自动重写次数</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={gateConfig.reviewMaxRewriteCount}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        reviewMaxRewriteCount: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                      }))
                    }
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">一致性最低分</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={gateConfig.reviewScoreThresholds.consistency}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          reviewScoreThresholds: {
                            ...current.reviewScoreThresholds,
                            consistency: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">连贯性最低分</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={gateConfig.reviewScoreThresholds.continuity}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          reviewScoreThresholds: {
                            ...current.reviewScoreThresholds,
                            continuity: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">追读力最低分</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={gateConfig.reviewScoreThresholds.reader_pull}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          reviewScoreThresholds: {
                            ...current.reviewScoreThresholds,
                            reader_pull: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={gateConfig.polishFailBlockReady}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        polishFailBlockReady: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
                  />
                  <div>
                    <p className="text-sm text-neutral-200">Polish 失败时阻止进入 ready</p>
                    <p className="mt-1 text-xs leading-6 text-neutral-500">
                      开启后，润色终检返回 fail 会直接把任务停在 error，必须人工处理或手动重试。
                    </p>
                  </div>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回最低分</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={gateConfig.lightweightRecall.minScore}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            minScore: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回 Top-K</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gateConfig.lightweightRecall.topK}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            topK: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回词命中权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gateConfig.lightweightRecall.phraseWeight}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            phraseWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回实体命中权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gateConfig.lightweightRecall.entityWeight}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            entityWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-neutral-300">轻量召回时序权重</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gateConfig.lightweightRecall.recencyWeight}
                      onChange={(event) =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            recencyWeight: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-neutral-200">轻量召回权重预设</p>
                      <p className="mt-1 text-xs leading-6 text-neutral-500">
                        当前：{matchedLightweightRecallPreset ? matchedLightweightRecallPreset.label : '自定义权重'}
                      </p>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      词 {gateConfig.lightweightRecall.phraseWeight} / 实体 {gateConfig.lightweightRecall.entityWeight} / 时序 {gateConfig.lightweightRecall.recencyWeight}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LIGHTWEIGHT_RECALL_PRESETS.map((preset) => {
                      const active = matchedLightweightRecallPreset?.key === preset.key;

                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() =>
                            setGateConfig((current) => ({
                              ...current,
                              lightweightRecall: applyLightweightRecallPreset(current.lightweightRecall, preset.key),
                            }))
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                              : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900'
                          }`}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    {matchedLightweightRecallPreset?.description ?? '当前权重不是内置预设，可继续细调后保存。'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void loadGateConfig(serverUrl)}
                    disabled={isGateConfigLoading}
                    className="rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGateConfigLoading ? '读取中...' : '读取后端配置'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveGateConfig()}
                    disabled={!savedGateConfig || !hasGateConfigChanges || isGateConfigSaving}
                    className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGateConfigSaving ? '保存中...' : '保存后端配置'}
                  </button>
                  <span className={`text-xs ${gateConfigStatus.startsWith('已读取') || gateConfigStatus.startsWith('后端门控配置已保存') ? 'text-green-400' : 'text-neutral-500'}`}>
                    {gateConfigStatus || '尚未读取'}
                  </span>
                </div>
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
