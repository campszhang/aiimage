import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR_PATH, getDb } from "./db";

export interface CloudUploadResult {
  ok: boolean;
  url: string | null;
  error?: string;
}

export interface StoredImageResult {
  relPath: string;
  url: string;
  cloudUrl: string | null;
  size: number;
  mimeType: string;
}

function getCloudUploadUrl(): string | null {
  let raw = process.env.CLOUD_STORAGE_UPLOAD_URL ?? "";
  try {
    const row = getDb()
      .prepare(`SELECT value FROM settings WHERE key = 'cloud_storage_upload_url'`)
      .get() as { value: string } | undefined;
    raw = row?.value || raw;
  } catch {}
  const value = raw.trim();
  if (!value || value === "off" || value === "disabled") return null;
  return value;
}

export function getCloudStorageInfo(): {
  uploadUrl: string;
  enabled: boolean;
  timeoutMs: number;
  fileField: string;
} {
  const uploadUrl = getCloudUploadUrl() || "";
  return {
    uploadUrl,
    enabled: uploadUrl.length > 0,
    timeoutMs: Number(process.env.CLOUD_STORAGE_TIMEOUT_MS || "12000"),
    fileField: process.env.CLOUD_STORAGE_FILE_FIELD || "image",
  };
}

function pickUrl(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const keys = ["url", "imageUrl", "image_url", "fileUrl", "file_url", "path"];

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }

  for (const key of ["data", "result", "file", "image"]) {
    const nested = pickUrl(obj[key]);
    if (nested) return nested;
  }

  return null;
}

export async function uploadToCloudStorage(args: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  kind?: string;
}): Promise<CloudUploadResult> {
  const uploadUrl = getCloudUploadUrl();
  if (!uploadUrl) return { ok: false, url: null, error: "cloud upload disabled" };

  const timeoutMs = Number(process.env.CLOUD_STORAGE_TIMEOUT_MS || "12000");
  const fieldName = process.env.CLOUD_STORAGE_FILE_FIELD || "image";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    const arrayBuffer = args.buffer.buffer.slice(
      args.buffer.byteOffset,
      args.buffer.byteOffset + args.buffer.byteLength,
    ) as ArrayBuffer;
    form.append(
      fieldName,
      new Blob([arrayBuffer], { type: args.mimeType }),
      args.filename,
    );
    form.append("filename", args.filename);
    if (args.kind) form.append("kind", args.kind);

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    const url = pickUrl(payload);
    if (!res.ok) {
      return {
        ok: false,
        url: null,
        error: `cloud upload ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    if (!url) {
      return {
        ok: false,
        url: null,
        error: `cloud upload returned no URL: ${text.slice(0, 200)}`,
      };
    }

    return { ok: true, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, url: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function saveGeneratedOutput(args: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  kind?: string;
  localSubdir?: string;
}): Promise<StoredImageResult> {
  const localSubdir = args.localSubdir || "outputs";
  const dir = path.join(DATA_DIR_PATH, localSubdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, args.filename), args.buffer);

  const relPath = path.posix.join(localSubdir, args.filename);
  const cloud = await uploadToCloudStorage({
    buffer: args.buffer,
    filename: args.filename,
    mimeType: args.mimeType,
    kind: args.kind || localSubdir,
  });

  if (!cloud.ok && cloud.error) {
    console.warn(`[cloud-storage] upload fallback local ${relPath}: ${cloud.error}`);
  }

  return {
    relPath,
    url: cloud.url || `/assets/${relPath}`,
    cloudUrl: cloud.url,
    size: args.buffer.length,
    mimeType: args.mimeType,
  };
}
