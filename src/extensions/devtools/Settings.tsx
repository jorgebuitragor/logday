// Opciones → Extensiones → DevTools (specs/devtools D17–D20 y D23, design
// Adenda G §G.3): cómo se muestra la lista, el orden y la visibilidad de
// las herramientas, y restablecer sus opciones. Se monta fuera de la vista
// (sin `DevtoolsContext`): lee del store y usa las funciones puras de
// `model.ts`, las mismas que la columna, así que los cambios se ven al
// momento si la vista está abierta detrás. Sin Cliente HTTP, su grupo y su
// herramienta no aparecen (specs/cliente-http HT27).
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { ICON_BTN, PANEL_TITLE, SECONDARY_CLS, SOFT_DISABLED } from '../../components/shared/controlClasses';
import { Toggle } from '../../components/shared/FormControls';
import { useRowDrag } from '../../components/shared/useRowDrag';
import type { DevtoolsKey } from '../../lib/i18n';
import {
  DEVTOOLS_ID, RESET_ORDER_PATCH, availableGroups, availableToolsIn, hasCustomOrder, hasToolOptions, isToolHidden, moveGroup,
  moveGroupTo, moveTool, moveToolTo, orderedTools, readDevtoolsSettings, setLayoutPatch, setToolHidden, visibleToolCount,
  type DevtoolsSettings, type DevtoolsSettingsPatch, type ToolGroup, type ToolId, type ToolListLayout,
} from './model';
import { Segmented } from './ui/controls';
import { TOOL_ICON } from './ui/meta';
import { makeTr, toolKey, type Tr } from './ui/text';

type Save = (make: (current: DevtoolsSettings) => DevtoolsSettingsPatch) => void;

const MOVE_BTN = `${ICON_BTN} ${SOFT_DISABLED}`;
const GRIP = 'flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--text-hint)] active:cursor-grabbing';
const HINT = 'text-[11px] text-[var(--text-hint)]';

function Subtitle({ children }: { children: string }) {
  return <p className="font-medium text-[var(--text-secondary)]">{children}</p>;
}

