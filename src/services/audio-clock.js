// ─────────────────────────────────────────────
// AUDIO CLOCK SERVICE
// A look-ahead beat scheduler built on AudioContext.currentTime, which is a
// hardware clock that doesn't drift the way setInterval does under load,
// tab backgrounding, or render contention. This is the standard "Tale of
// Two Clocks" pattern: a cheap, frequent poll just checks whether it's time
// to schedule upcoming beats, while all actual timing math is computed
// against the audio clock itself.
// ─────────────────────────────────────────────

const SCHEDULE_AHEAD_S = 0.1; // how far ahead we schedule, in seconds
const POLL_MS = 25;           // how often we check the clock
const COUNT_IN_BEATS = 4;     // silent-ish lead-in before the real session starts

// A slider you cannot hear is a slider you cannot trust — the only way to know a volume
// setting took is to hear it at that volume. Fires one click at the level being dragged
// to, reusing a single context so dragging doesn't open dozens of them.
let previewCtx = null;

export function previewTick(volume) {
  if (!(volume > 0)) return;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try {
    if (!previewCtx) previewCtx = new AC();
    if (previewCtx.state === 'suspended') previewCtx.resume();
    const now = previewCtx.currentTime;
    const osc = previewCtx.createOscillator();
    const gain = previewCtx.createGain();
    osc.connect(gain);
    gain.connect(previewCtx.destination);
    osc.frequency.setValueAtTime(1000, now);
    gain.gain.setValueAtTime(0.65 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch {}
}

export function closePreviewTick() {
  try { previewCtx?.close(); } catch {}
  previewCtx = null;
}

export class BeatScheduler {
  /**
   * @param {AudioContext} audioCtx
   * @param {object} callbacks
   *   onBeat({ beatIndexInBar, isDownbeat, isCountIn }) — fired at each beat's scheduled time
   *   onWord() — fired when beatsPerWord beats have elapsed (post count-in)
   *   onCountInEnd() — fired once, right as the count-in finishes
   */
  constructor(audioCtx, callbacks) {
    this.ctx = audioCtx;
    this.callbacks = callbacks;
    this.pollId = null;
    this.nextBeatTime = 0;
    this.beatNumber = 0;
    this.bpm = 90;
    this.beatsPerWord = 8;
    // Bumped on every stop() — any setTimeout already queued during the
    // look-ahead window captures the generation it was scheduled under and
    // checks it before firing, so stale callbacks can't land after a stop
    // (e.g. one extra word-change tick right as a session ends or a word
    // gets locked).
    this.generation = 0;
    // Oscillators already scheduled (via osc.start(when)) within the look-ahead window
    // would otherwise still play out even after stop() — tracked here so stop() can cut
    // them off immediately instead of leaving one stray click audible after locking/ending.
    this.pendingOscillators = [];
  }

  /**
   * Master click volume, 0 to 1. Set from the writer's setting rather than baked in:
   * a metronome you cannot turn down is one you turn off, and the count-in is worth
   * keeping even when the ongoing click is not.
   */
  volume = 1;

  playTickAt(when, freq, vol, dur = 0.08) {
    if (this.volume <= 0) return;
    vol *= this.volume;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when);
    osc.stop(when + dur);
    this.pendingOscillators.push(osc);
    osc.onended = () => {
      const i = this.pendingOscillators.indexOf(osc);
      if (i !== -1) this.pendingOscillators.splice(i, 1);
    };
  }

  start(bpm, beatsPerWord) {
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.bpm = bpm;
    this.beatsPerWord = beatsPerWord;
    this.beatNumber = -COUNT_IN_BEATS;
    this.nextBeatTime = this.ctx.currentTime + 0.05;

    const tick = () => this._scheduleAhead();
    tick();
    this.pollId = setInterval(tick, POLL_MS);
  }

  stop() {
    if (this.pollId) clearInterval(this.pollId);
    this.pollId = null;
    this.generation += 1;
    // Cut off any tick that was already scheduled via osc.start(when) inside the
    // look-ahead window but hasn't played yet — without this, one stray click can
    // still sound right after locking a word or ending the session.
    const now = this.ctx.currentTime;
    this.pendingOscillators.forEach(osc => { try { osc.stop(now); } catch {} });
    this.pendingOscillators = [];
  }

  _scheduleAhead() {
    const beatSeconds = 60 / this.bpm;
    while (this.nextBeatTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beatNum = this.beatNumber;
      const isCountIn = beatNum < 0;
      const b = ((beatNum % 4) + 4) % 4; // safe modulo for negative counts
      const when = this.nextBeatTime;
      const isDownbeat = b === 0;

      this.playTickAt(when, isDownbeat ? 1000 : 680, isCountIn ? 0.32 : (isDownbeat ? 0.65 : 0.28));

      const delayMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
      const isFirstRealBeat = beatNum === 0; // the actual downbeat the count-in was leading into
      const gen = this.generation;

      setTimeout(() => {
        if (gen !== this.generation) return; // stop() ran since this was scheduled
        this.callbacks.onBeat?.({ beatIndexInBar: b, isDownbeat, isCountIn });
        if (isFirstRealBeat) this.callbacks.onCountInEnd?.();
      }, delayMs);

      if (!isCountIn && beatNum > 0 && beatNum % this.beatsPerWord === 0) {
        setTimeout(() => { if (gen === this.generation) this.callbacks.onWord?.(); }, delayMs);
      }

      this.beatNumber += 1;
      this.nextBeatTime += beatSeconds;
    }
  }
}
