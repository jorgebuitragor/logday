export type CodeTokenKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'function'
  | 'property';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

export interface CodeLanguageOption {
  value: string;
  label: string;
}

export const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = [
  { value: 'plaintext', label: 'Texto' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'yaml', label: 'YAML' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
];

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  golang: 'go',
};

const KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'yield', 'async', 'await', 'interface', 'type', 'enum', 'implements', 'private',
    'protected', 'public', 'readonly', 'declare', 'from', 'as'
  ]),
  typescript: new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'yield', 'async', 'await', 'interface', 'type', 'enum', 'implements', 'private',
    'protected', 'public', 'readonly', 'declare', 'from', 'as', 'namespace', 'satisfies'
  ]),
  json: new Set(['true', 'false', 'null']),
  sql: new Set([
    'select', 'from', 'where', 'insert', 'into', 'update', 'delete', 'join', 'left', 'right', 'inner',
    'outer', 'full', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset', 'as', 'distinct', 'and',
    'or', 'not', 'is', 'null', 'like', 'between', 'in', 'exists', 'create', 'table', 'alter', 'drop',
    'primary', 'key', 'foreign', 'references', 'values', 'set'
  ]),
  bash: new Set([
    'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'case', 'esac', 'while', 'until',
    'function', 'export', 'local', 'readonly', 'return'
  ]),
  python: new Set([
    'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'false',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'none', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'true', 'try', 'while', 'with', 'yield'
  ]),
  yaml: new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off']),
  java: new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
    'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
    'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
    'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
    'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'void',
    'volatile', 'while', 'record', 'sealed', 'permits', 'var'
  ]),
  go: new Set([
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for',
    'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select',
    'struct', 'switch', 'type', 'var', 'nil', 'true', 'false'
  ]),
};

export function normalizeCodeLanguage(language?: string): string {
  if (!language) return 'plaintext';
  const normalized = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function getCommentPrefix(language: string): string | null {
  if (language === 'sql') return '--';
  if (language === 'python' || language === 'bash' || language === 'yaml') return '#';
  if (language === 'javascript' || language === 'typescript' || language === 'java' || language === 'go') return '//';
  return null;
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

export function tokenizeCodeLine(line: string, language?: string): CodeToken[] {
  const lang = normalizeCodeLanguage(language);
  const keywords = KEYWORDS[lang] || new Set<string>();
  const commentPrefix = getCommentPrefix(lang);
  const tokens: CodeToken[] = [];

  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    if (commentPrefix && rest.startsWith(commentPrefix)) {
      tokens.push({ text: rest, kind: 'comment' });
      break;
    }

    const ch = line[i];

    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < line.length) {
        const c = line[j];
        if (!escaped && c === quote) {
          j += 1;
          break;
        }
        if (!escaped && c === '\\') {
          escaped = true;
          j += 1;
          continue;
        }
        escaped = false;
        j += 1;
      }
      let stringKind: CodeTokenKind = 'string';
      // In JSON, a quoted token immediately followed by ':' is a key.
      if (lang === 'json' && quote === '"') {
        let k = j;
        while (k < line.length && /\s/.test(line[k])) k += 1;
        if (line[k] === ':') {
          stringKind = 'property';
        }
      }
      tokens.push({ text: line.slice(i, j), kind: stringKind });
      i = j;
      continue;
    }

    const numMatch = rest.match(/^\d+(?:\.\d+)?/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], kind: 'number' });
      i += numMatch[0].length;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && isWordChar(line[j])) j += 1;
      const word = line.slice(i, j);
      const lower = word.toLowerCase();
      let kind: CodeTokenKind = 'plain';

      if (keywords.has(lower)) {
        kind = 'keyword';
      } else {
        const prev = line.slice(0, i).trimEnd();
        const next = line.slice(j).trimStart();
        if (prev.endsWith('.')) kind = 'property';
        else if (next.startsWith('(')) kind = 'function';
      }

      tokens.push({ text: word, kind });
      i = j;
      continue;
    }

    const opMatch = rest.match(/^(===|!==|==|!=|<=|>=|=>|\+\+|--|&&|\|\||[+\-*/%=<>!&|^~?:])/);
    if (opMatch) {
      tokens.push({ text: opMatch[0], kind: 'operator' });
      i += opMatch[0].length;
      continue;
    }

    const wsMatch = rest.match(/^\s+/);
    if (wsMatch) {
      tokens.push({ text: wsMatch[0], kind: 'plain' });
      i += wsMatch[0].length;
      continue;
    }

    tokens.push({ text: ch, kind: 'plain' });
    i += 1;
  }

  return tokens;
}
