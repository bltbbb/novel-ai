import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, RotateCcw, Save, Settings2, Wifi, X } from 'lucide-react';
import { AI_PROVIDER_PRESETS, getProviderDefaultBaseUrl } from '@/lib/ai-provider-presets';
import {
  DEFAULT_GENERATION_GATE_CONFIG,
  findMatchingLightweightRecallPreset,
  LIGHTWEIGHT_RECALL_PRESETS,
  normalizeGenerationGateConfig,
} from '@/lib/generation-gate-defaults';
import { DEFAULT_SETTINGS, REASONING_EFFORT_OPTIONS } from '@/lib/runtime-config';
import {
  fetchAiRuntimeConfig,
  fetchAiRuntimeModels,
  fetchGenerationGateConfig,
  saveAiRuntimeConfig,
  saveGenerationGateConfig,
} from '@/lib/server-config-client';
import { checkServerHealth } from '@/lib/server-health';
import { useServerStatusStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { AIRuntimeConfig, AIProviderPreset, GenerationGateConfig, ReasoningEffortSetting } from '@/types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY_RUNTIME_CONFIG: AIRuntimeConfig = {
  provider: 'custom',
  apiKey: '',
  baseUrl: '',
  defaultModel: DEFAULT_SETTINGS.modelName,
  embeddingModel: '',
};

const reasoningEffortOptions: Array<{
  value: ReasoningEffortSetting;
  label: string;
}> = [
  { value: 'model_default', label: '模型默认' },
  ...REASONING_EFFORT_OPTIONS.map((value) => ({
    value,
    label: value,
  })),
];

