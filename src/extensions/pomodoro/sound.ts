// El aviso sonoro (PM5, design §6): dos tonos senoidales cortos, generados
// con Web Audio, sin archivos. Bajan al terminar el trabajo (toca soltar) y
// suben al terminar un descanso (toca volver).
let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Un tono de 120 ms con fundido de entrada y de salida. */
function tone(ac: AudioContext, freq: number, at: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.015);
  gain.gain.setValueAtTime(0.18, at + 0.1);
  gain.gain.linearRampToValueAtTime(0, at + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.13);
}

/** Nunca lanza: sin audio, no suena y ya. */
export function playChime(direction: 'down' | 'up'): void {
  try {
    const ac = context();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const [first, second] = direction === 'down' ? [880, 660] : [660, 880];
    const at = ac.currentTime + 0.02;
    tone(ac, first, at);
    // 80 ms de silencio entre los dos.
    tone(ac, second, at + 0.2);
  } catch {
    // Sin Web Audio (pruebas o un WebView raro): sin sonido.
  }
}

export function closeAudio(): void {
  const ac = ctx;
  ctx = null;
  if (ac) void ac.close().catch(() => {});
}
