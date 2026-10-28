import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Check, Copy, KeyRound, Radio } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { setExtensionSecret } from '../secrets';
import { restartMcpServer, useMcpStatus } from './server';
import {
  MCP_ID, TOKEN_SECRET_KEY, generateToken, isValidPort, mcpUrl, readMcpSettings, setupCommands,
  type McpServerStatus,
} from './model';

const INPUT_CLS =
  'w-24 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';
const BUTTON_CLS =
  'rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

function StatusLine({ status }: { status: McpServerStatus }) {
  const language = useAppStore((s) => s.language);
  if (status.state === 'listening') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <Radio size={12} className="shrink-0" />
        {t(language, 'mcp', 'statusListening')} <span className="font-mono">{mcpUrl(status.port)}</span>
      </span>
    );
  }
  const text =
    status.state === 'no_token' ? t(language, 'mcp', 'statusNoToken')
    : status.state === 'port_in_use' ? `${t(language, 'mcp', 'statusPortInUse')} (${status.port})`
    : status.state === 'error' ? `${t(language, 'mcp', 'statusError')} ${status.message}`
    : t(language, 'mcp', 'statusStopped');
  const warn = status.state === 'port_in_use' || status.state === 'error';
  return (
    <span className={`flex items-center gap-1.5 ${warn ? 'text-amber-400' : 'text-[var(--text-hint)]'}`}>
      <AlertCircle size={12} className="shrink-0" />
      {text}
    </span>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const language = useAppStore((s) => s.language);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await invoke('write_clipboard', { text });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
        <button type="button" onClick={() => void copy()} className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300">
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {t(language, 'mcp', copied ? 'copied' : 'copy')}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--bg-surface)] px-3 py-2 font-mono text-[10px] leading-relaxed text-[var(--text-primary)]">
        {text}
      </pre>
    </div>
  );
}

/** Panel de la extensión en Opciones → Extensiones (R19). */
export default function McpSettings() {
  const { language, raw, update } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[MCP_ID]?.settings, update: s.updateExtensionSettings })),
  );
  const settings = readMcpSettings(raw);
  const status = useMcpStatus((s) => s.status);

  const [portText, setPortText] = useState(String(settings.port));
  const [portError, setPortError] = useState(false);
  // R7: el token solo vive aquí, desde que se genera hasta "Listo".
  const [revealed, setRevealed] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [busy, setBusy] = useState(false);

  const savePort = async () => {
    const port = Number(portText);
    if (!isValidPort(port)) {
      setPortError(true);
      return;
    }
    setPortError(false);
    if (port === settings.port) return;
    await update(MCP_ID, { port });
    await restartMcpServer();
  };

  const newToken = async () => {
    setBusy(true);
    setTokenError(false);
    try {
      const token = generateToken();
      const hint = await setExtensionSecret(MCP_ID, TOKEN_SECRET_KEY, token);
      await update(MCP_ID, { hint });
      setRevealed(token);
      // Con el token nuevo, el anterior deja de valer en el acto.
      await restartMcpServer();
    } catch {
      setTokenError(true);
    } finally {
      setBusy(false);
    }
  };

  const commands = revealed ? setupCommands(settings.port, revealed) : null;

  return (
    <div className="space-y-3 text-xs">
      <div className="text-[11px]"><StatusLine status={status} /></div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mcp-port" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'mcp', 'port')}</label>
        <input
          id="mcp-port"
          inputMode="numeric"
          value={portText}
          onChange={(e) => { setPortText(e.target.value.replace(/\D/g, '')); setPortError(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void savePort(); }}
          className={INPUT_CLS}
        />
        <button type="button" onClick={() => void savePort()} disabled={portText === String(settings.port)} className={BUTTON_CLS}>
          {t(language, 'mcp', 'save')}
        </button>
        {portError && <span className="text-[10px] text-amber-400">{t(language, 'mcp', 'portInvalid')}</span>}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'mcp', 'allowWrites')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'mcp', 'allowWritesDesc')}</p>
        </div>
        <ToggleSwitch checked={settings.allowWrites} onChange={(v) => void update(MCP_ID, { allowWrites: v })} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <span className="flex items-center gap-1.5 text-[11px]">
          <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" />
          {settings.hint ? (
            <span className="text-[var(--text-secondary)]">
              {t(language, 'mcp', 'tokenSaved')} <span className="font-mono">{settings.hint}</span>
            </span>
          ) : (
            <span className="text-[var(--text-hint)]">{t(language, 'mcp', 'tokenNone')}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void newToken()}
          disabled={busy}
          className={settings.hint ? BUTTON_CLS : 'rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50'}
        >
          {t(language, 'mcp', settings.hint ? 'regenerate' : 'generate')}
        </button>
      </div>
      {settings.hint && !revealed && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'mcp', 'regenerateHint')}</p>}
      {tokenError && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{t(language, 'mcp', 'tokenError')}</span>
        </div>
      )}

      {commands && (
        <div className="space-y-2.5 rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3">
          <p className="text-[11px] font-medium text-[var(--text-primary)]">{t(language, 'mcp', 'revealTitle')}</p>
          <CopyBlock label={t(language, 'mcp', 'claudeCode')} text={commands.claudeCode} />
          <CopyBlock label={t(language, 'mcp', 'codex')} text={commands.codex} />
          <div className="flex justify-end">
            <button type="button" onClick={() => setRevealed(null)} className={BUTTON_CLS}>{t(language, 'mcp', 'done')}</button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'mcp', 'localOnly')}</p>
    </div>
  );
}
