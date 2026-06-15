/**
 * siteMockupStage — North-star full-site organization mockup (medium fidelity v3.7).
 *
 * Navigation:
 *   - Left rail items switch `activeRail` state.
 *   - Clicking a book card in Library switches to Book pipeline view.
 *   - Book pipeline has 5 stage tabs (Manuscript, Casting, Studio, Review, Publish).
 *   - Chevron at rail bottom toggles collapsed (icon-only ~56px) vs expanded.
 *   - Top bar "Queue" button slides a ~340px drawer over the right side WITHOUT
 *     changing the current page (the key "check status from anywhere" workflow).
 *
 * v3.7 changes (split + feature additions):
 *   - Split into siteMockup/ submodules (shared, rail, panes/*)
 *   - Library: grid/list view toggle, ⋯ ActionMenu (Open/Delete), New Book modal,
 *     Delete confirm dialog.
 *   - Manuscript: "+ New chapter" modal (Title, paste, upload).
 *   - Publish: Assemble M4B selection mode (checkbox list, Select all, Confirm),
 *     assembly-progress strip, create-backup row.
 *   - Studio: chapter-nav cluster (← Save & prev · Save & next →), Export ▾ (WAV/MP3),
 *     Commit changes button + "2 unsaved text edits" chip + Resync Preview modal,
 *     analysis strip (stats + green/amber badges + expandable ACTION REQUIRED),
 *     hover inline controls on one sentence (voice select chip, ▶, ↻),
 *     "Stop all" red ghost button.
 */

import React, { useState } from 'react';
import {
  Zap,
  X,
  MoreHorizontal,
  SkipBack,
  Rewind,
  Play,
  FastForward,
  SkipForward,
  Activity,
  CheckCircle2,
  XCircle,
  GripVertical,
} from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import {
  Col, Row, SemanticChip, ProgressBar, WaveformSvg,
  IN_FLIGHT_JOBS, QUEUED_JOBS, BOOK_TABS,
  StatusOrb,
} from './siteMockup/shared';
import type { BookTab, RailDest } from './siteMockup/shared';
import { Rail } from './siteMockup/rail';
import { LibraryPane } from './siteMockup/panes/library';
import { ManuscriptPane, CastingPane, ReviewPane } from './siteMockup/panes/book';
import { StudioPane } from './siteMockup/panes/studio';
import { PublishPane } from './siteMockup/panes/publish';
import { VoicesPane } from './siteMockup/panes/voices';
import { ActivityPane } from './siteMockup/panes/activity';
import { EnginesPane, IntegrationsPane } from './siteMockup/panes/platform';
import { SettingsPane } from './siteMockup/panes/settings';
import { SplashPane } from './siteMockup/panes/splash';

// ---------------------------------------------------------------------------
// Queue Drawer

const HISTORY_ROWS = [
  { title: 'Iron Meridian — Ch 1', engine: 'Voxtral', ok: true },
  { title: 'The Whispering Vale — Ch 6', engine: 'XTTS', ok: true },
  { title: 'Echoes of Ember — Ch 2', engine: 'XTTS', ok: false, reason: 'engine timeout' },
];

const QueueDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onViewAll: () => void;
}> = ({ open, onClose, onViewAll }) => {
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
  <>
    {open && (
      <div
        onClick={onClose}
        aria-label="Close queue drawer"
        style={{ position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 40 }}
      />
    )}
    <div
      role="complementary"
      aria-label="Queue drawer"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xl)', zIndex: 50,
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 14px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 6,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>Queue</span>
            <SemanticChip variant="accent">2 running</SemanticChip>
          </div>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 2 }}>2 active · 2 queued</div>
        </div>
        {/* Pause/Resume */}
        <div
          onClick={() => setPaused(p => !p)}
          style={{
            fontSize: 'var(--type-micro)', fontWeight: 600, padding: '2px 8px',
            borderRadius: 'var(--radius-button)', cursor: 'pointer',
            border: `1px solid ${paused ? 'var(--warning-tint-border)' : 'var(--border)'}`,
            background: paused ? 'var(--warning-tint-bg)' : 'var(--surface-alt)',
            color: paused ? 'var(--warning)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause all'}
        </div>
        {/* ⋯ menu */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setMenuOpen(m => !m)}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1, userSelect: 'none' }}
            aria-label="Queue menu"
          >
            <MoreHorizontal size={16} strokeWidth={2} />
          </div>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)', boxShadow: 'var(--shadow-lg)',
              zIndex: 10, minWidth: 140, overflow: 'hidden',
            }}>
              {['Clear completed', 'Clear all'].map((item, i) => (
                <div
                  key={item}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    padding: '7px 12px', fontSize: 'var(--type-caption)', cursor: 'pointer',
                    color: i === 1 ? 'var(--error)' : 'var(--text-primary)',
                    borderBottom: i === 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
        <span
          onClick={onClose}
          aria-label="Close queue"
          style={{ marginLeft: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
        >
          <X size={16} strokeWidth={2} />
        </span>
      </div>

      {/* Paused banner */}
      {paused && (
        <div style={{
          background: 'var(--warning-tint-bg)', borderBottom: '1px solid var(--warning-tint-border)',
          padding: '4px 14px', fontSize: 'var(--type-micro)', fontWeight: 600, color: 'var(--warning)', flexShrink: 0,
        }}>
          Queue paused — jobs will not start until resumed.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '4px 0 2px' }}>In flight</div>
        <Col gap={8} style={{ marginTop: 4 }}>
          {IN_FLIGHT_JOBS.map(job => (
            <div key={job.title} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '8px 10px',
            }}>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
                <StatusOrb status="running" progress={job.pct / 100} size={14} />
                <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>{job.title}</span>
                <SemanticChip variant="neutral">{job.engine}</SemanticChip>
                <span
                  style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  aria-label={`Cancel ${job.title}`}
                >
                  <X size={14} strokeWidth={2} />
                </span>
              </Row>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <ProgressBar pct={job.pct} />
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>{job.pct}%</span>
              </Row>
              <Row gap={8}>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{job.eta}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Segs {job.segs}</span>
              </Row>
            </div>
          ))}
        </Col>

        <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '4px 0 2px', marginTop: 10 }}>Queued</div>
        <Col gap={6} style={{ marginTop: 4 }}>
          {QUEUED_JOBS.map((job, i) => (
            <div key={job.title} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '7px 10px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {/* drag handle */}
              <span
                style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0, lineHeight: 1 }}
                title="Drag to reorder"
                aria-label="Drag to reorder"
              >
                <GripVertical size={14} strokeWidth={1.8} />
              </span>
              <StatusOrb status="queued" size={12} />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>#{i + 3}</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.3 }}>{job.title}</span>
              <SemanticChip variant="neutral">{job.engine}</SemanticChip>
              <span
                style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                aria-label={`Remove ${job.title} from queue`}
              >
                <X size={14} strokeWidth={2} />
              </span>
            </div>
          ))}
        </Col>

        {/* History section */}
        <div style={{ marginTop: 12 }}>
          <div
            onClick={() => setHistoryOpen(h => !h)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontSize: 'var(--type-micro)', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '4px 0',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 'var(--type-caption)' }}>{historyOpen ? '▾' : '›'}</span>
            Completed / Failed history (12)
          </div>
          {historyOpen && (
            <Col gap={5} style={{ marginTop: 4 }}>
              {HISTORY_ROWS.map(row => (
                <div key={row.title} style={{
                  background: 'var(--surface-alt)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-button)', padding: '5px 10px', opacity: 0.7,
                }}>
                  <Row gap={6} style={{ alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {row.ok
                        ? <CheckCircle2 size={13} color="var(--success)" strokeWidth={2} />
                        : <XCircle size={13} color="var(--error)" strokeWidth={2} />
                      }
                    </span>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.3 }}>{row.title}</span>
                    <SemanticChip variant="neutral">{row.engine}</SemanticChip>
                  </Row>
                  {!row.ok && row.reason && (
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--error)', marginTop: 3, marginLeft: 20 }}>{row.reason}</div>
                  )}
                </div>
              ))}
            </Col>
          )}
        </div>
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <span
          onClick={() => { onViewAll(); onClose(); }}
          style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
        >
          View all activity →
        </span>
      </div>
    </div>
  </>
  );
};

