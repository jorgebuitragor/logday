import { save } from '@tauri-apps/plugin-dialog';
import { fs } from './invoke';
import { Note } from '../types';
import jsPDF from 'jspdf';
import { renderMermaidPngDataUrl } from './mermaid';

export async function exportNote(note: Note, format: 'md' | 'txt' | 'pdf'): Promise<void> {
  const safeName = (note.title || 'nota').replace(/[/\\?%*:|"<>]/g, '-');

  if (format === 'pdf') {
    const path = await save({
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!path) return;

    const pdf = await buildPdf(note);
    const base64 = pdf.output('datauristring').split(',')[1];
    await fs.writeBinary(path, base64);
    return;
  }

  const path = await save({
    defaultPath: `${safeName}.${format}`,
    filters: [
      {
        name: format === 'md' ? 'Markdown' : 'Texto plano',
        extensions: [format],
      },
    ],
  });
  if (!path) return;

  const text =
    format === 'md'
      ? `# ${note.title}\n\n${note.content}`
      : `${note.title}\n\n${note.content}`;

  await fs.writeFile(path, text);
}

// ── Inline span types ────────────────────────────────────────────────────────

interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  href?: string;
}

/** Parses a markdown/HTML line into styled inline spans */
function parseInlineSpans(raw: string): InlineSpan[] {
  // Convert HTML tags to control chars to simplify parsing
  let text = raw
    .replace(/<u>([\s\S]*?)<\/u>/gi, '\x02$1\x02')
    .replace(/<s>([\s\S]*?)<\/s>/gi, '\x04$1\x04')
    .replace(/<mark>([\s\S]*?)<\/mark>/gi, '$1')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<[^>]+>/g, '');

  const spans: InlineSpan[] = [];
  // Token regex — longer delimiters first
  const TOKEN_RE =
    /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|==[\s\S]+?==|~~[\s\S]+?~~|`[^`]+`|\x02[\s\S]*?\x02|\x04[\s\S]*?\x04|\[([^\]]+)\]\([^)]*\)|[^*~`\x02\x04\[]+|\[)/g;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const m = match[0];
    if (m.startsWith('***') && m.endsWith('***') && m.length > 6) {
      spans.push({ text: m.slice(3, -3), bold: true, italic: true, underline: false, strike: false, code: false });
    } else if (m.startsWith('**') && m.endsWith('**') && m.length > 4) {
      spans.push({ text: m.slice(2, -2), bold: true, italic: false, underline: false, strike: false, code: false });
    } else if (m.startsWith('*') && m.endsWith('*') && m.length > 2) {
      spans.push({ text: m.slice(1, -1), bold: false, italic: true, underline: false, strike: false, code: false });
    } else if (m.startsWith('==') && m.endsWith('==') && m.length > 4) {
      spans.push({ text: m.slice(2, -2), bold: false, italic: false, underline: false, strike: false, code: false });
    } else if (m.startsWith('~~') && m.endsWith('~~') && m.length > 4) {
      spans.push({ text: m.slice(2, -2), bold: false, italic: false, underline: false, strike: true, code: false });
    } else if (m.startsWith('`') && m.endsWith('`') && m.length > 2) {
      spans.push({ text: m.slice(1, -1), bold: false, italic: false, underline: false, strike: false, code: true });
    } else if (m.startsWith('\x02') && m.endsWith('\x02') && m.length > 2) {
      spans.push({ text: m.slice(1, -1), bold: false, italic: false, underline: true, strike: false, code: false });
    } else if (m.startsWith('\x04') && m.endsWith('\x04') && m.length > 2) {
      spans.push({ text: m.slice(1, -1), bold: false, italic: false, underline: false, strike: true, code: false });
    } else if (m.startsWith('[') && m.includes('](')) {
      const linkMatch = m.match(/^\[([^\]]+)\]\(([^)]*)\)/);
      if (linkMatch) {
        spans.push({ text: linkMatch[1], bold: false, italic: false, underline: true, strike: false, code: false, href: linkMatch[2] });
      } else {
        spans.push({ text: m, bold: false, italic: false, underline: false, strike: false, code: false });
      }
    } else if (m) {
      spans.push({ text: m, bold: false, italic: false, underline: false, strike: false, code: false });
    }
  }

  return spans.filter((s) => s.text.length > 0);
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function stripPlain(text: string): string {
  return text
    .replace(/<u>(.*?)<\/u>/gi, '$1').replace(/<[^>]+>/g, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function isTableRow(line: string): boolean {
  return /^\|.+\|/.test(line.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-|:]+\|/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => stripPlain(c.trim()));
}

// ── Block types ───────────────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'text'; spans: InlineSpan[]; checkbox?: 'checked' | 'unchecked'; indent?: number }
  | { type: 'blockquote'; spans: InlineSpan[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'diagram'; code: string }
  | { type: 'code'; lines: string[] }
  | { type: 'rule' };

// ── Content pre-processor ─────────────────────────────────────────────────────

/** Converts HTML block elements to Markdown equivalents before line parsing */
function preprocessContent(raw: string): string {
  return raw
    // HTML blockquote → MD blockquote
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) =>
      inner.replace(/<p>([\s\S]*?)<\/p>/gi, (_m2, t: string) => `> ${t.trim()}\n`)
        .replace(/<[^>]+>/g, '').trim() + '\n'
    )
    // <p> tags → plain lines
    .replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n')
    // <br> / <br/> → newline
    .replace(/<br\s*\/?>/gi, '\n')
    // <li> items: keep as-is (will be handled by list detectors)
    // Strip remaining unknown block tags
    .replace(/<\/?(div|section|article|header|footer|aside|nav)[^>]*>/gi, '\n');
}

