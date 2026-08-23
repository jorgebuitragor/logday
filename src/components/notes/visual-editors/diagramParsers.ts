// =========================================================
// Parsers and serializers for all supported Mermaid diagram types
// =========================================================

// ==================== FLOWCHART ====================

export type FlowDirection = 'TD' | 'LR' | 'BT' | 'RL';
export type NodeShape = 'process' | 'decision' | 'terminal' | 'circle' | 'io';

export interface FCNode { id: string; label: string; shape: NodeShape; }
export interface FCEdge { id: string; source: string; target: string; label?: string; }
export interface ParsedFlowchart { direction: FlowDirection; nodes: FCNode[]; edges: FCEdge[]; }

function parseInlineNodeDef(rest: string): { label: string; shape: NodeShape; len: number } | null {
  const patterns: [RegExp, NodeShape][] = [
    [/^\(\[(.+?)\]\)/, 'terminal'],
    [/^\(\((.+?)\)\)/, 'circle'],
    [/^\{(.+?)\}/, 'decision'],
    [/^\[\/(.+?)\/\]/, 'io'],
    [/^\[\\(.+?)\\\]/, 'io'],
    [/^\[\[(.+?)\]\]/, 'process'],
    [/^\[(.+?)\]/, 'process'],
    [/^\((.+?)\)/, 'terminal'],
  ];
  for (const [re, shape] of patterns) {
    const m = rest.match(re);
    if (m) return { label: m[1], shape, len: m[0].length };
  }
  return null;
}

