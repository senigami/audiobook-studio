/**
 * siteMockupStage — North-star full-site organization mockup (medium fidelity v3).
 *
 * Navigation:
 *   - Left rail items switch `activeRail` state.
 *   - Clicking a book card in Library switches to Book pipeline view.
 *   - Book pipeline has 5 stage tabs (Manuscript, Casting, Studio, Review, Publish).
 *   - Chevron at rail bottom toggles collapsed (icon-only ~56px) vs expanded.
 *   - Top bar "Queue" button slides a ~340px drawer over the right side WITHOUT
 *     changing the current page (the key "check status from anywhere" workflow).
 *
 * v3 changes:
 *   - Book header strip on all pipeline stage tabs (cover, title/author/series/runtime/narrator).
 *   - Studio stage re-centred on Book view (prose paragraphs, speaker underlines, mixed-sentence
 *     callout, safe-text / section-number toggles, upgraded chapter rail with progress bars + menu).
 *   - Review stage: follow-along player with scrolling text panel + annotations column.
 *   - Library Continue cards: cover + series line for metadata presence.
 */

import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Shared primitives

const Row: React.FC<{ gap?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  gap = 8,
  children,
  style,
}) => (
  <div style={{ display: 'flex', gap, alignItems: 'stretch', ...style }}>
    {children}
  </div>
);

const Col: React.FC<{ gap?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  gap = 8,
  children,
  style,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
    {children}
  </div>
);

const Label: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <div
    style={{
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      padding: '4px 0 2px',
    }}
  >
    {children}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode; active?: boolean; color?: string }> = ({
  children,
  active,
  color,
}) => (
  <span
    style={{
      fontSize: '0.6rem',
      padding: '2px 7px',
      borderRadius: 20,
      border: `1px solid ${color ? color + '55' : active ? 'var(--accent)' : 'var(--border)'}`,
      background: color ? color + '22' : active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
      color: color ?? (active ? 'var(--accent)' : 'var(--text-secondary)'),
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
    }}
  >
    {children}
  </span>
);

const Btn: React.FC<{
  children: React.ReactNode;
  primary?: boolean;
  small?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({ children, primary, small, onClick, style }) => (
  <div
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: small ? '0.6rem' : '0.72rem',
      fontWeight: 600,
      padding: small ? '2px 7px' : '5px 14px',
      borderRadius: 6,
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--surface-alt)',
      color: primary ? '#fff' : 'var(--text-primary)',
      cursor: onClick ? 'pointer' : 'default',
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </div>
);

const ProgressBar: React.FC<{ pct: number; height?: number; shimmer?: boolean }> = ({
  pct,
  height = 4,
  shimmer,
}) => (
  <div
    style={{
      height,
      borderRadius: 2,
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      flex: 1,
    }}
  >
    <div
      style={{
        width: `${pct}%`,
        height: '100%',
        background: shimmer
          ? 'linear-gradient(90deg, var(--accent) 60%, #a78bfa 100%)'
          : 'var(--accent)',
        borderRadius: 2,
        opacity: shimmer ? 0.85 : 1,
      }}
    />
  </div>
);

// Pill for status
const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    Drafting: '#6366f1',
    Rendering: '#f59e0b',
    Published: '#22c55e',
    Review: '#ec4899',
    Casting: '#8b5cf6',
    Studio: '#0ea5e9',
  };
  const c = colors[status] ?? '#6b7280';
  return <Chip color={c}>{status}</Chip>;
};

