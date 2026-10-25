import { useState } from 'react';
import { FolderOpen, Tag, Search, Layout, Calendar, AlertTriangle, BookOpen, ClipboardList, Clock, GitCommit } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import logo from '../assets/logo.png';

function isICloudPath(path: string): boolean {
  return (
    path.includes('/Library/Mobile Documents') ||
    path.includes('com~apple~CloudDocs') ||
    path.includes('/iCloud Drive/')
  );
}

export function Onboarding() {
  const [loading, setLoading] = useState(false);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const setupBasePath = useAppStore((s) => s.setupBasePath);

  const handlePick = async () => {
    setLoading(true);
    setPickedPath(null);
    try {
      await setupBasePath();
      // Leer el path elegido para detectar iCloud
      setPickedPath(useAppStore.getState().basePath);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Layout,       label: 'Tareas con vistas Lista, Kanban y Calendario' },
    { icon: Tag,          label: 'Tags, proyectos y fechas de vencimiento' },
    { icon: BookOpen,     label: 'Notas en Markdown con editor enriquecido' },
    { icon: ClipboardList,label: 'Diario para registrar el trabajo del día' },
    { icon: Clock,        label: 'Cálculo de horas extra con exportación a Excel' },
    { icon: Search,       label: 'Búsqueda global en todos tus archivos' },
    { icon: Calendar,     label: 'Todo guardado en archivos .md en tu carpeta' },
    { icon: GitCommit,    label: 'Sincronización con Git (commits y push automáticos)' },
  ];

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--bg-base)]">
      <div className="w-full max-w-md px-8">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden mb-4">
            <img src={logo} alt="Logday" className="h-full w-full object-cover" />
          </div>
          <h1 className="brand-wordmark text-3xl">log<span className="accent">day</span></h1>
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

        {pickedPath && isICloudPath(pickedPath) && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Carpeta dentro de iCloud Drive</p>
                <p className="mt-0.5 text-[11px] text-amber-300/80">
                  La app puede congelarse mientras iCloud sincroniza archivos.<br />
                  Recomendamos una carpeta local, por ejemplo <span className="font-mono">~/Documents/Logday</span>.
                </p>
              </div>
            </div>
            <button
              onClick={handlePick}
              className="text-[11px] text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Cambiar a otra carpeta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
