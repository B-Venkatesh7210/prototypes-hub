"use client";

import type { Project } from "@/lib/types";

const DB_NAME = "gradium-captions";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  saveProject(project: Project) {
    return run<IDBValidKey>("projects", "readwrite", (s) => s.put({ ...project, updatedAt: Date.now() }));
  },
  getProject(id: string) {
    return run<Project | undefined>("projects", "readonly", (s) => s.get(id));
  },
  async listProjects(): Promise<Project[]> {
    const all = await run<Project[]>("projects", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async deleteProject(project: Project) {
    const keys = [project.mediaKey, ...project.tracks.map((t) => t.audioKey)].filter(Boolean) as string[];
    await Promise.all(keys.map((k) => run("blobs", "readwrite", (s) => s.delete(k))));
    await run("projects", "readwrite", (s) => s.delete(project.id));
  },
  putBlob(key: string, blob: Blob) {
    return run<IDBValidKey>("blobs", "readwrite", (s) => s.put(blob, key));
  },
  getBlob(key: string) {
    return run<Blob | undefined>("blobs", "readonly", (s) => s.get(key));
  },
  deleteBlob(key: string) {
    return run("blobs", "readwrite", (s) => s.delete(key));
  },
};
