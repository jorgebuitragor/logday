export interface SyncConfig {
  enabled: boolean;
  serverUrl: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