function normalizeRuntimeConfig(config: AIRuntimeConfig) {
  return {
    ...config,
    apiKey: config.apiKey.trim(),
    baseUrl:
      config.provider === 'custom'
        ? config.baseUrl.trim()
        : config.provider === 'claude_compatible'
          ? config.baseUrl.trim() || getProviderDefaultBaseUrl(config.provider)
          : getProviderDefaultBaseUrl(config.provider),
    defaultModel: config.defaultModel.trim(),
    embeddingModel: config.embeddingModel?.trim() || undefined,
  } satisfies AIRuntimeConfig;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const refreshServerStatus = useServerStatusStore((state) => state.refresh);
  const { toast } = useToast();
  const [runtimeConfig, setRuntimeConfig] = useState<AIRuntimeConfig>(EMPTY_RUNTIME_CONFIG);
  const [savedRuntimeConfig, setSavedRuntimeConfig] = useState<AIRuntimeConfig | null>(null);
  const [chatModel, setChatModel] = useState(settings.modelName);
  const [temperature, setTemperature] = useState(settings.temperature);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortSetting>(settings.reasoningEffort);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [gateConfig, setGateConfig] = useState<GenerationGateConfig>(DEFAULT_GENERATION_GATE_CONFIG);
  const [savedGateConfig, setSavedGateConfig] = useState<GenerationGateConfig | null>(null);
  const [isGateLoading, setIsGateLoading] = useState(false);
  const [isGateSaving, setIsGateSaving] = useState(false);
  const [gateStatus, setGateStatus] = useState('');
  const modelFieldRef = useRef<HTMLDivElement | null>(null);
  const isEditableBaseUrlProvider =
    runtimeConfig.provider === 'custom' || runtimeConfig.provider === 'claude_compatible';

  const resolvedBaseUrl = useMemo(() => {
    if (runtimeConfig.provider === 'custom') {
      return runtimeConfig.baseUrl.trim();
    }

    if (runtimeConfig.provider === 'claude_compatible') {
      return runtimeConfig.baseUrl.trim() || getProviderDefaultBaseUrl(runtimeConfig.provider);
    }

    return getProviderDefaultBaseUrl(runtimeConfig.provider);
  }, [runtimeConfig.baseUrl, runtimeConfig.provider]);
  const mergedModelOptions = useMemo(() => {
    return Array.from(new Set([chatModel, ...modelOptions].map((item) => item.trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }, [chatModel, modelOptions]);
  const filteredModelOptions = useMemo(() => {
    const keyword = chatModel.trim().toLocaleLowerCase('zh-CN');
    if (!keyword) {
      return mergedModelOptions;
    }

    return mergedModelOptions.filter((item) => item.toLocaleLowerCase('zh-CN').includes(keyword));
  }, [chatModel, mergedModelOptions]);
  const matchedLightweightRecallPreset = useMemo(
    () => findMatchingLightweightRecallPreset(gateConfig.lightweightRecall),
    [gateConfig.lightweightRecall],
  );
  const hasChanges = useMemo(() => {
    const normalizedRuntimeConfig = normalizeRuntimeConfig({
      ...runtimeConfig,
      baseUrl: resolvedBaseUrl,
      defaultModel: chatModel,
    });

    return (
      (savedRuntimeConfig
        ? normalizedRuntimeConfig.provider !== savedRuntimeConfig.provider ||
          normalizedRuntimeConfig.apiKey !== savedRuntimeConfig.apiKey ||
          normalizedRuntimeConfig.baseUrl !== savedRuntimeConfig.baseUrl ||
          normalizedRuntimeConfig.defaultModel !== savedRuntimeConfig.defaultModel
        : true) ||
      chatModel !== settings.modelName ||
      temperature !== settings.temperature ||
      reasoningEffort !== settings.reasoningEffort
    );
  }, [chatModel, reasoningEffort, resolvedBaseUrl, runtimeConfig, savedRuntimeConfig, settings.modelName, settings.reasoningEffort, settings.temperature, temperature]);
  const hasGateChanges = useMemo(() => {
    if (!savedGateConfig) {
      return false;
    }

    return JSON.stringify(gateConfig) !== JSON.stringify(savedGateConfig);
  }, [gateConfig, savedGateConfig]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setChatModel(settings.modelName);
    setTemperature(settings.temperature);
    setReasoningEffort(settings.reasoningEffort);
    setModelOptions([]);
    setIsModelMenuOpen(false);
    setStatusText('');
    setTestStatus('');
    setGateStatus('');
    void loadRuntimeConfig();
    void loadGateConfig();
  }, [open, settings]);

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!modelFieldRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isModelMenuOpen]);

  if (!open) {
    return null;
  }

  async function loadRuntimeConfig() {
    setIsLoading(true);

    try {
      const config = normalizeRuntimeConfig(await fetchAiRuntimeConfig(settings.serverUrl));
      setRuntimeConfig(config);
      setSavedRuntimeConfig(config);
      await loadModels(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setStatusText(`读取 AI 配置失败：${message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadModels(config = runtimeConfig) {
    setIsModelLoading(true);

    try {
      const models = await fetchAiRuntimeModels(settings.serverUrl, {
        provider: config.provider,
        apiKey: config.apiKey.trim(),
        baseUrl:
          config.provider === 'custom'
            ? config.baseUrl.trim()
            : config.provider === 'claude_compatible'
              ? config.baseUrl.trim() || getProviderDefaultBaseUrl(config.provider)
              : getProviderDefaultBaseUrl(config.provider),
      });
      setModelOptions(models.map((item) => item.id));
      setStatusText(models.length > 0 ? `已拉取 ${models.length} 个模型` : '未返回可用模型');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setModelOptions([]);
      setStatusText(`拉取模型失败：${message}`);
    } finally {
      setIsModelLoading(false);
    }
  }

  async function loadGateConfig() {
    setIsGateLoading(true);

    try {
      const config = normalizeGenerationGateConfig(await fetchGenerationGateConfig(settings.serverUrl));
      setGateConfig(config);
      setSavedGateConfig(config);
      setGateStatus('已读取后端门控配置');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setGateStatus(`读取后端门控配置失败：${message}`);
    } finally {
      setIsGateLoading(false);
    }
  }

  async function handleSave() {
    if (!chatModel.trim()) {
      toast('请先填写聊天模型', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const savedRuntimeConfig = normalizeRuntimeConfig({
        ...runtimeConfig,
        baseUrl: resolvedBaseUrl,
        defaultModel: chatModel,
      });
      await saveAiRuntimeConfig(settings.serverUrl, savedRuntimeConfig);
      setRuntimeConfig(savedRuntimeConfig);
      setSavedRuntimeConfig(savedRuntimeConfig);
      await updateSettings({
        modelName: chatModel.trim(),
        temperature,
        reasoningEffort,
      });
      await refreshServerStatus(settings.serverUrl);
      toast('全局 AI 设置已保存', 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast(`保存失败：${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    await resetSettings();
    setChatModel(DEFAULT_SETTINGS.modelName);
    setTemperature(DEFAULT_SETTINGS.temperature);
    setReasoningEffort(DEFAULT_SETTINGS.reasoningEffort);
    toast('模型参数已恢复默认值', 'info');
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestStatus('');

    try {
      const result = await checkServerHealth(settings.serverUrl);

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
    setIsGateSaving(true);

    try {
      const saved = normalizeGenerationGateConfig(await saveGenerationGateConfig(settings.serverUrl, gateConfig));
      setGateConfig(saved);
      setSavedGateConfig(saved);
      setGateStatus('后端门控配置已保存');
      toast('后端门控配置已保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setGateStatus(`保存后端门控配置失败：${message}`);
      toast(`保存后端配置失败：${message}`, 'error');
    } finally {
      setIsGateSaving(false);
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
              <p className="text-sm text-neutral-500">Provider、模型和推理参数统一放到项目列表级管理。</p>
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

        <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-6">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-300">Provider</p>
            <p className="mt-2 text-sm text-neutral-500">当前按 OpenAI 兼容接口工作；后端地址改为读取 `VITE_SERVER_URL`。</p>

            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">模型提供方</span>
                <select
                  value={runtimeConfig.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AIProviderPreset;
                    setRuntimeConfig((current) => ({
                      ...current,
                      provider: nextProvider,
                      baseUrl:
                        nextProvider === 'custom'
                          ? current.baseUrl
                          : nextProvider === 'claude_compatible'
                            ? current.provider === 'claude_compatible'
                              ? current.baseUrl
                              : getProviderDefaultBaseUrl(nextProvider)
                            : getProviderDefaultBaseUrl(nextProvider),
                    }));
                  }}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                >
                  {AI_PROVIDER_PRESETS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">Base URL</span>
                <input
                  value={resolvedBaseUrl}
                  readOnly={!isEditableBaseUrlProvider}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }))
                  }
                  className={`w-full rounded-2xl border border-neutral-800 px-4 py-3 text-sm outline-none transition-colors ${
                    isEditableBaseUrlProvider
                      ? 'bg-neutral-950/70 text-neutral-100 focus:border-indigo-500'
                      : 'bg-neutral-900 text-neutral-500'
                  }`}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">API Key</span>
                <input
                  type="password"
                  value={runtimeConfig.apiKey}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                  placeholder="输入当前 provider 的 API Key"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">聊天模型</span>
                <div ref={modelFieldRef} className="relative">
                  <input
                    value={chatModel}
                    onFocus={() => setIsModelMenuOpen(true)}
                    onChange={(event) => {
                      setChatModel(event.target.value);
                      setIsModelMenuOpen(true);
                    }}
                    placeholder="可直接手填模型名，也可先拉取模型后选择"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 pr-12 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsModelMenuOpen((current) => !current)}
                    className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-2xl text-neutral-500 transition-colors hover:text-neutral-200"
                    aria-label={isModelMenuOpen ? '收起模型列表' : '展开模型列表'}
                    aria-expanded={isModelMenuOpen}
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${isModelMenuOpen ? 'rotate-180 text-neutral-200' : ''}`}
                    />
                  </button>
                  {isModelMenuOpen ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/40">
                      {filteredModelOptions.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto py-2">
                          {filteredModelOptions.map((model) => (
                            <button
                              key={model}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setChatModel(model);
                                setIsModelMenuOpen(false);
                              }}
                              className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors ${
                                model === chatModel
                                  ? 'bg-indigo-500/15 text-indigo-200'
                                  : 'text-neutral-200 hover:bg-neutral-900'
                              }`}
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-3 text-sm text-neutral-500">没有匹配项，可直接手填模型名</div>
                      )}
                    </div>
                  ) : null}
                </div>
                <span className="mt-2 block text-xs text-neutral-500">
                  支持直接手填，也可点右侧箭头展开已拉取模型。向量模型不在这里设置，服务端会继续使用
                  `OPENAI_EMBEDDING_MODEL` / `EMBEDDING_*` 配置。
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loadModels()}
                  disabled={isModelLoading || isLoading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={15} className={isModelLoading ? 'animate-spin' : ''} />
                  {isModelLoading ? '拉取中...' : '拉取模型'}
                </button>
                <span className="text-xs text-neutral-500">{statusText || '尚未拉取模型列表'}</span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-300">请求参数</p>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-200">思考等级</span>
                <select
                  value={reasoningEffort}
                  onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffortSetting)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                >
                  {reasoningEffortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

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
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                  <Wifi size={15} className="text-indigo-400" />
                  服务端状态
                </div>
                <p className="text-xs leading-6 text-neutral-500">
                  测试 `${settings.serverUrl.replace(/\/+$/, '')}/api/health`，这里只确认前端能否访问后端。
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
          </section>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-300">后端门控配置</p>
            <p className="mt-2 text-sm text-neutral-500">{gateStatus || '用于控制轻量召回与生成门控。'}</p>

            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-neutral-200">轻量召回权重预设</span>
                  <span className="text-xs text-neutral-500">
                    当前预设：{matchedLightweightRecallPreset?.label || '自定义'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LIGHTWEIGHT_RECALL_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() =>
                        setGateConfig((current) => ({
                          ...current,
                          lightweightRecall: {
                            ...current.lightweightRecall,
                            phraseWeight: preset.weights.phraseWeight,
                            entityWeight: preset.weights.entityWeight,
                            recencyWeight: preset.weights.recencyWeight,
                          },
                        }))
                      }
                      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                        matchedLightweightRecallPreset?.key === preset.key
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">轻量召回词命中权重</span>
                  <input
                    aria-label="轻量召回词命中权重"
                    type="number"
                    min="0"
                    value={gateConfig.lightweightRecall.phraseWeight}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        lightweightRecall: {
                          ...current.lightweightRecall,
                          phraseWeight: Math.max(0, Number(event.target.value || 0)),
                        },
                      }))
                    }
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">轻量召回实体命中权重</span>
                  <input
                    aria-label="轻量召回实体命中权重"
                    type="number"
                    min="0"
                    value={gateConfig.lightweightRecall.entityWeight}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        lightweightRecall: {
                          ...current.lightweightRecall,
                          entityWeight: Math.max(0, Number(event.target.value || 0)),
                        },
                      }))
                    }
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">轻量召回时序权重</span>
                  <input
                    aria-label="轻量召回时序权重"
                    type="number"
                    min="0"
                    value={gateConfig.lightweightRecall.recencyWeight}
                    onChange={(event) =>
                      setGateConfig((current) => ({
                        ...current,
                        lightweightRecall: {
                          ...current.lightweightRecall,
                          recencyWeight: Math.max(0, Number(event.target.value || 0)),
                        },
                      }))
                    }
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loadGateConfig()}
                  disabled={isGateLoading}
                  className="rounded-2xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGateLoading ? '读取中...' : '重新读取'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveGateConfig()}
                  disabled={isGateSaving || !hasGateChanges}
                  className="rounded-2xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGateSaving ? '保存中...' : '保存后端配置'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 px-6 py-5">
          <button
            type="button"
            onClick={() => void handleReset()}
            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          >
            <RotateCcw size={15} />
            恢复默认模型参数
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{isLoading ? '正在读取当前 AI 配置...' : '项目文风已改为项目级设置。'}</span>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !hasChanges}
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
