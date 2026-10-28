import { t } from '../../lib/i18n';
import type { ChatProvider } from './model';

// Guía paso a paso para conseguir la URL del webhook, pensada para quien
// nunca ha configurado una integración (specs/chat-del-equipo). Los pasos
// siguen la ayuda oficial de cada proveedor (oct 2026); si cambian sus
// menús, se actualizan aquí y en i18n.ts.
export type GuideKey = Parameters<typeof t<'teamChat'>>[2];

export const GUIDES: Record<ChatProvider, { steps: GuideKey[]; tips: GuideKey[]; help: { url: string; label: GuideKey } }> = {
  google_chat: {
    steps: ['guideGoogle1', 'guideGoogle2', 'guideGoogle3', 'guideGoogle4', 'guideGoogle5'],
    tips: ['guideGoogleTip'],
    help: { url: 'https://developers.google.com/workspace/chat/quickstart/webhooks', label: 'guideHelpGoogle' },
  },
  slack: {
    steps: ['guideSlack1', 'guideSlack2', 'guideSlack3', 'guideSlack4', 'guideSlack5'],
    tips: ['guideSlackTip'],
    help: { url: 'https://api.slack.com/messaging/webhooks', label: 'guideHelpSlack' },
  },
  teams: {
    steps: ['guideTeams1', 'guideTeams2', 'guideTeams3', 'guideTeams4', 'guideTeams5'],
    tips: ['guideTeamsTip'],
    help: { url: 'https://support.microsoft.com/en-us/topic/8ae491c7-0394-4861-ba59-055e33f75498', label: 'guideHelpTeams' },
  },
};

/** Los últimos pasos son iguales para los tres: pegar, guardar y probar. */
export const FINAL_STEPS: GuideKey[] = ['guideFinal1', 'guideFinal2'];
export const COMMON_TIPS: GuideKey[] = ['guideTipAdmin', 'guideTipSecret'];
