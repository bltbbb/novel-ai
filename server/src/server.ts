import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadServerEnv } from './config/env.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerHealthRoutes } from './routes/health.js';

async function bootstrap() {
  const env = loadServerEnv();
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin:
      env.corsOrigin === '*'
        ? true
        : env.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean),
  });

  await registerHealthRoutes(app);
  await registerAIRoutes(app, env);

  await app.listen({
    port: env.port,
    host: env.host,
  });
}

bootstrap().catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});
