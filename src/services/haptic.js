// ─────────────────────────────────────────────
// HAPTICS
//
// navigator.vibrate has never been supported by Safari, so on iOS this has always been a
// silent no-op — the Haptics toggle in Settings promised something the web could not
// deliver on the one platform every tester is using. The native shell can actually do it,
// via the Taptic Engine, so this is one of the few places where wrapping adds a feature
// rather than merely preserving one.
//
// Durations map to iOS impact styles by weight, since the Taptic Engine takes a style
// rather than a millisecond count: the app's calls range from a 10ms beat tick to a 25ms
// downbeat, and those want to feel different.
// ─────────────────────────────────────────────

import { isNative } from './platform';

let hapticsEnabled = true;
export const setHapticsEnabled = (on) => { hapticsEnabled = on; };

// Resolved once, then reused. The import is lazy so no plugin code enters the web bundle.
let impactFn = null;
let impactStyles = null;
let loading = null;

function loadNativeHaptics() {
  if (!loading) {
    loading = import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) => { impactFn = Haptics.impact.bind(Haptics); impactStyles = ImpactStyle; })
      .catch(() => { impactFn = null; });
  }
  return loading;
}

export const haptic = (ms = 18) => {
  if (!hapticsEnabled) return;

  if (isNative()) {
    // Fire-and-forget: a haptic that arrives a frame late is still right, and a writer
    // mid-bar must never wait on one.
    if (impactFn && impactStyles) {
      // Two levels, because the app only has two meanings: the downbeat and the bar-saved
      // pulse (24ms+) want weight, everything else — offbeat ticks, a copied word — wants
      // to be barely there. Heavy is deliberately unused; on a metronome it is a hammer.
      const style = ms >= 24 ? impactStyles.Medium : impactStyles.Light;
      try { impactFn({ style }); } catch {}
    } else {
      loadNativeHaptics();
    }
    return;
  }

  try { navigator.vibrate?.(ms); } catch {}
};
