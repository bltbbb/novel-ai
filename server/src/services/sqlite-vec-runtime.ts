import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServerEnv } from '../config/env.js';

export async function resolveSqliteVecExtensionPath(env: ServerEnv) {
  if (env.sqliteVecExtensionPath?.trim()) {
    return env.sqliteVecExtensionPath.trim();
  }

  const sqlite3VecModule = await import('@dao-xyz/sqlite3-vec');
  const resolveNativeExtensionPath =
    'resolveNativeExtensionPath' in sqlite3VecModule
      ? sqlite3VecModule.resolveNativeExtensionPath
      : null;

  if (typeof resolveNativeExtensionPath !== 'function') {
    throw new Error('未找到 @dao-xyz/sqlite3-vec 的原生扩展路径解析函数');
  }

  const resolvedPath = resolveNativeExtensionPath();

  if (!resolvedPath || typeof resolvedPath !== 'string') {
    throw new Error('无法解析 sqlite-vec 原生扩展路径，请改用 SQLITE_VEC_EXTENSION_PATH 显式指定');
  }

  return resolvedPath;
}

export function listSqliteVecPackageNativeFiles(extensionPath: string) {
  const packageRoot = path.resolve(path.dirname(extensionPath), '..');

  if (!existsSync(packageRoot)) {
    return [] as string[];
  }

  const result: string[] = [];
  const directories = [packageRoot];

  while (directories.length > 0) {
    const currentDirectory = directories.pop()!;
    const entries = readdirSync(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        directories.push(entryPath);
        continue;
      }

      if (/\.(dll|node)$/iu.test(entry.name)) {
        result.push(path.relative(packageRoot, entryPath));
      }
    }
  }

  return result.sort();
}

export function loadSqliteVecExtension(db: DatabaseSync, extensionPath: string) {
  db.enableLoadExtension(true);

  try {
    db.loadExtension(extensionPath);
  } finally {
    db.enableLoadExtension(false);
  }
}

export function createSqliteVecDatabase(sqliteFilePath: string) {
  return new DatabaseSync(sqliteFilePath, {
    allowExtension: true,
  });
}
