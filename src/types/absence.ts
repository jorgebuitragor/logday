export type AbsenceType = 'incapacidad' | 'vacaciones' | 'otro';

export interface AbsenceDay {
  id: string;
  date: string;   // YYYY-MM-DD
  type: AbsenceType;
  note?: string;
}
