// A subtle, synthesized typewriter keystroke click (no audio asset bundled).
// Off by default; played only when settings.typewriterSound is on.
let ctx: AudioContext | null = null

export function playKeyClick(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new AC()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 780 + Math.random() * 220
    gain.gain.setValueAtTime(0.05, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.03)
  } catch {
    /* audio unavailable — silently ignore */
  }
}
