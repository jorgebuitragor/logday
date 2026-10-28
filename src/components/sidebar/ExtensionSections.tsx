import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { useExtensions } from '../../extensions/useExtensions';
import { extensionSection } from '../../extensions/state';
import { extensionText } from '../../extensions/text';

/** Secciones del menú de las extensiones activas con vista propia, después
 *  de las fijas y separadas de ellas (specs/extensiones R11). Sin ninguna,
 *  no se dibuja nada, ni la separadora. */
export function ExtensionSections({ collapsed }: { collapsed: boolean }) {
  const { activeSection, setSection, language } = useAppStore(
    useShallow((s) => ({ activeSection: s.activeSection, setSection: s.setSection, language: s.language })),
  );
  const withView = useExtensions().enabled.filter((def) => def.view);
  if (withView.length === 0) return null;

  const buttons = withView.map((def) => {
    const section = extensionSection(def.id);
    const isActive = activeSection === section;
    const label = extensionText(language, def.id, 'name');
    const Icon = def.icon;
    return (
      <button
        key={def.id}
        onClick={() => void setSection(section)}
        title={label}
        className={
          collapsed
            ? `rounded-lg p-2 transition ${
                isActive
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`
            : `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
              }`
        }
      >
        <Icon size={collapsed ? 18 : 14} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
  });

  if (collapsed) {
    return (
      <>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        {buttons}
      </>
    );
  }
  return <div className="space-y-0.5 border-b border-[var(--border)] px-2 py-2">{buttons}</div>;
}
