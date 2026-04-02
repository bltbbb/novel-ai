import { loadServerEnv } from '../config/env.js';
import { diagnoseSqliteVecPocFailure, runSqliteVecPoc } from '../services/sqlite-vec-poc.js';

async function main() {
  const env = loadServerEnv();
  try {
    const result = await runSqliteVecPoc(env);

    console.log('# sqlite-vec PoC');
    console.log(`extensionPath: ${result.extensionPath}`);
    console.log(`extensionExists: ${result.extensionExists}`);
    console.log(`packageNativeFiles: ${result.packageNativeFiles.join(', ') || '无'}`);
    console.log(`sqliteFilePath: ${result.sqliteFilePath}`);
    console.log(`vecVersion: ${result.vecVersion}`);
    console.log(`insertedRows: ${result.insertedRows}`);
    console.log('nearestNeighbors:');

    for (const row of result.nearestNeighbors) {
      console.log(`- rowid=${row.rowid} distance=${row.distance}`);
    }
  } catch (error) {
    const diagnostics = await diagnoseSqliteVecPocFailure(env);
    const message = error instanceof Error ? error.message : String(error);

    console.error('# sqlite-vec PoC 失败');
    console.error(`extensionPath: ${diagnostics.extensionPath}`);
    console.error(`extensionExists: ${diagnostics.extensionExists}`);
    console.error(`packageNativeFiles: ${diagnostics.packageNativeFiles.join(', ') || '无'}`);
    console.error(`loadError: ${diagnostics.loadError || message}`);
    process.exitCode = 1;
  }
}

void main();
