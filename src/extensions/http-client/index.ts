// Módulo de "Cliente HTTP" (specs/cliente-http). Se carga con `import()`
// solo cuando la extensión está activa (specs/extensiones R16). Aporta el
// bloque ```http de las notas (barra y respuesta), su pantalla propia (la
// columna de peticiones y el formulario, HT33), su panel de Opciones y un
// proceso propio: la región viva y, al pararse, cancelar lo que esté en
// curso y olvidar las respuestas y el formulario (R7, HT11).
import { getVersion } from '@tauri-apps/api/app';
import type { ExtensionModule } from '../types';
import { mountAnnouncer } from './announce';
import { resetAll, setUserAgent } from './store';
import HttpNoteBlock from './ui/Block';
import HttpClientSettingsPanel from './ui/Settings';
import HttpClientView from './ui/View';

const httpClient: ExtensionModule = {
  NoteBlock: HttpNoteBlock,
  Settings: HttpClientSettingsPanel,
  View: HttpClientView,
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
