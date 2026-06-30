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
  }

  playTickAt(when, freq, vol, dur = 0.08) {
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
      const isLastCountInBeat = beatNum === -1;

      setTimeout(() => {
        this.callbacks.onBeat?.({ beatIndexInBar: b, isDownbeat, isCountIn });
        if (isLastCountInBeat) this.callbacks.onCountInEnd?.();
      }, delayMs);

      if (!isCountIn && (beatNum + 1) % this.beatsPerWord === 0) {
        setTimeout(() => this.callbacks.onWord?.(), delayMs);
      }

      this.beatNumber += 1;
      this.nextBeatTime += beatSeconds;
    }
  }
}
