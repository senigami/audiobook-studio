/**
 * siteMockup/rail.tsx — Left navigation rail
 */
import React, { useState } from 'react';
import { saveThemePref } from '@/utils/theme';
import {
  Library,
  Mic,
  Zap,
  Puzzle,
  Plug,
  Settings,
  BookOpen,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import {
  ProgressBar,
  StatusOrb,
  BookCover,
  CHAPTERS, CHAPTER_RENDER_PCT, BOOK_STAGE_LINKS,
} from './shared';
import type { OrbStatus, RailDest, BookTab } from './shared';

const RAIL_ICON: Record<RailDest, React.ReactNode> = {
  Library:      <Library size={16} strokeWidth={1.8} />,
  Voices:       <Mic size={16} strokeWidth={1.8} />,
  Activity:     <Zap size={16} strokeWidth={1.8} />,
  Engines:      <Puzzle size={16} strokeWidth={1.8} />,
  Integrations: <Plug size={16} strokeWidth={1.8} />,
  Settings:     <Settings size={16} strokeWidth={1.8} />,
};

const RAIL_GROUPS: { group: string; items: { id: RailDest; badge?: string }[] }[] = [
  {
    group: 'CREATE',
    items: [
      { id: 'Library' },
      { id: 'Voices' },
    ],
  },
  {
    group: 'MONITOR',
    items: [{ id: 'Activity', badge: '2' }],
  },
  {
    group: 'PLATFORM',
    items: [
      { id: 'Engines' },
      { id: 'Integrations' },
    ],
  },
  {
    group: 'MANAGE',
    items: [{ id: 'Settings' }],
  },
];

// Map chapter status to StatusOrb status
function chapterToOrbStatus(status: string): OrbStatus {
  if (status === 'Published') return 'done';
  if (status === 'Studio')    return 'running';
  if (status === 'Review')    return 'preparing';
  return 'idle';
}

export const Rail: React.FC<{
  active: RailDest;
  onSelect: (d: RailDest) => void;
  collapsed: boolean;
  onToggle: () => void;
  inBook: boolean;
  activeBookTab: BookTab;
  onBookTabSelect: (t: BookTab) => void;
  activeChapter: number;
  onChapterSelect: (n: number) => void;
}> = ({ active, onSelect, collapsed, onToggle, inBook, activeBookTab, onBookTabSelect, activeChapter, onChapterSelect }) => {
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    saveThemePref(next);
    setTheme(next);
  };

  return (
    <div
      style={{
        width: collapsed ? 52 : 190,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.18s ease',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {RAIL_GROUPS.map(({ group, items }) => (
          <div key={group} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 'var(--type-micro)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  padding: '6px 14px 2px',
                  textTransform: 'uppercase',
                }}
              >
                {group}
              </div>
            )}
            {items.map(item => {
              const isActive = active === item.id;
              return (
                <React.Fragment key={item.id}>
                  <div
                    onClick={() => onSelect(item.id)}
                    aria-label={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: collapsed ? '7px 0' : '7px 14px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      cursor: 'pointer',
                      background: isActive ? 'var(--accent-tint-bg)' : 'transparent',
                      borderLeft: isActive && !collapsed ? '3px solid var(--accent)' : '3px solid transparent',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 'var(--type-caption)',
                      fontWeight: isActive ? 700 : 400,
                      position: 'relative',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {RAIL_ICON[item.id]}
                    </span>
                    {!collapsed && (
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.id}
                      </span>
                    )}
                    {item.badge && (
                      <span
                        style={{
                          fontSize: 'var(--type-micro)',
                          fontWeight: 700,
                          background: 'var(--accent)',
                          color: 'var(--text-on-accent)',
                          borderRadius: 10,
                          padding: '1px 5px',
                          position: collapsed ? 'absolute' : 'static',
                          top: collapsed ? 4 : undefined,
                          right: collapsed ? 4 : undefined,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {/* Contextual book hierarchy — shown below Library item when inBook */}
                  {item.id === 'Library' && inBook && (
                    collapsed ? (
                      /* Collapsed: single book cover */
                      <div
                        title="The Whispering Vale"
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          padding: '5px 0',
                          background: 'var(--accent-tint-bg)',
                        }}
                      >
                        <BookCover title="The Whispering Vale" size={24} />
                      </div>
                    ) : (
                      /* Expanded: full tree block */
                      <div
                        style={{
                          marginLeft: 14,
                          borderLeft: '1px solid var(--border)',
                          paddingLeft: 0,
                          marginBottom: 2,
                        }}
                      >
                        {/* Book title row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px 3px 10px',
                          }}
                        >
                          <BookCover title="The Whispering Vale" size={18} />
                          <span
                            style={{
                              fontSize: 'var(--type-micro)',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            The Whispering Vale
                          </span>
                        </div>

                        {/* Stage links */}
                        {BOOK_STAGE_LINKS.map(stage => {
                          const isStageActive = activeBookTab === stage;
                          return (
                            <div key={stage}>
                              <div
                                onClick={() => onBookTabSelect(stage)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '3px 10px 3px 20px',
                                  cursor: 'pointer',
                                  background: isStageActive ? 'var(--accent-tint-bg)' : 'transparent',
                                  color: isStageActive ? 'var(--accent)' : 'var(--text-secondary)',
                                  fontSize: 'var(--type-micro)',
                                  fontWeight: isStageActive ? 700 : 400,
                                  borderLeft: isStageActive ? '2px solid var(--accent)' : '2px solid transparent',
                                  marginLeft: -1,
                                }}
                              >
                                {stage}
                              </div>

                              {/* Chapter list — under Studio only, expanded when Studio is active */}
                              {stage === 'Studio' && isStageActive && (
                                <div style={{ paddingLeft: 8 }}>
                                  {CHAPTERS.map(ch => {
                                    const isChActive = ch.n === activeChapter;
                                    const orbStatus = chapterToOrbStatus(ch.status);
                                    const renderPct = CHAPTER_RENDER_PCT[ch.n - 1] ?? 0;
                                    return (
                                      <div
                                        key={ch.n}
                                        onClick={() => onChapterSelect(ch.n)}
                                        style={{
                                          padding: '4px 6px 3px 22px',
                                          background: isChActive ? 'var(--accent-tint-bg)' : 'transparent',
                                          borderLeft: isChActive ? '2px solid var(--accent)' : '2px solid transparent',
                                          cursor: 'pointer',
                                          position: 'relative',
                                          marginLeft: -1,
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <StatusOrb
                                            status={orbStatus}
                                            progress={renderPct / 100}
                                            size={12}
                                          />
                                          <span style={{
                                            fontSize: 'var(--type-micro)',
                                            color: isChActive ? 'var(--accent)' : 'var(--text-secondary)',
                                            fontWeight: isChActive ? 700 : 400,
                                            flex: 1,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            lineHeight: 1.3,
                                          }}>
                                            {ch.n}. {ch.title}
                                          </span>
                                          {isChActive && (
                                            <span
                                              onClick={e => { e.stopPropagation(); setChapterMenuOpen(m => !m); }}
                                              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                                              title="Chapter actions"
                                              aria-label="Chapter actions"
                                            >
                                              <MoreHorizontal size={10} strokeWidth={2} />
                                            </span>
                                          )}
                                        </div>
                                        {/* Thin render bar */}
                                        <div style={{ marginTop: 2, marginLeft: 10 }}>
                                          {renderPct > 0
                                            ? <ProgressBar pct={renderPct} height={2} shimmer={renderPct < 100 && renderPct > 0} />
                                            : <div style={{ height: 2, borderRadius: 1, background: 'var(--border)' }} />
                                          }
                                        </div>
                                        {/* Chapter action menu (active chapter only) */}
                                        {isChActive && chapterMenuOpen && (
                                          <div
                                            style={{
                                              position: 'absolute',
                                              top: '100%',
                                              right: 0,
                                              zIndex: 20,
                                              background: 'var(--surface)',
                                              border: '1px solid var(--border)',
                                              borderRadius: 'var(--radius-button)',
                                              boxShadow: 'var(--shadow-lg)',
                                              minWidth: 140,
                                              padding: '4px 0',
                                            }}
                                          >
                                            {['Rebuild audio', 'Export', 'Download', 'Reset audio', 'Delete'].map(action => (
                                              <div
                                                key={action}
                                                onClick={() => setChapterMenuOpen(false)}
                                                style={{
                                                  fontSize: 'var(--type-micro)',
                                                  padding: '5px 12px',
                                                  color: action === 'Delete' ? 'var(--error)' : 'var(--text-primary)',
                                                  cursor: 'pointer',
                                                }}
                                              >
                                                {action}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
      {/* Rail bottom: expanded = one horizontal row (theme left, chevron right);
                      collapsed = vertical stack (theme above, chevron below) */}
      {collapsed ? (
        <>
          {/* Collapsed: theme icon */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--border)',
              padding: '8px 0',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-light)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            {theme === 'light'
              ? <Moon size={15} strokeWidth={1.8} />
              : <Sun size={15} strokeWidth={1.8} />
            }
          </button>
          {/* Collapsed: chevron below */}
          <div
            onClick={onToggle}
            style={{
              padding: '8px',
              display: 'flex',
              justifyContent: 'center',
              cursor: 'pointer',
              borderTop: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}
            title="Expand rail"
            aria-label="Expand rail"
          >
            <ChevronRight size={14} strokeWidth={2} />
          </div>
        </>
      ) : (
        /* Expanded: single horizontal row */
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          {/* Theme button — left, fills remaining space */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              background: 'none',
              border: 'none',
              borderRight: '1px solid var(--border)',
              padding: '8px 14px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 'var(--type-caption)',
              minWidth: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-light)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {theme === 'light'
                ? <Moon size={14} strokeWidth={1.8} />
                : <Sun size={14} strokeWidth={1.8} />
              }
            </span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </span>
          </button>
          {/* Chevron — right */}
          <div
            onClick={onToggle}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            title="Collapse rail"
            aria-label="Collapse rail"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </div>
        </div>
      )}
    </div>
  );
};
