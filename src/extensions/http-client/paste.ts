// Pegar un comando cURL (specs/cliente-http HT39, HT70, HT71, design §13 y
// §15): en una nota pasa a ser un bloque ```http (`convertPaste`,
// specs/extensiones R24) y en la URL de la pantalla rellena el formulario.
// Qué pasa con los valores sensibles lo dice Opciones → Cliente HTTP:
// "Preguntar" (de serie), "Cambiar por variables" o "Dejar los valores tal
// cual". Con "Preguntar", no se inserta nada hasta que se responde, y el
// texto original solo vive en memoria mientras el diálogo está abierto. El
// valor real no se guarda en ningún sitio: ni en los ajustes ni en el
// llavero (eso lo hace el usuario en Entornos, si quiere).
import { useAppStore } from '../../store/appStore';
import type { NotePasteConversion } from '../types';
import { announce } from './announce';
import { fromCurl, type FromCurlResult } from './core/curl';
import { activeEnvironment, EXTENSION_ID, readHttpSettings, type CurlPasteMode } from './core/environments';
import { listVars, makeTr } from './core/text';
import { openSettings } from './store';
import { askCurlSecrets, type CurlAnswer, type CurlChoice } from './ui/CurlSecretsDialog';

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
  const description = tr('curlSecretsBody', { n: replaced.length, vars: listVars(tr, replaced) });
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

const currentMode = (): CurlPasteMode => readHttpSettings(useAppStore.getState().extensions[EXTENSION_ID]?.settings).curlPaste;

/** Las dos formas de convertirlo: con variables y con los valores. */
export interface CurlPastePlan {
  /** Con los valores sensibles cambiados por variables (HT39b). */
  variables: FromCurlResult;
  /** Con los valores tal cual. */
  keep: FromCurlResult;
  /** Qué hacer: `ask` solo si hay valores sensibles; sin ellos, convertir. */
  mode: CurlPasteMode;
}

export function planCurlPaste(text: string, mode: CurlPasteMode = currentMode()): CurlPastePlan | null {
  const variables = fromCurl(text);
  if (!variables) return null;
  const keep = fromCurl(text, { keepValues: true }) ?? variables;
  return { variables, keep, mode: variables.replaced.length === 0 ? 'variables' : mode };
}

/** Lo elegido, como el resultado a insertar. */
export const chosen = (plan: CurlPastePlan, choice: CurlChoice): FromCurlResult => (choice === 'keep' ? plan.keep : plan.variables);

/** Pregunta (HT71) y, con "Recordar mi elección", fija la opción. `null`:
 *  Esc, se pega el texto tal cual. */
export async function askCurlChoice(plan: CurlPastePlan): Promise<CurlChoice | null> {
  const app = useAppStore.getState();
  const answer: CurlAnswer | null = await askCurlSecrets(makeTr(app.language), plan.variables.replaced);
  if (!answer) return null;
  if (answer.remember) {
    await useAppStore.getState().updateExtensionSettings(EXTENSION_ID, { curlPaste: answer.choice });
  }
  return answer.choice;
}

const conversionOf = (r: FromCurlResult): NotePasteConversion => ({ code: r.code, onInserted: () => notifyCurlConverted(r.replaced) });

/** `ExtensionModule.convertPaste`: un cURL → el código del bloque. Con
 *  "Preguntar" y valores sensibles, `ask` abre el diálogo antes de insertar
 *  nada (specs/extensiones R24). */
export function convertCurlPaste(text: string): NotePasteConversion | null {
  const plan = planCurlPaste(text);
  if (!plan) return null;
  if (plan.mode === 'keep') return conversionOf(plan.keep);
  if (plan.mode === 'variables') return conversionOf(plan.variables);
  return {
    ...conversionOf(plan.variables),
    ask: async () => {
      const choice = await askCurlChoice(plan);
      return choice ? conversionOf(chosen(plan, choice)) : null;
    },
  };
}
