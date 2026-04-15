import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';

const DISCUSS_FILE_PATH = fileURLToPath(new URL('../../../discuss.txt', import.meta.url));

type TranscriptRole = 'user' | 'assistant';

interface TranscriptMessage {
  role: TranscriptRole;
  content: string;
}

function normalizeTranscriptRole(label: string): TranscriptRole | null {
  if (label === '你的想法') {
    return 'user';
  }

  if (label === '立项助手') {
    return 'assistant';
  }

  return null;
}

function serializeTranscript(messages: TranscriptMessage[]) {
  return messages
    .map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`)
    .join('\n\n');
}

function normalizeDiscussTranscript(rawText: string) {
  const lines = rawText.replace(/^\uFEFF/u, '').split(/\r?\n/);
  const messages: TranscriptMessage[] = [];
  const buffer: string[] = [];
  let currentRole: TranscriptRole | null = null;
  let hasStructuredMarkers = false;

  function flushBuffer() {
    if (!currentRole) {
      return;
    }

    const content = buffer.join('\n').trim();
    buffer.length = 0;

    if (!content) {
      return;
    }

    messages.push({
      role: currentRole,
      content,
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const nextRole = normalizeTranscriptRole(trimmed);

    if (nextRole) {
      hasStructuredMarkers = true;
      flushBuffer();
      currentRole = nextRole;
      continue;
    }

    if (!currentRole) {
      continue;
    }

    buffer.push(line);
  }

  flushBuffer();

  if (hasStructuredMarkers && messages.length > 0) {
    return {
      transcript: serializeTranscript(messages),
      messageCount: messages.length,
    };
  }

  return {
    transcript: rawText.trim(),
    messageCount: 0,
  };
}

function replyWithError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.status(statusCode).send({
    message,
  });
}

export async function registerLocalInspirationTranscriptRoutes(app: FastifyInstance) {
  app.get('/api/local/inspiration-transcripts/discuss', async (_request, reply) => {
    try {
      const [rawText, fileStat] = await Promise.all([
        readFile(DISCUSS_FILE_PATH, 'utf8'),
        stat(DISCUSS_FILE_PATH),
      ]);
      const normalized = normalizeDiscussTranscript(rawText);

      if (!normalized.transcript.trim()) {
        return replyWithError(reply, 400, 'discuss.txt 为空，无法生成');
      }

      return {
        sourceName: 'discuss.txt',
        transcript: normalized.transcript,
        messageCount: normalized.messageCount,
        bytes: fileStat.size,
        updatedAt: fileStat.mtime.toISOString(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return replyWithError(reply, 404, '未找到仓库根目录 discuss.txt');
      }

      const message = error instanceof Error ? error.message : '读取 discuss.txt 失败';
      return replyWithError(reply, 500, message);
    }
  });
}