export default function DevtoolsSettingsPanel() {
  const { language, raw, config, update, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[DEVTOOLS_ID]?.settings,
      config: s.extensions,
      update: s.updateExtensionSettings,
      showToast: s.showToast,
    })),
  );
  const settings = useMemo(() => readDevtoolsSettings(raw), [raw]);
  const available = useMemo(() => availableToolsIn(config), [config]);
  const tr = useMemo(() => makeTr(language), [language]);
  const [announcement, setAnnouncement] = useState('');

  // Como en la vista: el parche se arma con lo guardado en ese momento.
  const save: Save = (make) => {
    const patch = make(readDevtoolsSettings(useAppStore.getState().extensions[DEVTOOLS_ID]?.settings));
    if (Object.keys(patch).length) void update(DEVTOOLS_ID, patch);
  };

  const az = settings.layout === 'az';
  const groups = availableGroups(settings, available);
  const groupName = (group: ToolGroup) => tr(`group.${group}` as DevtoolsKey);
  const onlyOneVisible = visibleToolCount(settings, available) === 1;

  const moveGroupBy = (group: ToolGroup, index: number, delta: -1 | 1) => {
    save((current) => moveGroup(current, group, delta, available));
    setAnnouncement(tr('set.groupMoved', { name: groupName(group), n: index + 1 + delta, total: groups.length }));
  };
  const groupDrag = useRowDrag<HTMLDivElement>('[data-group-row]', (id, to) => {
    const group = id as ToolGroup;
    save((current) => moveGroupTo(current, group, to, available));
    setAnnouncement(tr('set.groupMoved', { name: groupName(group), n: to + 1, total: groups.length }));
  });

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        <Subtitle>{tr('set.list')}</Subtitle>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[var(--text-secondary)]">{tr('set.layout')}</span>
          <Segmented<ToolListLayout>
            label={tr('set.layout')}
            value={settings.layout}
            options={[
              { value: 'groups', label: tr('set.layoutGroups') },
              { value: 'az', label: tr('set.layoutAz') },
            ]}
            onChange={(layout) => save(() => setLayoutPatch(layout))}
          />
        </div>
        <p className={HINT}>{tr(az ? 'set.azHint' : 'set.layoutGroupsHint')}</p>
      </div>

      <div className="space-y-2">
        <Subtitle>{tr('set.order')}</Subtitle>
        <p className={HINT}>{tr(az ? 'set.azHint' : 'set.orderDesc')}</p>
        <div ref={groupDrag.listRef} className="space-y-2">
          {groups.map((group, index) => (
            <GroupCard
              key={group}
              group={group}
              name={groupName(group)}
              settings={settings}
              available={available}
              tr={tr}
              save={save}
              announce={setAnnouncement}
              az={az}
              onlyOneVisible={onlyOneVisible}
              cardClass={groupDrag.rowClass(index, group)}
              grip={groupDrag.gripProps(index, group)}
              first={index === 0}
              last={index === groups.length - 1}
              onMove={(delta) => moveGroupBy(group, index, delta)}
            />
          ))}
        </div>
        {onlyOneVisible && <p className={HINT}>{tr('set.lastVisible')}</p>}
        {hasCustomOrder(settings) && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className={SECONDARY_CLS}
              onClick={() => {
                save(() => RESET_ORDER_PATCH);
                setAnnouncement(tr('set.resetOrderDone'));
              }}
            >
              <RotateCcw size={12} aria-hidden />
              {tr('set.resetOrder')}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <Subtitle>{tr('set.toolOptions')}</Subtitle>
        <p className={HINT}>{tr('set.toolOptionsDesc')}</p>
        {hasToolOptions(settings) && (
          <button
            type="button"
            className={SECONDARY_CLS}
            onClick={() => {
              // D23: sin confirmación, porque no borra datos: las
              // herramientas vuelven a sus valores por defecto.
              save(() => ({ options: undefined }));
              showToast({ kind: 'success', title: tr('set.resetOptionsDone') });
            }}
          >
            <RotateCcw size={13} aria-hidden />
            {tr('set.resetOptions')}
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}

/** La tarjeta de un grupo: su fila (asa y flechas) y la de cada herramienta. */
function GroupCard({
  group, name, settings, available, tr, save, announce, az, onlyOneVisible, cardClass, grip, first, last, onMove,
}: {
  group: ToolGroup;
  name: string;
  settings: DevtoolsSettings;
  available: readonly ToolId[];
  tr: Tr;
  save: Save;
  announce: (message: string) => void;
  az: boolean;
  onlyOneVisible: boolean;
  cardClass: string;
  grip: ReturnType<ReturnType<typeof useRowDrag>['gripProps']>;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const tools = orderedTools(settings, group);
  const nameOf = (tool: ToolId) => tr(toolKey(tool, 'name'));
  const moved = (tool: ToolId, index: number) =>
    announce(tr('set.moved', { name: nameOf(tool), n: index + 1, total: tools.length }));
  // Las herramientas solo se arrastran dentro de su tarjeta (D19).
  const toolDrag = useRowDrag<HTMLUListElement>('[data-tool-row]', (id, to) => {
    const tool = id as ToolId;
    save((current) => moveToolTo(current, tool, to));
    moved(tool, to);
  });

  return (
    <ul
      ref={toolDrag.listRef}
      data-group-row
      aria-label={name}
      className={`divide-y divide-[var(--border)] rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] ${cardClass}`}
    >
      <li className="flex min-h-9 items-center gap-2 px-2 py-1 text-xs">
        {/* En A-Z no se dibujan asas ni flechas: no se desactivan, para no
            llenar la lista de controles grises (§G.3). */}
        {!az && (
          <span title={tr('set.dragGroup', { name })} aria-hidden {...grip} className={GRIP}>
            <GripVertical size={14} />
          </span>
        )}
        <span className={`${PANEL_TITLE} min-w-0 flex-1 truncate`}>{name}</span>
        {!az && (
          <>
            <button
              type="button"
              className={MOVE_BTN}
              aria-disabled={first || undefined}
              onClick={() => !first && onMove(-1)}
              aria-label={tr('set.moveGroupUpNamed', { name })}
              title={tr('set.moveUp')}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className={MOVE_BTN}
              aria-disabled={last || undefined}
              onClick={() => !last && onMove(1)}
              aria-label={tr('set.moveGroupDownNamed', { name })}
              title={tr('set.moveDown')}
            >
              <ChevronDown size={14} />
            </button>
          </>
        )}
      </li>
      {tools.map((tool, index) => {
        const Icon = TOOL_ICON[tool];
        const toolName = nameOf(tool);
        const hidden = isToolHidden(settings, tool, available);
        const atTop = index === 0;
        const atBottom = index === tools.length - 1;
        return (
          <li
            key={tool}
            data-tool-row
            className={`flex min-h-9 items-center gap-2 py-1 pl-7 pr-2 text-xs ${toolDrag.rowClass(index, tool)}`}
          >
            {!az && (
              <span title={tr('set.drag', { name: toolName })} aria-hidden {...toolDrag.gripProps(index, tool)} className={GRIP}>
                <GripVertical size={14} />
              </span>
            )}
            <Icon size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
            <span className={`min-w-0 flex-1 truncate ${hidden ? 'text-[var(--text-hint)]' : 'text-[var(--text-secondary)]'}`}>{toolName}</span>
            {!az && (
              <>
                <button
                  type="button"
                  className={MOVE_BTN}
                  aria-disabled={atTop || undefined}
                  onClick={() => {
                    if (atTop) return;
                    save((current) => moveTool(current, tool, -1));
                    moved(tool, index - 1);
                  }}
                  aria-label={tr('set.moveUpNamed', { name: toolName })}
                  title={tr('set.moveUp')}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className={MOVE_BTN}
                  aria-disabled={atBottom || undefined}
                  onClick={() => {
                    if (atBottom) return;
                    save((current) => moveTool(current, tool, 1));
                    moved(tool, index + 1);
                  }}
                  aria-label={tr('set.moveDownNamed', { name: toolName })}
                  title={tr('set.moveDown')}
                >
                  <ChevronDown size={14} />
                </button>
              </>
            )}
            <span className="ml-1 shrink-0">
              <Toggle
                label={tr('set.show')}
                srSuffix={toolName}
                checked={!hidden}
                // D20: la última visible no se puede ocultar.
                disabled={!hidden && onlyOneVisible}
                onChange={(show) => {
                  save((current) => setToolHidden(current, tool, !show, available));
                  announce(tr(show ? 'set.shownNow' : 'set.hiddenNow', { name: toolName }));
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
