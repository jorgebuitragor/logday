import { describe, expect, it } from 'vitest';
import type { GitConfig } from '../types/git';
import { gitAutoAction } from '../lib/gitAutomation';

const cfg = (over: Partial<GitConfig> = {}): GitConfig => ({
  enabled: true, remote: 'git@ejemplo:datos.git', autoCommitHourly: true, autoPushDaily: true, userName: '', userEmail: '', ...over,
});

describe('gitAutoAction', () => {
  it('commit y push con auto-commit, push y remoto', () => {
    expect(gitAutoAction(cfg(), '/datos')).toBe('push');
  });

  it('solo commit sin push o sin remoto', () => {
    expect(gitAutoAction(cfg({ autoPushDaily: false }), '/datos')).toBe('commit');
    expect(gitAutoAction(cfg({ remote: '  ' }), '/datos')).toBe('commit');
  });

  it('nada sin Git, sin auto-commit o sin carpeta', () => {
    expect(gitAutoAction(cfg({ enabled: false }), '/datos')).toBe('none');
    expect(gitAutoAction(cfg({ autoCommitHourly: false }), '/datos')).toBe('none');
    expect(gitAutoAction(cfg(), null)).toBe('none');
  });
});
