export interface OvertimeEntry {
  id: string;
  fecha: string;           // YYYY-MM-DD
  solicitadaPor: string;
  actividad: string;
  observaciones: string;
  horaInicio: string;      // HH:MM
  horaFinal: string;       // HH:MM
  totalHoras: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasFestivas: number;
  extrasNocturnasFestivas: number;
}

export interface OvertimeMonthMeta {
  colaborador: string;
  cedula: string;
}
