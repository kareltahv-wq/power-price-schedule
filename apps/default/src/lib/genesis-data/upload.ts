/**
 * Upload one file from a Genesis app to the workspace Media library.
 *
 * The gateway route behind this helper is rolling out, and it answers 404 where it is
 * not on yet. Use `uploadFile` only when the build instructions name it. Otherwise send
 * a file with `submitForm` to a form flow.
 */
import { gatewayRequest } from '../genesis-gateway';
import type { ClientOptions, GatewayResponse } from '../genesis-gateway';

/** A stored file: put `url` in the row's field (Photo, Resume). */
export interface UploadedFile {
  url: string;
  mediaId: string;
  name: string;
  mimetype: string;
}

export interface UploadFileOptions extends ClientOptions {
  /** Long edge in pixels for a re-encoded photo. Default 2560. */
  maxImageEdge?: number;
}

/**
 * The largest file the gateway stores in one request: 10 MB. It sits below the
 * 10 MiB request cap, so the multipart boundary and headers still fit.
 */
export const UPLOAD_MAX_BYTES = 10_000_000;

/** A photo above this size is re-encoded before upload. */
const RESIZE_ABOVE_BYTES = 2 * 1024 * 1024;

const DEFAULT_MAX_IMAGE_EDGE = 2560;

/**
 * Only camera photos are re-encoded. A PNG can hold transparency, and a GIF,
 * WebP or AVIF can be animated, so a JPEG copy would change the file the user
 * picked. Those upload as they are, under the same 10 MB cap.
 */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/heic', 'image/heif']);

/**
 * How long one upload can take. A 10 MB file takes about 40 s on a 2 Mbps phone
 * link, which the 30 s default of `gatewayRequest` cut off. 120 s stays under
 * the CDN idle cut (about 125 s).
 */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Re-encodes a large photo as a JPEG with its long edge at `maxEdge`. A phone photo
 * is often 3 to 8 MB, and Safari decodes HEIC, so an iPhone photo also becomes a JPEG
 * that every browser can draw. Returns the original file when it is small, is not a
 * camera photo (see PHOTO_TYPES), or cannot be decoded here.
 */
async function shrinkImage(file: File, maxEdge: number): Promise<File> {
  if (
    !PHOTO_TYPES.has(file.type) ||
    file.size <= RESIZE_ABOVE_BYTES ||
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (context == null) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (blob == null) {
      return file;
    }
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    // This browser cannot decode the file (for example HEIC outside Safari).
    return file;
  }
}

/**
 * Uploads ONE file and resolves with its media URL. Throws before any request when the
 * file is still over 10 MB, and throws on any gateway error, so a form keeps the user's
 * answers on screen instead of showing a false success. The file stays in Media even
 * when the row write after it fails, and no helper deletes it: check the answers
 * before the upload, and reuse the returned `url` on a retry.
 *
 * @example
 * ```typescript
 * const photo = await uploadFile(photoInput.files[0]);
 * await createNode(familiesId, { Name: name, 'Child photo': photo.url });
 * ```
 */
export async function uploadFile(file: File, options?: UploadFileOptions): Promise<UploadedFile> {
  const toSend = await shrinkImage(file, options?.maxImageEdge ?? DEFAULT_MAX_IMAGE_EDGE);
  if (toSend.size > UPLOAD_MAX_BYTES) {
    throw new Error(`"${file.name}" is larger than 10 MB. Choose a smaller file.`);
  }
  const body = new FormData();
  body.append('file', toSend, toSend.name);
  let data: GatewayResponse<UploadedFile & { size: number }>;
  try {
    data = await gatewayRequest<GatewayResponse<UploadedFile & { size: number }>>(
      '/media',
      { method: 'POST', body, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) },
      options,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Taskade gateway request timed out')) {
      throw new Error(
        `The upload of "${file.name}" did not finish within ${UPLOAD_TIMEOUT_MS / 1000} s. Check the connection and try again.`,
        { cause: err },
      );
    }
    // The upload route is rolling out. Where it is not on yet it answers 404.
    if (err instanceof Error && err.message.startsWith('Taskade gateway request failed: 404')) {
      throw new Error(
        'File upload is not available for this app yet. Send the file with submitForm to a form flow instead.',
        { cause: err },
      );
    }
    throw err;
  }
  const payload = data.payload;
  if (payload == null || typeof payload.url !== 'string') {
    throw new Error('The upload did not return a file URL');
  }
  return {
    url: payload.url,
    mediaId: payload.mediaId,
    name: payload.name,
    mimetype: payload.mimetype,
  };
}
