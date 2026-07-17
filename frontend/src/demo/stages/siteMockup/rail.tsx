/**
 * siteMockup/rail.tsx — Left navigation rail
 */
import React, { useState, useEffect } from 'react';
import { saveThemePref } from '@/utils/theme';
import {
  Library,
  Mic,
  BarChart2,
  Puzzle,
  Plug,
  Settings,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import {
  StatusOrb,
  BookCover,
  ConceptBadge,
  CHAPTERS, CHAPTER_RENDER_PCT, BOOK_STAGE_LINKS,
} from './shared';
import type { OrbStatus, RailDest, BookTab } from './shared';

const RAIL_ICON: Record<RailDest, React.ReactNode> = {
  Library:      <Library size={16} strokeWidth={1.8} />,
  Voices:       <Mic size={16} strokeWidth={1.8} />,
  Activity:     <BarChart2 size={16} strokeWidth={1.8} />,
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
  active: RailDest | null;
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
  const [isMobileLocal, setIsMobileLocal] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobileLocal(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    saveThemePref(next);
    setTheme(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0 }}>
    <div
      id="ns-nav-rail"
      style={{
        width: collapsed ? 52 : 190,
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
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-label={item.id}
                    aria-current={isActive ? 'page' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: collapsed ? '7px 0' : '7px 14px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      cursor: 'pointer',
                      border: 0,
                      background: isActive ? 'var(--accent-tint-bg)' : 'transparent',
                      borderLeft: isActive && !collapsed ? '3px solid var(--action-primary)' : '3px solid transparent',
                      color: isActive ? 'var(--action-primary)' : 'var(--text-secondary)',
                      fontSize: 'var(--type-caption)',
                      fontWeight: isActive ? 700 : 400,
                      fontFamily: 'inherit',
                      position: 'relative',
                      textAlign: 'left',
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
                          background: 'var(--action-primary)',
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
                  </button>

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
                          marginLeft: 10,
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
                            padding: '4px 8px 3px 8px',
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

                        {/* Ambient chapter-progress glance — mirrors production RailBookBlock */}
                        <div style={{ padding: '0 8px 5px 8px', fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                          {CHAPTER_RENDER_PCT.filter(p => p >= 100).length} of {CHAPTERS.length} done
                          {CHAPTER_RENDER_PCT.some(p => p > 0 && p < 100) &&
                            ` · ${CHAPTER_RENDER_PCT.filter(p => p > 0 && p < 100).length} rendering`}
                        </div>

                        {/* Stage links */}
                        {BOOK_STAGE_LINKS.map(stage => {
                          const isStageActive = activeBookTab === stage;
                          return (
                            <div key={stage}>
                              <button
                                type="button"
                                className="ns-book-rail-stage"
                                onClick={() => onBookTabSelect(stage)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  width: '100%',
                                  padding: '3px 8px 3px 12px',
                                  justifyContent: 'flex-start',
                                  cursor: 'pointer',
                                  border: 0,
                                  background: isStageActive ? 'var(--accent-tint-bg)' : 'transparent',
                                  color: isStageActive ? 'var(--action-primary)' : 'var(--text-secondary)',
                                  fontSize: 'var(--type-micro)',
                                  fontWeight: isStageActive ? 700 : 400,
                                  fontFamily: 'inherit',
                                  borderLeft: isStageActive ? '2px solid var(--action-primary)' : '2px solid transparent',
                                  marginLeft: -1,
                                  textAlign: 'left',
                                }}
                              >
                                {stage}
                              </button>

                              {/* Chapter list — under Contents, expanded when Contents is active.
                                  Aspirational: production's rail shows only cover + progress +
                                  fixed stage links (no inline chapter tree), so this North Star
                                  surface is badged "Concept". */}
                              {stage === 'Contents' && isStageActive && (
                                <div style={{ paddingLeft: 4 }}>
                                  <div style={{ padding: '2px 6px 4px 14px' }}>
                                    <ConceptBadge title="Inline chapter navigation is a North Star concept — the shipping rail shows cover + progress + stage links only" />
                                  </div>
                                  {CHAPTERS.map(ch => {
                                    const isChActive = ch.n === activeChapter;
                                    const orbStatus = chapterToOrbStatus(ch.status);
                                    const renderPct = CHAPTER_RENDER_PCT[ch.n - 1] ?? 0;
                                    return (
                                      <div
                                        key={ch.n}
                                        onClick={() => onChapterSelect(ch.n)}
                                        title={`${ch.n}. ${ch.title}`}
                                        style={{
                                          padding: '4px 6px 3px 14px',
                                          background: isChActive ? 'var(--accent-tint-bg)' : 'transparent',
                                          borderLeft: isChActive ? '2px solid var(--action-primary)' : '2px solid transparent',
                                          cursor: 'pointer',
                                          position: 'relative',
                                          marginLeft: -1,
                                          textAlign: 'left',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6 }}>
                                          <StatusOrb
                                            status={orbStatus}
                                            progress={renderPct / 100}
                                            size={12}
                                          />
                                          <span style={{
                                            fontSize: 'var(--type-micro)',
                                            color: isChActive ? 'var(--action-primary)' : 'var(--text-secondary)',
                                            fontWeight: isChActive ? 700 : 400,
                                            flex: 1,
                                            whiteSpace: 'nowrap',
                                            lineHeight: 1.3,
                                          }}>
                                            Ch {ch.n}
                                          </span>
                                          {isChActive && (
                                            <button
                                              type="button"
                                              onClick={e => { e.stopPropagation(); setChapterMenuOpen(m => !m); }}
                                              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, border: 0, background: 'transparent', fontFamily: 'inherit' }}
                                              title="Chapter actions"
                                              aria-label="Chapter actions"
                                            >
                                              <MoreHorizontal size={10} strokeWidth={2} />
                                            </button>
                                          )}
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
                                              <button
                                                type="button"
                                                key={action}
                                                onClick={() => setChapterMenuOpen(false)}
                                                style={{
                                                  fontSize: 'var(--type-micro)',
                                                  padding: '5px 12px',
                                                  color: action === 'Delete' ? 'var(--error)' : 'var(--text-primary)',
                                                  cursor: 'pointer',
                                                  width: '100%',
                                                  border: 0,
                                                  background: 'transparent',
                                                  fontFamily: 'inherit',
                                                  textAlign: 'left',
                                                }}
                                              >
                                                {action}
                                              </button>
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
        </div>
      )}
    </div>
    {/* Collapse handle — thin vertical pill at the rail's trailing edge.
        Button spans full height for hover detection + WCAG 2.5.8 hit target (24px wide);
        only the pill visual is rendered, centered at 50% height.
        Lights up on hover; doubles as a future drag-resize handle. */}
    {!isMobileLocal && (
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
        aria-controls="ns-nav-rail"
        style={{
          width: 24, flexShrink: 0, cursor: 'pointer', alignSelf: 'stretch',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', padding: 0, border: 0,
          fontFamily: 'inherit',
          marginLeft: -12, zIndex: 1,
        }}
        onMouseEnter={e => {
          const pill = e.currentTarget.querySelector('span') as HTMLElement | null;
          if (pill) { pill.style.background = 'var(--surface-alt)'; pill.style.borderColor = 'var(--text-secondary)'; }
        }}
        onMouseLeave={e => {
          const pill = e.currentTarget.querySelector('span') as HTMLElement | null;
          if (pill) { pill.style.background = 'transparent'; pill.style.borderColor = 'var(--border)'; }
        }}
      >
        {/* Pill: 14px wide × 44px tall, border-radius = half width = fully rounded sides */}
        <span style={{
          width: 14, height: 44, borderRadius: 7,
          background: 'transparent', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s ease, border-color 0.15s ease',
          flexShrink: 0,
        }}>
          {collapsed
            ? <ChevronRight size={10} strokeWidth={2.5} style={{ width: 10, height: 10 }} />
            : <ChevronLeft size={10} strokeWidth={2.5} style={{ width: 10, height: 10 }} />}
        </span>
      </button>
    )}
    </div>
  );
};
