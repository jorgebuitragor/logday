// Pegar un comando cURL (specs/cliente-http HT39, design §13): en una nota
// pasa a ser un bloque ```http (`convertPaste`, specs/extensiones R24) y en
// la URL de la pantalla rellena el formulario. Los valores sensibles ya
// vienen cambiados por variables (`fromCurl`); aquí solo se avisa. El valor
// real no se guarda en ningún sitio: ni en la nota, ni en los ajustes, ni
// en el llavero (eso lo hace el usuario en Entornos, si quiere).
import { useAppStore } from '../../store/appStore';
import type { NotePasteConversion } from '../types';
import { announce } from './announce';
import { fromCurl } from './core/curl';
import { activeEnvironment, EXTENSION_ID, readHttpSettings } from './core/environments';
import { listVars, makeTr } from './core/text';
import { openSettings } from './store';

/** El anuncio de siempre y, si se ocultaron valores, un aviso con
 *  "Abrir Entornos" (el entorno activo, para crear ahí los secretos).
 *  `where`: en una nota se deshace con ⌘Z; en el formulario, no. */
export function notifyCurlConverted(replaced: readonly string[], where: 'note' | 'form' = 'note'): void {
  const app = useAppStore.getState();
  const tr = makeTr(app.language);
  const done = tr(where === 'note' ? 'aCurlPasted' : 'aCurlFilled');
  if (!replaced.length) {
    announce(done);
    return;
  }
  const body = tr('curlSecretsBody', { n: replaced.length, vars: listVars(tr, replaced) });
  const description = replaced.includes('basic_auth') ? `${body} ${tr('curlBasicHint')}` : body;
  announce(`${done} ${description}`);
  const env = activeEnvironment(readHttpSettings(app.extensions[EXTENSION_ID]?.settings));
  app.showToast({
    kind: 'info',
    title: tr('curlSecretsTitle'),
    description,
    durationMs: 10_000,
    action: { label: tr('curlSecretsAction'), onClick: () => openSettings(env?.id ?? null) },
  });
}

/** `ExtensionModule.convertPaste`: un cURL → el código del bloque. */
export function convertCurlPaste(text: string): NotePasteConversion | null {
  const r = fromCurl(text);
  return r ? { code: r.code, onInserted: () => notifyCurlConverted(r.replaced) } : null;
}
