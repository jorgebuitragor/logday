// Módulo de DevTools. Se carga con `import()` solo cuando la extensión
// está activa (specs/extensiones R16); cada herramienta, al abrirla.
import type { ExtensionModule } from '../types';
import { clearDrafts } from './model';
import { cancelRegex } from './tools/regexRunner';
import DevtoolsView from './View';

const devtools: ExtensionModule = {
  View: DevtoolsView,
  // D9: al desactivarla se olvida lo pegado; mientras está activa vive en
  // memoria. No hay procesos propios que parar, aparte de un regex en curso.
  start: () => () => {
    cancelRegex();
    clearDrafts();
  },
};

export default devtools;
