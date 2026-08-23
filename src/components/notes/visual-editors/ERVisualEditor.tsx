import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CARD_OPTIONS,
  parseERDiagram,
  serializeERDiagram,
  type ERAttribute,
  type EREntity,
  type ERRelationship,
} from './diagramParsers';

interface Props {
  code: string;
  onChange: (code: string) => void;
}

function uid() { return `id_${Math.random().toString(36).slice(2, 8)}`; }

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-hint)', textTransform: 'uppercase',
  letterSpacing: '0.12em', fontWeight: 600, marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const smallBtn = (color = 'var(--text-hint)'): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)',
  background: 'var(--bg-elevated)', color, cursor: 'pointer', flexShrink: 0,
});

export function ERVisualEditor({ code, onChange }: Props) {
  const [entities, setEntities] = useState<EREntity[]>([]);
  const [relationships, setRelationships] = useState<ERRelationship[]>([]);

  // Parse on mount
  useEffect(() => {
    const parsed = parseERDiagram(code);
    setEntities(parsed.entities);
    setRelationships(parsed.relationships);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Serialize on changes
  useEffect(() => {
    onChange(serializeERDiagram({ entities, relationships }));
  }, [entities, relationships, onChange]);

  // ---- Entities ----
  const addEntity = () => {
    const name = `ENTIDAD_${entities.length + 1}`;
    setEntities(es => [...es, { id: uid(), name, attributes: [] }]);
  };
  const removeEntity = (id: string) => {
    const e = entities.find(e => e.id === id);
    if (!e) return;
    setEntities(es => es.filter(e => e.id !== id));
    setRelationships(rs => rs.filter(r => r.entity1 !== e.name && r.entity2 !== e.name));
  };
  const updateEntityName = (id: string, name: string) => {
    const old = entities.find(e => e.id === id);
    setEntities(es => es.map(e => e.id === id ? { ...e, name } : e));
    if (old) {
      setRelationships(rs => rs.map(r => ({
        ...r,
        entity1: r.entity1 === old.name ? name : r.entity1,
        entity2: r.entity2 === old.name ? name : r.entity2,
      })));
    }
  };

  // ---- Attributes ----
  const addAttribute = (entityId: string) => {
    const attr: ERAttribute = { id: uid(), type: 'string', name: 'campo' };
    setEntities(es => es.map(e => e.id === entityId ? { ...e, attributes: [...e.attributes, attr] } : e));
  };
  const removeAttribute = (entityId: string, attrId: string) => {
    setEntities(es => es.map(e => e.id === entityId
      ? { ...e, attributes: e.attributes.filter(a => a.id !== attrId) }
      : e));
  };
  const updateAttribute = (entityId: string, attrId: string, field: 'type' | 'name', value: string) => {
    setEntities(es => es.map(e => e.id === entityId
      ? { ...e, attributes: e.attributes.map(a => a.id === attrId ? { ...a, [field]: value } : a) }
      : e));
  };

  // ---- Relationships ----
  const entityNames = entities.map(e => e.name);
  const addRelationship = () => {
    if (entityNames.length < 2) return;
    setRelationships(rs => [...rs, {
      id: uid(), entity1: entityNames[0], card1: '||', card2: 'o{', entity2: entityNames[1], label: 'tiene',
    }]);
  };
  const removeRelationship = (id: string) => setRelationships(rs => rs.filter(r => r.id !== id));
  const updateRelationship = <K extends keyof ERRelationship>(id: string, field: K, value: ERRelationship[K]) => {
    setRelationships(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        boxSizing: 'border-box',
        scrollbarGutter: 'stable',
        padding: 16,
        gap: 24,
      }}
    >

      {/* Entities */}
      <section>
        <div style={labelStyle}>Entidades</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entities.map(entity => (
            <div key={entity.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Entity header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
                <input value={entity.name} onChange={e => updateEntityName(entity.id, e.target.value)}
                  style={{ ...inputStyle, fontWeight: 600, fontSize: 13 }} />
                <button onClick={() => removeEntity(entity.id)} style={smallBtn('#ef4444')}>
                  <Trash2 size={11} />
                </button>
              </div>
              {/* Attributes */}
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-elevated)' }}>
                {entity.attributes.map(attr => (
                  <div key={attr.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input value={attr.type} onChange={e => updateAttribute(entity.id, attr.id, 'type', e.target.value)}
                      placeholder="tipo" style={{ ...inputStyle, width: 90, color: 'var(--text-hint)', fontStyle: 'italic' }} />
                    <input value={attr.name} onChange={e => updateAttribute(entity.id, attr.id, 'name', e.target.value)}
                      placeholder="nombre" style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => removeAttribute(entity.id, attr.id)} style={smallBtn('#ef4444')}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addAttribute(entity.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 11, alignSelf: 'flex-start' }}>
                  <Plus size={10} />Atributo
                </button>
              </div>
            </div>
          ))}
          <button onClick={addEntity}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}>
            <Plus size={12} />Añadir entidad
          </button>
        </div>
      </section>

      {/* Relationships */}
      <section>
        <div style={labelStyle}>Relaciones</div>
        {relationships.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>Sin relaciones. Necesitas al menos 2 entidades.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {relationships.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)' }}>
              {/* Entity 1 */}
              <select value={r.entity1} onChange={e => updateRelationship(r.id, 'entity1', e.target.value)} style={{ ...inputStyle, width: 110 }}>
                {entityNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {/* Cardinality 1 */}
              <select value={r.card1} onChange={e => updateRelationship(r.id, 'card1', e.target.value)} style={{ ...inputStyle, width: 110 }}>
                {CARD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>--</span>
              {/* Cardinality 2 */}
              <select value={r.card2} onChange={e => updateRelationship(r.id, 'card2', e.target.value)} style={{ ...inputStyle, width: 110 }}>
                {CARD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {/* Entity 2 */}
              <select value={r.entity2} onChange={e => updateRelationship(r.id, 'entity2', e.target.value)} style={{ ...inputStyle, width: 110 }}>
                {entityNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {/* Label */}
              <span style={{ fontSize: 11, color: 'var(--text-hint)', flexShrink: 0 }}>:</span>
              <input value={r.label} onChange={e => updateRelationship(r.id, 'label', e.target.value)}
                placeholder="etiqueta" style={{ ...inputStyle, flex: 1, minWidth: 80 }} />
              <button onClick={() => removeRelationship(r.id)} style={smallBtn('#ef4444')}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <button onClick={addRelationship} disabled={entityNames.length < 2}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-hint)', cursor: entityNames.length < 2 ? 'not-allowed' : 'pointer', fontSize: 12, alignSelf: 'flex-start', opacity: entityNames.length < 2 ? 0.5 : 1 }}>
            <Plus size={12} />Añadir relación
          </button>
        </div>
      </section>
    </div>
  );
}