// ── Block parser ──────────────────────────────────────────────────────────────

function parseBlocks(rawContent: string): Block[] {
  const content = preprocessContent(rawContent);
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // Fenced code block  ```lang or ```
    const fenceMatch = line.match(/^```(\w+)?/);
    if (fenceMatch) {
      const language = (fenceMatch[1] || '').toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      if (language === 'mermaid') {
        blocks.push({ type: 'diagram', code: codeLines.join('\n') });
      } else {
        blocks.push({ type: 'code', lines: codeLines });
      }
      continue;
    }

    // Horizontal rule: ---, ***, ___ (alone on line)
    if (/^(\-{3,}|\*{3,}|_{3,})\s*$/.test(line) && !isTableRow(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    // Image: ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      blocks.push({ type: 'image', alt: imgMatch[1], src: imgMatch[2] });
      i++;
      continue;
    }

    // Table
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const allRows = tableLines.filter((l) => !isSeparatorRow(l)).map(parseTableRow);
      if (allRows.length >= 1) {
        blocks.push({ type: 'table', headers: allRows[0], rows: allRows.slice(1) });
      }
      continue;
    }

    // Headings
    if (/^###### /.test(line)) { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^#{6} /, '')), level: 3 }); i++; continue; }
    if (/^##### /.test(line))  { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^#{5} /, '')), level: 3 }); i++; continue; }
    if (/^#### /.test(line))   { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^#{4} /, '')), level: 3 }); i++; continue; }
    if (/^### /.test(line))    { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^### /, '')), level: 3 }); i++; continue; }
    if (/^## /.test(line))     { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^## /, '')), level: 2 }); i++; continue; }
    if (/^# /.test(line))      { blocks.push({ type: 'heading', text: stripPlain(line.replace(/^# /, '')), level: 1 }); i++; continue; }

    // Blockquote: > text (with or without trailing space)
    const bqMatch = line.match(/^>{1,}\s?(.*)/);
    if (bqMatch && line.startsWith('>')) {
      blocks.push({ type: 'blockquote', spans: parseInlineSpans(bqMatch[1]) });
      i++;
      continue;
    }

    // Task list: - [x] / - [ ] / * [x] / * [ ]
    const taskMatch = line.match(/^[ \t]*[-*+] \[([xX ])\] (.*)/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x' ? 'checked' : 'unchecked';
      blocks.push({ type: 'text', spans: parseInlineSpans(taskMatch[2]), checkbox: checked });
      i++; continue;
    }

    // Ordered list: 1. / 2. etc (with optional leading spaces)
    const olMatch = line.match(/^( {0,3})\d+[.)]\s+(.*)/);
    if (olMatch) {
      const indentLevel = Math.floor(olMatch[1].length / 2);
      const bullet: InlineSpan = { text: '• ', bold: false, italic: false, underline: false, strike: false, code: false };
      blocks.push({ type: 'text', spans: [bullet, ...parseInlineSpans(olMatch[2])], indent: indentLevel });
      i++; continue;
    }

    // Unordered list: - / * / + (with optional leading spaces)
    const ulMatch = line.match(/^( {0,6})[-*+] (.*)/);
    if (ulMatch) {
      const indentLevel = Math.floor(ulMatch[1].length / 2);
      const bullet: InlineSpan = { text: '• ', bold: false, italic: false, underline: false, strike: false, code: false };
      blocks.push({ type: 'text', spans: [bullet, ...parseInlineSpans(ulMatch[2])], indent: indentLevel });
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      blocks.push({ type: 'text', spans: [] });
      i++; continue;
    }

    // Regular paragraph
    blocks.push({ type: 'text', spans: parseInlineSpans(line) });
    i++;
  }

  return blocks;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; format: string } | null> {
  try {
    // Use Rust command to download — bypasses WebView CORS restrictions
    const b64 = await fs.fetchImageBase64(url);
    if (!b64) return null;

    // Detect format from content-type by loading into Image element
    const cleanUrl = url.split('?')[0].toLowerCase();
    let fmt = 'JPEG';
    if (cleanUrl.endsWith('.png')) fmt = 'PNG';
    else if (cleanUrl.endsWith('.gif')) fmt = 'GIF';
    else if (cleanUrl.endsWith('.webp')) fmt = 'WEBP';

    // If WEBP (not natively supported by all jsPDF versions), convert via canvas
    if (fmt === 'WEBP') {
      const converted = await convertBase64ViaCanvas(`data:image/webp;base64,${b64}`);
      return converted ? { data: converted, format: 'JPEG' } : null;
    }

    return { data: b64, format: fmt };
  } catch {
    return null;
  }
}

async function convertBase64ViaCanvas(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 160, h: 80 });
    img.src = src;
  });
}

// ── Inline span renderer ──────────────────────────────────────────────────────

function renderSpans(
  doc: jsPDF,
  spans: InlineSpan[],
  startX: number,
  startY: number,
  maxX: number,
  lineH: number,
  fontSize: number,
  defaultColor: [number, number, number] = [30, 30, 30]
): number {
  doc.setFontSize(fontSize);
  let cx = startX;
  let cy = startY;

  for (const span of spans) {
    if (!span.text) continue;
    const fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' =
      span.bold && span.italic ? 'bolditalic' : span.bold ? 'bold' : span.italic ? 'italic' : 'normal';
    doc.setFont(span.code ? 'courier' : 'helvetica', fontStyle);

    // Color: blue for links, default otherwise
    if (span.href) {
      doc.setTextColor(30, 90, 200);
    } else {
      doc.setTextColor(defaultColor[0], defaultColor[1], defaultColor[2]);
    }

    // Split into parts preserving spaces, for word-wrap
    const parts = span.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      const partW = doc.getTextWidth(part);
      if (cx + partW > maxX && cx > startX && part.trim().length > 0) {
        cy += lineH;
        cx = startX;
      }
      doc.text(part, cx, cy);
      if (span.underline || span.href) {
        doc.setDrawColor(span.href ? 30 : 60, span.href ? 90 : 60, span.href ? 200 : 200);
        doc.setLineWidth(0.2);
        doc.line(cx, cy + 0.8, cx + partW, cy + 0.8);
        doc.setLineWidth(0.3);
      }
      if (span.href) {
        // Clickable hyperlink annotation
        doc.link(cx, cy - fontSize * 0.35, partW, fontSize * 0.45, { url: span.href });
      }
      if (span.strike) {
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.3);
        doc.line(cx, cy - 1.5, cx + partW, cy - 1.5);
      }
      doc.setDrawColor(200, 200, 210);
      cx += partW;
    }
  }

  // Restore default color
  doc.setTextColor(defaultColor[0], defaultColor[1], defaultColor[2]);
  return cy;
}

// ── PDF builder ───────────────────────────────────────────────────────────────

async function buildPdf(note: Note): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(note.title || 'Sin título', maxW) as string[];
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 4;

  // Separador
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const blocks = parseBlocks(note.content || '');
  const lh = 5.5;

  for (const block of blocks) {
    if (block.type === 'rule') {
      checkPage(4);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

    } else if (block.type === 'heading') {
      const sz = block.level === 1 ? 18 : block.level === 2 ? 15 : 13;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(sz);
      const hlh = sz * 0.45;
      const wrapped = doc.splitTextToSize(block.text, maxW) as string[];
      checkPage(wrapped.length * hlh + 3);
      doc.text(wrapped, margin, y);
      y += wrapped.length * hlh + 3;

    } else if (block.type === 'text') {
      if (block.spans.length === 0) { y += 2; continue; }
      checkPage(lh + 2);
      doc.setTextColor(30, 30, 30);

      const indentX = margin + (block.indent ?? 0) * 4;
      let textStartX = indentX;
      if (block.checkbox === 'checked') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('☑ ', indentX, y);
        textStartX = indentX + doc.getTextWidth('☑ ');
      } else if (block.checkbox === 'unchecked') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('☐ ', indentX, y);
        textStartX = indentX + doc.getTextWidth('☐ ');
      }

      const newY = renderSpans(doc, block.spans, textStartX, y, margin + maxW, lh, 11);
      y = newY + lh;

    } else if (block.type === 'blockquote') {
      const bqIndent = 6;
      const bqTextX = margin + bqIndent;
      const bqMaxX = margin + maxW;
      checkPage(lh + 3);

      // Left accent bar
      doc.setFillColor(130, 130, 200);
      doc.rect(margin, y - 4, 1.5, lh + 1, 'F');

      // Background tint
      doc.setFillColor(245, 245, 252);
      doc.rect(margin + 1.5, y - 4, maxW - 1.5, lh + 1, 'F');

      const newBqY = renderSpans(doc, block.spans, bqTextX, y, bqMaxX, lh, 11, [70, 70, 120]);
      y = newBqY + lh + 1;

    } else if (block.type === 'code') {
      const codeLineH = 5;
      const codeH = block.lines.length * codeLineH + 6;
      checkPage(codeH);
      doc.setFillColor(235, 235, 235);
      doc.rect(margin, y - 4, maxW, codeH, 'F');
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      for (const codeLine of block.lines) {
        doc.text(codeLine || ' ', margin + 2, y);
        y += codeLineH;
      }
      doc.setTextColor(30, 30, 30);
      y += 4;

    } else if (block.type === 'diagram') {
      const pngDataUrl = await renderMermaidPngDataUrl(block.code);
      if (!pngDataUrl) {
        const codeLineH = 5;
        const fallbackLines = block.code.split('\n');
        const codeH = fallbackLines.length * codeLineH + 10;
        checkPage(codeH);
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y - 4, maxW, codeH, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text('[Diagrama Mermaid no disponible, exportado como código]', margin + 2, y);
        y += 5;
        doc.setFont('courier', 'normal');
        doc.setTextColor(40, 40, 40);
        for (const diagramLine of fallbackLines) {
          doc.text(diagramLine || ' ', margin + 2, y);
          y += codeLineH;
        }
        doc.setTextColor(30, 30, 30);
        y += 4;
      } else {
        const dims = await getImageDimensions(pngDataUrl);
        const maxDiagramH = 120;
        const scale = Math.min(maxW / dims.w, maxDiagramH / dims.h);
        const imgW = Math.max(40, dims.w * scale);
        const imgH = Math.max(20, dims.h * scale);
        checkPage(imgH + 6);

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, y - 2, maxW, imgH + 4, 2, 2, 'F');
        doc.setDrawColor(220, 220, 225);
        doc.roundedRect(margin, y - 2, maxW, imgH + 4, 2, 2);

        const base64 = pngDataUrl.split(',')[1];
        doc.addImage(base64, 'PNG', margin + (maxW - imgW) / 2, y, imgW, imgH);
        y += imgH + 6;
      }

    } else if (block.type === 'table') {
      const allRows = [block.headers, ...block.rows];
      const cols = block.headers.length;
      if (cols === 0) continue;

      const colW = maxW / cols;
      const cellPad = 2;
      const rowH = 7;

      checkPage(rowH * allRows.length + 4);

      doc.setFontSize(9);

      allRows.forEach((row, ri) => {
        const isHeader = ri === 0;

        // Fondo cabecera
        if (isHeader) {
          doc.setFillColor(60, 60, 80);
          doc.rect(margin, y - rowH + 1.5, maxW, rowH, 'F');
        } else if (ri % 2 === 0) {
          doc.setFillColor(240, 240, 245);
          doc.rect(margin, y - rowH + 1.5, maxW, rowH, 'F');
        }

        // Texto de cada celda
        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
        doc.setTextColor(isHeader ? 255 : 30, isHeader ? 255 : 30, isHeader ? 255 : 30);

        row.forEach((cell, ci) => {
          const x = margin + ci * colW;
          const cellText = doc.splitTextToSize(cell, colW - cellPad * 2) as string[];
          doc.text(cellText[0] ?? '', x + cellPad, y);
        });

        // Bordes de fila
        doc.setDrawColor(200, 200, 210);
        doc.setLineWidth(0.2);
        doc.rect(margin, y - rowH + 1.5, maxW, rowH);
        // Líneas verticales
        for (let c = 1; c < cols; c++) {
          const lx = margin + c * colW;
          doc.line(lx, y - rowH + 1.5, lx, y + 1.5);
        }

        y += rowH;
        checkPage(rowH);
      });

      doc.setTextColor(30, 30, 30);
      y += 3;

    } else if (block.type === 'image') {
      try {
        const src = block.src;
        let imgData: string | null = null;
        let imgFmt = 'JPEG';

        if (src.startsWith('data:image/')) {
          const match = src.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) { imgFmt = match[1].toUpperCase(); imgData = match[2]; }
        } else if (src.startsWith('file://') || src.match(/^\//)) {
          try {
            const cleanPath = src.replace(/^file:\/\/?/, '/');
            imgData = await fs.readBinary(cleanPath);
            imgFmt = 'PNG';
          } catch (error) {
            console.warn('Failed to load local image:', error);
          }
        } else {
          const fetched = await fetchImageAsBase64(src);
          if (fetched) { imgData = fetched.data; imgFmt = fetched.format; }
        }

        if (imgData) {
          const fullSrc = src.startsWith('data:') ? src : `data:image/${imgFmt.toLowerCase()};base64,${imgData}`;
          const dims = await getImageDimensions(fullSrc);
          const aspectRatio = dims.h > 0 ? dims.w / dims.h : 4 / 3;
          const imgW = Math.min(maxW, 150);
          const imgH = imgW / aspectRatio;
          checkPage(imgH + 4);
          doc.addImage(imgData, imgFmt, margin, y, imgW, imgH);
          y += imgH + 4;
        } else {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          checkPage(5);
          doc.text(`[Imagen no disponible: ${block.alt || block.src}]`, margin, y);
          doc.setTextColor(30, 30, 30);
          y += 6;
        }
      } catch {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(`[Imagen no disponible]`, margin, y);
        doc.setTextColor(30, 30, 30);
        y += 6;
      }
    }
  }

  return doc;
}
