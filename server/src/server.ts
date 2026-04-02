import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadServerEnv } from './config/env.js';
import { registerGenerationDebugRoutes } from './routes/generation-debug.js';
import { registerGenerationMaintenanceRoutes } from './routes/generation-maintenance.js';
import { registerRuntimeConfigRoutes } from './routes/runtime-config.js';
import { startGenerationJobWorker } from './services/generation-job-runner.js';
import { hydrateGenerationGateConfig } from './services/generation-gate-config-store.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerGenerationJobRoutes } from './routes/generation-jobs.js';
import { registerGenerationRoutes } from './routes/generation.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSearchRoutes } from './routes/search.js';

async function bootstrap() {
  const env = loadServerEnv();
  await hydrateGenerationGateConfig(env);
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
  await registerGenerationRoutes(app, env);
  await registerGenerationJobRoutes(app, env);
  await registerRuntimeConfigRoutes(app, env);
  await registerGenerationDebugRoutes(app, env);
  await registerGenerationMaintenanceRoutes(app, env);
  await registerSearchRoutes(app);

  startGenerationJobWorker(env);

  await app.listen({
    port: env.port,
    host: env.host,
  });
}

bootstrap().catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});
