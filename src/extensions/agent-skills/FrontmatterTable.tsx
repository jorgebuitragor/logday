// El frontmatter del SKILL.md en una tabla (detalle y vista previa).
import { frontmatterValue } from './skillMd';
import type { Tr } from './text';

export function FrontmatterTable({ fm, tr }: { fm: Record<string, unknown>; tr: Tr }) {
  const rows = Object.entries(fm);
  if (!rows.length) return null;
  return (
    <table className="w-full border-collapse text-xs" aria-label={tr('frontmatterLabel')}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-[var(--border)] align-top last:border-0">
            <th scope="row" className="w-40 py-1.5 pr-3 text-left font-mono font-normal text-[var(--text-hint)]">{k}</th>
            <td className="whitespace-pre-wrap break-words py-1.5 text-[var(--text-primary)]">{frontmatterValue(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

