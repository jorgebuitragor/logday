// Módulo de "Cliente HTTP" (specs/cliente-http). Se carga con `import()`
// solo cuando la extensión está activa (specs/extensiones R16). Aporta el
// bloque ```http de las notas (barra y respuesta), su panel de Opciones y
// un proceso propio: la región viva y, al pararse, cancelar lo que esté en
// curso y olvidar las respuestas (R7, HT11).
import { getVersion } from '@tauri-apps/api/app';
import type { ExtensionModule } from '../types';
import { mountAnnouncer } from './announce';
import { resetAll, setUserAgent } from './store';
import HttpNoteBlock from './ui/Block';
import HttpClientSettingsPanel from './ui/Settings';

const httpClient: ExtensionModule = {
  NoteBlock: HttpNoteBlock,
  Settings: HttpClientSettingsPanel,
  start: () => {
    const unmount = mountAnnouncer();
    void getVersion().then((v) => setUserAgent(`Logday/${v}`)).catch(() => {});
    return () => {
      resetAll();
      unmount();
    };
  },
};

export default httpClient;
