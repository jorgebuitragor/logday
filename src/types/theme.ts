export type BuiltInTheme =
  | 'dark' | 'light' | 'system' | 'high-contrast' | 'visual-rest'
  | 'sepia' | 'oled' | 'nordic';
// El prefijo "custom:" permite seguir tratando el tema activo como un
// string simple almacenable en localStorage, sin clave separada para
// "cuál custom está activo".
export type Theme = BuiltInTheme | `custom:${string}`;

export interface CustomTheme {
  id: string;
  name: string;
  base: 'dark' | 'light';
  accent: string;    // hex, ej. "#ff6b6b" — color de acento
  bgTint: string;    // hex — tinte de la escala de fondos/bordes
  textTint: string;  // hex — tinte de la escala de textos
  intensity: number; // 0-100, controla la saturación del acento derivado
  createdAt: string; // ISO date
}
