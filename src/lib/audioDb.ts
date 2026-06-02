import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'spire-audio';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

interface AudioRecord {
  key: string;
  blob: Blob;
  mimeType: string;
  questionIndex: number;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveAudio(
  questionIndex: number,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const db = await getDb();
  const key = `q${questionIndex}-${Date.now()}`;
  const record: AudioRecord = {
    key,
    blob,
    mimeType,
    questionIndex,
    createdAt: new Date().toISOString(),
  };
  await db.put(STORE_NAME, record);
  return key;
}

export async function getAudio(key: string): Promise<AudioRecord | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, key);
}

export async function deleteAudio(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, key);
}

export async function getPendingRecordings(): Promise<AudioRecord[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

// Delete recordings older than maxAgeMs (default 24h).
// Runs on app startup to clear any orphaned blobs from failed transcription sessions.
export async function cleanupStaleAudio(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  for (const record of all) {
    if (record.createdAt < cutoff) {
      await db.delete(STORE_NAME, record.key);
    }
  }
}
