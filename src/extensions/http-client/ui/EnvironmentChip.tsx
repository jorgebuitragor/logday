// El entorno activo, siempre a la vista en la barra de cada bloque
// (Interfaz §1.3, HT19). Es uno solo para todas las peticiones; elegir
// otro lo cambia en todos los bloques. Se comparte con DevTools (PR 2).
import { ChevronDown, Server, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { EXTENSION_ID, readHttpSettings, activeEnvironment } from '../core/environments';
import { makeTr } from '../core/text';
import { openSettings, setActiveEnv } from '../store';
import { Menu, type MenuItem } from './Menu';

export function EnvironmentChip() {
  const language = useAppStore((s) => s.language);
  const raw = useAppStore((s) => s.extensions[EXTENSION_ID]?.settings);
  const tr = makeTr(language);
  const settings = readHttpSettings(raw);
  const env = activeEnvironment(settings);
  const name = env?.name ?? tr('envNone');

  const items: MenuItem[] = [
    { key: 'none', label: tr('envNone'), checked: !env, onSelect: () => void setActiveEnv(null) },
    ...settings.environments.map((e) => ({
      key: e.id,
      label: (
        <>
          <span className="truncate">{e.name}</span>
          {e.protected && <ShieldAlert size={12} className="ml-auto shrink-0 text-amber-400" aria-hidden />}
        </>
      ),
      srSuffix: e.protected ? tr('envProtected') : undefined,
      checked: e.id === env?.id,
      onSelect: () => void setActiveEnv(e.id),
    })),
    settings.environments.length > 0
      ? { key: 'configure', label: tr('envConfigure'), action: true, onSelect: () => openSettings(env?.id ?? null) }
      : { key: 'create', label: tr('envCreate'), action: true, onSelect: () => openSettings(null) },
  ];

  return (
    <Menu
      label={`${tr('envChipLabel', { name })}${env?.protected ? `, ${tr('envProtected')}` : ''}`}
      hint={tr('envMenuHint')}
      align="right"
      items={items}
      button={
        <>
          {env?.protected
            ? <ShieldAlert size={12} className="shrink-0 text-amber-400" aria-hidden />
            : <Server size={12} className="shrink-0" aria-hidden />}
          <span className={`truncate ${env ? '' : 'text-[var(--text-hint)]'}`}>{name}</span>
          <ChevronDown size={11} className="shrink-0" aria-hidden />
        </>
      }
    />
  );
}