// Fake waveform SVG (bar-style)
const WaveformSvg: React.FC<{ height?: number }> = ({ height = 40 }) => {
  const bars = [4,8,14,20,28,18,24,30,22,16,26,32,24,18,12,20,28,22,16,10,18,26,30,20,14,8,16,24,18,10];
  const total = bars.length;
  const w = 6;
  const gap = 2;
  const svgW = total * (w + gap);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${svgW} ${height}`} preserveAspectRatio="xMidYMid meet">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * (w + gap)}
          y={(height - h) / 2}
          width={w}
          height={h}
          rx={2}
          fill={i > 8 && i < 18 ? 'var(--accent)' : 'var(--border)'}
          opacity={i > 8 && i < 18 ? 0.9 : 0.5}
        />
      ))}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Queue drawer data (shared between drawer and Activity pane)

const IN_FLIGHT_JOBS = [
  { title: 'The Whispering Vale — Ch 7', engine: 'XTTS', pct: 64, eta: '~12m left', segs: '3/7' },
  { title: 'Iron Meridian — Ch 3', engine: 'Voxtral', pct: 18, eta: '~34m left', segs: '1/9' },
];
const QUEUED_JOBS = [
  { title: 'Echoes of Ember — Ch 5', engine: 'XTTS' },
  { title: 'The Whispering Vale — Ch 8', engine: 'XTTS' },
];

// ---------------------------------------------------------------------------
// Queue Drawer

const QueueDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onViewAll: () => void;
}> = ({ open, onClose, onViewAll }) => (
  <>
    {/* Scrim — dim but see-through so page is visible */}
    {open && (
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.18)',
          zIndex: 40,
        }}
      />
    )}
    {/* Drawer panel */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Drawer header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          Queue
        </span>
        <Chip active>2 running</Chip>
        <span
          onClick={onClose}
          style={{ marginLeft: 10, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1 }}
        >
          ✕
        </span>
      </div>

      {/* Drawer body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        <Label>In flight</Label>
        <Col gap={8} style={{ marginTop: 4 }}>
          {IN_FLIGHT_JOBS.map(job => (
            <div
              key={job.title}
              style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
              }}
            >
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>
                  {job.title}
                </span>
                <Chip>{job.engine}</Chip>
                <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>✕</span>
              </Row>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <ProgressBar pct={job.pct} />
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flexShrink: 0 }}>{job.pct}%</span>
              </Row>
              <Row gap={8}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>⏱ {job.eta}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Segs {job.segs}</span>
              </Row>
            </div>
          ))}
        </Col>

        <Label style={{ marginTop: 10 }}>Queued</Label>
        <Col gap={6} style={{ marginTop: 4 }}>
          {QUEUED_JOBS.map((job, i) => (
            <div
              key={job.title}
              style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>#{i + 3}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.3 }}>
                {job.title}
              </span>
              <Chip>{job.engine}</Chip>
              <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>✕</span>
            </div>
          ))}
        </Col>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span
          onClick={() => { onViewAll(); onClose(); }}
          style={{
            fontSize: '0.7rem',
            color: 'var(--accent)',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          View all activity →
        </span>
      </div>
    </div>
  </>
);

// ---------------------------------------------------------------------------
// Top bar

const TopBar: React.FC<{
  breadcrumb: string;
  queueOpen: boolean;
  onToggleQueue: () => void;
}> = ({ breadcrumb, queueOpen, onToggleQueue }) => (
  <div
    style={{
      height: 36,
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 10,
      zIndex: 10,
    }}
  >
    {/* Breadcrumb */}
    <span style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
      {breadcrumb.split(' / ').map((seg, i, arr) => (
        <React.Fragment key={seg}>
          <span style={{ color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === arr.length - 1 ? 600 : 400 }}>
            {seg}
          </span>
          {i < arr.length - 1 && <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>›</span>}
        </React.Fragment>
      ))}
    </span>

    {/* Connection dot */}
    <span style={{ fontSize: '0.5rem', color: '#22c55e' }}>●</span>
    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Connected</span>

    {/* Queue button */}
    <div
      onClick={onToggleQueue}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.68rem',
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 6,
        border: `1px solid ${queueOpen ? 'var(--accent)' : 'var(--border)'}`,
        background: queueOpen ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
        color: queueOpen ? 'var(--accent)' : 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      ⚡ Queue
      <span
        style={{
          fontSize: '0.58rem',
          fontWeight: 700,
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 10,
          padding: '0 5px',
          lineHeight: '14px',
          height: 14,
          display: 'inline-block',
        }}
      >
        2
      </span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Rail

type RailDest = 'Library' | 'Voices' | 'Activity' | 'Engines' | 'Integrations' | 'Settings';

const RAIL_GROUPS: { group: string; items: { id: RailDest; icon: string; badge?: string }[] }[] = [
  {
    group: 'CREATE',
    items: [
      { id: 'Library', icon: '📚' },
      { id: 'Voices', icon: '🎙' },
    ],
  },
  {
    group: 'MONITOR',
    items: [{ id: 'Activity', icon: '⚡', badge: '2' }],
  },
  {
    group: 'PLATFORM',
    items: [
      { id: 'Engines', icon: '🧩' },
      { id: 'Integrations', icon: '🔌' },
    ],
  },
  {
    group: 'MANAGE',
    items: [{ id: 'Settings', icon: '⚙' }],
  },
];

const Rail: React.FC<{
  active: RailDest;
  onSelect: (d: RailDest) => void;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ active, onSelect, collapsed, onToggle }) => (
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
                fontSize: '0.58rem',
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
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
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
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 400,
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && (
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.id}
                  </span>
                )}
                {item.badge && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      fontWeight: 700,
                      background: 'var(--accent)',
                      color: '#fff',
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
            );
          })}
        </div>
      ))}
    </div>
    <div
      onClick={onToggle}
      style={{
        padding: '8px',
        display: 'flex',
        justifyContent: collapsed ? 'center' : 'flex-end',
        cursor: 'pointer',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
      }}
      title={collapsed ? 'Expand rail' : 'Collapse rail'}
    >
      {collapsed ? '›' : '‹'}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Library pane

const LIBRARY_BOOKS = [
  { title: 'The Whispering Vale', author: 'E. Holloway', status: 'Studio', emoji: '📕' },
  { title: 'Echoes of Ember', author: 'R. Ashby', status: 'Review', emoji: '📗' },
  { title: 'Iron Meridian', author: 'S. Cross', status: 'Casting', emoji: '📘' },
  { title: 'The Silver Thread', author: 'A. Vance', status: 'Drafting', emoji: '📙' },
  { title: 'Starfall Compact', author: 'T. Wren', status: 'Published', emoji: '📒' },
  { title: 'Hollow Crown', author: 'D. Marsh', status: 'Drafting', emoji: '📓' },
];

const LibraryPane: React.FC<{ onOpenBook: () => void }> = ({ onOpenBook }) => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={8} style={{ alignItems: 'center' }}>
      <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Good evening, Steven
      </div>
      <Btn primary>+ New Book</Btn>
    </Row>

    <Label>Continue</Label>
    <Row gap={8}>
      {[
        {
          title: 'The Whispering Vale',
          author: 'E. Holloway',
          series: 'The Vale Cycle · #1',
          statusLine: 'Studio · Chapter 7 rendering',
          pct: 64,
          eta: '12m left',
          emoji: '📕',
        },
        {
          title: 'Echoes of Ember',
          author: 'R. Ashby',
          series: 'Ember Sequence · #2',
          statusLine: 'Review · 3 notes open',
          pct: null,
          eta: null,
          emoji: '📗',
        },
      ].map(book => (
        <div
          key={book.title}
          onClick={onOpenBook}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '9px 11px',
            cursor: 'pointer',
            display: 'flex',
            gap: 9,
            alignItems: 'flex-start',
          }}
        >
          {/* Cover thumbnail */}
          <div style={{
            width: 36,
            height: 50,
            borderRadius: 4,
            background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
            border: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.3rem',
            lineHeight: 1,
          }}>
            {book.emoji}
          </div>
          <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {book.title}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{book.author}</div>
            <div style={{ fontSize: '0.57rem', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.2 }}>
              {book.series}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
              {book.statusLine}
            </div>
            {book.pct !== null && (
              <Row gap={6} style={{ alignItems: 'center', marginTop: 1 }}>
                <ProgressBar pct={book.pct} height={3} />
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {book.eta}
                </span>
              </Row>
            )}
          </Col>
        </div>
      ))}
    </Row>

    <Row gap={6} style={{ alignItems: 'center', marginTop: 4 }}>
      <Label>All Books</Label>
      <div style={{ flex: 1 }} />
      {['Recent', 'A–Z', 'In Progress'].map((c, i) => (
        <Chip key={c} active={i === 0}>{c}</Chip>
      ))}
    </Row>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))',
        gap: 8,
      }}
    >
      {LIBRARY_BOOKS.map((book) => (
        <div
          key={book.title}
          onClick={onOpenBook}
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '9px 6px 7px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '1.9rem', lineHeight: 1 }}>{book.emoji}</div>
          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.3 }}>
            {book.title}
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 1 }}>
            {book.author}
          </div>
          <div style={{ marginTop: 5 }}>
            <StatusPill status={book.status} />
          </div>
        </div>
      ))}
    </div>
  </Col>
);

// ---------------------------------------------------------------------------
// Book tabs content

type BookTab = 'Manuscript' | 'Casting' | 'Studio' | 'Review' | 'Publish';
const BOOK_TABS: BookTab[] = ['Manuscript', 'Casting', 'Studio', 'Review', 'Publish'];

const CHAPTERS = [
  { n: 1, title: 'The Hollow Road', words: 2814, status: 'Published' },
  { n: 2, title: 'Ember in the Dark', words: 3102, status: 'Published' },
  { n: 3, title: 'Voices Underground', words: 2650, status: 'Review' },
  { n: 4, title: 'A Vale at Dusk', words: 3440, status: 'Studio' },
  { n: 5, title: 'Silver and Stone', words: 2980, status: 'Studio' },
  { n: 6, title: "The Warden's Keep", words: 3210, status: 'Drafting' },
  { n: 7, title: 'Whispers at Threshold', words: 2775, status: 'Drafting' },
];

const ManuscriptPane: React.FC = () => (
  <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Chapter table */}
    <Col gap={0} style={{ flex: 2, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {/* Header */}
      <Row
        gap={0}
        style={{
          padding: '5px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        {['#', 'Title', 'Words', 'Status'].map((h, i) => (
          <div
            key={h}
            style={{
              fontSize: '0.58rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flex: i === 1 ? 3 : 1,
              textAlign: i > 1 ? 'right' : 'left',
            }}
          >
            {h}
          </div>
        ))}
      </Row>
      {CHAPTERS.map((ch, i) => (
        <Row
          key={ch.n}
          gap={0}
          style={{
            padding: '5px 10px',
            borderBottom: i < CHAPTERS.length - 1 ? '1px solid var(--border)' : 'none',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>{ch.n}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-primary)', fontWeight: 500, flex: 3 }}>{ch.title}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>{ch.words.toLocaleString()}</div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <StatusPill status={ch.status} />
          </div>
        </Row>
      ))}
    </Col>

    {/* Right panel */}
    <Col gap={8} style={{ flex: 1 }}>
      {/* Import dropzone */}
      <div
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 8,
          padding: '16px 12px',
          textAlign: 'center',
          background: 'var(--surface-alt)',
        }}
      >
        <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>📄</div>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)' }}>Import</div>
        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3 }}>
          Drop .txt · .epub · .docx
        </div>
        <Btn small style={{ marginTop: 8, display: 'inline-flex' }}>Choose file</Btn>
      </div>

      {/* Chapter preview */}
      <div
        style={{
          flex: 1,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 10px',
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Chapter 1 Preview
        </div>
        {[
          'The road wound down through silver birch and pale stone…',
          'Maren pulled her cloak tighter. The vale smelled of old rain.',
          '"They say the warden never sleeps," Dov said quietly.',
          'She did not answer. The lantern swayed in the still air.',
        ].map((line, i) => (
          <div key={i} style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 2 }}>
            {line}
          </div>
        ))}
        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
          … +2,810 words
        </div>
      </div>
    </Col>
  </Row>
);

const CHARACTERS = [
  { name: 'Maren', color: '#6366f1', lines: 142, voice: 'Studio Voice' },
  { name: 'Dov', color: '#f59e0b', lines: 88, voice: 'Marcus Reed' },
  { name: 'The Warden', color: '#ef4444', lines: 34, voice: 'Old Tom' },
  { name: 'Narrator', color: '#22c55e', lines: 210, voice: 'Studio Voice' },
  { name: 'Sira', color: '#ec4899', lines: 29, voice: 'Unassigned' },
];

const CastingPane: React.FC = () => (
  <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Character table */}
    <Col gap={0} style={{ flex: 2, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <Row
        gap={0}
        style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {['Character', 'Lines', 'Voice'].map(h => (
          <div
            key={h}
            style={{
              fontSize: '0.58rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flex: 1,
            }}
          >
            {h}
          </div>
        ))}
      </Row>
      {CHARACTERS.map((ch, i) => (
        <Row
          key={ch.name}
          gap={0}
          style={{
            padding: '6px 10px',
            borderBottom: i < CHARACTERS.length - 1 ? '1px solid var(--border)' : 'none',
            alignItems: 'center',
          }}
        >
          <Row gap={6} style={{ flex: 1, alignItems: 'center' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ch.color,
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ch.name}</span>
          </Row>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>{ch.lines}</div>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: '0.62rem',
                color: ch.voice === 'Unassigned' ? 'var(--text-muted)' : 'var(--text-primary)',
                fontStyle: ch.voice === 'Unassigned' ? 'italic' : 'normal',
              }}
            >
              {ch.voice !== 'Unassigned' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'var(--accent-tint-bg)',
                    border: '1px solid var(--border)',
                    fontSize: '0.55rem',
                    marginRight: 4,
                    verticalAlign: 'middle',
                  }}
                >
                  🎙
                </span>
              )}
              {ch.voice}
            </span>
          </div>
        </Row>
      ))}
    </Col>

    {/* Right panel */}
    <Col gap={8} style={{ flex: 1 }}>
      {/* Voice picker card */}
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          🎙 Studio Voice
        </div>
        <Col gap={6}>
          <Row gap={4} style={{ flexWrap: 'wrap' }}>
            <Chip color="#6366f1">Narrator</Chip>
            <Chip color="#ec4899">Female</Chip>
            <Chip color="#f59e0b">Adult</Chip>
            <Chip color="#22c55e">Warm</Chip>
          </Row>
          <Btn small style={{ marginTop: 4 }}>▶ Preview 15s</Btn>
          <Btn primary small>Assign to Maren</Btn>
        </Col>
      </div>

      {/* AI casting */}
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          ✨ Suggest cast (AI)
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Recommends voices per character — never auto-assigns.
        </div>
        <Btn small>Run suggestions</Btn>
      </div>
    </Col>
  </Row>
);

const SCRIPT_LINES = [
  { speaker: 'Narrator', color: '#22c55e', text: 'The gate groaned open on rusted hinges.' },
  { speaker: 'Maren', color: '#6366f1', text: "\"Stay close. The warden's lantern moves at dusk.\"" },
  { speaker: 'Dov', color: '#f59e0b', text: '"How close?" He tightened his grip on the satchel.' },
  { speaker: 'Narrator', color: '#22c55e', text: 'The vale swallowed them whole.', rendering: true },
  { speaker: 'Maren', color: '#6366f1', text: '"Close enough that you can hear me breathe."' },
  { speaker: 'Narrator', color: '#22c55e', text: 'Far above, an owl called once, then fell silent.' },
  { speaker: 'Dov', color: '#f59e0b', text: '"Right." He exhaled. "Right."' },
];

// Chapter render progress percentages for the rail (indexed by ch.n - 1)
const CHAPTER_RENDER_PCT = [100, 100, 80, 60, 30, 0, 0];

const StudioPane: React.FC = () => {
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [safeText, setSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);

  // Speaker colors from CHARACTERS (Maren=#6366f1, Dov=#f59e0b, Narrator=none/neutral)
  const narratorColor = '#22c55e';
  const marenColor = '#6366f1';
  const dovColor = '#f59e0b';

  return (
    <Row gap={0} style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
      {/* Chapter rail — upgraded */}
      <Col
        gap={0}
        style={{
          width: 130,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Chapters
        </div>
        {CHAPTERS.map((ch) => {
          const isActive = ch.n === 4;
          const orb = ch.status === 'Published' ? '#22c55e' : ch.status === 'Studio' ? '#f59e0b' : ch.status === 'Review' ? '#ec4899' : '#6b7280';
          const renderPct = CHAPTER_RENDER_PCT[ch.n - 1] ?? 0;
          return (
            <div
              key={ch.n}
              style={{
                padding: '6px 8px',
                background: isActive ? 'var(--accent-tint-bg)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <Row gap={5} style={{ alignItems: 'center' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: orb, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: '0.6rem', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive ? 700 : 400, lineHeight: 1.3, flex: 1 }}>
                  {ch.n}. {ch.title}
                </span>
                {isActive && (
                  <span
                    onClick={e => { e.stopPropagation(); setChapterMenuOpen(m => !m); }}
                    style={{ fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                    title="Chapter actions"
                  >
                    ⋯
                  </span>
                )}
              </Row>
              {/* Per-chapter render progress bar */}
              {renderPct > 0 && (
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <ProgressBar pct={renderPct} height={2} shimmer={renderPct < 100 && renderPct > 0} />
                </div>
              )}
              {renderPct === 0 && (
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <div style={{ height: 2, borderRadius: 1, background: 'var(--border)' }} />
                </div>
              )}
              {/* Chapter action menu (active chapter only) */}
              {isActive && chapterMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 4,
                    zIndex: 20,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    minWidth: 140,
                    padding: '4px 0',
                  }}
                >
                  {['Rebuild audio', 'Export', 'Download', 'Reset audio', 'Delete'].map((action) => (
                    <div
                      key={action}
                      onClick={() => setChapterMenuOpen(false)}
                      style={{
                        fontSize: '0.65rem',
                        padding: '5px 12px',
                        color: action === 'Delete' ? '#ef4444' : 'var(--text-primary)',
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
      </Col>

      {/* Center: view-mode area + controls */}
      <Col gap={0} style={{ flex: 1, overflow: 'hidden' }}>
        {/* View mode pills row */}
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          {(['book', 'script'] as const).map(mode => (
            <div
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
                cursor: 'pointer',
                border: `1px solid ${viewMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                background: viewMode === mode ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                color: viewMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'book' ? 'Book view' : 'Script view'}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {/* Dev-ish toggles */}
          <div
            onClick={() => setSafeText(s => !s)}
            style={{
              fontSize: '0.6rem',
              padding: '2px 8px',
              borderRadius: 20,
              cursor: 'pointer',
              border: `1px solid ${safeText ? 'var(--accent)' : 'var(--border)'}`,
              background: safeText ? 'var(--accent-tint-bg)' : 'transparent',
              color: safeText ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            Safe text
          </div>
          <div
            onClick={() => setShowNumbers(n => !n)}
            style={{
              fontSize: '0.6rem',
              padding: '2px 8px',
              borderRadius: 20,
              cursor: 'pointer',
              border: `1px solid ${showNumbers ? 'var(--accent)' : 'var(--border)'}`,
              background: showNumbers ? 'var(--accent-tint-bg)' : 'transparent',
              color: showNumbers ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            #
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          {viewMode === 'book' ? (
            <Col gap={10}>
              {/* Safe text notice */}
              {safeText && (
                <div style={{
                  fontSize: '0.58rem',
                  color: 'var(--accent)',
                  background: 'var(--accent-tint-bg)',
                  border: '1px solid var(--accent)',
                  borderRadius: 4,
                  padding: '3px 8px',
                }}>
                  safe text is per-engine — may differ per section by voice
                </div>
              )}

              {/* Paragraph 1 — mostly narrator, one rendered sentence */}
              <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§1</span>}
                {safeText
                  ? 'The road went down through pale trees and old stone.'
                  : 'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.'
                }{' '}
                {/* Rendered sentence — green tint + play affordance */}
                <span style={{
                  background: 'rgba(34,197,94,0.10)',
                  borderRadius: 3,
                  padding: '1px 3px',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'inline',
                }}>
                  <span style={{ fontSize: '0.6rem', marginRight: 3, color: '#22c55e' }}>▶</span>
                  {safeText ? 'Maren pulled her cloak close.' : 'Maren pulled her cloak tighter against the chill that rose from the valley floor.'}
                </span>{' '}
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§2</span>}
                {safeText ? 'The vale smelled of rain.' : 'The vale smelled of old rain and something older still — loam and iron and time.'}
              </div>

              {/* Paragraph 2 — dialogue with speaker underlines */}
              <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§3</span>}
                {/* Maren dialogue */}
                <span style={{
                  borderBottom: `2px solid ${marenColor}`,
                  paddingBottom: 1,
                }}>
                  {'"Stay close to me.'}
                </span>{' '}
                <span style={{
                  borderBottom: `2px solid ${marenColor}`,
                  paddingBottom: 1,
                }}>
                  {safeText ? 'The warden moves at dusk."' : "The warden's lantern moves at dusk, and it moves fast.\""}
                </span>{' '}
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§4</span>}
                {/* In-progress / rendering sentence */}
                <span style={{
                  background: 'var(--accent-tint-bg)',
                  borderRadius: 3,
                  padding: '1px 3px',
                  display: 'inline',
                }}>
                  {safeText ? 'Dov tightened his grip.' : 'Dov tightened his grip on the satchel and said nothing for a long moment.'}
                  <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 5 }}>
                    rendering…
                  </span>
                </span>{' '}
                {/* Dov response */}
                <span style={{
                  borderBottom: `2px solid ${dovColor}`,
                  paddingBottom: 1,
                }}>
                  {'"How close exactly?"'}
                </span>
              </div>

              {/* Paragraph 3 — mixed sentence callout */}
              <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)', position: 'relative' }}>
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§5</span>}
                {safeText ? 'The vale took them.' : 'Far above, an owl called once, then fell silent.'}{' '}
                {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§6</span>}
                {/* Mixed sentence: quoted span = Dov, rest = narrator */}
                <span title='Mixed: "He excelled," = Dov; rest = Narrator'>
                  <span style={{ borderBottom: `2px solid ${dovColor}`, paddingBottom: 1 }}>
                    {'"He excelled,"'}
                  </span>
                  {' Dove said, rising from his chair.'}
                </span>
                {/* Callout chip */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginLeft: 6,
                  fontSize: '0.52rem',
                  color: dovColor,
                  background: dovColor + '18',
                  border: `1px solid ${dovColor}55`,
                  borderRadius: 10,
                  padding: '1px 6px',
                  cursor: 'default',
                  verticalAlign: 'middle',
                }}>
                  sub-sentence assignment (planned)
                </span>
              </div>

              {/* Speaker key */}
              <Row gap={10} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speaker key:</span>
                {[
                  { label: 'Narrator', color: narratorColor, note: 'no underline / neutral' },
                  { label: 'Maren', color: marenColor },
                  { label: 'Dov', color: dovColor },
                ].map(s => (
                  <Row key={s.label} gap={4} style={{ alignItems: 'center' }}>
                    {s.note
                      ? <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Narrator — no underline</span>
                      : <>
                          <span style={{ width: 16, height: 2, background: s.color, display: 'inline-block', borderRadius: 1 }} />
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{s.label}</span>
                        </>
                    }
                  </Row>
                ))}
              </Row>
            </Col>
          ) : (
            /* Script view */
            <Col gap={0}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                Script view — final read-through / play-script preview
              </div>
              {SCRIPT_LINES.map((line, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 6,
                    borderRadius: 6,
                    padding: '5px 8px',
                    background: line.rendering ? 'var(--accent-tint-bg)' : 'transparent',
                    border: line.rendering ? '1px solid var(--accent)' : '1px solid transparent',
                  }}
                >
                  <Row gap={6} style={{ alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: line.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: line.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {line.speaker}
                    </span>
                    {line.rendering && (
                      <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 4 }}>
                        rendering…
                      </span>
                    )}
                  </Row>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-primary)', lineHeight: 1.5, paddingLeft: 13 }}>
                    {line.text}
                  </div>
                  {line.rendering && (
                    <div style={{ marginTop: 4, paddingLeft: 13 }}>
                      <ProgressBar pct={64} height={3} shimmer />
                    </div>
                  )}
                </div>
              ))}
            </Col>
          )}
        </div>

        {/* Render controls strip */}
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface)',
          }}
        >
          <Btn primary small>▶ Render chapter</Btn>
          <Btn small>Render remaining</Btn>
          <div style={{ flex: 1 }} />
          <Chip active>XTTS v2</Chip>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ETA ~12m</span>
        </div>
      </Col>
    </Row>
  );
};

