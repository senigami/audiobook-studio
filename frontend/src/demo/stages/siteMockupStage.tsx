/**
 * siteMockupStage — North-star full-site organization mockup.
 *
 * Deliberately low-fidelity: gray placeholder boxes, labels, minimal styling.
 * No real components, no data wiring. Speed over polish.
 *
 * Navigation:
 *   - Left rail items switch `activeRail` state (Library, Voices, Activity,
 *     Engines, Integrations, Settings).
 *   - Clicking a book card in Library switches to Book pipeline view.
 *   - Book pipeline has 5 stage tabs (Manuscript, Casting, Studio, Review,
 *     Publish) driven by `activeBookTab` state.
 *   - Chevron at rail bottom toggles collapsed (icon-only ~56px) vs expanded.
 */

import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Shared primitives

const Box: React.FC<{
  label: string;
  sub?: string;
  height?: number | string;
  style?: React.CSSProperties;
}> = ({ label, sub, height = 56, style }) => (
  <div
    style={{
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height,
      padding: '6px 10px',
      textAlign: 'center',
      ...style,
    }}
  >
    <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
      {label}
    </span>
    {sub && (
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
        {sub}
      </span>
    )}
  </div>
);

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
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      padding: '4px 0 2px',
    }}
  >
    {children}
  </div>
);

const Chip: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
  <span
    style={{
      fontSize: '0.65rem',
      padding: '2px 8px',
      borderRadius: 20,
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Btn: React.FC<{ children: React.ReactNode; primary?: boolean; small?: boolean }> = ({
  children,
  primary,
  small,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: small ? '0.65rem' : '0.72rem',
      fontWeight: 600,
      padding: small ? '3px 8px' : '5px 14px',
      borderRadius: 6,
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--surface-alt)',
      color: primary ? '#fff' : 'var(--text-primary)',
      cursor: 'default',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </div>
);

const ProgressBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div
    style={{
      height: 4,
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
        background: 'var(--accent)',
        borderRadius: 2,
      }}
    />
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
                fontSize: '0.6rem',
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
                      fontSize: '0.6rem',
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
    {/* Collapse toggle */}
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
// Content panes

const LibraryPane: React.FC<{ onOpenBook: () => void }> = ({ onOpenBook }) => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    {/* Greeting + New Book */}
    <Row gap={8} style={{ alignItems: 'center' }}>
      <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Good afternoon, Steven
      </div>
      <Btn primary>+ New Book</Btn>
    </Row>

    {/* Continue row */}
    <Label>Continue</Label>
    <Row gap={8}>
      {[
        { title: 'The Whispering Vale', status: 'Studio · Ch 7 rendering — 12m left', emoji: '📕' },
        { title: 'Echoes of Ember', status: 'Review · 3 annotations pending', emoji: '📗' },
        { title: 'Iron Meridian', status: 'Casting · 80% assigned', emoji: '📘' },
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
            padding: '8px 10px',
            cursor: 'pointer',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>{book.emoji}</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {book.title}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {book.status}
            </div>
          </div>
        </div>
      ))}
    </Row>

    {/* All books grid */}
    <Row gap={6} style={{ alignItems: 'center', marginTop: 4 }}>
      <Label>All books</Label>
      <div style={{ flex: 1 }} />
      {['Recent', 'A–Z', 'In Progress'].map((c, i) => (
        <Chip key={c} active={i === 0}>{c}</Chip>
      ))}
    </Row>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
        gap: 8,
      }}
    >
      {['📕', '📗', '📘', '📙', '📒', '📓', '📔', '📕'].map((e, i) => (
        <div
          key={i}
          onClick={onOpenBook}
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 4px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '1.8rem' }}>{e}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Book {i + 1}
          </div>
        </div>
      ))}
    </div>
  </Col>
);

type BookTab = 'Manuscript' | 'Casting' | 'Studio' | 'Review' | 'Publish';
const BOOK_TABS: BookTab[] = ['Manuscript', 'Casting', 'Studio', 'Review', 'Publish'];

const ManuscriptPane: React.FC = () => (
  <Col gap={8}>
    <Row gap={8}>
      <Box label="Chapter list" sub="30 chapters" height={200} style={{ flex: 1 }} />
      <Box label="Import / paste box" sub="Drop .txt, .epub, .docx" height={200} style={{ flex: 1 }} />
    </Row>
    <Box label="Stage-progress strip" sub="Manuscript ✓ · Casting 80% · Studio 12/30 · Review — · Publish —" height={36} />
  </Col>
);

