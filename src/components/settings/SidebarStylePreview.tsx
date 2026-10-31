// La miniatura animada de cada estilo del menú (specs/navegacion-secciones
// NS20, design §6.1). Se dibuja con los tokens del tema, sin imágenes; la
// animación está en App.css (`.sbp-*`): corre al pasar el puntero, con el
// foco del teclado y una vez al elegirla (`play`), y se apaga con
// `prefers-reduced-motion` o las animaciones de la app apagadas, dejando
// el fotograma final.
import type { SidebarStyle } from '../sidebar/sectionOrder';

const SQUARE = 'h-2.5 w-2.5 rounded-sm bg-[var(--bg-hover)]';
const LINE = 'h-1.5 rounded-full bg-[var(--bg-hover)]';

function PanelLines({ widths }: { widths: string[] }) {
  return (
    <div className="sbp-anim sbp-lines flex flex-col gap-1.5">
      {widths.map((w, i) => <div key={i} className={LINE} style={{ width: w }} />)}
    </div>
  );
}

export function SidebarStylePreview({ variant, play = false }: { variant: SidebarStyle; play?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`sbp ${play ? 'sbp-run' : ''} flex h-24 w-full max-w-40 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-base)]`}
    >
      {variant === 'icons' ? (
        <>
          {/* La columna de íconos: el resaltado baja de sección en sección,
              con su tooltip al lado. */}
          <div className="relative flex w-5 shrink-0 flex-col items-center gap-[3px] border-r border-[var(--border)] bg-[var(--bg-panel)] py-1.5">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className={SQUARE} />)}
            <div className="sbp-anim sbp-hl absolute left-[5px] top-[19px] h-2.5 w-2.5 rounded-sm bg-[var(--accent)]">
              <div className="sbp-anim sbp-tip absolute left-4 top-[1px] h-2 w-7 rounded-sm border border-[var(--border-card)] bg-[var(--bg-elevated)]" />
            </div>
          </div>
          <div className="flex w-14 shrink-0 flex-col gap-2 border-r border-[var(--border)] bg-[var(--bg-panel)] p-2">
            <div className={LINE} style={{ width: '70%' }} />
            <PanelLines widths={['90%', '60%', '75%']} />
          </div>
        </>
      ) : (
        <div className="flex w-[4.75rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          {/* Las filas con nombre: el resaltado baja por ellas. */}
          <div className="relative flex flex-col gap-[3px] border-b border-[var(--border)] p-1.5">
            <div className="sbp-anim sbp-hl sbp-hl-list absolute left-1 right-1 top-[4px] h-[11px] rounded-sm bg-[var(--accent)] opacity-30" />
            {['70%', '55%', '80%', '60%', '65%'].map((w, i) => (
              <div key={i} className="relative flex h-2 items-center gap-1">
                <div className="h-2 w-2 shrink-0 rounded-sm bg-[var(--bg-hover)]" />
                <div className={LINE} style={{ width: w }} />
              </div>
            ))}
          </div>
          <div className="p-1.5">
            <PanelLines widths={['85%', '60%']} />
          </div>
        </div>
      )}
      {/* El contenido de la sección. */}
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className={LINE} style={{ width: '60%' }} />
        <div className={LINE} style={{ width: '85%' }} />
        <div className={LINE} style={{ width: '40%' }} />
      </div>
    </div>
  );
}
