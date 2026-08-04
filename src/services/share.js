// ─────────────────────────────────────────────
// SHARE SERVICE
// The single seam between Barsmith and the OS share sheet.
//
// Every caller goes through `shareImage()` and gets back a plain outcome string,
// so the transport underneath can change without touching any UI. That matters
// because the native path is planned: wrapping in Capacitor means swapping the
// Web Share call here for `@capacitor/share` and nothing else moves.
//
// ── The iOS gesture rule ──
// Safari only honours `navigator.share()` when it is called synchronously inside
// a user gesture. Any `await` before it — encoding a canvas, loading a font,
// fetching a blob — drops the activation and the sheet silently never opens.
// So this function takes an ALREADY-RENDERED blob and does no async work before
// the share call. Callers must prepare the image ahead of the tap; the bar card
// modal renders on open for exactly this reason.
// ─────────────────────────────────────────────

import { downloadBlob } from './download';

/**
 * True when this browser can put an image file into the OS share sheet.
 * Used to label the button honestly rather than offering a share that will
 * quietly turn into a download.
 */
export function canShareImages() {
  return canShareType('image/png', 'probe.png');
}

/** True when this browser can put a file of this type into the OS share sheet. */
export function canShareType(mime, name) {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
  try {
    // A one-byte probe file: canShare inspects type and count, not contents.
    const probe = new File([new Uint8Array(1)], name, { type: mime });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Hand an image to the OS share sheet, falling back to a download.
 *
 * @param {Blob}   blob        Rendered image. Must already exist — see the gesture note above.
 * @param {string} filename
 * @returns {Promise<'shared'|'cancelled'|'downloaded'|'failed'>}
 */
export async function shareImage(blob, filename) {
  return shareFile(blob, filename, 'image/png');
}

/**
 * Hand any file to the OS share sheet, falling back to a download.
 *
 * **Files only — never a `text` or `url` alongside them.** iOS decides which actions to
 * promote from what the payload contains: files alone reads as "share this image/video"
 * and puts Save Image or Save Video near the front, while adding text makes it a generic
 * share and pushes Save to Files up instead. Barsmith was attaching the bar's own words
 * as a caption, which is why saving a card started by opening the Files browser.
 *
 * @param {Blob}   blob
 * @param {string} filename
 * @param {string} fallbackMime Used when the blob has no type of its own.
 * @returns {Promise<'shared'|'cancelled'|'downloaded'|'failed'>}
 */
export async function shareFile(blob, filename, fallbackMime = 'application/octet-stream') {
  const type = blob.type || fallbackMime;
  if (canShareType(type, filename)) {
    try {
      const file = new File([blob], filename, { type });
      // No await before this call — see the iOS gesture rule above.
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      // AbortError is the user dismissing the sheet. That is a normal outcome,
      // not a failure, and must not trigger a surprise download on top of it.
      if (err?.name === 'AbortError') return 'cancelled';
      // Anything else (NotAllowedError from a lost gesture, an unsupported type)
      // falls through to the download so the writer still gets the image.
    }
  }

  try {
    downloadBlob(filename, blob);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
