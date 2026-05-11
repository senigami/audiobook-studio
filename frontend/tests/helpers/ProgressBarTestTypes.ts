export type ProgressBarCheckpointMode = 'default' | 'queue' | 'segment';
export type ProgressBarStatus = 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';

export interface ProgressBarTestConfig {
  progress: number;
  startedAt?: number;
  etaSeconds?: number;
  persistenceKey?: string;
  label: string;
  showEta: boolean;
  status: ProgressBarStatus;
  allowBackwardProgress: boolean;
  evidenceWeightFraction: number;
  checkpointMode: ProgressBarCheckpointMode;
  etaBasis: 'remaining_from_update' | 'total_from_start';
  updatedAt?: number;
  transitionTickCount: number;
  backwardTransitionTickCount: number;
  tickMs: number;
}

export const DEFAULT_CONFIG: ProgressBarTestConfig = {
  progress: 0.25,
  startedAt: Math.floor(Date.now() / 1000) - 35,
  etaSeconds: 120,
  persistenceKey: 'progress-test-run',
  label: 'Progress Test',
  showEta: true,
  status: 'running',
  allowBackwardProgress: false,
  evidenceWeightFraction: 0.8,
  checkpointMode: 'segment',
  etaBasis: 'total_from_start',
  transitionTickCount: 8,
  backwardTransitionTickCount: 2,
  tickMs: 250,
};

export const STATUS_OPTIONS: ProgressBarStatus[] = ['queued', 'preparing', 'running', 'finalizing', 'done', 'failed', 'cancelled'];
export const CHECKPOINT_MODES: ProgressBarCheckpointMode[] = ['default', 'queue', 'segment'];
