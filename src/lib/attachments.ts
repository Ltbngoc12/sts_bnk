/**
 * Attachment storage rules, shared by the client uploader and the upload route.
 *
 * History: attachments used to be read with FileReader.readAsDataURL() and the
 * resulting base64 string was stored INSIDE the Mongo document. Measured on
 * production 2026-08-19, 30 such images were 3.02 MB of a 3.32 MB /api/cases
 * response, and one case document had grown to 1.69 MB — against MongoDB's hard
 * 16 MB per-document limit, past which the write fails outright. Files now go to
 * Vercel Blob and only the URL is stored.
 *
 * The stored type is unchanged (`attachments: string[]`), so every existing
 * `<img src={a} />` keeps working — a Blob URL is just a different string.
 */

/**
 * Hard cap enforced on both sides. Capped at 4 MB because the file is POSTed
 * through /api/attachments/upload and a Vercel Function request body is limited
 * to 4.5 MB. Still well above the 1.5 MB the app allowed before this change.
 */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
];

/**
 * True for the legacy inline base64 form. Kept so UI and migration code can tell
 * old records from new ones — both render, only one of them is cheap.
 */
export function isLegacyBase64Attachment(attachment: string): boolean {
  return attachment.startsWith('data:');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
