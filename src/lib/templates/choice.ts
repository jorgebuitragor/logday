// Qué plantilla usa cada salida (logday-server specs/plantillas, v1). Se
// guarda en config.json, solo en este equipo (sin sync en la v1).
// - Daily: la de Logday (el mensaje de siempre, predeterminada) o una propia.
// - Excel de horas extra: Legacy (el de siempre, predeterminado), la de
//   Logday (genérica) o un .xlsx propio.
import { buildDailyCopyText } from '../colombianHolidays';
import { dailyTemplateContext, renderTemplate, type DailyContextInput } from './dailyTemplate';

export type DailyTemplateSource = 'logday' | 'custom';
export type OvertimeTemplateSource = 'legacy' | 'logday' | 'custom';

export interface DailyTemplateChoice {
  source: DailyTemplateSource;
  /** El texto de la propia. Se conserva al volver a la de Logday. */
  text?: string;
}

export interface OvertimeTemplateChoice {
  source: OvertimeTemplateSource;
  /** Nombre del archivo cargado y cuándo, para mostrarlo. El archivo vive
   *  en `<configDir>/plantillas/horas-extra.xlsx`. */
  fileName?: string;
  loadedAt?: string;
}

export interface TemplatesConfig {
  daily?: DailyTemplateChoice;
  overtime?: OvertimeTemplateChoice;
}

export const customOvertimeTemplatePath = (configDir: string) => `${configDir}/plantillas/horas-extra.xlsx`;

/** El mensaje del Daily con la plantilla elegida. La de Logday sigue
 *  saliendo de `buildDailyCopyText`, igual que antes; una propia vacía,
 *  también. */
export function buildDailyMessage(choice: DailyTemplateChoice | undefined, input: DailyContextInput): string {
  const text = choice?.source === 'custom' ? (choice.text ?? '') : '';
  if (!text.trim()) {
    return buildDailyCopyText(input.prevDate, input.prevActivities, input.todayDate, input.todayActivities);
  }
  return renderTemplate(text, dailyTemplateContext(input)).text;
}
