// ─────────────────────────────────────────────
// AUDIO SESSION  (iOS only)
//
// A web page gets whatever audio behaviour Safari decides. A native app has to declare
// one, and getting it wrong here has two distinct failure modes that pull in opposite
// directions:
//
//   `playback`      — survives the ringer switch, so the metronome is audible with the
//                     phone on silent. But it grants no recording input, so asking for the
//                     camera under it kills the session.
//   `playAndRecord` — allows the camera and mic, but by default routes output to the
//                     *receiver* (the earpiece you hold to your head), not the speaker.
//                     A metronome that quietly relocates to the earpiece mid-session reads
//                     as "the click stopped working".
//
// So neither category is right for the whole app; the right one depends on whether a
// recording is running. This module owns that switch, and `defaultToSpeaker` is what keeps
// the click out of the earpiece while recording.
//
// Everything is best-effort and silent. A session that will not configure is a worse
// session, never a broken one, and this must never throw into the writing loop.
//
// Web is untouched: every function returns immediately unless isNative().
// ─────────────────────────────────────────────

import { isNative } from './platform';

let current = null;

async function configure(category, options) {
  if (!isNative()) return;
  if (current === category) return; // switching costs a round trip through the OS
  try {
    const { AudioSession } = await import('@capawesome/capacitor-audio-session');
    await AudioSession.configure({ category, options });
    current = category;
  } catch {}
}

/**
 * The default: the metronome and count-in play even with the ringer switch on silent.
 *
 * A writer who has silenced their phone to concentrate has not asked for a silent
 * metronome — they have asked for no notifications. Those are different requests, and
 * the Settings slider is where the click gets turned down.
 */
export function useForPlayback() {
  return configure('playback', { mixWithOthers: false });
}

/**
 * While the camera is running. Output stays on the speaker rather than the earpiece, so
 * the click a writer is rapping to is still where they expect it.
 */
export function useForRecording() {
  return configure('playAndRecord', { defaultToSpeaker: true, allowBluetooth: true });
}

/** Test seam — the module caches the last category set. */
export function _resetAudioSession() { current = null; }