export function parseFlowchart(code: string): ParsedFlowchart {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const nodeMap = new Map<string, { label: string; shape: NodeShape }>();
  const edges: FCEdge[] = [];
  let eidx = 0;

  const firstLine = lines[0] ?? '';
  const dirMatch = firstLine.match(/^flowchart\s+(TD|TB|LR|RL|BT)/i);
  const direction = ((dirMatch?.[1]?.toUpperCase()) as FlowDirection) ?? 'TD';

  const ensure = (id: string, label?: string, shape?: NodeShape) => {
    const cur = nodeMap.get(id);
    nodeMap.set(id, { label: label ?? cur?.label ?? id, shape: shape ?? cur?.shape ?? 'process' });
  };

  for (const line of lines.slice(1)) {
    if (line === 'end' || line.startsWith('subgraph')) continue;
    const idM = line.match(/^([A-Za-z0-9_]+)/);
    if (!idM) continue;
    const srcId = idM[1];
    let rest = line.slice(srcId.length);
    const srcDef = parseInlineNodeDef(rest);
    if (srcDef) { rest = rest.slice(srcDef.len); ensure(srcId, srcDef.label, srcDef.shape); }
    else ensure(srcId);
    rest = rest.trim();

    // Edge pattern: --> or --- etc., optionally |label|
    const edgeM = rest.match(/^(-{1,3}>?|={1,3}>?|-\.->?|\.{2,}>?)(?:\|([^|]*)\|)?\s*(.*)/);
    if (!edgeM) continue;
    const edgeLabel = edgeM[2]?.trim() || undefined;
    const tgtStr = edgeM[3]?.trim() ?? '';
    const tgtIdM = tgtStr.match(/^([A-Za-z0-9_]+)/);
    if (!tgtIdM) continue;
    const tgtId = tgtIdM[1];
    const tgtDef = parseInlineNodeDef(tgtStr.slice(tgtId.length));
    if (tgtDef) ensure(tgtId, tgtDef.label, tgtDef.shape);
    else ensure(tgtId);
    edges.push({ id: `e${eidx++}`, source: srcId, target: tgtId, label: edgeLabel });
  }

  // BFS layout for node positions (used by FlowVisualEditor)
  const ids = [...nodeMap.keys()];
  const childMap = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  ids.forEach(id => { childMap.set(id, []); inDeg.set(id, 0); });
  edges.forEach(e => {
    childMap.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  const roots = ids.filter(id => (inDeg.get(id) ?? 0) === 0);
  if (!roots.length && ids.length) roots.push(ids[0]);
  const level = new Map<string, number>();
  const bfsQ: [string, number][] = roots.map(id => [id, 0]);
  const seen = new Set<string>();
  while (bfsQ.length) {
    const [id, l] = bfsQ.shift()!;
    if (seen.has(id)) continue;
    seen.add(id); level.set(id, l);
    childMap.get(id)?.forEach(c => { if (!seen.has(c)) bfsQ.push([c, l + 1]); });
  }
  ids.forEach(id => { if (!level.has(id)) level.set(id, 0); });
  const byLvl = new Map<number, string[]>();
  level.forEach((l, id) => { if (!byLvl.has(l)) byLvl.set(l, []); byLvl.get(l)!.push(id); });
  const isV = direction === 'TD' || direction === 'BT';
  const posMap = new Map<string, { x: number; y: number }>();
  byLvl.forEach((idsL, l) => {
    idsL.forEach((id, i) => {
      const off = i - (idsL.length - 1) / 2;
      posMap.set(id, isV ? { x: off * 200, y: l * 140 } : { x: l * 230, y: off * 130 });
    });
  });

  const nodes: FCNode[] = ids.map(id => ({
    id,
    ...nodeMap.get(id)!,
    x: posMap.get(id)?.x ?? 0,
    y: posMap.get(id)?.y ?? 0,
  } as FCNode & { x: number; y: number }));

  return { direction, nodes, edges };
}

const SO: Record<NodeShape, string> = { process: '[', decision: '{', terminal: '([', circle: '((', io: '[/' };
const SC: Record<NodeShape, string> = { process: ']', decision: '}', terminal: '])', circle: '))', io: '/]' };

export function serializeFlowchart({ direction, nodes, edges }: ParsedFlowchart): string {
  const nodeDefs = nodes.map(n => `  ${n.id}${SO[n.shape]}${n.label}${SC[n.shape]}`);
  const edgeDefs = edges.map(e => `  ${e.source} -->${e.label ? `|${e.label}|` : ''} ${e.target}`);
  return `flowchart ${direction}\n${[...nodeDefs, ...edgeDefs].join('\n')}`;
}

// ==================== STATE DIAGRAM ====================

export interface StateNode {
  id: string;       // mermaid id, '[*]' is allowed
  label: string;
  isSpecial?: boolean; // true for [*]
}
export interface StateTransition { id: string; from: string; to: string; label?: string; }
export interface ParsedStateDiagram { states: StateNode[]; transitions: StateTransition[]; }

export function parseStateDiagram(code: string): ParsedStateDiagram {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%') && !l.match(/^stateDiagram/));
  const stateMap = new Map<string, StateNode>();
  const transitions: StateTransition[] = [];
  let idx = 0;

  const addState = (id: string) => {
    if (!stateMap.has(id)) {
      stateMap.set(id, { id, label: id === '[*]' ? '●' : id, isSpecial: id === '[*]' });
    }
  };

  for (const line of lines) {
    // state "Label" as ID
    const saMatch = line.match(/^state\s+"(.+?)"\s+as\s+(\w+)/);
    if (saMatch) { stateMap.set(saMatch[2], { id: saMatch[2], label: saMatch[1] }); continue; }

    // Transition: A --> B or A --> B : label
    const tMatch = line.match(/^(\[?\*?\]?|\w+)\s*-->\s*(\[?\*?\]?|\w+)(?:\s*:\s*(.+))?$/);
    if (tMatch) {
      const from = tMatch[1].trim();
      const to = tMatch[2].trim();
      const label = tMatch[3]?.trim();
      addState(from); addState(to);
      transitions.push({ id: `t${idx++}`, from, to, label });
    }
  }

  return { states: [...stateMap.values()], transitions };
}

export function serializeStateDiagram({ states, transitions }: ParsedStateDiagram): string {
  const lines = ['stateDiagram-v2'];
  states.forEach(s => {
    if (!s.isSpecial && s.label !== s.id) lines.push(`  state "${s.label}" as ${s.id}`);
  });
  transitions.forEach(t => {
    lines.push(`  ${t.from} --> ${t.to}${t.label ? ` : ${t.label}` : ''}`);
  });
  return lines.join('\n');
}

// ==================== SEQUENCE DIAGRAM ====================

export type ArrowType = '->>' | '-->>' | '->' | '-->' | '-x' | '--x';
export const ARROW_OPTIONS: { value: ArrowType; label: string }[] = [
  { value: '->>', label: '->> (síncrono)' },
  { value: '-->>', label: '-->> (respuesta)' },
  { value: '->', label: '-> (línea)' },
  { value: '-->', label: '--> (línea punteada)' },
  { value: '-x', label: '-x (asíncrono)' },
  { value: '--x', label: '--x (asíncrono punteado)' },
];

export interface SeqParticipant { id: string; alias: string; label: string; }
export interface SeqMessage { id: string; from: string; to: string; arrow: ArrowType; label: string; }
export interface ParsedSequence { autonumber: boolean; participants: SeqParticipant[]; messages: SeqMessage[]; }

export function parseSequenceDiagram(code: string): ParsedSequence {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%') && !l.match(/^sequenceDiagram/));
  let autonumber = false;
  const participantMap = new Map<string, SeqParticipant>();
  const messages: SeqMessage[] = [];
  let idx = 0;

  const ensureParticipant = (alias: string) => {
    if (!participantMap.has(alias)) {
      participantMap.set(alias, { id: `p${participantMap.size}`, alias, label: alias });
    }
  };

  for (const line of lines) {
    if (line === 'autonumber') { autonumber = true; continue; }

    // participant A as Label  or  actor A as Label
    const pMatch = line.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/);
    if (pMatch) {
      const alias = pMatch[1]; const label = pMatch[2] ?? alias;
      participantMap.set(alias, { id: `p${participantMap.size}`, alias, label });
      continue;
    }

    // Message: A->>B: label  or  A ->> B : label
    const mMatch = line.match(/^(\w+)\s*(-{1,2}>>?|->|--x|-x)\s*(\w+)\s*:\s*(.*)$/);
    if (mMatch) {
      const from = mMatch[1]; const arrow = mMatch[2] as ArrowType; const to = mMatch[3]; const label = mMatch[4].trim();
      ensureParticipant(from); ensureParticipant(to);
      messages.push({ id: `m${idx++}`, from, to, arrow, label });
    }
  }

  // If no explicit participants, derive from messages
  const participants = [...participantMap.values()];
  return { autonumber, participants, messages };
}

export function serializeSequenceDiagram({ autonumber, participants, messages }: ParsedSequence): string {
  const lines = ['sequenceDiagram'];
  if (autonumber) lines.push('  autonumber');
  participants.forEach(p => {
    if (p.label !== p.alias) lines.push(`  participant ${p.alias} as ${p.label}`);
    else lines.push(`  participant ${p.alias}`);
  });
  messages.forEach(m => {
    lines.push(`  ${m.from}${m.arrow}${m.to}: ${m.label}`);
  });
  return lines.join('\n');
}

// ==================== ER DIAGRAM ====================

export type ERCard = '||' | 'o|' | '}|' | 'o{' | '}o' | '||' ;
export const CARD_OPTIONS = [
  { value: '||', label: '|| exactamente uno' },
  { value: 'o|', label: 'o| cero o uno' },
  { value: '}|', label: '}| uno o más' },
  { value: 'o{', label: 'o{ cero o más' },
  { value: '}o', label: '}o cero o más (alt)' },
];

export interface ERAttribute { id: string; type: string; name: string; }
export interface EREntity { id: string; name: string; attributes: ERAttribute[]; }
export interface ERRelationship { id: string; entity1: string; card1: string; card2: string; entity2: string; label: string; }
export interface ParsedER { entities: EREntity[]; relationships: ERRelationship[]; }

export function parseERDiagram(code: string): ParsedER {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%') && l !== 'erDiagram');
  const entityMap = new Map<string, EREntity>();
  const relationships: ERRelationship[] = [];
  let idx = 0;
  let currentEntity: EREntity | null = null;

  const ensureEntity = (name: string) => {
    if (!entityMap.has(name)) entityMap.set(name, { id: name, name, attributes: [] });
    return entityMap.get(name)!;
  };

  for (const line of lines) {
    // Relationship: ENTITY1 ||--o{ ENTITY2 : "label"
    const relMatch = line.match(/^(\w+)\s+(\|{1,2}|o\||\}o|\}\||\|o)\s*-{2}\s*(\|{1,2}|o\{|\}o|\}\{|o\|)\s+(\w+)\s*:\s*"?([^"]*)"?$/);
    if (relMatch) {
      const [, e1, c1, c2, e2, label] = relMatch;
      ensureEntity(e1); ensureEntity(e2);
      relationships.push({ id: `r${idx++}`, entity1: e1, card1: c1, card2: c2, entity2: e2, label: label.trim() });
      currentEntity = null;
      continue;
    }

    // Entity block start: ENTITY {
    const entityStart = line.match(/^(\w+)\s*\{$/);
    if (entityStart) { currentEntity = ensureEntity(entityStart[1]); continue; }

    // Entity block end
    if (line === '}') { currentEntity = null; continue; }

    // Attribute inside entity: type name
    if (currentEntity) {
      const attrMatch = line.match(/^(\w+)\s+(\w+)/);
      if (attrMatch) {
        currentEntity.attributes.push({ id: `${currentEntity.id}_${attrMatch[2]}`, type: attrMatch[1], name: attrMatch[2] });
      }
    }
  }

  return { entities: [...entityMap.values()], relationships };
}

export function serializeERDiagram({ entities, relationships }: ParsedER): string {
  const lines = ['erDiagram'];
  relationships.forEach(r => {
    lines.push(`  ${r.entity1} ${r.card1}--${r.card2} ${r.entity2} : "${r.label}"`);
  });
  entities.forEach(e => {
    if (e.attributes.length > 0) {
      lines.push(`  ${e.name} {`);
      e.attributes.forEach(a => lines.push(`    ${a.type} ${a.name}`));
      lines.push(`  }`);
    }
  });
  return lines.join('\n');
}
