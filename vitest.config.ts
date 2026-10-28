import { defineConfig } from 'vitest/config';

// Pruebas de la lógica pura (src/**/*.test.ts). Separado de vite.config.ts
// para no cargar los plugins de la app.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Zona horaria fija: las pruebas de fechas comprueban el comportamiento
    // en Colombia (UTC-5), donde desde las 7 p. m. en UTC ya es mañana.
    env: { TZ: 'America/Bogota' },
  },
});
