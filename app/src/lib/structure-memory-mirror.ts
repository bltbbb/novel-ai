import { createTimestamp } from '@/lib/identity';
import {
  db,
  type StructureMemoryMirrorRecord,
  type StructureMemoryMirrorSystem,
} from '@/lib/db';
import type { Id, StructureMemorySyncStatus } from '@/types';

interface StructureMemoryEntityBase {
  id: Id;
  projectId: Id;
  updatedAt: string;
}

export interface StructureMemoryMirrorLoadResult<T> {
  items: T[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  hasMirror: boolean;
}

function buildMirrorId(system: StructureMemoryMirrorSystem, entityId: Id) {
  return `${system}:${entityId}`;
}

function parseMirrorPayload<T>(record: StructureMemoryMirrorRecord) {
  try {
    return JSON.parse(record.payloadJson) as T;
  } catch {
    return null;
  }
}

function sortMirrorItems<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function listMirrorRecords(projectId: Id, system: StructureMemoryMirrorSystem) {
  return db.structureMemoryMirrors.where('[projectId+system]').equals([projectId, system]).toArray();
}

function buildSyncStatusById(records: StructureMemoryMirrorRecord[]) {
  return records.reduce<Record<Id, StructureMemorySyncStatus>>((map, record) => {
    if (!record.isDeleted) {
      map[record.entityId] = record.syncStatus;
    }
    return map;
  }, {});
}

function buildLocalOnlyById(records: StructureMemoryMirrorRecord[]) {
  return records.reduce<Record<Id, boolean>>((map, record) => {
    if (!record.isDeleted) {
      map[record.entityId] = !record.serverUpdatedAt;
    }
    return map;
  }, {});
}

function createMirrorRecord<T extends StructureMemoryEntityBase>(
  system: StructureMemoryMirrorSystem,
  item: T,
  overrides?: Partial<StructureMemoryMirrorRecord>,
): StructureMemoryMirrorRecord {
  const now = createTimestamp();

  return {
    id: buildMirrorId(system, item.id),
    projectId: item.projectId,
    system,
    entityId: item.id,
    payloadJson: JSON.stringify(item),
    syncStatus: 'synced',
    isDeleted: false,
    localUpdatedAt: now,
    serverUpdatedAt: item.updatedAt,
    lastSyncedAt: now,
    errorMessage: '',
    updatedAt: now,
    ...overrides,
  };
}

export async function loadStructureMemoryMirror<T extends StructureMemoryEntityBase>(
  projectId: Id,
  system: StructureMemoryMirrorSystem,
): Promise<StructureMemoryMirrorLoadResult<T>> {
  const records = await listMirrorRecords(projectId, system);
  const items = sortMirrorItems(
    records
      .filter((record) => !record.isDeleted)
      .map((record) => parseMirrorPayload<T>(record))
      .filter((item): item is T => Boolean(item)),
  );

  return {
    items,
    syncStatusById: buildSyncStatusById(records),
    localOnlyById: buildLocalOnlyById(records),
    hasMirror: records.length > 0,
  };
}

export async function syncStructureMemoryMirrorFromServer<T extends StructureMemoryEntityBase>(
  projectId: Id,
  system: StructureMemoryMirrorSystem,
  items: T[],
): Promise<StructureMemoryMirrorLoadResult<T>> {
  const existingRecords = await listMirrorRecords(projectId, system);
  const existingByEntityId = new Map(existingRecords.map((record) => [record.entityId, record] as const));
  const serverIds = new Set(items.map((item) => item.id));
  const nextRecords: StructureMemoryMirrorRecord[] = [];

  for (const item of items) {
    const existing = existingByEntityId.get(item.id);

    if (existing && existing.syncStatus !== 'synced') {
      nextRecords.push(existing);
      continue;
    }

    nextRecords.push(createMirrorRecord(system, item));
  }

  for (const record of existingRecords) {
    if (!serverIds.has(record.entityId) && record.syncStatus !== 'synced') {
      nextRecords.push(record);
    }
  }

  await db.transaction('rw', db.structureMemoryMirrors, async () => {
    await db.structureMemoryMirrors.where('[projectId+system]').equals([projectId, system]).delete();

    if (nextRecords.length > 0) {
      await db.structureMemoryMirrors.bulkPut(nextRecords);
    }
  });

  return loadStructureMemoryMirror<T>(projectId, system);
}

export async function upsertStructureMemoryMirrorSyncedEntity<T extends StructureMemoryEntityBase>(
  system: StructureMemoryMirrorSystem,
  item: T,
) {
  await db.structureMemoryMirrors.put(createMirrorRecord(system, item));
}

export async function markStructureMemoryMirrorPendingUpsert<T extends StructureMemoryEntityBase>(
  system: StructureMemoryMirrorSystem,
  item: T,
) {
  const now = createTimestamp();
  const existing = await db.structureMemoryMirrors.get(buildMirrorId(system, item.id));

  await db.structureMemoryMirrors.put(
    createMirrorRecord(system, item, {
      syncStatus: 'pending_push',
      isDeleted: false,
      localUpdatedAt: now,
      serverUpdatedAt: existing?.serverUpdatedAt ?? item.updatedAt,
      lastSyncedAt: existing?.lastSyncedAt ?? '',
      errorMessage: '',
      updatedAt: now,
    }),
  );
}

export async function markStructureMemoryMirrorUpsertError<T extends StructureMemoryEntityBase>(
  system: StructureMemoryMirrorSystem,
  item: T,
  errorMessage: string,
) {
  const existing = await db.structureMemoryMirrors.get(buildMirrorId(system, item.id));
  const now = createTimestamp();

  await db.structureMemoryMirrors.put(
    createMirrorRecord(system, item, {
      syncStatus: 'sync_error',
      isDeleted: false,
      localUpdatedAt: existing?.localUpdatedAt ?? now,
      serverUpdatedAt: existing?.serverUpdatedAt ?? item.updatedAt,
      lastSyncedAt: existing?.lastSyncedAt ?? '',
      errorMessage,
      updatedAt: now,
    }),
  );
}

export async function markStructureMemoryMirrorPendingDelete(
  projectId: Id,
  system: StructureMemoryMirrorSystem,
  entityId: Id,
) {
  const existing = await db.structureMemoryMirrors.get(buildMirrorId(system, entityId));
  const now = createTimestamp();

  await db.structureMemoryMirrors.put({
    id: buildMirrorId(system, entityId),
    projectId,
    system,
    entityId,
    payloadJson: existing?.payloadJson ?? '{}',
    syncStatus: 'pending_push',
    isDeleted: true,
    localUpdatedAt: now,
    serverUpdatedAt: existing?.serverUpdatedAt ?? '',
    lastSyncedAt: existing?.lastSyncedAt ?? '',
    errorMessage: '',
    updatedAt: now,
  });
}

export async function markStructureMemoryMirrorDeleteError(
  projectId: Id,
  system: StructureMemoryMirrorSystem,
  entityId: Id,
  errorMessage: string,
) {
  const existing = await db.structureMemoryMirrors.get(buildMirrorId(system, entityId));
  const now = createTimestamp();

  await db.structureMemoryMirrors.put({
    id: buildMirrorId(system, entityId),
    projectId,
    system,
    entityId,
    payloadJson: existing?.payloadJson ?? '{}',
    syncStatus: 'sync_error',
    isDeleted: true,
    localUpdatedAt: existing?.localUpdatedAt ?? now,
    serverUpdatedAt: existing?.serverUpdatedAt ?? '',
    lastSyncedAt: existing?.lastSyncedAt ?? '',
    errorMessage,
    updatedAt: now,
  });
}

export async function clearStructureMemoryMirrorEntity(
  system: StructureMemoryMirrorSystem,
  entityId: Id,
) {
  await db.structureMemoryMirrors.delete(buildMirrorId(system, entityId));
}
