import 'dotenv/config';

export interface ServerEnv {
  port: number;
  host: string;
  corsOrigin: string;
  openaiApiKey: string;
  openaiBaseUrl?: string;
  defaultModel: string;
}

export function loadServerEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? '3001');

  if (Number.isNaN(port)) {
    throw new Error('环境变量 PORT 不是有效数字');
  }

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
    defaultModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  };
}
