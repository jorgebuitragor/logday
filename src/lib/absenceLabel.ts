import { AbsenceType } from '../types/absence';
import { t, type Language } from './i18n';

export function absenceTypeLabel(language: Language, type: AbsenceType): string {
  const key = `type${type.charAt(0).toUpperCase()}${type.slice(1)}` as
    'typeIncapacidad' | 'typeVacaciones' | 'typeOtro';
  return t(language, 'absence', key);
}
