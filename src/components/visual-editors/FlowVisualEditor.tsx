import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CircleDot, Diamond, Hexagon, Square, Trash2 } from 'lucide-react';
import {
  parseFlowchart,
  parseStateDiagram,
  serializeFlowchart,
  serializeStateDiagram,
  type FCEdge,
  type FCNode,
  type FlowDirection,
  type NodeShape,
  type ParsedFlowchart,
  type StateNode,
  type StateTransition,
} from './diagramParsers';

// ==================== Shared editable label hook ====================

function useEditableLabel(id: string, initialLabel: string) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialLabel);

  const commit = () => {
    setEditing(false);
    setNodes(nds =>
      nds.map(n => (n.id === id ? { ...n, data: { ...n.data, label: draft || n.data.label } } : n))
    );
  };

  return {
    editing,
    draft,
    setDraft,
    startEdit: () => { setDraft(initialLabel); setEditing(true); },
    commit,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); },
  };
}

// ==================== Custom node styles ====================

const baseStyle = (selected: boolean): React.CSSProperties => ({
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: `2px solid ${selected ? '#6366f1' : 'var(--border-high)'}`,
  boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'default',
  userSelect: 'none',
});

const handleStyle: React.CSSProperties = { background: '#6366f1', width: 10, height: 10 };

function EditInput({ draft, setDraft, onKeyDown, onBlur }: { draft: string; setDraft: (v: string) => void; onKeyDown: (e: React.KeyboardEvent) => void; onBlur: () => void }) {
  return (
    <input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      autoFocus
      style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', textAlign: 'center', width: '100%', minWidth: 60 }}
    />
  );
}

// ==================== Process node (rectangle) ====================

