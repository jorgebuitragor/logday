import { useEffect, useState } from 'react';
import { Check, Code2, LayoutTemplate, Sparkles, X } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { MermaidBlock } from './MermaidBlock';
import { FlowVisualEditor, type FlowVisualDiagramType } from './visual-editors/FlowVisualEditor';
import { SequenceVisualEditor } from './visual-editors/SequenceVisualEditor';
import { ERVisualEditor } from './visual-editors/ERVisualEditor';

interface Props {
  initialCode: string;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSave: (code: string) => void;
}

const TEMPLATES = [
  {
    label: 'Flujo',
    code: `flowchart TD
  Inicio([Inicio]) --> Validar{Hay datos?}
  Validar -->|Si| Proceso[Procesar tarea]
  Validar -->|No| Solicitar[Solicitar datos]
  Proceso --> Fin([Fin])`,
  },
  {
    label: 'Secuencia',
    code: `sequenceDiagram
  autonumber
  Usuario->>App: Crear nota
  App->>Store: Guardar contenido
  Store-->>App: Confirmacion
  App-->>Usuario: Mostrar nota`,
  },
  {
    label: 'Estados',
    code: `stateDiagram-v2
  [*] --> Borrador
  Borrador --> Revisando
  Revisando --> Publicado
  Revisando --> Borrador`,
  },
  {
    label: 'ER',
    code: `erDiagram
  NOTE ||--o{ TAG : contiene
  NOTE {
    string id
    string title
    string content
  }
  TAG {
    string name
  }`,
  },
];

export function MermaidEditorModal({ initialCode, mode, onClose, onSave }: Props) {
  const [code, setCode] = useState(initialCode);
  const [editorMode, setEditorMode] = useState<'code' | 'visual'>('code');
  const [visualKey, setVisualKey] = useState(0);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  function detectType(c: string): 'flowchart' | 'state' | 'sequence' | 'er' | 'unknown' {
    const first = c.trim().split('\n')[0]?.toLowerCase() ?? '';
    if (first.startsWith('flowchart')) return 'flowchart';
    if (first.startsWith('sequencediagram')) return 'sequence';
    if (first.startsWith('statediagram')) return 'state';
    if (first.startsWith('erdiagram')) return 'er';
    return 'unknown';
  }

  const diagramType = detectType(code);
  const canVisual = diagramType !== 'unknown';

  const handleTemplateClick = (templateCode: string) => {
    setCode(templateCode);
    if (editorMode === 'visual') setVisualKey(k => k + 1);
  };

  const handleToggleVisual = () => {
    if (!canVisual) return;
    if (editorMode === 'code') {
      setVisualKey(k => k + 1);
      setEditorMode('visual');
    } else {
      setEditorMode('code');
    }
  };

  function renderVisualEditor() {
    const key = visualKey;
    if (diagramType === 'flowchart') {
      return (
        <ReactFlowProvider>
          <FlowVisualEditor key={key} code={code} diagramType={'flowchart' as FlowVisualDiagramType} onChange={setCode} />
        </ReactFlowProvider>
      );
    }
    if (diagramType === 'state') {
      return (
        <ReactFlowProvider>
          <FlowVisualEditor key={key} code={code} diagramType={'state' as FlowVisualDiagramType} onChange={setCode} />
        </ReactFlowProvider>
      );
    }
    if (diagramType === 'sequence') {
      return <SequenceVisualEditor key={key} code={code} onChange={setCode} />;
    }
    if (diagramType === 'er') {
      return <ERVisualEditor key={key} code={code} onChange={setCode} />;
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/45 px-2 py-2">
      <div
        className="flex h-[96vh] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-3xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {mode === 'edit' ? 'Editar diagrama Mermaid' : 'Nuevo diagrama Mermaid'}
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              Edita el codigo Mermaid con vista previa inmediata y guardalo dentro de la nota.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="flex min-h-0 overflow-hidden flex-col border-b border-[var(--border)] lg:border-b-0 lg:border-r">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-hint)]">
                Plantillas
              </div>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    onClick={() => handleTemplateClick(template.code)}
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[var(--text-hint)]">
                <span>{editorMode === 'code' ? 'Codigo Mermaid' : 'Editor visual'}</span>
                <div className="flex items-center gap-2">
                  {editorMode === 'code' && (
                    <span>{code.trim().split(/\s+/).filter(Boolean).length} palabras</span>
                  )}
                  <button
                    onClick={handleToggleVisual}
                    disabled={!canVisual}
                    title={canVisual ? (editorMode === 'code' ? 'Cambiar a modo visual' : 'Cambiar a modo código') : 'Tipo de diagrama no soportado visualmente'}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: editorMode === 'visual' ? '#6366f1' : 'var(--text-secondary)', borderColor: editorMode === 'visual' ? '#6366f1' : undefined }}
                  >
                    {editorMode === 'code' ? <LayoutTemplate size={11} /> : <Code2 size={11} />}
                    {editorMode === 'code' ? 'Visual' : 'Código'}
                  </button>
                </div>
              </div>
              {editorMode === 'code' ? (
                <textarea
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className="min-h-0 flex-1 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[var(--text-secondary)] outline-none transition focus:border-indigo-400/50 focus:text-[var(--text-primary)]"
                  style={{ scrollbarGutter: 'stable' }}
                  placeholder="flowchart TD\n  A[Inicio] --> B[Fin]"
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-indigo-400/40">
                  {renderVisualEditor()}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 overflow-hidden flex-col bg-[var(--bg-base)]/45 px-5 py-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-hint)]">
              <Sparkles size={13} />
              Vista previa
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-3"
              style={{ scrollbarGutter: 'stable' }}
            >
              {code.trim() ? (
                <MermaidBlock code={code} compact />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-hint)]">
                  Escribe o elige una plantilla para ver el diagrama.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-20 flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
          <div className="text-xs text-[var(--text-hint)]">
            Se guardara como bloque Mermaid dentro del markdown de la nota.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(code)}
              disabled={!code.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-indigo-500/45"
            >
              <Check size={14} />
              {mode === 'edit' ? 'Actualizar diagrama' : 'Insertar diagrama'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}