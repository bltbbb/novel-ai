import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Save, Settings2, Wifi, X } from 'lucide-react';
import { AI_PROVIDER_PRESETS, getProviderDefaultBaseUrl } from '@/lib/ai-provider-presets';
import { DEFAULT_SETTINGS, REASONING_EFFORT_OPTIONS } from '@/lib/runtime-config';
import {
  fetchAiRuntimeConfig,
  fetchAiRuntimeModels,
  saveAiRuntimeConfig,
} from '@/lib/server-config-client';
import { checkServerHealth } from '@/lib/server-health';
import { useServerStatusStore, useSettingsStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { AIRuntimeConfig, AIProviderPreset, ReasoningEffortSetting } from '@/types';

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
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [temperature, setTemperature] = useState(settings.temperature);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortSetting>(settings.reasoningEffort);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [testStatus, setTestStatus] = useState('');

  const resolvedBaseUrl = useMemo(() => {
    return runtimeConfig.provider === 'custom'
      ? runtimeConfig.baseUrl.trim()
      : getProviderDefaultBaseUrl(runtimeConfig.provider);
  }, [runtimeConfig.baseUrl, runtimeConfig.provider]);
  const mergedModelOptions = useMemo(() => {
    return Array.from(new Set([chatModel, embeddingModel, ...modelOptions].map((item) => item.trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }, [chatModel, embeddingModel, modelOptions]);
  const hasChanges = useMemo(() => {
    const normalizedRuntimeConfig = normalizeRuntimeConfig({
      ...runtimeConfig,
      baseUrl: resolvedBaseUrl,
      defaultModel: chatModel,
      embeddingModel,
    });

    return (
      (savedRuntimeConfig
        ? normalizedRuntimeConfig.provider !== savedRuntimeConfig.provider ||
          normalizedRuntimeConfig.apiKey !== savedRuntimeConfig.apiKey ||
          normalizedRuntimeConfig.baseUrl !== savedRuntimeConfig.baseUrl ||
          normalizedRuntimeConfig.defaultModel !== savedRuntimeConfig.defaultModel ||
          (normalizedRuntimeConfig.embeddingModel || '') !== (savedRuntimeConfig.embeddingModel || '')
        : true) ||
      chatModel !== settings.modelName ||
      temperature !== settings.temperature ||
      reasoningEffort !== settings.reasoningEffort ||
      embeddingModel !== (runtimeConfig.embeddingModel || '')
    );
  }, [chatModel, embeddingModel, reasoningEffort, resolvedBaseUrl, runtimeConfig, savedRuntimeConfig, settings.modelName, settings.reasoningEffort, settings.temperature, temperature]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setChatModel(settings.modelName);
    setTemperature(settings.temperature);
    setReasoningEffort(settings.reasoningEffort);
    setModelOptions([]);
    setStatusText('');
    setTestStatus('');
    void loadRuntimeConfig();
  }, [open, settings]);

  if (!open) {
    return null;
  }

  async function loadRuntimeConfig() {
    setIsLoading(true);

    try {
      const config = normalizeRuntimeConfig(await fetchAiRuntimeConfig(settings.serverUrl));
      setRuntimeConfig(config);
      setSavedRuntimeConfig(config);
      setEmbeddingModel(config.embeddingModel || '');
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
        baseUrl: config.provider === 'custom' ? config.baseUrl.trim() : getProviderDefaultBaseUrl(config.provider),
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

  async function handleSave() {
    if (!chatModel.trim()) {
      toast('请先选择聊天模型', 'warning');
      return;
    }

    setIsSaving(true);

    try {
      const savedRuntimeConfig = normalizeRuntimeConfig({
        ...runtimeConfig,
        baseUrl: resolvedBaseUrl,
        defaultModel: chatModel,
        embeddingModel,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">全局 AI 设置</h2>
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
                      baseUrl: nextProvider === 'custom' ? current.baseUrl : getProviderDefaultBaseUrl(nextProvider),
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
                  readOnly={runtimeConfig.provider !== 'custom'}
                  onChange={(event) =>
                    setRuntimeConfig((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }))
                  }
                  className={`w-full rounded-2xl border border-neutral-800 px-4 py-3 text-sm outline-none transition-colors ${
                    runtimeConfig.provider === 'custom'
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

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">聊天模型</span>
                  <select
                    value={chatModel}
                    onChange={(event) => setChatModel(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    {!chatModel ? <option value="">请选择模型</option> : null}
                    {mergedModelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">Embedding 模型</span>
                  <select
                    value={embeddingModel}
                    onChange={(event) => setEmbeddingModel(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
                  >
                    <option value="">关闭向量增强</option>
                    {mergedModelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
