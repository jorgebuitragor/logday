export interface Note {
  id: string;
  title: string;
  folder: string;    // '' = unfiled (root)
  tags: string[];
  // Marcas: instante UTC (toISOString) o YYYY-MM-DD legado (fecha local).
  // Leerlas con los helpers de lib/localDate.ts (stampToLocalDate, stampSortKey).
  created: string;
  updated: string;   // puede venir vacío del server en notas viejas
  pinned: boolean;
  content: string;
  filePath: string;
}
