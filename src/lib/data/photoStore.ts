// Photos live in IndexedDB (browser-local) so they don't exhaust the ~5 MB localStorage quota.
// Falls back to memory when IndexedDB is unavailable.
import { uid } from "../id";

const DB = "fixub-photos";
const STORE = "photos";
const memory = new Map<string, Blob>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function putPhoto(blob: Blob): Promise<string> {
  const id = uid("p");
  memory.set(id, blob);
  const db = await open();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  return id;
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const hit = memory.get(id);
  if (hit) return hit;
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => {
      const blob = (req.result as Blob | undefined) ?? null;
      if (blob) memory.set(id, blob);
      resolve(blob);
    };
    req.onerror = () => resolve(null);
  });
}

export async function clearPhotos(): Promise<void> {
  memory.clear();
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Decode, auto-orient, resize to at most `max` px and re-encode as JPEG — the same
 * client-side step the architecture specifies (R-02/R-03). Re-encoding drops EXIF/GPS metadata.
 */
export async function processImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
    throw new Error("unsupported");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("decode");
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("decode");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("decode"))), "image/jpeg", quality),
  );
}
