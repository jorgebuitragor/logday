/** Lo que necesitan los pasos que pueden terminar la bienvenida (OB2, OB9). */
export interface StepFinishProps {
  /** Se está preparando la carpeta. */
  finishing: boolean;
  /** No se pudo preparar (OB9). */
  finishError: boolean;
  /** "Omitir y abrir Logday". */
  onSkipAll: () => void;
  /** Volver al paso 2 para elegir otra carpeta. */
  onPickOther: () => void;
}
