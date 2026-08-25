import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
} from '@/lib/attachments';

export const runtime = 'nodejs';

/**
 * Receives one file and stores it in Vercel Blob, returning its URL.
 *
 * Why the file goes through this function rather than browser → Blob directly:
 * the direct-upload flow (`handleUpload`) signs a client token with a static
 * BLOB_READ_WRITE_TOKEN, and Vercel no longer issues one — connecting a Blob
 * store now provisions OIDC credentials (BLOB_STORE_ID + VERCEL_OIDC_TOKEN)
 * instead. `put()` reads those automatically, so this is the flow that actually
 * works with how the store is wired today.
 *
 * The cost of that choice: a Vercel Function request body is capped at 4.5 MB,
 * which is why MAX_ATTACHMENT_BYTES is 4 MB. Still well above the 1.5 MB the app
 * allowed before this change.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          'Attachment storage is not configured. Connect a Blob store to this project in the ' +
          'Vercel dashboard (Storage → Connect to Project), then run `vercel env pull .env.local`.',
      },
      { status: 501 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Malformed upload request.' }, { status: 400 });
  }

  const file = form.get('file');
  const folder = String(form.get('folder') || 'attachments').replace(/[^a-zA-Z0-9/_-]/g, '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was sent.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: `"${file.name}" is empty.` }, { status: 400 });
  }
  // Re-checked here, not just on the client: the browser check is a courtesy,
  // this one is the actual rule.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.` },
      { status: 413 },
    );
  }
  if (file.type && !ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `"${file.name}" is a ${file.type} file, which is not an accepted attachment type.` },
      { status: 415 },
    );
  }

  try {
    const blob = await put(`${folder}/${file.name}`, file, {
      access: 'public',
      // Two responders uploading "photo.jpg" must not overwrite each other.
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    // The local OIDC token is short-lived; an expired one surfaces here as an
    // auth error and the fix is not obvious from the raw message.
    const hint = /token|auth|forbidden|401|403/i.test(message)
      ? ' (if this is local dev, the OIDC token may have expired — re-run `vercel env pull .env.local`)'
      : '';
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
