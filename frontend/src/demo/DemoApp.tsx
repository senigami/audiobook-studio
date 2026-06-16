/**
 * DemoApp — hash-based stage routing shell.
 *
 * Routes:
 *   #/           → stage index (grid of cards)
 *   #/stage/:id  → DemoStage wrapping the matching stage element
 *
 * Features:
 *   - Theme toggle: flips data-theme on <html>, persists to localStorage
 *   - "demo mode" badge
 *   - Listens for `demo-blocked-action` window events → transient toast
 *   - ?embed=1 hides the header
 */

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { loadThemePref, saveThemePref } from '@/utils/theme';
import { DemoStage } from './DemoStage';
import { demoTimeline } from './scenes';
import { liveOutputStage } from './stages/liveOutputStage';
import { queueStage } from './stages/queueStage';
import { progressStage } from './stages/progressStage';
import { voiceLabStage } from './stages/voiceLabStage';
import { siteMockupStage } from './stages/siteMockupStage';
import { StyleguidePage } from './styleguide/StyleguidePage';

export const demoStages = [siteMockupStage, liveOutputStage, queueStage, progressStage, voiceLabStage];

// ---------------------------------------------------------------------------
// Hash routing helpers

const getHash = () => window.location.hash || '#/';
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

const useHash = () => useSyncExternalStore(subscribeHash, getHash, getHash);

const parseHash = (hash: string): { page: 'index' | 'stage' | 'styleguide'; stageId?: string } => {
  // Tolerate a query string inside the hash (e.g. "#/stage/queue?embed=1").
  const path = hash.replace(/^#/, '').split('?')[0];
  if (path === '/styleguide') return { page: 'styleguide' };
  const m = path.match(/^\/stage\/(.+)$/);
  if (m) return { page: 'stage', stageId: m[1] };
  return { page: 'index' };
};

const initTheme = (): 'light' | 'dark' => {
  const pref = loadThemePref();
  // Demo only supports two-state toggle (light/dark); treat 'system' as 'light' default.
  return pref === 'dark' ? 'dark' : 'light';
};

const isEmbedMode = () => {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('embed') === '1') return true;
  // Also accept a query string carried inside the hash ("#/stage/x?embed=1").
  const hashQuery = window.location.hash.split('?')[1];
  return hashQuery !== undefined && new URLSearchParams(hashQuery).get('embed') === '1';
};

// ---------------------------------------------------------------------------

export const DemoApp: React.FC = () => {
  const hash = useHash();
  const { page, stageId } = parseHash(hash);

  const [theme, setTheme] = useState<'light' | 'dark'>(initTheme);
  const [toast, setToast] = useState<string | null>(null);
  const embed = isEmbedMode();

  // Apply theme to root element via the shared theme utility.
  useEffect(() => {
    saveThemePref(theme);
  }, [theme]);

  // Listen for demo-blocked-action events
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      const msg =
        (e as CustomEvent).detail?.message ?? 'This is a demo — actions are disabled.';
      setToast(msg);
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 3500);
    };
    window.addEventListener('demo-blocked-action', handler);
    return () => {
      window.removeEventListener('demo-blocked-action', handler);
      if (timer != null) clearTimeout(timer);
    };
  }, []);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const activeStage =
    page === 'stage' ? demoStages.find(s => s.id === stageId) ?? null : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {/* Header — hidden when ?embed=1 */}
      {!embed && (
        <header
          className="demo-shell-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <a
            className="demo-shell-title"
            href="#/"
            style={{
              fontWeight: 700,
              fontSize: '1.1rem',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Audiobook Studio — Live Demo
          </a>

          <span
            className="demo-shell-badge"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: 20,
              flexShrink: 0,
            }}
          >
            demo mode
          </span>

          <div style={{ flex: 1 }} />

          <button
            className="demo-shell-theme"
            type="button"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            onClick={toggleTheme}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {theme === 'light'
              ? <Moon size={14} strokeWidth={2} aria-hidden="true" />
              : <Sun size={14} strokeWidth={2} aria-hidden="true" />}
            <span className="demo-shell-theme-label">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
        </header>
      )}

      {/* Main content */}
      <main style={{ flex: 1, minHeight: 0, padding: embed ? 0 : page === 'styleguide' ? 0 : '1.5rem 24px' }}>
        {page === 'index' && (
          <StageIndex />
        )}
        {page === 'styleguide' && (
          <StyleguidePage />
        )}
        {page === 'stage' && activeStage && (
          <div style={{ height: embed ? '100vh' : 'calc(100vh - 140px)' }}>
            <DemoStage
              timeline={demoTimeline}
              title={activeStage.title}
              autoPlay
            >
              {activeStage.element}
            </DemoStage>
          </div>
        )}
        {page === 'stage' && !activeStage && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Stage not found: <code>{stageId}</code>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15))',
            zIndex: 9999,
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stage index grid

const IndexCard: React.FC<{ href: string; title: string; description: string; accent?: boolean }> = ({
  href, title, description, accent,
}) => (
  <a href={href} style={{ textDecoration: 'none' }}>
    <div
      style={{
        background: accent ? 'var(--accent-tint-bg)' : 'var(--surface)',
        border: `1px solid ${accent ? 'var(--accent-tint-border)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        height: '100%',
      }}
      onMouseEnter={e =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)')
      }
      onMouseLeave={e =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = accent
          ? 'var(--accent-tint-border)'
          : 'var(--border)')
      }
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '1rem',
          color: accent ? 'var(--accent)' : 'var(--text-primary)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {description}
      </div>
    </div>
  </a>
);

const StageIndex: React.FC = () => (
  <div>
    <h1
      style={{
        fontSize: '1.4rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '1.25rem',
      }}
    >
      Choose a demo stage
    </h1>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '1rem',
      }}
    >
      {demoStages.map(stage => (
        <IndexCard
          key={stage.id}
          href={`#/stage/${stage.id}`}
          title={stage.title}
          description={stage.description}
        />
      ))}
      <IndexCard
        href="#/styleguide"
        title="Design Spec Sheet"
        description="Tokens, type rules, component states, and proposed redesign directions — a storybook-style reference for evaluating theming and design decisions."
        accent
      />
    </div>
  </div>
);