// ---------------------------------------------------------------------------
// Top bar

const TopBar: React.FC<{
  breadcrumb: string;
  queueOpen: boolean;
  onToggleQueue: () => void;
  inBook?: boolean;
  activeBookTab?: BookTab;
  onSwitchToPublish?: () => void;
  onLogoClick?: () => void;
}> = ({ breadcrumb, queueOpen, onToggleQueue, inBook, onSwitchToPublish, onLogoClick }) => {
  const segments = breadcrumb.split(' / ');
  const stageSeg = inBook ? segments[segments.length - 1] : null;

  return (
    <div style={{
      height: 36, flexShrink: 0,
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6, zIndex: 10, minWidth: 0,
    }}>
      {/* Brand logo — click returns to splash/home */}
      <button
        type="button"
        aria-label="Home"
        onClick={onLogoClick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          background: 'none', border: 'none', padding: '2px 4px', margin: '-2px -4px',
          borderRadius: 'var(--radius-button)',
          cursor: onLogoClick ? 'pointer' : 'default',
        }}
      >
        <BrandLogo scale={0.58} showIcon />
      </button>
      <span style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

      <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flexShrink: 0 }}>Library</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--type-caption)', flexShrink: 0 }}>›</span>

      {inBook ? (
        <>
          <div
            onClick={onSwitchToPublish}
            title="Edit book info in Publish"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', minWidth: 0, overflow: 'hidden', flexShrink: 1, maxWidth: 340,
            }}
          >
            {/* Inline mini book cover */}
            <div style={{
              width: 18, height: 24, borderRadius: 2,
              background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1, userSelect: 'none' }}>W</span>
            </div>
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
              The Whispering Vale
            </span>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 2 }}>
              R.E. Hartley · The Vale Cycle #1 · 6h 12m · pred 6h 28m
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--type-caption)', flexShrink: 0 }}>›</span>
          <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{stageSeg}</span>
        </>
      ) : (
        segments.slice(1).map((seg, i) => (
          <React.Fragment key={seg}>
            {i > 0 && <span style={{ margin: '0 2px', color: 'var(--text-muted)', fontSize: 'var(--type-caption)' }}>›</span>}
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', fontWeight: 600 }}>{seg}</span>
          </React.Fragment>
        ))
      )}

      <div style={{ flex: 1 }} />

      {/* Connection status dot — tokenized */}
      <span
        style={{
          width: 8, height: 8, borderRadius: 'var(--radius-round)',
          background: 'var(--success)', display: 'inline-block', flexShrink: 0,
        }}
        aria-label="Connected"
        title="Connected"
      />
      <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>Connected</span>

      <button
        type="button"
        onClick={onToggleQueue}
        aria-label="Toggle queue drawer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 'var(--type-caption)', fontWeight: 600, padding: '3px 10px',
          borderRadius: 'var(--radius-button)',
          border: `1px solid ${queueOpen ? 'var(--accent-tint-border)' : 'var(--border)'}`,
          background: queueOpen ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
          color: queueOpen ? 'var(--accent)' : 'var(--text-primary)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Zap size={12} strokeWidth={2} />
        Queue
        <span style={{
          fontSize: 'var(--type-micro)', fontWeight: 700,
          background: 'var(--accent)', color: 'var(--text-on-accent)',
          borderRadius: 'var(--radius-round)', padding: '0 5px', lineHeight: '14px',
          height: 14, display: 'inline-block',
        }}>2</span>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Player bar

const PLAYER_SCOPES = [
  'Chapter 7 · segment 14',
  'Chapter 7 · full render',
  'Voice preview · Elena Marsh',
] as const;