const REVIEW_SENTENCES = [
  { text: 'The road wound down through silver birch and pale stone.', state: 'past' },
  { text: 'Maren pulled her cloak tighter against the chill.', state: 'past' },
  { text: 'The vale smelled of old rain and something older still.', state: 'playing' },
  { text: '"Stay close to me," she said quietly.', state: 'rerendering' },
  { text: 'Dov tightened his grip on the satchel.', state: 'future' },
  { text: 'Far above, an owl called once, then fell silent.', state: 'future' },
  { text: '"Right," he exhaled. "Right."', state: 'future' },
];

const ReviewPane: React.FC = () => (
  <Col gap={0} style={{ flex: 1, minHeight: 0 }}>
    {/* Transport row + waveform */}
    <div
      style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '6px 10px',
        marginBottom: 8,
        flexShrink: 0,
      }}
    >
      {/* Transport controls */}
      <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.8rem', cursor: 'pointer' }}>⏮</span>
        <span style={{ fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-muted)' }}>⏪5s</span>
        <span style={{ fontSize: '0.9rem', cursor: 'pointer', color: 'var(--accent)' }}>▶</span>
        <span style={{ fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-muted)' }}>5s⏩</span>
        <Chip active>Chapter 7</Chip>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>02:14 / 24:38</span>
      </Row>
      <WaveformSvg height={32} />
    </div>

    {/* Body: text panel + annotations column */}
    <Row gap={10} style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
      {/* Text follow-along panel */}
      <Col gap={0} style={{ flex: 2, minHeight: 0 }}>
        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
          text follows playback — auto-scroll, tap a sentence to seek
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Col gap={3}>
            {REVIEW_SENTENCES.map((s, i) => {
              const isPlaying = s.state === 'playing';
              const isPast = s.state === 'past';
              const isRerendering = s.state === 'rerendering';
              return (
                <div
                  key={i}
                  style={{
                    fontSize: '0.7rem',
                    lineHeight: 1.65,
                    color: isPast ? 'var(--text-muted)' : 'var(--text-primary)',
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: isPlaying
                      ? 'var(--accent-tint-bg)'
                      : isRerendering
                      ? 'rgba(139,92,246,0.08)'
                      : 'transparent',
                    border: isPlaying
                      ? '1px solid var(--accent)'
                      : isRerendering
                      ? '1px solid #8b5cf655'
                      : '1px solid transparent',
                    cursor: 'pointer',
                    fontWeight: isPlaying ? 600 : 400,
                    opacity: isPast ? 0.55 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ flex: 1 }}>{s.text}</span>
                  {isRerendering && (
                    <span style={{ fontSize: '0.52rem', color: '#8b5cf6', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                      re-rendering — highlight follows progress, like Studio build view
                    </span>
                  )}
                </div>
              );
            })}
          </Col>
        </div>
      </Col>

      {/* Annotations column */}
      <Col gap={8} style={{ flex: 1, minHeight: 0 }}>
        <Label>Annotations</Label>
        <Col gap={6} style={{ flex: 1, overflowY: 'auto' }}>
          {[
            { ts: '0:42', note: "Mispronounced 'Vale' — needs re-render" },
            { ts: '3:18', note: 'Pause too long after sentence end' },
            { ts: '9:05', note: "Narrator volume dips on 'stone'" },
          ].map(ann => (
            <div
              key={ann.ts}
              style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 8px',
              }}
            >
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <Chip>{ann.ts}</Chip>
                <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {ann.note}
                </span>
              </Row>
              <Btn small>Re-render section</Btn>
            </div>
          ))}
          <div
            style={{
              fontSize: '0.62rem',
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: '4px 2px',
            }}
          >
            + Add note at 02:14
          </div>
        </Col>
      </Col>
    </Row>
  </Col>
);

const PublishPane: React.FC = () => (
  <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Left: assembly card */}
    <Col gap={8} style={{ flex: 1 }}>
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 6 }}>📕</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          The Whispering Vale
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Runtime: 6h 12m · 12/12 chapters
        </div>
        <Row gap={4} style={{ justifyContent: 'center', marginBottom: 8 }}>
          <ProgressBar pct={100} height={4} />
        </Row>
        <Btn primary>Assemble M4B</Btn>
      </div>
    </Col>

    {/* Right: metadata + export + backups */}
    <Col gap={8} style={{ flex: 2 }}>
      {/* Metadata form */}
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {[
          { label: 'Title', value: 'The Whispering Vale' },
          { label: 'Author', value: 'E. Holloway' },
          { label: 'Narrator', value: 'Studio Voice' },
          { label: 'Series', value: 'The Vale Chronicles, #1' },
        ].map((row, i, arr) => (
          <Row
            key={row.label}
            gap={0}
            style={{
              padding: '6px 10px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>
              {row.label}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)', flex: 1 }}>{row.value}</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>✎</span>
          </Row>
        ))}
      </div>

      {/* Export row */}
      <div>
        <Label>Export</Label>
        <Row gap={6} style={{ marginTop: 4 }}>
          <Btn primary small>⬇ M4B</Btn>
          <Btn small>⬇ MP3</Btn>
          <Btn small>⬇ EPUB3</Btn>
        </Row>
      </div>

      {/* Backups */}
      <div>
        <Label>Backups</Label>
        <Col gap={4} style={{ marginTop: 4 }}>
          {[
            '2026-06-11 23:14 — auto (pre-assemble)',
            '2026-06-10 18:30 — manual',
            '2026-06-09 09:05 — auto',
          ].map(b => (
            <div
              key={b}
              style={{
                fontSize: '0.6rem',
                color: 'var(--text-muted)',
                padding: '4px 8px',
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{b}</span>
              <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>Restore</span>
            </div>
          ))}
        </Col>
      </div>
    </Col>
  </Row>
);

// ---------------------------------------------------------------------------
// Book header strip — shown on ALL 5 pipeline stage tabs

const BookHeaderStrip: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0 10px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}
  >
    {/* Cover thumbnail with hover-chip affordance */}
    <div
      style={{
        width: 44,
        height: 60,
        borderRadius: 5,
        background: 'linear-gradient(135deg, #6366f133 0%, #8b5cf633 100%)',
        border: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.6rem',
        position: 'relative',
        cursor: 'pointer',
      }}
      title="Change cover"
    >
      📕
      <span
        style={{
          position: 'absolute',
          bottom: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.46rem',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          borderRadius: 3,
          padding: '1px 4px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        Change
      </span>
    </div>

    {/* Title / author / series / runtime column */}
    <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
      {/* Title row */}
      <Row gap={5} style={{ alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>
          The Whispering Vale
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Edit title">✏</span>
      </Row>
      {/* Author + edit */}
      <Row gap={5} style={{ alignItems: 'center' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>E. Holloway</span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Edit author">✏</span>
      </Row>
      {/* Series chip */}
      <Row gap={5} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip color="#8b5cf6">The Vale Cycle · #1</Chip>
        <Chip>6h 12m</Chip>
        <span style={{ fontSize: '0.57rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          predicted 6h 28m
        </span>
      </Row>
      {/* Created date */}
      <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Created 2026-05-14</span>
    </Col>

    {/* Default narrator chip */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        cursor: 'pointer',
        flexShrink: 0,
      }}
      title="Go to Casting to change default narrator"
    >
      {/* Avatar circle */}
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--accent-tint-bg)',
          border: '1px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.65rem',
          flexShrink: 0,
        }}
      >
        🎙
      </div>
      <Col gap={0}>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: 1 }}>Default narrator</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          Elena Marsh
        </span>
      </Col>
      <span style={{ fontSize: '0.55rem', color: 'var(--accent)', marginLeft: 2 }}>→ Casting</span>
    </div>
  </div>
);

const BookPane: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<BookTab>('Studio');

  return (
    <Col gap={0} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      {/* Breadcrumb back link */}
      <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
        <span
          onClick={onBack}
          style={{ fontSize: '0.65rem', color: 'var(--accent)', cursor: 'pointer' }}
        >
          ← Library
        </span>
      </Row>

      {/* Book header strip — shown on all tabs */}
      <BookHeaderStrip />

      {/* Stage tabs */}
      <Row gap={2} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0, marginTop: 8 }}>
        {BOOK_TABS.map(t => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: '0.72rem',
              fontWeight: tab === t ? 700 : 400,
              padding: '4px 12px',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              background: tab === t ? 'var(--accent-tint-bg)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {t}
          </div>
        ))}
        <div style={{ flex: 1 }} />
      </Row>

      {/* Tab content — must fill remaining space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 10 }}>
        {tab === 'Manuscript' && <ManuscriptPane />}
        {tab === 'Casting' && <CastingPane />}
        {tab === 'Studio' && <StudioPane />}
        {tab === 'Review' && <ReviewPane />}
        {tab === 'Publish' && <PublishPane />}
      </div>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Voices pane

const VOICE_CARDS = [
  { name: 'Studio Voice', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }, { label: 'Warm', color: '#f59e0b' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Marcus Reed', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Male', color: '#3b82f6' }, { label: 'Deep', color: '#8b5cf6' }], emoji: '🎤', cta: 'Edit voice' },
  { name: 'Clara Bell', pills: [{ label: 'Dialogue', color: '#22c55e' }, { label: 'Female', color: '#ec4899' }, { label: 'Bright', color: '#f59e0b' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Old Tom', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'Male', color: '#3b82f6' }, { label: 'Gruff', color: '#6b7280' }], emoji: '🎤', cta: 'Edit voice' },
  { name: 'Aria', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }, { label: 'Clear', color: '#0ea5e9' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Frost', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'NB', color: '#a78bfa' }, { label: 'Cool', color: '#0ea5e9' }], emoji: '🎤', cta: 'Edit voice' },
];

const DISCOVER_CARDS = [
  { name: 'VoxNarrator-v2', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Male', color: '#3b82f6' }], emoji: '🤗' },
  { name: 'EmberReader', pills: [{ label: 'Dialogue', color: '#22c55e' }, { label: 'Female', color: '#ec4899' }], emoji: '🤗' },
  { name: 'DeepCast-M', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'Male', color: '#3b82f6' }], emoji: '🤗' },
  { name: 'ClearTone-F', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }], emoji: '🤗' },
];

const VoicesPane: React.FC = () => {
  const [voiceTab, setVoiceTab] = useState<'local' | 'discover'>('local');
  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      {/* Tab pills */}
      <Row gap={6}>
        <div
          onClick={() => setVoiceTab('local')}
          style={{
            fontSize: '0.7rem', fontWeight: 600, padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${voiceTab === 'local' ? 'var(--accent)' : 'var(--border)'}`,
            background: voiceTab === 'local' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
            color: voiceTab === 'local' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          My Voices
        </div>
        <div
          onClick={() => setVoiceTab('discover')}
          style={{
            fontSize: '0.7rem', fontWeight: 600, padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${voiceTab === 'discover' ? 'var(--accent)' : 'var(--border)'}`,
            background: voiceTab === 'discover' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
            color: voiceTab === 'discover' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          🤗 Discover
        </div>
      </Row>

      {voiceTab === 'local' && (
        <>
          {/* Facets */}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {[
              { label: 'Narrator', color: '#6366f1' },
              { label: 'Female', color: '#ec4899' },
              { label: 'Adult', color: '#f59e0b' },
              { label: 'Warm', color: '#22c55e' },
            ].map((f, i) => (
              <Chip key={f.label} active={i === 0} color={i === 0 ? f.color : undefined}>{f.label}</Chip>
            ))}
            <Chip>+ Filter</Chip>
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {VOICE_CARDS.map(v => (
              <div
                key={v.name}
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 10px 8px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--accent-tint-bg)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    margin: '0 auto 6px',
                  }}
                >
                  {v.emoji}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => <Chip key={p.label} color={p.color}>{p.label}</Chip>)}
                </Row>
                <Row gap={4} style={{ marginTop: 6, justifyContent: 'center' }}>
                  <Btn small>▶ Preview</Btn>
                  <Btn small primary>{v.cta}</Btn>
                </Row>
              </div>
            ))}
          </div>
        </>
      )}

      {voiceTab === 'discover' && (
        <>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Community voices from Hugging Face — download to install locally.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {DISCOVER_CARDS.map(v => (
              <div
                key={v.name}
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 10px 8px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', margin: '0 auto 6px',
                  }}
                >
                  {v.emoji}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => <Chip key={p.label} color={p.color}>{p.label}</Chip>)}
                </Row>
                <Btn small style={{ marginTop: 6 }}>⬇ Download</Btn>
              </div>
            ))}
          </div>
        </>
      )}
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Activity pane

const ActivityPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <Col gap={8} style={{ flex: 2 }}>
        <Label>Now</Label>
        {IN_FLIGHT_JOBS.map(job => (
          <div
            key={job.title}
            style={{
              background: 'var(--surface-alt)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <Row gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {job.title}
              </span>
              <Chip>{job.engine}</Chip>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{job.eta}</span>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 3 }}>
              <ProgressBar pct={job.pct} />
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flexShrink: 0 }}>{job.pct}%</span>
            </Row>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Segs {job.segs}</span>
          </div>
        ))}

        <Label>History</Label>
        <div
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {[
            { job: 'Whispering Vale — Ch 6', engine: 'XTTS', dur: '14m 22s', ago: '2h ago', ok: true },
            { job: 'Iron Meridian — Ch 2', engine: 'XTTS', dur: '11m 05s', ago: '3h ago', ok: true },
            { job: 'Echoes of Ember — Ch 4', engine: 'Voxtral', dur: '9m 48s', ago: '5h ago', ok: true },
            { job: 'Whispering Vale — Ch 5', engine: 'XTTS', dur: '13m 11s', ago: 'yesterday', ok: true },
            { job: 'Iron Meridian — Ch 1', engine: 'Mixed', dur: '18m 33s', ago: '2d ago', ok: false },
          ].map((row, i, arr) => (
            <Row
              key={row.job}
              gap={6}
              style={{
                padding: '5px 10px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 3 }}>{row.job}</span>
              <Chip>{row.engine}</Chip>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>{row.dur}</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>{row.ago}</span>
              <Chip color={row.ok ? '#22c55e' : '#ef4444'}>{row.ok ? '✓' : '✗'}</Chip>
            </Row>
          ))}
        </div>
      </Col>

      <Col gap={8} style={{ flex: 1 }}>
        <Label>Stats</Label>
        <div
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <Chip active>XTTS · 14.2 chars/s</Chip>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 6 }}>Voxtral · 10.8 chars/s</div>
        </div>
        <div
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>Production</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: 3 }}>
            23h 41m generated · 312 chapters
          </div>
          {/* Mini bar chart sketch */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', marginTop: 8, height: 24 }}>
            {[6, 9, 14, 11, 18, 22, 17].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h / 22 * 100}%`,
                  background: i === 6 ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 2,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 3 }}>Last 7 days</div>
        </div>
      </Col>
    </Row>
  </Col>
);

// ---------------------------------------------------------------------------
// Engines pane

const EnginesPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Label>Installed</Label>
    <Col gap={8}>
      {[
        { name: 'XTTS v2', version: 'v2.0.3', desc: 'Local · GPU · High quality voice cloning', status: 'Active', ok: true },
        { name: 'Voxtral', version: 'v1.1.0', desc: 'Local · CPU/GPU · Fast inference', status: 'Active', ok: true },
        { name: 'Mixed', version: 'v1.0.1', desc: 'Routes across installed engines', status: 'Active', ok: true },
      ].map(e => (
        <div
          key={e.name}
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🧩</span>
          <div style={{ flex: 1 }}>
            <Row gap={6} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{e.name}</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{e.version}</span>
            </Row>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{e.desc}</div>
          </div>
          <span style={{ fontSize: '0.55rem', color: '#22c55e' }}>●</span>
          <Chip color="#22c55e">{e.status}</Chip>
          <Btn small>Configure</Btn>
        </div>
      ))}
    </Col>

    <Label>Browse store</Label>
    <div
      style={{
        border: '2px dashed var(--border)',
        borderRadius: 8,
        padding: '14px',
        textAlign: 'center',
        background: 'var(--surface-alt)',
      }}
    >
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>GitHub plugin repos · Install from .zip · Trust model</div>
      <Btn small style={{ marginTop: 8, display: 'inline-flex' }}>Browse</Btn>
    </div>
  </Col>
);

// ---------------------------------------------------------------------------
// Integrations pane

const IntegrationsPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Label>Gateway API</Label>
    <div
      style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          Studio as TTS Gateway
        </div>
        <span style={{ fontSize: '0.5rem', color: '#22c55e' }}>●</span>
        <Chip color="#22c55e">Enabled</Chip>
      </Row>
      <Col gap={6}>
        {/* API key row */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 50 }}>API Key</span>
          <span style={{ flex: 1, fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            sk-••••••••••••ef4a
          </span>
          <Btn small>Copy</Btn>
          <Btn small>Rotate</Btn>
        </div>

        {/* Docs link */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 50 }}>Docs</span>
          <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--accent)', fontFamily: 'monospace' }}>
            /api/v1/tts/docs → Swagger UI
          </span>
          <Btn small>Open ↗</Btn>
        </div>

        {/* Rate limit */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 50 }}>Rate</span>
          <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
            60 req/min · unlimited chars
          </span>
          <Btn small>Edit</Btn>
        </div>
      </Col>
    </div>
  </Col>
);

// ---------------------------------------------------------------------------
// Settings pane

const SettingsPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <div
      style={{
        fontSize: '0.62rem',
        color: 'var(--text-muted)',
        background: 'var(--accent-tint-bg)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '4px 10px',
        marginBottom: 4,
      }}
    >
      Engines &amp; Integrations are under PLATFORM — Settings is intentionally thin.
    </div>
    {[
      {
        section: 'Appearance',
        rows: [
          { label: 'Theme', value: 'System' },
          { label: 'Font scale', value: '100%' },
        ],
      },
      {
        section: 'Defaults',
        rows: [
          { label: 'Default engine', value: 'XTTS v2' },
          { label: 'Default voice', value: 'Studio Voice' },
          { label: 'Stability mode', value: 'Balanced' },
        ],
      },
      {
        section: 'Advanced',
        rows: [
          { label: 'Diagnostics', value: 'Off' },
          { label: 'Restart TTS server', value: '—' },
          { label: 'Reset all data', value: '—' },
        ],
      },
      {
        section: 'About',
        rows: [
          { label: 'Version', value: '2.0.0-rc1 · build a4f9c' },
          { label: 'Production tally', value: '23h 41m generated' },
        ],
      },
    ].map(({ section, rows }) => (
      <Col key={section} gap={6}>
        <Label>{section}</Label>
        <div
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {rows.map((row, i) => (
            <div
              key={row.label}
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-secondary)',
                padding: '7px 12px',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{row.value}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>›</span>
              </Row>
            </div>
          ))}
        </div>
      </Col>
    ))}
  </Col>
);

// ---------------------------------------------------------------------------
// Player bar (full width, waveform toggle)

const PlayerBar: React.FC = () => {
  const [waveOpen, setWaveOpen] = useState(false);
  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {waveOpen && (
        <div style={{ padding: '6px 14px 2px', borderBottom: '1px solid var(--border)' }}>
          <WaveformSvg height={32} />
        </div>
      )}
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
        }}
      >
        <Row gap={5} style={{ alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', cursor: 'default' }}>⏮</span>
          <span style={{ fontSize: '0.85rem', cursor: 'default' }}>▶</span>
          <span style={{ fontSize: '0.85rem', cursor: 'default' }}>⏭</span>
        </Row>
        <div
          style={{
            height: 3,
            flex: 1,
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: '38%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
        </div>
        <Chip>Ch 4 · seg 3</Chip>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          02:14 / 28:10
        </span>
        <div
          onClick={() => setWaveOpen(w => !w)}
          title="Toggle waveform"
          style={{
            fontSize: '0.65rem',
            cursor: 'pointer',
            padding: '2px 7px',
            borderRadius: 4,
            border: `1px solid ${waveOpen ? 'var(--accent)' : 'var(--border)'}`,
            color: waveOpen ? 'var(--accent)' : 'var(--text-muted)',
            background: waveOpen ? 'var(--accent-tint-bg)' : 'transparent',
          }}
        >
          〰
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root mockup

const SiteMockup: React.FC = () => {
  const [activeRail, setActiveRail] = useState<RailDest>('Library');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [inBook, setInBook] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const handleRailSelect = (dest: RailDest) => {
    setActiveRail(dest);
    if (dest !== 'Library') setInBook(false);
  };

  // Compute breadcrumb
  let breadcrumb = 'Library';
  if (activeRail !== 'Library') {
    breadcrumb = activeRail;
  } else if (inBook) {
    breadcrumb = 'Library / The Whispering Vale / Studio';
  }

  return (
    <Col gap={0} style={{ height: '100%', position: 'relative' }}>
      {/* Caption */}
      <div
        style={{
          fontSize: '0.62rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          padding: '3px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        North-star organization mockup v3 — current functionality represented. Queue drawer = check status from anywhere without losing your place.
      </div>

      {/* App window — column: [top bar] / [rail + content] / [player bar] */}
      <Col gap={0} style={{ flex: 1, overflow: 'hidden' }}>
        {/* Top bar — full window width */}
        <TopBar
          breadcrumb={breadcrumb}
          queueOpen={queueOpen}
          onToggleQueue={() => setQueueOpen(o => !o)}
        />

        {/* Middle row: rail + content — drawer is scoped here so it does NOT cover player bar */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Rail */}
          <Rail
            active={activeRail}
            onSelect={handleRailSelect}
            collapsed={railCollapsed}
            onToggle={() => setRailCollapsed(c => !c)}
          />

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {activeRail === 'Library' && !inBook && (
              <LibraryPane onOpenBook={() => setInBook(true)} />
            )}
            {activeRail === 'Library' && inBook && (
              <BookPane onBack={() => setInBook(false)} />
            )}
            {activeRail === 'Voices' && <VoicesPane />}
            {activeRail === 'Activity' && <ActivityPane />}
            {activeRail === 'Engines' && <EnginesPane />}
            {activeRail === 'Integrations' && <IntegrationsPane />}
            {activeRail === 'Settings' && <SettingsPane />}
          </div>

          {/* Queue drawer overlay — scoped to middle row, does not cover player bar */}
          <QueueDrawer
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            onViewAll={() => handleRailSelect('Activity')}
          />
        </div>

        {/* Player bar — full window width, below both rail and content */}
        <PlayerBar />
      </Col>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Stage wrapper

const SiteMockupElement: React.FC = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}
  >
    <div
      style={{
        flex: 1,
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <SiteMockup />
    </div>
  </div>
);

export const siteMockupStage = {
  id: 'site-mockup',
  title: 'Site Mockup — North Star',
  description:
    'Medium-fidelity full-site layout mockup v3 — current functionality represented: queue drawer slide-over, collapsible rail, book header strip, book pipeline stages (Manuscript/Casting/Studio/Review/Publish), Studio book-view with speaker underlines + mixed-sentence callout, follow-along Review player, and all rail destinations with realistic fake data.',
  element: <SiteMockupElement />,
};
