import { useMatch, useNavigate } from 'react-router-dom';
import { ChevronRight, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import type { StudioShellState } from '@/app/navigation/model';

type TopBarShellState = Pick<StudioShellState, 'navigation' | 'hydration'>;

interface TopBarProps {
  breadcrumb?: ReactNode;
  identitySlot?: ReactNode;
  mobileNavButton?: ReactNode;
  shellState?: TopBarShellState;
  queueCount?: number;
  isQueueOpen?: boolean;
  onToggleQueue?: () => void;
}

type ConnectionTone = 'success' | 'warning' | 'muted';

const ROUTE_KIND_LABELS: Record<string, string> = {
  library: 'Library',
  queue: 'Queue',
  voices: 'Voices',
  settings: 'Settings',
};

function getDefaultBreadcrumbLabel(shellState?: TopBarShellState): string {
  if (!shellState) {
    return 'Library';
  }

  return ROUTE_KIND_LABELS[shellState.navigation.routeKind] ?? 'Library';
}

function getConnectionState(status?: TopBarShellState['hydration']['status']): {
  tone: ConnectionTone;
  title: string;
} {
  switch (status) {
    case 'ready':
      return { tone: 'success', title: 'Connection ready' };
    case 'bootstrap':
      return { tone: 'warning', title: 'Connection bootstrapping' };
    case 'reconnecting':
      return { tone: 'warning', title: 'Connection reconnecting' };
    case 'recovering':
      return { tone: 'warning', title: 'Connection recovering' };
    case 'refreshing':
      return { tone: 'warning', title: 'Connection refreshing' };
    case 'error':
      return { tone: 'muted', title: 'Connection unavailable' };
    default:
      return { tone: 'muted', title: 'Connection unavailable' };
  }
}

export function TopBar({
  breadcrumb,
  identitySlot,
  mobileNavButton,
  shellState,
  queueCount,
  isQueueOpen,
  onToggleQueue,
}: TopBarProps) {
  const navigate = useNavigate();
  const defaultBreadcrumb = getDefaultBreadcrumbLabel(shellState);
  const connection = getConnectionState(shellState?.hydration.status);
  const showQueueBadge = typeof queueCount === 'number' && queueCount > 0;

  // Inside a book the breadcrumb becomes a continuous path: Library / [book] / Stage.
  const stageMatch = useMatch('/book/:bookId/:stage');
  const stageParam = stageMatch?.params.stage;
  const stageLabel = stageParam ? stageParam.charAt(0).toUpperCase() + stageParam.slice(1) : null;
  const inBook = Boolean(stageMatch);

  return (
    <header className="top-bar">
      {mobileNavButton}

      <button
        type="button"
        className="top-bar__brand-btn"
        aria-label="Audiobook Studio home"
        onClick={() => navigate('/')}
      >
        <BrandLogo scale={0.7} showIcon />
      </button>

      <span className="top-bar__divider" aria-hidden="true" />

      <nav className="top-bar__breadcrumb" aria-label="Breadcrumb">
        {inBook ? (
          <>
            <button
              type="button"
              className="top-bar__crumb-link"
              onClick={() => navigate('/library')}
            >
              Library
            </button>
            <span className="top-bar__breadcrumb-caret" aria-hidden="true"><ChevronRight size={14} /></span>
            {/* Book identity, threaded inline into the breadcrumb path. */}
            <span className="top-bar__crumb-identity" data-testid="topbar-identity-slot">
              {identitySlot}
            </span>
            <span className="top-bar__breadcrumb-caret" aria-hidden="true"><ChevronRight size={14} /></span>
            <span className="top-bar__crumb-current">{stageLabel}</span>
          </>
        ) : (
          <>
            <span className="top-bar__breadcrumb-label">{breadcrumb ?? defaultBreadcrumb}</span>
            <span className="top-bar__breadcrumb-caret" aria-hidden="true"><ChevronRight size={14} /></span>
          </>
        )}
      </nav>

      <div className="top-bar__spacer" />

      <span
        className="top-bar__connection-dot"
        role="status"
        title={connection.title}
        data-state={connection.tone}
      >
        <span className="sr-only">{connection.title}</span>
      </span>

      <button
        type="button"
        className="top-bar__queue-btn"
        onClick={onToggleQueue}
        aria-expanded={Boolean(isQueueOpen)}
        aria-label={isQueueOpen ? 'Close queue drawer' : 'Open queue drawer'}
      >
        <Zap aria-hidden="true" size={16} />
        <span>Queue</span>
        {showQueueBadge ? <span className="top-bar__queue-badge">{queueCount}</span> : null}
      </button>
    </header>
  );
}
