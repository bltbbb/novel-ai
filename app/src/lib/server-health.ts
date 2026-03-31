export interface ServerHealthResult {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export function normalizeServerUrl(serverUrl: string) {
  return serverUrl.replace(/\/+$/, '');
}

export async function checkServerHealth(serverUrl: string, signal?: AbortSignal): Promise<ServerHealthResult> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/health`, {
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `服务返回状态码 ${response.status}`,
        checkedAt,
      };
    }

    return {
      ok: true,
      message: '服务端连接正常',
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    return {
      ok: false,
      message,
      checkedAt,
    };
  }
}
