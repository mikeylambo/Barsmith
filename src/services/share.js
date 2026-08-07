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
import { isNative } from './platform';

/**
 * Share through the native sheet. Returns an outcome, or null if the native route was
 * unavailable so the caller can fall through to the web path.
 *
 * The plugins are imported here rather than at module scope so nothing Capacitor-specific
 * enters the web bundle — see services/platform.js for why that rule exists.
 *
 * The file has to exist on disk before the sheet can offer it, so it is written to the
 * app's cache directory first. That is also why the iOS gesture rule stops applying here:
 * a native sheet is not gated on user activation the way navigator.share is.
 */
async function shareViaNative(blob, filename, type) {
  try {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([
      import('@capacitor/share'),
      import('@capacitor/filesystem'),
    ]);
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    // Files only, for the same reason as the web path: a text caption changes which
    // actions iOS promotes, pushing Save to Files above Save Image.
    await Share.share({ files: [uri] });
    return 'shared';
  } catch (err) {
    const msg = String(err?.message || err);
    // The plugin reports a dismissed sheet as a cancel rather than an error type, so
    // match on it explicitly — a dismissal must not trigger a surprise download.
    if (/cancel/i.test(msg) || err?.name === 'AbortError') return 'cancelled';
    return null;
  }
}

/** Filesystem.writeFile takes base64, not a Blob. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

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
  // The native shell always can, and this answer drives the UI: BarCardModal shows Share
  // only when it is true, and offers a download instead when it is false. WKWebView may
  // not expose navigator.canShare at all, so without this a wrapped build would hide its
  // working share sheet and offer a download into a sandbox nobody can reach.
  if (isNative()) return true;
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

  // Native shell first. Web Share inside a WKWebView is version-dependent and its file
  // support is the fragile part; on Android's WebView it does not exist at all. The
  // Capacitor plugin talks to the real share sheet, so a wrapped build gets the behaviour
  // a browser tab only sometimes gets. Browsers never reach this branch.
  if (isNative()) {
    const outcome = await shareViaNative(blob, filename, type);
    if (outcome) return outcome;
    // A native failure falls through to the web path rather than dead-ending, so the
    // writer still gets their file even if the plugin is unavailable.
  }

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
