// Worker del probador de regex (specs/devtools D5): corre `runRegex` fuera
// del hilo principal para que la vista pueda cortarlo con `terminate()`.
import { runRegex } from './regex';

self.onmessage = (e: MessageEvent<{ pattern: string; flags: string; text: string }>) => {
  const { pattern, flags, text } = e.data;
  self.postMessage(runRegex(pattern, flags, text));
};
