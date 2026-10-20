import { useEffect } from 'react';
import { Monitor, Globe, Puzzle, Smartphone, HelpCircle, AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { Language } from '../../types/common';
import { DeviceResponse } from '../../lib/sync';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';

// El server no manda un "tipo" de dispositivo explícito, solo el
// device_name libre que cada cliente elige al loguearse ("Logday
// Desktop", "Logday Web", etc.) — se infiere el ícono de ahí. Sin
// match conocido (un nombre custom, o algo como "unknown device" de
// un login viejo sin device_name), HelpCircle en vez de asumir.
function deviceIcon(deviceName: string) {
  const n = deviceName.toLowerCase();
  if (n.includes('desktop')) return Monitor;
  if (n.includes('extension') || n.includes('plugin')) return Puzzle;
  if (n.includes('mobile') || n.includes('android') || n.includes('ios') || n.includes('iphone')) return Smartphone;
  if (n.includes('web') || n.includes('browser')) return Globe;
  return HelpCircle;
}

function relativeTime(iso: string, language: Language): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return language === 'en' ? 'just now' : 'ahora mismo';
  if (diffMin < 60) return language === 'en' ? `${diffMin} min ago` : `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return language === 'en' ? `${diffH} h ago` : `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return language === 'en' ? `${diffD} d ago` : `hace ${diffD} d`;
}

/** Lista de sesiones/dispositivos activos — mismo GET/DELETE /devices
 *  que ya consume logday-web (server-side no hizo falta tocar nada).
 *  Vive dentro de SyncSettingsTab, solo mientras hay sync conectado —
 *  sin servidor no hay sesión que listar. */
export function DevicesPanel() {
  const {
    devices, devicesError, syncConfig, language, confirmDestructiveActions,
    loadDevices, revokeDeviceAction, syncDisconnect,
  } = useAppStore();

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const confirmRevokeDialog = useConfirmDelete<DeviceResponse>(confirmDestructiveActions);

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'extras', 'devicesTitle')}
      </p>
      <div className="divide-y divide-[var(--border-card)] rounded-xl border border-[var(--border-card)]">
        {devices.length === 0 && devicesError ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-red-400">
              <AlertCircle size={12} className="shrink-0" />
              <span>{devicesError.message}</span>
            </div>
            {/* "expired" no es reintentable — reintentar con el mismo
                access token muerto repite el mismo 401 para siempre
                (bug real: el botón "Reintentar" no hacía nada visible).
                Ahí se ofrece Desconectar en vez de Reintentar, que es
                lo que el propio mensaje ya le pide al usuario hacer. */}
            <button
              onClick={() => void (devicesError.kind === 'expired' ? syncDisconnect() : loadDevices())}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {devicesError.kind === 'expired' ? <LogOut size={11} /> : <RefreshCw size={11} />}
              {t(language, 'extras', devicesError.kind === 'expired' ? 'syncDisconnect' : 'devicesRetry')}
            </button>
          </div>
        ) : devices.length === 0 ? (
          <p className="px-3 py-2.5 text-[11px] text-[var(--text-hint)]">{t(language, 'extras', 'devicesLoading')}</p>
        ) : (
          devices.map((d) => {
            const isSelf = d.id === syncConfig.deviceId;
            const Icon = deviceIcon(d.device_name);
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Icon size={13} className="shrink-0 text-[var(--text-hint)]" />
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {d.device_name}
                      {isSelf && (
                        <span className="ml-2 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400">
                          {t(language, 'extras', 'devicesThisDevice')}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--text-hint)]">
                      {t(language, 'extras', 'devicesLastUsedPrefix')} {relativeTime(d.last_used_at, language)}
                    </p>
                  </div>
                </div>
                {/* La sesión propia no se cierra desde acá — a
                    propósito, para que esa acción siempre pase por el
                    botón "Desconectar" de la pestaña, no por un click
                    suelto en esta lista. */}
                {!isSelf && (
                  <button
                    onClick={() => confirmRevokeDialog.request(d, (device) => void revokeDeviceAction(device.id))}
                    className="rounded-lg px-2 py-1 text-[11px] text-[var(--text-hint)] transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    {t(language, 'extras', 'devicesRevoke')}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {confirmRevokeDialog.isOpen && confirmRevokeDialog.pending && (
        <ConfirmDeleteModal
          title={t(language, 'extras', 'devicesRevokeTitle')}
          message={<>{t(language, 'extras', 'devicesRevokeConfirmPrefix')} <span className="font-medium text-[var(--text-primary)]">{confirmRevokeDialog.pending.device_name}</span>?</>}
          cancelLabel={t(language, 'extras', 'devicesCancel')}
          confirmLabel={t(language, 'extras', 'devicesRevoke')}
          onCancel={confirmRevokeDialog.cancel}
          onConfirm={() => { void revokeDeviceAction(confirmRevokeDialog.pending!.id); confirmRevokeDialog.cancel(); }}
        />
      )}
    </div>
  );
}
