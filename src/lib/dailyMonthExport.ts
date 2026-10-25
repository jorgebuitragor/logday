import jsPDF from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { fs } from './invoke';

function buildDailyMonthPdfBase64(label: string, entries: [string, string][]): string {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(label, margin, y);
  y += 10;
  for (const [date, content] of entries) {
    if (y > 270) { pdf.addPage(); y = margin; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(date, margin, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const lines = content.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const wrapped = pdf.splitTextToSize(line, maxWidth);
      if (y + wrapped.length * 4.5 > 280) { pdf.addPage(); y = margin; }
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 4.5;
    }
    y += 5;
  }
  return pdf.output('datauristring').split(',')[1];
}

/**
 * Exporta las entradas de dailys de un mes a PDF/Markdown/texto plano,
 * pidiendo la ruta de guardado al usuario. Retorna `false` si el usuario
 * canceló el diálogo de guardado (no se escribió ningún archivo).
 */
export async function exportDailyMonthEntries(
  ym: string,
  label: string,
  entries: [string, string][],
  format: 'pdf' | 'md' | 'txt',
): Promise<boolean> {
  if (format === 'pdf') {
    const path = await save({
      defaultPath: `dailys-${ym}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!path) return false;
    await fs.writeBinary(path, buildDailyMonthPdfBase64(label, entries));
    return true;
  }

  const path = await save({
    defaultPath: `dailys-${ym}.${format}`,
    filters: [{ name: format === 'md' ? 'Markdown' : 'Plain text', extensions: [format] }],
  });
  if (!path) return false;
  const ismd = format === 'md';
  const header = ismd ? `# ${label}\n\n` : `${label}\n${'='.repeat(label.length)}\n\n`;
  const body = entries
    .map(([date, content]) =>
      ismd ? `## ${date}\n\n${content}` : `${date}\n${'-'.repeat(date.length)}\n${content}`
    )
    .join('\n\n---\n\n');
  await fs.writeFile(path, header + body + '\n');
  return true;
}
