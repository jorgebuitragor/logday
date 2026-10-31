// Módulo de "Google Calendar". Se carga con `import()` solo cuando la
// extensión está activa (specs/extensiones R16).
import type { ExtensionModule } from '../types';
import { startGoogleCalendar } from './sync';
import HomeCard from './HomeCard';
import Settings from './Settings';

const googleCalendar: ExtensionModule = { Settings, HomeCard, start: startGoogleCalendar };

export default googleCalendar;
