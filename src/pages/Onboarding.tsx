import { useState } from 'react';
import { FolderOpen, CheckSquare, Tag, Search, Layout, Calendar } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function Onboarding() {
  const [loading, setLoading] = useState(false);
  const setupBasePath = useAppStore((s) => s.setupBasePath);

  const handlePick = async () => {
    setLoading(true);
    try {
      await setupBasePath();
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: CheckSquare, label: 'Tareas en archivos .md legibles en cualquier editor' },
    { icon: Tag, label: 'Tags, proyectos y fechas de vencimiento' },
    { icon: Search, label: 'Búsqueda global en todos tus archivos' },
    { icon: Layout, label: 'Vista Lista, Kanban y Calendario' },
    { icon: Calendar, label: 'Vincula archivos y carpetas de tu equipo' },
  ];

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--bg-base)]">
      <div className="w-full max-w-md px-8">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white mb-4">
            <CheckSquare size={32} />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Logday</h1>
          <p className="mt-2 text-[var(--text-muted)] text-sm">Tu gestor de tareas local, en archivos markdown.</p>
        </div>

        {/* Features list */}
        <ul className="mb-8 space-y-3">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-start gap-3 text-sm text-[var(--text-tertiary)]">
              <Icon size={16} className="mt-0.5 shrink-0 text-indigo-400" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={handlePick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <FolderOpen size={18} />
          {loading ? 'Configurando…' : 'Elegir carpeta de trabajo'}
        </button>
        <p className="mt-3 text-center text-xs text-[var(--text-hint)]">
          Tus tareas se guardarán en la carpeta que elijas, como archivos .md.
        </p>
      </div>
    </div>
  );
}
