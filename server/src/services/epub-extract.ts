import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { AIEpubExtractRequest, AIEpubExtractResponse } from '../types/ai.js';

interface ZipEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }

  throw new Error('EPUB 解析失败：未找到 ZIP 目录');
}

function parseZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('EPUB 解析失败：中央目录结构损坏');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .slice(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`EPUB 解析失败：本地文件头损坏 ${entry.fileName}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const compressedData = buffer.slice(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedData;
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressedData);
  }

  throw new Error(`EPUB 解析失败：暂不支持的压缩方式 ${entry.compressionMethod}`);
}

function decodeText(buffer: Buffer) {
  const utf8 = buffer.toString('utf8');

  if (utf8.includes('\uFFFD')) {
    return buffer.toString('utf16le');
  }

  return utf8;
}

function findEntry(entries: ZipEntry[], fileName: string) {
  return entries.find((entry) => entry.fileName === fileName) ?? null;
}

function decodeHtmlEntities(content: string) {
  return content
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#(\d+);/giu, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(content: string) {
  return decodeHtmlEntities(
    content
      .replace(/<script[\s\S]*?<\/script>/giu, '')
      .replace(/<style[\s\S]*?<\/style>/giu, '')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/p>/giu, '\n\n')
      .replace(/<\/div>/giu, '\n')
      .replace(/<[^>]+>/gu, '')
      .replace(/\r\n?/gu, '\n'),
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function resolveContainerPath(containerXml: string) {
  const match = containerXml.match(/full-path\s*=\s*"([^"]+)"/iu);

  if (!match?.[1]) {
    throw new Error('EPUB 解析失败：未找到 OPF 路径');
  }

  return match[1];
}

function parseManifest(opfContent: string) {
  const manifest = new Map<string, string>();
  const itemPattern = /<item\b[^>]*id\s*=\s*"([^"]+)"[^>]*href\s*=\s*"([^"]+)"[^>]*>/giu;

  for (const match of opfContent.matchAll(itemPattern)) {
    if (match[1] && match[2]) {
      manifest.set(match[1], match[2]);
    }
  }

  return manifest;
}

function parseSpine(opfContent: string) {
  const ids: string[] = [];
  const itemRefPattern = /<itemref\b[^>]*idref\s*=\s*"([^"]+)"[^>]*>/giu;

  for (const match of opfContent.matchAll(itemRefPattern)) {
    if (match[1]) {
      ids.push(match[1]);
    }
  }

  return ids;
}

function parseTitle(opfContent: string, fallback: string) {
  const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/iu);
  return titleMatch?.[1]?.trim() || fallback;
}

function toPosixPath(value: string) {
  return value.replace(/\\/gu, '/');
}

function resolveSpinePaths(opfPath: string, manifest: Map<string, string>, spineIds: string[]) {
  const baseDir = path.posix.dirname(toPosixPath(opfPath));

  return spineIds
    .map((id) => manifest.get(id))
    .filter((href): href is string => Boolean(href))
    .map((href) => path.posix.normalize(path.posix.join(baseDir, href)));
}

export function extractEpubText(request: AIEpubExtractRequest): AIEpubExtractResponse {
  if (!request.contentBase64.trim()) {
    throw new Error('EPUB 内容不能为空');
  }

  const fileBuffer = Buffer.from(request.contentBase64, 'base64');
  const entries = parseZipEntries(fileBuffer);
  const containerEntry = findEntry(entries, 'META-INF/container.xml');

  if (!containerEntry) {
    throw new Error('EPUB 解析失败：缺少 container.xml');
  }

  const containerXml = decodeText(readZipEntry(fileBuffer, containerEntry));
  const opfPath = resolveContainerPath(containerXml);
  const opfEntry = findEntry(entries, opfPath);

  if (!opfEntry) {
    throw new Error('EPUB 解析失败：缺少 OPF 文件');
  }

  const opfContent = decodeText(readZipEntry(fileBuffer, opfEntry));
  const manifest = parseManifest(opfContent);
  const spineIds = parseSpine(opfContent);
  const spinePaths = resolveSpinePaths(opfPath, manifest, spineIds);
  const chapters: string[] = [];

  for (const spinePath of spinePaths) {
    const entry = findEntry(entries, spinePath);

    if (!entry) {
      continue;
    }

    const rawContent = decodeText(readZipEntry(fileBuffer, entry));
    const chapterText = stripHtml(rawContent);

    if (chapterText.trim()) {
      chapters.push(chapterText.trim());
    }
  }

  if (chapters.length === 0) {
    throw new Error('EPUB 解析失败：未提取到正文内容');
  }

  const fallbackTitle = request.fileName.replace(/\.epub$/iu, '').trim();

  return {
    title: parseTitle(opfContent, fallbackTitle),
    content: chapters.join('\n\n'),
    chapterCount: chapters.length,
  };
}

