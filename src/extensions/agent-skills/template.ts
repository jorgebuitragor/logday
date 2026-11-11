// La plantilla de una skill nueva (specs/skills-de-agentes SK9). El
// frontmatter se arma con js-yaml para que una descripción con `:` o
// comillas no rompa el YAML.
import yaml from 'js-yaml';
import type { Language } from '../../lib/i18n';

export function skillTemplate(name: string, description: string, language: Language): string {
  const frontmatter = yaml.safeDump({ name, description: description.trim() }, { lineWidth: -1 }).trimEnd();
  const body =
    language === 'en'
      ? `# ${name}\n\n## When to use it\n\n- …\n\n## Steps\n\n1. …\n`
      : `# ${name}\n\n## Cuándo usarla\n\n- …\n\n## Pasos\n\n1. …\n`;
  return `---\n${frontmatter}\n---\n\n${body}`;
}
