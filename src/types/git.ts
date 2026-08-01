export interface GitConfig {
  enabled: boolean;
  remote: string;
  autoCommitHourly: boolean;
  autoPushDaily: boolean;
  userName: string;
  userEmail: string;
}

export type GitStatus = 'idle' | 'synced' | 'pending' | 'error';
export type GitRemoteStatus = 'unknown' | 'synced' | 'behind' | 'ahead' | 'diverged' | 'offline';
