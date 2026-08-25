import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
} from '@/lib/attachments';

/**
 * Uploads one file via /api/attachments/upload and returns its Blob URL.
 *
 * The returned string is stored directly in `attachments: string[]`, exactly
 * where the base64 data URL used to go — so every existing `<img src={a} />`
 * keeps working without a change.
 */
export async function uploadAttachment(file: File, folder: string): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
    );
  }
  if (file.type && !ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" is a ${file.type} file, which is not an accepted attachment type.`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const res = await fetch('/api/attachments/upload', { method: 'POST', body: form });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;

  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? `Could not upload "${file.name}" (HTTP ${res.status}).`);
  }
  return data.url;
}

/**
 * Uploads a batch, appending each URL as it lands so thumbnails appear one by
 * one instead of waiting for the slowest file. Returns the error messages of
 * whichever files failed, so one bad file does not sink the rest.
 */
export async function uploadAttachments(
  files: File[],
  folder: string,
  onUploaded: (url: string) => void,
): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    try {
      onUploaded(await uploadAttachment(file, folder));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return errors;
}
