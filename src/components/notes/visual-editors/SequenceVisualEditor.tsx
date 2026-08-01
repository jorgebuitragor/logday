import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  ARROW_OPTIONS,
  parseSequenceDiagram,
  serializeSequenceDiagram,
  type ArrowType,
  type SeqMessage,
  type SeqParticipant,
} from './diagramParsers';

interface Props {
  code: string;
  onChange: (code: string) => void;
}

function uid() { return `id_${Math.random().toString(36).slice(2, 8)}`; }

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-hint)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 600,
  marginBottom: 6,
};

const cellStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle = (color = 'var(--text-hint)'): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color, cursor: 'pointer', flexShrink: 0,
});

export function SequenceVisualEditor({ code, onChange }: Props) {
  const [participants, setParticipants] = useState<SeqParticipant[]>([]);
  const [messages, setMessages] = useState<SeqMessage[]>([]);
  const [autonumber, setAutonumber] = useState(false);

  // Parse on mount
  useEffect(() => {
    const parsed = parseSequenceDiagram(code);
    setParticipants(parsed.participants);
    setMessages(parsed.messages);
    setAutonumber(parsed.autonumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Serialize on changes
  useEffect(() => {
    onChange(serializeSequenceDiagram({ autonumber, participants, messages }));
  }, [participants, messages, autonumber, onChange]);

  // ---- Participants ----
  const addParticipant = () => {
    const alias = `P${participants.length + 1}`;
    setParticipants(ps => [...ps, { id: uid(), alias, label: alias }]);
  };
  const removeParticipant = (id: string) => {
    const p = participants.find(p => p.id === id);
    if (!p) return;
    setParticipants(ps => ps.filter(p => p.id !== id));
    setMessages(ms => ms.filter(m => m.from !== p.alias && m.to !== p.alias));
  };
  const updateParticipant = (id: string, field: 'alias' | 'label', value: string) => {
    const old = participants.find(p => p.id === id);
    setParticipants(ps => ps.map(p => p.id === id ? { ...p, [field]: value } : p));
    if (field === 'alias' && old) {
      setMessages(ms => ms.map(m => ({
        ...m,
        from: m.from === old.alias ? value : m.from,
        to: m.to === old.alias ? value : m.to,
      })));
    }
  };
  const moveParticipant = (id: string, dir: -1 | 1) => {
    const idx = participants.findIndex(p => p.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= participants.length) return;
    const copy = [...participants];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setParticipants(copy);
  };

  // ---- Messages ----
  const addMessage = () => {
    const from = participants[0]?.alias ?? 'A';
    const to = participants[1]?.alias ?? 'B';
    setMessages(ms => [...ms, { id: uid(), from, to, arrow: '->>', label: 'Mensaje' }]);
  };
  const removeMessage = (id: string) => setMessages(ms => ms.filter(m => m.id !== id));
  const updateMessage = <K extends keyof SeqMessage>(id: string, field: K, value: SeqMessage[K]) => {
    setMessages(ms => ms.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const moveMessage = (id: string, dir: -1 | 1) => {
    const idx = messages.findIndex(m => m.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= messages.length) return;
    const copy = [...messages];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setMessages(copy);
  };

  const aliasOptions = participants.map(p => p.alias);

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
        gap: 20,
      }}
    >

      {/* Autonumber toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={autonumber} onChange={e => setAutonumber(e.target.checked)} />
          Numeración automática
        </label>
      </div>

      {/* Participants */}
      <section>
        <div style={labelStyle}>Participantes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {participants.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={p.alias} onChange={e => updateParticipant(p.id, 'alias', e.target.value)}
                placeholder="Alias" style={{ ...cellStyle, width: 90 }} />
              <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>como</span>
              <input value={p.label} onChange={e => updateParticipant(p.id, 'label', e.target.value)}
                placeholder="Etiqueta" style={{ ...cellStyle, flex: 1 }} />
              <button onClick={() => moveParticipant(p.id, -1)} disabled={i === 0} style={btnStyle()}>
                <ArrowUp size={12} />
              </button>
              <button onClick={() => moveParticipant(p.id, 1)} disabled={i === participants.length - 1} style={btnStyle()}>
                <ArrowDown size={12} />
              </button>
              <button onClick={() => removeParticipant(p.id)} style={btnStyle('#ef4444')}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button onClick={addParticipant} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}>
            <Plus size={12} />Añadir participante
          </button>
        </div>
      </section>

      {/* Messages */}
      <section>
        <div style={labelStyle}>Mensajes</div>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>Sin mensajes. Añade participantes primero.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={m.from} onChange={e => updateMessage(m.id, 'from', e.target.value)} style={{ ...cellStyle, width: 90 }}>
                {aliasOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={m.arrow} onChange={e => updateMessage(m.id, 'arrow', e.target.value as ArrowType)} style={{ ...cellStyle, width: 160 }}>
                {ARROW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={m.to} onChange={e => updateMessage(m.id, 'to', e.target.value)} style={{ ...cellStyle, width: 90 }}>
                {aliasOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>:</span>
              <input value={m.label} onChange={e => updateMessage(m.id, 'label', e.target.value)}
                placeholder="Etiqueta del mensaje" style={{ ...cellStyle, flex: 1, minWidth: 100 }} />
              <button onClick={() => moveMessage(m.id, -1)} disabled={i === 0} style={btnStyle()}>
                <ArrowUp size={12} />
              </button>
              <button onClick={() => moveMessage(m.id, 1)} disabled={i === messages.length - 1} style={btnStyle()}>
                <ArrowDown size={12} />
              </button>
              <button onClick={() => removeMessage(m.id)} style={btnStyle('#ef4444')}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button onClick={addMessage} disabled={participants.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-hint)', cursor: participants.length === 0 ? 'not-allowed' : 'pointer', fontSize: 12, alignSelf: 'flex-start', opacity: participants.length === 0 ? 0.5 : 1 }}>
            <Plus size={12} />Añadir mensaje
          </button>
        </div>
      </section>
    </div>
  );
}