const ProcessNode = memo(({ id, data, selected }: NodeProps) => {
  const { editing, draft, setDraft, startEdit, commit, onKeyDown } = useEditableLabel(id, data.label as string);
  return (
    <div onDoubleClick={startEdit} style={{ ...baseStyle(selected), padding: '9px 18px', borderRadius: 8, minWidth: 100, textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {editing
        ? <EditInput draft={draft} setDraft={setDraft} onKeyDown={onKeyDown} onBlur={commit} />
        : <span>{data.label as string}</span>}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});
ProcessNode.displayName = 'ProcessNode';

// ==================== Terminal node (pill / stadium) ====================

const TerminalNode = memo(({ id, data, selected }: NodeProps) => {
  const { editing, draft, setDraft, startEdit, commit, onKeyDown } = useEditableLabel(id, data.label as string);
  return (
    <div onDoubleClick={startEdit} style={{ ...baseStyle(selected), padding: '8px 22px', borderRadius: 999, minWidth: 90, textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {editing
        ? <EditInput draft={draft} setDraft={setDraft} onKeyDown={onKeyDown} onBlur={commit} />
        : <span>{data.label as string}</span>}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});
TerminalNode.displayName = 'TerminalNode';

// ==================== Decision node (diamond) ====================

const DecisionNode = memo(({ id, data, selected }: NodeProps) => {
  const { editing, draft, setDraft, startEdit, commit, onKeyDown } = useEditableLabel(id, data.label as string);
  const size = 96;
  return (
    <div onDoubleClick={startEdit} style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>
      <div style={{ position: 'absolute', inset: 10, background: 'var(--bg-elevated)', border: `2px solid ${selected ? '#6366f1' : 'var(--border-high)'}`, transform: 'rotate(45deg)', borderRadius: 3, boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', padding: '0 6px', maxWidth: '90%', wordBreak: 'break-word' }}>
        {editing
          ? <EditInput draft={draft} setDraft={setDraft} onKeyDown={onKeyDown} onBlur={commit} />
          : <span>{data.label as string}</span>}
      </div>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: 10 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ ...handleStyle, right: 10 }} />
      <Handle id="left" type="source" position={Position.Left} style={{ ...handleStyle, left: 10 }} />
    </div>
  );
});
DecisionNode.displayName = 'DecisionNode';

// ==================== Circle node ====================

const CircleNode = memo(({ id, data, selected }: NodeProps) => {
  const { editing, draft, setDraft, startEdit, commit, onKeyDown } = useEditableLabel(id, data.label as string);
  return (
    <div onDoubleClick={startEdit} style={{ ...baseStyle(selected), width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 11 }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {editing
        ? <EditInput draft={draft} setDraft={setDraft} onKeyDown={onKeyDown} onBlur={commit} />
        : <span style={{ padding: '0 6px' }}>{data.label as string}</span>}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});
CircleNode.displayName = 'CircleNode';

// ==================== State node ====================

const StateNodeComp = memo(({ id, data, selected }: NodeProps) => {
  const { editing, draft, setDraft, startEdit, commit, onKeyDown } = useEditableLabel(id, data.label as string);
  return (
    <div onDoubleClick={startEdit} style={{ ...baseStyle(selected), padding: '8px 18px', borderRadius: 20, minWidth: 90, textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {editing
        ? <EditInput draft={draft} setDraft={setDraft} onKeyDown={onKeyDown} onBlur={commit} />
        : <span>{data.label as string}</span>}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});
StateNodeComp.displayName = 'StateNodeComp';

// ==================== Start/End node (filled circle) ====================

const StartEndNode = memo(({ selected }: NodeProps) => (
  <div style={{ width: 28, height: 28, borderRadius: '50%', background: selected ? '#6366f1' : 'var(--text-secondary)', border: `2px solid ${selected ? '#818cf8' : 'var(--border-high)'}`, boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none' }}>
    <Handle type="target" position={Position.Top} style={{ ...handleStyle, opacity: 0.7 }} />
    <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, opacity: 0.7 }} />
  </div>
));
StartEndNode.displayName = 'StartEndNode';

// ==================== Node type registries ====================

const FLOW_NODE_TYPES: NodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
  terminal: TerminalNode,
  circle: CircleNode,
  io: ProcessNode, // IO reuses process shape
};

const STATE_NODE_TYPES: NodeTypes = {
  state: StateNodeComp,
  startend: StartEndNode,
};

const DEFAULT_EDGE = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6366f1' },
  style: { stroke: '#6366f1', strokeWidth: 1.5 },
  labelStyle: { fontSize: 11, fill: 'var(--text-secondary)' },
  labelBgStyle: { fill: 'var(--bg-panel)', fillOpacity: 0.85 },
};

// ==================== Converter helpers ====================

function fcNodesToRF(nodes: FCNode[]): Node[] {
  return nodes.map(n => ({
    id: n.id,
    type: n.shape,
    position: { x: (n as FCNode & { x?: number }).x ?? 0, y: (n as FCNode & { y?: number }).y ?? 0 },
    data: { label: n.label, shape: n.shape },
  }));
}

function fcEdgesToRF(edges: FCEdge[]): Edge[] {
  return edges.map(e => ({
    ...DEFAULT_EDGE,
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
  }));
}

function rfToFCNodes(nodes: Node[]): FCNode[] {
  return nodes.map(n => ({ id: n.id, label: n.data.label as string, shape: (n.data.shape as NodeShape) ?? 'process' }));
}

function rfToFCEdges(edges: Edge[]): FCEdge[] {
  return edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label as string | undefined }));
}

function stateNodesToRF(nodes: StateNode[]): Node[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: n.isSpecial ? 'startend' : 'state',
    position: { x: 0, y: i * 130 },
    data: { label: n.label },
  }));
}

function rfToStateNodes(nodes: Node[]): StateNode[] {
  return nodes.map(n => ({ id: n.id, label: n.data.label as string, isSpecial: n.type === 'startend' }));
}

function rfToStateTransitions(edges: Edge[]): StateTransition[] {
  return edges.map(e => ({ id: e.id, from: e.source, to: e.target, label: e.label as string | undefined }));
}

// ==================== FlowVisualEditor ====================

export type FlowVisualDiagramType = 'flowchart' | 'state';

interface Props {
  code: string;
  diagramType: FlowVisualDiagramType;
  onChange: (code: string) => void;
}

let nodeCounter = 0;
function newNodeId() { return `N${++nodeCounter}`; }

const DIRECTIONS: FlowDirection[] = ['TD', 'LR', 'BT', 'RL'];
const DIRECTIONS_LABELS: Record<FlowDirection, string> = {
  'TD': 'De arriba hacia abajo',
  'LR': 'De izquierda a derecha',
  'BT': 'De abajo hacia arriba',
  'RL': 'De derecha a izquierda',
};

export function FlowVisualEditor({ code, diagramType, onChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [direction, setDirection] = useState<FlowDirection>('TD');
  const skipSerialize = useRef(false);

  // Parse on mount
  useEffect(() => {
    skipSerialize.current = true;
    if (diagramType === 'flowchart') {
      const parsed = parseFlowchart(code);
      setDirection(parsed.direction);
      setNodes(fcNodesToRF(parsed.nodes as (FCNode & { x?: number; y?: number })[]) as never);
      setEdges(fcEdgesToRF(parsed.edges) as never);
    } else {
      const parsed = parseStateDiagram(code);
      setNodes(stateNodesToRF(parsed.states) as never);
      setEdges(parsed.transitions.map(t => ({
        ...DEFAULT_EDGE,
        id: t.id,
        source: t.from,
        target: t.to,
        label: t.label,
      })) as never);
    }
    setTimeout(() => { skipSerialize.current = false; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Serialize on changes
  useEffect(() => {
    if (skipSerialize.current) return;
    if (diagramType === 'flowchart') {
      const parsed: ParsedFlowchart = { direction, nodes: rfToFCNodes(nodes), edges: rfToFCEdges(edges) };
      onChange(serializeFlowchart(parsed));
    } else {
      onChange(serializeStateDiagram({ states: rfToStateNodes(nodes), transitions: rfToStateTransitions(edges) }));
    }
  }, [nodes, edges, direction, diagramType, onChange]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, ...DEFAULT_EDGE, id: `e-${Date.now()}` }, eds) as never);
  }, [setEdges]);

  const addNode = (shape: NodeShape | 'state' | 'startend') => {
    const id = newNodeId();
    const isState = diagramType === 'state';
    const newNode: Node = {
      id,
      type: isState ? (shape === 'startend' ? 'startend' : 'state') : (shape as string),
      position: { x: Math.random() * 280 + 60, y: Math.random() * 180 + 60 },
      data: { label: isState ? (shape === 'startend' ? '●' : id) : id, shape },
    };
    setNodes(nds => [...nds, newNode] as never);
  };

  const deleteSelected = () => {
    setNodes(nds => (nds as Node[]).filter(n => !n.selected) as never);
    setEdges(eds => (eds as Edge[]).filter(e => !e.selected) as never);
  };

  const nodeTypes = diagramType === 'flowchart' ? FLOW_NODE_TYPES : STATE_NODE_TYPES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0, background: 'var(--bg-panel)' }}>
        {diagramType === 'flowchart' ? (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-hint)', marginRight: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Añadir:</span>
            {([
              ['process', Square, 'Proceso'],
              ['decision', Diamond, 'Decisión'],
              ['terminal', Hexagon, 'Terminal'],
              ['circle', CircleDot, 'Círculo'],
            ] as [NodeShape, React.ComponentType<{ size?: number }>, string][]).map(([shape, Icon, label]) => (
              <button key={shape} onClick={() => addNode(shape)} title={label}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
                <Icon size={12} />{label}
              </button>
            ))}
            <span style={{ margin: '0 4px', color: 'var(--border-high)' }}>|</span>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Dirección:</span>
            <select value={direction} onChange={e => setDirection(e.target.value as FlowDirection)}
              style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer' }}>
              {DIRECTIONS.map(d => <option key={d} value={d}>{DIRECTIONS_LABELS[d]}</option>)}
            </select>
          </>
        ) : (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-hint)', marginRight: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Añadir:</span>
            <button onClick={() => addNode('state')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
              <Square size={12} />Estado
            </button>
            <button onClick={() => addNode('startend')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
              <CircleDot size={12} />Inicio/Fin
            </button>
          </>
        )}
        <span style={{ margin: '0 4px', color: 'var(--border-high)' }}>|</span>
        <button onClick={deleteSelected}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>
          <Trash2 size={12} />Eliminar selección
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-hint)' }}>Doble clic para editar etiqueta · Arrastra handle para conectar</span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Delete', 'Backspace']}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          style={{ background: 'var(--bg-base)' }}
        >
          <Controls style={{ button: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' } } as React.CSSProperties} />
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} size={1} />
        </ReactFlow>
      </div>

      {/* Help bar */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-hint)' }}><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>Del</kbd> Eliminar · <kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>Scroll</kbd> Zoom · Arrastra fondo para mover</span>
      </div>
    </div>
  );
}
