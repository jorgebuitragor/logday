export function parseDailyFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const parts = content.split(/^## (\d{4}-\d{2}-\d{2})\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    // Eliminar separadores "---" que quedan al final de cada bloque
    const raw = (parts[i + 1] || '').trim().replace(/(\n*---\s*)+$/, '').trim();
    entries[parts[i].trim()] = raw;
  }
  return entries;
}

export function serializeDailyFile(entries: Record<string, string>, yearMonth: string): string {
  const sorted = Object.keys(entries).sort().reverse();
  const header = `# ${yearMonth}\n\n`;
  if (sorted.length === 0) return header;
  return header + sorted.map((d) => `## ${d}\n\n${entries[d]}`).join('\n\n---\n\n') + '\n';
}