const PlayerBar: React.FC = () => {
  const [waveOpen, setWaveOpen] = useState(false);
  const [scopeIdx, setScopeIdx] = useState(0);
  const cycleScope = () => setScopeIdx(i => (i + 1) % PLAYER_SCOPES.length);
  return (
    <div style={{ flexShrink: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      {waveOpen && (
        <div style={{ padding: '6px 14px 2px', borderBottom: '1px solid var(--border)' }}>
          <WaveformSvg height={32} />
        </div>
      )}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
        {/* VCR transport — circular icon buttons */}
        <Row gap={4} style={{ alignItems: 'center' }}>
          {[
            { Icon: SkipBack,    label: 'Previous' },
            { Icon: Rewind,      label: 'Skip back 10 seconds' },
            { Icon: Play,        label: 'Play', primary: true },
            { Icon: FastForward, label: 'Skip forward 10 seconds' },
            { Icon: SkipForward, label: 'Next' },
          ].map(({ Icon, label, primary }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              style={{
                width: primary ? 30 : 26, height: primary ? 30 : 26,
                borderRadius: 'var(--radius-round)',
                border: primary ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: primary ? 'var(--accent)' : 'var(--surface-alt)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                color: primary ? 'var(--text-on-accent)' : 'var(--text-primary)',
              }}
            >
              <Icon size={primary ? 14 : 12} strokeWidth={2} style={{ flexShrink: 0 }} />
            </button>
          ))}
        </Row>
        <div style={{
          height: 3, flex: 1, background: 'var(--surface-alt)',
          border: '1px solid var(--border)', borderRadius: 2, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ width: '38%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
        </div>
        <div onClick={cycleScope} title="Click to cycle scope" style={{ cursor: 'pointer' }}>
          <SemanticChip variant="accent">{PLAYER_SCOPES[scopeIdx]}</SemanticChip>
        </div>
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>02:14 / 28:10</span>
        <button
          type="button"
          onClick={() => setWaveOpen(w => !w)}
          aria-label="Toggle waveform"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 'var(--type-micro)', cursor: 'pointer', padding: '2px 7px',
            borderRadius: 'var(--radius-button)',
            border: `1px solid ${waveOpen ? 'var(--accent-tint-border)' : 'var(--border)'}`,
            color: waveOpen ? 'var(--accent)' : 'var(--text-muted)',
            background: waveOpen ? 'var(--accent-tint-bg)' : 'transparent',
          }}
        >
          <Activity size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BookPane — assembles tab content from imported panes

const BookPane: React.FC<{
  onBack: () => void;
  activeTab: BookTab;
  setActiveTab: (t: BookTab) => void;
}> = ({ onBack, activeTab, setActiveTab }) => (
  <Col gap={0} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
      <span onClick={onBack} style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)', cursor: 'pointer' }}>← Library</span>
    </Row>

    <Row gap={2} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0, marginBottom: 0 }}>
      {BOOK_TABS.map(t => (
        <div
          key={t}
          onClick={() => setActiveTab(t)}
          style={{
            fontSize: 'var(--type-callout)', fontWeight: activeTab === t ? 700 : 400,
            padding: '4px 12px', borderRadius: 'var(--radius-button) var(--radius-button) 0 0', cursor: 'pointer',
            background: activeTab === t ? 'var(--accent-tint-bg)' : 'transparent',
            color: activeTab === t ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          {t}
        </div>
      ))}
      <div style={{ flex: 1 }} />
    </Row>

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 10 }}>
      {activeTab === 'Manuscript' && <ManuscriptPane onSwitchToPublish={() => setActiveTab('Publish')} />}
      {activeTab === 'Casting' && <CastingPane />}
      {activeTab === 'Studio' && <StudioPane />}
      {activeTab === 'Review' && <ReviewPane />}
      {activeTab === 'Publish' && <PublishPane />}
    </div>
  </Col>
);

// ---------------------------------------------------------------------------
// Root mockup

const SiteMockup: React.FC = () => {
  const [activeRail, setActiveRail] = useState<RailDest>('Library');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [inBook, setInBook] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [activeBookTab, setActiveBookTab] = useState<BookTab>('Studio');
  const [activeChapter, setActiveChapter] = useState(4);
  const [showSplash, setShowSplash] = useState(true);

  const handleRailSelect = (dest: RailDest) => {
    setShowSplash(false);
    setActiveRail(dest);
    if (dest !== 'Library') setInBook(false);
  };

  const handleBookTabSelect = (t: BookTab) => {
    setShowSplash(false);
    setActiveBookTab(t);
    setActiveRail('Library');
    setInBook(true);
  };

  let breadcrumb = 'Library';
  if (showSplash) {
    breadcrumb = 'Home';
  } else if (activeRail !== 'Library') {
    breadcrumb = activeRail;
  } else if (inBook) {
    breadcrumb = `Library / The Whispering Vale / ${activeBookTab}`;
  }

  const handleSwitchToPublish = () => {
    setActiveBookTab('Publish');
    setActiveRail('Library');
    setInBook(true);
  };

  return (
    <Col gap={0} style={{ height: '100%', position: 'relative' }}>
      {/* Caption */}
      <div style={{
        fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic',
        padding: '3px 10px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        North-star organization mockup — current functionality represented. Queue drawer = check status from anywhere without losing your place. · v3.7 — modular split + Library/Manuscript/Publish/Studio feature additions
      </div>

      <Col gap={0} style={{ flex: 1, overflow: 'hidden' }}>
        <TopBar
          breadcrumb={breadcrumb}
          queueOpen={queueOpen}
          onToggleQueue={() => setQueueOpen(o => !o)}
          inBook={!showSplash && inBook && activeRail === 'Library'}
          activeBookTab={activeBookTab}
          onSwitchToPublish={handleSwitchToPublish}
          onLogoClick={() => setShowSplash(true)}
        />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          <Rail
            active={showSplash ? null : activeRail}
            onSelect={handleRailSelect}
            collapsed={railCollapsed}
            onToggle={() => setRailCollapsed(c => !c)}
            inBook={inBook}
            activeBookTab={activeBookTab}
            onBookTabSelect={handleBookTabSelect}
            activeChapter={activeChapter}
            onChapterSelect={setActiveChapter}
          />

          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {showSplash ? (
              <SplashPane onGetStarted={() => setShowSplash(false)} />
            ) : (
              <>
                {activeRail === 'Library' && !inBook && (
                  <LibraryPane onOpenBook={() => { setShowSplash(false); setInBook(true); }} />
                )}
                {activeRail === 'Library' && inBook && (
                  <BookPane
                    onBack={() => setInBook(false)}
                    activeTab={activeBookTab}
                    setActiveTab={setActiveBookTab}
                  />
                )}
                {activeRail === 'Voices' && <VoicesPane />}
                {activeRail === 'Activity' && <ActivityPane />}
                {activeRail === 'Engines' && <EnginesPane />}
                {activeRail === 'Integrations' && <IntegrationsPane />}
                {activeRail === 'Settings' && <SettingsPane />}
              </>
            )}
          </div>

          <QueueDrawer
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            onViewAll={() => handleRailSelect('Activity')}
          />
        </div>

        <PlayerBar />
      </Col>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Stage wrapper

const SiteMockupElement: React.FC = () => (
  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <div style={{
      flex: 1, border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <SiteMockup />
    </div>
  </div>
);

export const siteMockupStage = {
  id: 'site-mockup',
  title: 'Site Mockup — North Star',
  description:
    'Medium-fidelity full-site layout mockup v3.7 — modular split into siteMockup/ submodules. Features: Library grid/list view toggle + ⋯ ActionMenu + New Book modal + Delete confirm; Manuscript "+ New chapter" modal; Publish Assemble selection mode + progress strip + backup row; Studio chapter-nav cluster + Export ▾ + Commit changes + Resync Preview modal + analysis strip (auto-fix badges + expandable ACTION REQUIRED) + hover sentence controls + Stop all. All settings surfaces preserved.',
  element: <SiteMockupElement />,
};
