import mermaid from 'mermaid';

let mermaidInitialized = false;

export interface MermaidBlockMatch {
  start: number;
  end: number;
  code: string;
}

function ensureMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'neutral',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  });
  mermaidInitialized = true;
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseMermaidBlocks(markdown: string): MermaidBlockMatch[] {
  const matches: MermaidBlockMatch[] = [];
  const regex = /^```mermaid[^\n]*\n([\s\S]*?)```/gm;
  let result: RegExpExecArray | null;

  while ((result = regex.exec(markdown)) !== null) {
    matches.push({
      start: result.index,
      end: result.index + result[0].length,
      code: result[1].replace(/^\n+|\n+$/g, ''),
    });
  }

  return matches;
}

export function formatMermaidFence(code: string): string {
  const normalized = code.replace(/^\n+|\n+$/g, '');
  return `\`\`\`mermaid\n${normalized}\n\`\`\``;
}

export async function renderMermaidSvg(code: string, prefix = 'mermaid') {
  ensureMermaid();
  try {
    const result = await mermaid.render(uniqueId(prefix), code);
    return result;
  } catch (error) {
    // Re-throw Mermaid errors so they bubble up to the caller
    throw new Error(`Mermaid render error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function renderMermaidPngDataUrl(code: string): Promise<string | null> {
  try {
    const { svg } = await renderMermaidSvg(code, 'mermaid-pdf');
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    return await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(null);
      }, 5000); // 5 second timeout

      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth || 1200;
          canvas.height = image.naturalHeight || 800;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            clearTimeout(timeoutId);
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          clearTimeout(timeoutId);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          clearTimeout(timeoutId);
          resolve(null);
        }
      };

      image.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };

      image.src = svgUrl;
    });
  } catch {
    return null;
  }
}