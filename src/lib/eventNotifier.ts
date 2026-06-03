import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { isPermissionGranted, requestPermission, sendNotification } from './invoke';

/**
 * Hook global que verifica cada 60 s si hay eventos de calendario próximos
 * y dispara una notificación del sistema cuando corresponda.
 * Solo funciona mientras la app esté abierta.
 */
export function useEventNotifier() {
  // Guardamos los IDs de eventos ya notificados para no repetir
  const firedRef = useRef<Set<string>>(new Set());
  const permGrantedRef = useRef<boolean>(false);

  useEffect(() => {
    let destroyed = false;

    const initPermission = async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        permGrantedRef.current = granted;
      } catch {
        permGrantedRef.current = false;
      }
    };

    const checkEvents = async () => {
      if (destroyed || !permGrantedRef.current) return;
      const { calendarEvents: events, notificationsEnabled } = useAppStore.getState();
      if (!notificationsEnabled) return;
      const now = new Date();

      for (const ev of events) {
        if (ev.reminderMinutes === 0) continue;

        // Construir la fecha+hora del evento
        let eventDt: Date;
        if (ev.time) {
          const [h, m] = ev.time.split(':').map(Number);
          eventDt = new Date(`${ev.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        } else {
          // Todo el día: recordatorio a las 09:00 del día
          eventDt = new Date(`${ev.date}T09:00:00`);
        }

        // Tiempo en ms hasta el evento
        const diffMs = eventDt.getTime() - now.getTime();
        const reminderMs = ev.reminderMinutes * 60 * 1000;

        // Ventana de disparo: dentro del intervalo del recordatorio y hasta 60 s antes
        // (el check ocurre cada 60 s, usamos ±90 s de margen para no saltarnos el tick)
        const MARGIN_MS = 90_000;
        if (diffMs > reminderMs - MARGIN_MS && diffMs <= reminderMs) {
          // Clave única: id + fecha para que funcione si el evento se mueve de día
          const fireKey = `${ev.id}:${ev.date}`;
          if (!firedRef.current.has(fireKey)) {
            firedRef.current.add(fireKey);
            const language = useAppStore.getState().language;
            const title = language === 'es' ? 'Recordatorio Logday' : 'Logday reminder';
            const body = ev.time
              ? `${ev.title} — ${ev.time}`
              : `${ev.title}`;
            try {
              await sendNotification({ title, body });
            } catch {
              // Ignorar si falla en algún OS
            }
          }
        }
      }
    };

    void initPermission().then(() => {
      void checkEvents();
    });

    const interval = window.setInterval(() => {
      void checkEvents();
    }, 60_000);

    return () => {
      destroyed = true;
      clearInterval(interval);
    };
  }, []);
}
