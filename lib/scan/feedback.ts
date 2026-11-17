/**
 * Audio and Haptic feedback for mobile camera and wedge scanner operations.
 * Uses Web Audio API oscillator synthesis (zero external audio file dependencies)
 * and the Navigator Vibration API for tactile response in noisy factory environments.
 */

/** Plays a crisp, cheerful scanner beep (1320Hz -> 1760Hz, 80ms) upon successful code acquisition. */
export function playScanSuccessSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Quick ascending frequency chirp
    osc.frequency.setValueAtTime(1320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    // Cleanup context after playback
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 150);
  } catch {
    // Audio autoplay restrictions or unsupported hardware: silently ignore
  }
}

/** Plays a subtle low double-tone warning beep (320Hz -> 220Hz, 100ms) when code does not match criteria. */
export function playScanWarningSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 180);
  } catch {
    // Ignore audio errors
  }
}

/** Triggers tactile vibration patterns when supported by mobile device hardware. */
export function triggerScanHaptic(type: "success" | "warn" = "success") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    if (type === "success") {
      // Crisp double-pulse: vibrate 40ms, pause 40ms, vibrate 50ms
      navigator.vibrate([40, 40, 50]);
    } else {
      // Single solid warning buzz
      navigator.vibrate(120);
    }
  } catch {
    // Ignore vibration errors
  }
}
