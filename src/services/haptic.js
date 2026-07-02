let hapticsEnabled = true;
export const setHapticsEnabled = (on) => { hapticsEnabled = on; };
export const haptic = (ms = 18) => {
  if (!hapticsEnabled) return;
  try { navigator.vibrate?.(ms); } catch {}
};
