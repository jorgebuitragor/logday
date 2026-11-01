// Qué plantilla usa cada salida (logday-server specs/plantillas, v1): FCV,
// la de siempre y la predeterminada; Logday, la genérica; o una propia. Se
// guarda en config.json, solo en este equipo (sin sync en la v1).
import { buildDailyCopyText } from '../colombianHolidays';
import { LOGDAY_DAILY_TEMPLATE, dailyTemplateContext, renderTemplate, type DailyContextInput } from './dailyTemplate';

export type TemplateSource = 'fcv' | 'logday' | 'custom';

export interface DailyTemplateChoice {
  source: TemplateSource;
  /** El texto de la propia. Se conserva al volver a una incluida. */
  text?: string;
}

export interface OvertimeTemplateChoice {
  source: TemplateSource;
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

/** El mensaje del Daily con la plantilla elegida. La FCV sigue saliendo de
 *  `buildDailyCopyText`, igual que antes; una propia vacía, también. */
export function buildDailyMessage(choice: DailyTemplateChoice | undefined, input: DailyContextInput): string {
  const source = choice?.source ?? 'fcv';
  const text = source === 'logday' ? LOGDAY_DAILY_TEMPLATE[input.language] : source === 'custom' ? (choice?.text ?? '') : '';
  if (source === 'fcv' || !text.trim()) {
    return buildDailyCopyText(input.prevDate, input.prevActivities, input.todayDate, input.todayActivities);
  }
  return renderTemplate(text, dailyTemplateContext(input)).text;
}
