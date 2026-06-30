export const haptic = (ms = 18) => {
  try { navigator.vibrate?.(ms); } catch {}
};
