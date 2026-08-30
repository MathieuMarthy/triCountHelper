import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Person, type Receipt, type Settings } from '../types';

const DB_NAME = 'splitticket';
const DB_VERSION = 1;

interface SplitTicketDB extends DBSchema {
  receipts: {
    key: string;
    value: Receipt;
    indexes: { createdAt: string };
  };
  people: {
    key: string;
    value: Person;
  };
  images: {
    key: string;
    value: { key: string; blob: Blob; createdAt: string };
  };
  settings: {
    key: string;
    value: { key: string; value: Settings };
  };
}

let dbPromise: Promise<IDBPDatabase<SplitTicketDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SplitTicketDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SplitTicketDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const receipts = db.createObjectStore('receipts', { keyPath: 'id' });
        receipts.createIndex('createdAt', 'createdAt');
        db.createObjectStore('people', { keyPath: 'id' });
        db.createObjectStore('images', { keyPath: 'key' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function listReceipts(): Promise<Receipt[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('receipts', 'createdAt');
  return all.reverse();
}

export async function getReceipt(id: string): Promise<Receipt | undefined> {
  return (await getDb()).get('receipts', id);
}

export async function putReceipt(receipt: Receipt): Promise<void> {
  await (await getDb()).put('receipts', receipt);
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDb();
  const receipt = await db.get('receipts', id);
  await db.delete('receipts', id);
  if (receipt?.imageBlobKey) await db.delete('images', receipt.imageBlobKey);
}

export async function listPeople(): Promise<Person[]> {
  return (await getDb()).getAll('people');
}

export async function putPerson(person: Person): Promise<void> {
  await (await getDb()).put('people', person);
}

export async function deletePerson(id: string): Promise<void> {
  await (await getDb()).delete('people', id);
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  await (await getDb()).put('images', { key, blob, createdAt: new Date().toISOString() });
}

export async function getImage(key: string): Promise<Blob | undefined> {
  const record = await (await getDb()).get('images', key);
  return record?.blob;
}

export async function deleteImage(key: string): Promise<void> {
  await (await getDb()).delete('images', key);
}

export async function purgeOldImages(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  const db = await getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = await db.getAll('images');
  let removed = 0;
  for (const record of all) {
    if (new Date(record.createdAt).getTime() < cutoff) {
      await db.delete('images', record.key);
      removed += 1;
    }
  }
  return removed;
}

export async function getSettings(): Promise<Settings> {
  const record = await (await getDb()).get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...(record?.value ?? {}) };
}

export async function putSettings(value: Settings): Promise<void> {
  await (await getDb()).put('settings', { key: 'app', value });
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear('receipts'),
    db.clear('images'),
    db.clear('people'),
    db.clear('settings'),
  ]);
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