const CastingPane: React.FC = () => (
  <Row gap={8} style={{ flex: 1, alignItems: 'stretch' }}>
    <Col gap={8} style={{ flex: 2 }}>
      <Box label="Character / speaker table" sub="Name · Role · Voice assigned · Coverage %" height={180} />
      <Box label="Sub-sentence span assignments" sub="Highlighted script excerpt" height={80} />
    </Col>
    <Col gap={8} style={{ flex: 1 }}>
      <Box label="Voice assignment panel" sub="Book default → character → span cascade" height={120} />
      <Box label="AI casting suggestion card" sub="Recommend, never auto-assign" height={80} />
    </Col>
  </Row>
);

const StudioPane: React.FC = () => (
  <Row gap={8} style={{ flex: 1, alignItems: 'stretch' }}>
    <Box label="Chapter rail" sub="Ch 1–30 list, status dots" height={200} style={{ width: 120, flexShrink: 0 }} />
    <Col gap={8} style={{ flex: 2 }}>
      <Box label="Script / segments column" sub="Segment rows · speaker chips · waveform stubs" height={130} />
      <Box label="Render controls" sub="Render Chapter · Render All · Stop · Re-render" height={52} />
    </Col>
    <Col gap={8} style={{ flex: 1 }}>
      <Box label="Job status" sub="In-flight progress, ETA" height={90} />
      <Box label="Engine selector" sub="XTTS / Voxtral / Mixed" height={52} />
    </Col>
  </Row>
);

const ReviewPane: React.FC = () => (
  <Col gap={8}>
    <Box label="Waveform strip" sub="Rendered chapter audio — seek, zoom" height={80} />
    <Row gap={8}>
      <Box label="Segment playback list" sub="Per-segment play + annotation" height={120} style={{ flex: 2 }} />
      <Box label="Annotation panel" sub="Flag · note · re-render trigger" height={120} style={{ flex: 1 }} />
    </Row>
  </Col>
);

const PublishPane: React.FC = () => (
  <Row gap={8} style={{ flex: 1, alignItems: 'stretch' }}>
    <Col gap={8} style={{ flex: 2 }}>
      <Box label="Assembly card" sub="Stitch chapters → full WAV" height={72} />
      <Box label="Metadata form" sub="Title · Author · Narrator · Cover art" height={90} />
    </Col>
    <Col gap={8} style={{ flex: 1 }}>
      <Box label="Export buttons" sub=".zip · .m4b · folder" height={72} />
      <Box label="Loudness QA" sub="LUFS check · normalize" height={52} />
    </Col>
  </Row>
);

const BookPane: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<BookTab>('Manuscript');

  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      {/* Breadcrumb */}
      <Row gap={6} style={{ alignItems: 'center' }}>
        <span
          onClick={onBack}
          style={{ fontSize: '0.72rem', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Library
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>›</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          The Whispering Vale
        </span>
      </Row>

      {/* Stage tabs */}
      <Row gap={2} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
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
      </Row>

      {/* Tab content */}
      {tab === 'Manuscript' && <ManuscriptPane />}
      {tab === 'Casting' && <CastingPane />}
      {tab === 'Studio' && <StudioPane />}
      {tab === 'Review' && <ReviewPane />}
      {tab === 'Publish' && <PublishPane />}
    </Col>
  );
};

const VoicesPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    {/* Tab pills */}
    <Row gap={6}>
      <Chip active>My Voices</Chip>
      <Chip>Discover (Hugging Face)</Chip>
    </Row>
    {/* Facets */}
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      {['Class: Narrator', 'Gender: F', 'Age: Adult', 'Style: Warm'].map((f, i) => (
        <Chip key={f} active={i === 0}>{f}</Chip>
      ))}
      <Chip>+ Filter</Chip>
    </Row>
    {/* Voice cards grid */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {[
        { name: 'Studio Voice', pills: ['Narrator', 'F', 'Warm'], emoji: '🎙' },
        { name: 'Marcus Reed', pills: ['Narrator', 'M', 'Deep'], emoji: '🎤' },
        { name: 'Clara Bell', pills: ['Dialogue', 'F', 'Bright'], emoji: '🎙' },
        { name: 'Old Tom', pills: ['Character', 'M', 'Gruff'], emoji: '🎤' },
        { name: 'Aria', pills: ['Narrator', 'F', 'Clear'], emoji: '🎙' },
        { name: 'Frost', pills: ['Character', 'NB', 'Cool'], emoji: '🎤' },
      ].map(v => (
        <div
          key={v.name}
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{v.emoji}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
          <Row gap={4} style={{ marginTop: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {v.pills.map(p => <Chip key={p}>{p}</Chip>)}
          </Row>
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>▶</div>
        </div>
      ))}
    </div>
  </Col>
);

const ActivityPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <Col gap={8} style={{ flex: 2 }}>
        <Label>Now</Label>
        {[
          { title: 'The Whispering Vale — Ch 7', engine: 'XTTS', pct: 62, eta: '~12m left' },
          { title: 'Iron Meridian — Ch 3', engine: 'Voxtral', pct: 18, eta: '~34m left' },
        ].map(job => (
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
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{job.eta}</span>
            </Row>
            <Row gap={6} style={{ alignItems: 'center' }}>
              <ProgressBar pct={job.pct} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{job.pct}%</span>
            </Row>
          </div>
        ))}

        <Label>History</Label>
        <Box label="Job history table" sub="Book · Chapter · Engine · Duration · Completed at" height={80} />
      </Col>

      <Col gap={8} style={{ flex: 1 }}>
        <Label>Stats</Label>
        <Box label="Per-engine speed" sub="XTTS: 1.2× RT · Voxtral: 0.9× RT" height={64} />
        <Box label="Production tally" sub="23h generated this month" height={52} />
        <Box label="Queue depth" sub="2 active · 4 queued" height={52} />
      </Col>
    </Row>
  </Col>
);

const EnginesPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Label>Installed</Label>
    <Col gap={8}>
      {[
        { name: 'XTTS v2', desc: 'Local · GPU · High quality', status: '✓ Active' },
        { name: 'Voxtral', desc: 'Local · CPU/GPU · Fast', status: '✓ Active' },
        { name: 'Mixed', desc: 'Routes across engines', status: '✓ Active' },
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
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{e.name}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{e.desc}</div>
          </div>
          <Chip active>{e.status}</Chip>
          <Btn small>Settings</Btn>
        </div>
      ))}
    </Col>

    <Label>Browse store</Label>
    <Box label="Browse store placeholder" sub="GitHub plugin repos · Install from .zip · Trust model" height={60} />
  </Col>
);

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
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          Studio as TTS Gateway
        </div>
        <Chip>● Enabled</Chip>
      </Row>
      <Col gap={6}>
        <Box label="API key field" sub="sk-••••••••••••  [Rotate] [Copy]" height={40} />
        <Box label="Docs link" sub="/api/v1/tts/docs  →  Swagger UI" height={36} />
        <Box label="Rate limit settings" sub="coming — labels honest" height={36} />
        <Box label="Live request log" sub="coming — labels honest" height={36} />
        <Box label="Copy-paste recipes" sub="curl · Home Assistant · Python — coming" height={36} />
      </Col>
    </div>
  </Col>
);

const SettingsPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <div
      style={{
        fontSize: '0.65rem',
        color: 'var(--text-muted)',
        background: 'var(--accent-tint-bg)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '4px 10px',
        marginBottom: 4,
      }}
    >
      Engines &amp; Integrations moved to PLATFORM — Settings is intentionally thin.
    </div>
    {[
      { section: 'Appearance', rows: ['Theme (light / dark / system)', 'Font scale'] },
      { section: 'Defaults', rows: ['Default engine', 'Default voice', 'Stability mode'] },
      { section: 'Advanced', rows: ['Diagnostics', 'Restart TTS server', 'Reset all data'] },
      { section: 'About', rows: ['Version · build hash', 'Production tally'] },
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
              key={row}
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                padding: '7px 12px',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {row}
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>›</span>
            </div>
          ))}
        </div>
      </Col>
    ))}
  </Col>
);

// ---------------------------------------------------------------------------
// Player bar

const PlayerBar: React.FC = () => (
  <div
    style={{
      height: 44,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 14px',
      flexShrink: 0,
    }}
  >
    <Row gap={6} style={{ alignItems: 'center' }}>
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
      }}
    >
      <div style={{ width: '38%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
    </div>
    <Chip>Chapter 3 · segment 14</Chip>
    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
      02:14 / 05:40
    </span>
    <span
      style={{
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        whiteSpace: 'nowrap',
      }}
    >
      hidden when nothing loaded
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Root mockup

const SiteMockup: React.FC = () => {
  const [activeRail, setActiveRail] = useState<RailDest>('Library');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [inBook, setInBook] = useState(false);

  const handleRailSelect = (dest: RailDest) => {
    setActiveRail(dest);
    if (dest !== 'Library') setInBook(false);
  };

  return (
    <Col gap={0} style={{ height: '100%' }}>
      {/* Caption */}
      <div
        style={{
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        North-star organization mockup (Phases A–D compressed into one view) — low fidelity, layout only.
      </div>

      {/* App window */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <Rail
          active={activeRail}
          onSelect={handleRailSelect}
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed(c => !c)}
        />

        {/* Main content + player */}
        <Col gap={0} style={{ flex: 1, overflow: 'hidden' }}>
          {/* Content area */}
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

          {/* Bottom player bar — full width of content area */}
          <PlayerBar />
        </Col>
      </div>
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
    'Low-fidelity full-site layout mockup: left rail navigation (collapsible), book pipeline stages, player bar, and all rail destinations as gray placeholder wireframes.',
  element: <SiteMockupElement />,
};
