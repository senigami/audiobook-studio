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

import React, { useState, useEffect } from 'react';
import {
  Zap,
  X,
  MoreHorizontal,
  AudioLines,
  CheckCircle2,
  XCircle,
  GripVertical,
  Menu,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Square,
  Waves,
  GalleryHorizontalEnd,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import './siteMockup/mockup.css';
import {
  Col, Row, SemanticChip, ProgressBar, WaveformSvg, MockWaveTape,
  IN_FLIGHT_JOBS, QUEUED_JOBS, BOOK_TABS,
  StatusOrb,
} from './siteMockup/shared';
import type { BookTab, RailDest } from './siteMockup/shared';
import { ZoomPresetControl, TapeMinimapStrip, snapZoom } from './siteMockup/MockTapeControls';
import type { ZoomPreset } from './siteMockup/MockTapeControls';
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
  inFlightJobs: any[];
  setInFlightJobs: React.Dispatch<React.SetStateAction<any[]>>;
  queuedJobs: any[];
  setQueuedJobs: React.Dispatch<React.SetStateAction<any[]>>;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({
  open,
  onClose,
  onViewAll,
  inFlightJobs,
  setInFlightJobs,
  queuedJobs,
  setQueuedJobs,
  paused,
  setPaused,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const moveJob = (index: number, direction: 'up' | 'down') => {
    const nextIndex = index + (direction === 'up' ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= queuedJobs.length) return;
    const updated = [...queuedJobs];
    const temp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = temp;
    setQueuedJobs(updated);
  };

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
      className="ns-glass"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
        background: 'var(--glass)', borderLeft: '1px solid var(--hairline)',
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
            <SemanticChip variant="accent">{inFlightJobs.length} running</SemanticChip>
          </div>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 2 }}>{inFlightJobs.length} active · {queuedJobs.length} queued</div>
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
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {paused
            ? <><Play size={11} strokeWidth={2.2} aria-hidden="true" /> Resume</>
            : <><Pause size={11} strokeWidth={2.2} aria-hidden="true" /> Pause all</>}
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
                  onClick={() => {
                    setMenuOpen(false);
                    if (item === 'Clear all') {
                      setInFlightJobs([]);
                      setQueuedJobs([]);
                    } else if (item === 'Clear completed') {
                      setInFlightJobs(prev => prev.filter(j => j.pct < 100));
                    }
                  }}
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
          {inFlightJobs.map(job => (
            <div key={job.title} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '8px 10px',
            }}>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
                <StatusOrb status="running" progress={job.pct / 100} size={14} />
                <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>{job.title}</span>
                <SemanticChip variant="neutral">{job.engine}</SemanticChip>
                <span
                  onClick={() => setInFlightJobs(prev => prev.filter(j => j.title !== job.title))}
                  style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  aria-label={`Cancel ${job.title}`}
                >
                  <X size={14} strokeWidth={2} />
                </span>
              </Row>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <ProgressBar pct={job.pct} />
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(job.pct)}%</span>
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
          {queuedJobs.map((job, i) => (
            <div
              key={job.title}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', i.toString());
              }}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (isNaN(dragIndex) || dragIndex === i) return;
                const updated = [...queuedJobs];
                const [removed] = updated.splice(dragIndex, 1);
                updated.splice(i, 0, removed);
                setQueuedJobs(updated);
              }}
              style={{
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)', padding: '7px 10px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {/* drag handle + click controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'grab', lineHeight: 1 }}
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                >
                  <GripVertical size={14} strokeWidth={1.8} />
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 2 }}>
                  <button
                    onClick={() => moveJob(i, 'up')}
                    disabled={i === 0}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      cursor: i === 0 ? 'default' : 'pointer',
                      color: i === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                      fontSize: '7px', lineHeight: 1, display: 'flex', alignItems: 'center'
                    }}
                    title="Move up"
                    aria-label="Move job up"
                  >
                    <ChevronUp size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => moveJob(i, 'down')}
                    disabled={i === queuedJobs.length - 1}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      cursor: i === queuedJobs.length - 1 ? 'default' : 'pointer',
                      color: i === queuedJobs.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                      fontSize: '7px', lineHeight: 1, display: 'flex', alignItems: 'center'
                    }}
                    title="Move down"
                    aria-label="Move job down"
                  >
                    <ChevronDown size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <StatusOrb status="queued" size={12} />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>#{i + 1 + inFlightJobs.length}</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.3 }}>
                {job.title}
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 400 }}>
                  starts in ~{(i + 1) * 8}m
                </div>
              </span>
              <SemanticChip variant="neutral">{job.engine}</SemanticChip>
              <span
                onClick={() => setQueuedJobs(prev => prev.filter(j => j.title !== job.title))}
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
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {historyOpen ? <ChevronDown size={13} strokeWidth={2.2} /> : <ChevronRight size={13} strokeWidth={2.2} />}
            </span>
            Completed / Failed history ({HISTORY_ROWS.length})
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
          style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <span style={{ textDecoration: 'underline' }}>View all activity</span>
          <ArrowRight size={13} strokeWidth={2.2} />
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
  queueCount: number;
  isMobile?: boolean;
  onToggleMobileMenu?: () => void;
}> = ({
  breadcrumb,
  queueOpen,
  onToggleQueue,
  inBook,
  onSwitchToPublish,
  onLogoClick,
  queueCount,
  isMobile,
  onToggleMobileMenu,
}) => {
  const segments = breadcrumb.split(' / ');
  const stageSeg = inBook ? segments[segments.length - 1] : null;

  return (
    <div className="ns-topbar" style={{
      height: 36, flexShrink: 0,
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6, zIndex: 10, minWidth: 0,
    }}>
      {/* Mobile hamburger menu */}
      {isMobile && (
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            marginRight: 4,
            borderRadius: 'var(--radius-button)',
          }}
        >
          <Menu size={16} strokeWidth={2} />
        </button>
      )}

      {/* Brand logo — click returns to splash/home */}
      <button
        className="ns-home-button"
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
      <span className="ns-topbar-separator" style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

      <span className="ns-topbar-library" style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flexShrink: 0 }}>Library</span>
      <ChevronRight className="ns-topbar-library" size={13} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

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
          <ChevronRight size={13} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{stageSeg}</span>
        </>
      ) : (
        segments.slice(1).map((seg, i) => (
          <React.Fragment key={seg}>
            {i > 0 && <ChevronRight size={13} strokeWidth={2} style={{ margin: '0 2px', color: 'var(--text-muted)', flexShrink: 0 }} />}
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', fontWeight: 600 }}>{seg}</span>
          </React.Fragment>
        ))
      )}

      <div style={{ flex: 1 }} />

      {/* Connection status dot — tokenized */}
      <span
        className="ns-connection-dot"
        style={{
          width: 8, height: 8, borderRadius: 'var(--radius-round)',
          background: 'var(--success)', display: 'inline-block', flexShrink: 0,
        }}
        aria-label="Connected"
        title="Connected"
      />
      <span className="ns-connection-label" style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>Connected</span>

      <button
        className="ns-queue-button"
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
        }}>{queueCount}</span>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Player bar

type TrackState = {
  trackName: string;
  subtitle: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  scope: 'segment' | 'chapter' | 'preview';
};

const PlayerBar: React.FC<{
  activeTrack: TrackState;
  setActiveTrack: React.Dispatch<React.SetStateAction<TrackState | null>>;
}> = ({ activeTrack, setActiveTrack }) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setActiveTrack(prev => (prev ? { ...prev, isPlaying: !prev.isPlaying } : prev));
  };

  const handleSkipBack = () => {
    setActiveTrack(prev => (prev ? { ...prev, currentTime: Math.max(0, prev.currentTime - 10) } : prev));
  };

  const handleSkipForward = () => {
    setActiveTrack(prev => (prev ? { ...prev, currentTime: Math.min(prev.duration, prev.currentTime + 10) } : prev));
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPct = Math.max(0, Math.min(1, clickX / rect.width));
    setActiveTrack(prev => (prev ? { ...prev, currentTime: Math.round(clickPct * prev.duration) } : prev));
  };

  const pct = (activeTrack.currentTime / activeTrack.duration) * 100;

  // Scrub representation is DURATION-driven, not scope-driven (segment/chapter
  // agnostic — no scope toggle): a short clip shows the inline waveform, a long
  // one a plain bar. The far-right toggle overrides it; resets on each new track.
  const FIT_WAVE_MAX_SEC = 30;
  const [forceWave, setForceWave] = useState<boolean | null>(null);
  useEffect(() => { setForceWave(null); }, [activeTrack.trackName]);
  const showWave = forceWave ?? activeTrack.duration <= FIT_WAVE_MAX_SEC;

  // Expandable zoomed "tape" (grows the bar upward). The AudioLines toggle opens
  // it when the scrub track is a bar; in waveform mode the toggle flips to bar.
  const [tapeOpen, setTapeOpen] = useState(false);
  const [windowSec, setWindowSec] = useState<ZoomPreset>(30);
  // Tape motion: false = paged (default); true = moving wave under a fixed playhead.
  const [tapeScroll, setTapeScroll] = useState(false);
  useEffect(() => { setTapeOpen(false); setWindowSec(30); }, [activeTrack.trackName]);

  const handleAudioLinesClick = () => {
    if (showWave) {
      // Waveform mode: flip the inline scrub to a plain bar.
      setForceWave(false);
      setTapeOpen(false);
    } else {
      // Bar mode: open/close the expanded tape.
      setTapeOpen(prev => !prev);
    }
  };

  const seekToTime = (newTime: number) =>
    setActiveTrack(prev => (prev ? { ...prev, currentTime: Math.max(0, Math.min(newTime, prev.duration)) } : prev));

  // Time = the loaded clip's position / duration (scope-agnostic).
  const timeText = `${formatTime(activeTrack.currentTime)} / ${formatTime(activeTrack.duration)}`;

  const transportControls = [
    {
      label: 'Previous',
      Icon: SkipBack,
      action: () => setActiveTrack(prev => (prev ? { ...prev, currentTime: 0 } : prev)),
      active: false,
    },
    {
      label: 'Skip back 10 seconds',
      Icon: Rewind,
      action: handleSkipBack,
      active: false,
    },
    {
      label: activeTrack.isPlaying ? 'Pause' : 'Play',
      Icon: activeTrack.isPlaying ? Pause : Play,
      action: handlePlayPause,
      active: true,
    },
    {
      label: 'Skip forward 10 seconds',
      Icon: FastForward,
      action: handleSkipForward,
      active: false,
    },
    {
      label: 'Next',
      Icon: SkipForward,
      action: () => setActiveTrack(prev => (prev ? { ...prev, currentTime: prev.duration } : prev)),
      active: false,
    },
  ];

  return (
    <div
      className="nsp-playerbar"
      style={{ flexShrink: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', containerType: 'inline-size' }}
    >
      {/* U16 responsive: in segment scope the inline waveform reflows above the
          controls when the bar is too narrow (container query, not a viewport query). */}
      <style>{`
        @container (max-width: 620px) {
          .nsp-scrub--wave { flex-basis: 100% !important; order: -1; }
          .nsp-scrub--wave .nsp-wave { height: 24px !important; }
        }
      `}</style>
      {/* Expandable zoomed tape — grows the bar upward when open. aria-hidden
          drives the CSS max-height collapse; paged playhead + click/drag scrub +
          minimap + bounded zoom presets. Opened by the AudioLines toggle in bar mode. */}
      <div className="nsp-tape-region" aria-hidden={tapeOpen ? 'false' : 'true'}>
        <div
          className="nsp-tape-canvas-wrap"
          onWheel={(e) => {
            e.preventDefault();
            setWindowSec(prev => snapZoom(prev, e.deltaY > 0 ? 'out' : 'in'));
          }}
          style={{ padding: '8px 14px 0' }}
        >
          <MockWaveTape
            durationSec={activeTrack.duration}
            currentTimeSec={activeTrack.currentTime}
            isPlaying={activeTrack.isPlaying}
            windowSec={windowSec}
            onSeek={seekToTime}
            height={104}
            mode={tapeScroll ? 'scroll' : 'paged'}
          />
        </div>
        <div className="nsp-tape-footer">
          <TapeMinimapStrip
            durationSec={activeTrack.duration}
            currentTimeSec={activeTrack.currentTime}
            windowSec={windowSec}
            onSeek={seekToTime}
            height={28}
          />
          {/* Motion: paged (default) ↔ moving wave under a fixed playhead. */}
          <button
            type="button"
            onClick={() => setTapeScroll(v => !v)}
            aria-pressed={tapeScroll}
            aria-label={tapeScroll ? 'Switch to paged motion' : 'Switch to moving waveform'}
            title={tapeScroll ? 'Paged' : 'Moving'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              fontSize: 'var(--type-micro)', fontWeight: 600,
              padding: '3px var(--space-2)', borderRadius: 'var(--radius-round)',
              border: `1px solid ${tapeScroll ? 'var(--accent-tint-border)' : 'var(--border)'}`,
              background: tapeScroll ? 'var(--accent-tint-bg)' : 'transparent',
              color: tapeScroll ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {tapeScroll ? <Waves size={12} strokeWidth={2.2} aria-hidden="true" /> : <GalleryHorizontalEnd size={12} strokeWidth={2.2} aria-hidden="true" />}
            {tapeScroll ? 'Moving' : 'Paged'}
          </button>
          <ZoomPresetControl windowSec={windowSec} onZoomChange={setWindowSec} />
        </div>
      </div>
      <div className="nsp-player-inner" style={{ minHeight: 52, display: 'flex', flexWrap: 'wrap', rowGap: 8, alignItems: 'center', gap: 12, padding: '8px 14px' }}>
        {/* VCR transport — styleguide-aligned visible glyph buttons */}
        <Row className="nsp-transport" gap={8} style={{ alignItems: 'center', flexShrink: 0 }}>
          {transportControls.map(control => (
            <button
              key={control.label}
              type="button"
              aria-label={control.label}
              title={control.label}
              onClick={control.action}
              style={{
                width: control.active ? 38 : 34,
                height: control.active ? 38 : 34,
                borderRadius: 'var(--radius-round)',
                border: `1px solid ${control.active ? 'var(--accent)' : 'var(--border)'}`,
                background: control.active ? 'var(--accent)' : 'var(--surface-alt)',
                color: control.active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                fontSize: control.active ? '1rem' : '0.875rem',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              <control.Icon
                size={control.active ? 17 : 15}
                strokeWidth={2.2}
                aria-hidden="true"
                style={{ transform: control.Icon === Play ? 'translateX(1px)' : undefined }}
              />
            </button>
          ))}
          {/* Stop — clears the loaded track so the bar collapses (matches the
              live single-owner stop(): visibility keys on audio loaded, never on screen). */}
          <button
            type="button"
            aria-label="Stop"
            title="Stop"
            onClick={() => setActiveTrack(null)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-round)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <Square size={11} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </Row>

        {/* Scrub track follows DURATION (scope-agnostic): short clip → inline
            waveform (the waveform IS the seek surface) / long clip → plain seek bar. */}
        <div
          className={`nsp-scrub${showWave ? ' nsp-scrub--wave' : ''}`}
          style={{ flex: '1 1 160px', minWidth: 120, display: 'flex', alignItems: 'center' }}
        >
          {showWave ? (
            <div className="nsp-wave" onClick={handleSeek} style={{ width: '100%', height: 32, cursor: 'pointer' }} title="Click to seek">
              <WaveformSvg height={32} isPlaying={activeTrack.isPlaying} fill />
            </div>
          ) : (
            <div
              onClick={handleSeek}
              style={{
                height: 6, width: '100%', background: 'var(--surface-alt)',
                border: '1px solid var(--border)', borderRadius: 3, position: 'relative', overflow: 'hidden',
                cursor: 'pointer',
              }}
              title="Click to seek"
            >
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.1s linear' }} />
            </div>
          )}
        </div>

        {/* Title + optional subtitle pill. No segment/chapter scope toggle — the
            player is scope-agnostic; representation is decided by duration. */}
        <div className="nsp-track-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: 340, overflow: 'hidden' }}>
          <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeTrack.trackName}
          </span>
          {activeTrack.subtitle && <SemanticChip variant="accent">{activeTrack.subtitle}</SemanticChip>}
        </div>

        {/* Timer display — segment-relative in segment scope */}
        <span className="nsp-time" style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {timeText}
        </span>

        {/* Representation override (far right) — defaults to the scope type, but
            the user can flip waveform ↔ bar on demand. */}
        <button
          type="button"
          onClick={handleAudioLinesClick}
          aria-pressed={showWave || tapeOpen}
          aria-label={tapeOpen ? 'Close waveform tape' : (showWave ? 'Show progress bar' : 'Open waveform tape')}
          title={tapeOpen ? 'Close waveform tape' : (showWave ? 'Switch to progress bar' : 'Open waveform tape')}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, flexShrink: 0, cursor: 'pointer', padding: 0,
            borderRadius: 'var(--radius-button)',
            border: `1px solid ${showWave || tapeOpen ? 'var(--accent-tint-border)' : 'var(--border)'}`,
            color: showWave || tapeOpen ? 'var(--accent)' : 'var(--text-muted)',
            background: showWave || tapeOpen ? 'var(--accent-tint-bg)' : 'transparent',
          }}
        >
          <AudioLines size={13} strokeWidth={2} />
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
  <Col className="ns-book-pane" gap={0} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          border: 0,
          background: 'transparent',
          padding: 0,
          fontFamily: 'inherit',
          fontSize: 'var(--type-caption)',
          color: 'var(--accent)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        Library
      </button>
    </Row>

    <Row className="ns-book-tabs" gap={2} role="tablist" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0, marginBottom: 0 }}>
      {BOOK_TABS.map(t => (
        <button
          type="button"
          key={t}
          className="ns-book-tab"
          role="tab"
          aria-selected={activeTab === t}
          onClick={() => setActiveTab(t)}
          style={{
            border: 0,
            fontFamily: 'inherit',
            fontSize: 'var(--type-callout)', fontWeight: activeTab === t ? 700 : 400,
            padding: '4px 12px', borderRadius: 'var(--radius-button) var(--radius-button) 0 0', cursor: 'pointer',
            background: activeTab === t ? 'var(--accent-tint-bg)' : 'transparent',
            color: activeTab === t ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          {t}
        </button>
      ))}
      <div style={{ flex: 1 }} />
    </Row>

    <div className="ns-book-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 10 }}>
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

  // Responsive mobile navigation state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Shared audio playback simulation state. `null` = nothing loaded → the
  // PlayerBar is hidden entirely (collapse-when-empty). A track is loaded by the
  // play/preview triggers below; once loaded it persists across pane navigation
  // (the bar lives at the mock root) and is cleared by the bar's Stop control.
  const [activeTrack, setActiveTrack] = useState<TrackState | null>(null);

  // Ticking audio timer when playing. Advances in fine sub-second steps (still
  // ~1s of audio per real second) so the tape playhead and the moving-waveform
  // mode glide smoothly instead of jumping a full second per frame.
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTrack?.isPlaying) {
      const stepMs = 100;
      const stepSec = stepMs / 1000;
      interval = setInterval(() => {
        setActiveTrack(prev => {
          if (!prev) return prev;
          if (prev.currentTime >= prev.duration) {
            return { ...prev, currentTime: 0, isPlaying: false };
          }
          return { ...prev, currentTime: Math.min(prev.duration, prev.currentTime + stepSec) };
        });
      }, stepMs);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTrack?.isPlaying]);

  // Stateful jobs lists and paused state
  const [inFlightJobs, setInFlightJobs] = useState(IN_FLIGHT_JOBS);
  const [queuedJobs, setQueuedJobs] = useState(QUEUED_JOBS);
  const [queuePaused, setQueuePaused] = useState(false);

  // Ticking progress counters for active tasks when not paused
  useEffect(() => {
    if (queuePaused) return;
    const interval = setInterval(() => {
      setInFlightJobs(prev => {
        return prev.map(job => {
          if (job.pct >= 100) {
            return { ...job, pct: 0, eta: '~30m left' }; // reset to loop simulation
          }
          const nextPct = Math.min(100, job.pct + 1.5);
          const minsLeft = Math.max(1, Math.round((100 - nextPct) * 0.3));
          return {
            ...job,
            pct: nextPct,
            eta: `~${minsLeft}m left`,
          };
        });
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [queuePaused]);

  // Global click delegator to intercept play/preview clicks
  const handleGlobalClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[aria-label]');
    if (!target) return;

    const ariaLabel = target.getAttribute('aria-label');
    if (!ariaLabel) return;

    // 1. Preview on a voice card in VoicesPane
    if (ariaLabel.startsWith('Preview ')) {
      const voiceName = ariaLabel.replace('Preview ', '');
      setActiveTrack({
        trackName: voiceName,
        subtitle: 'Voice Preview',
        duration: 15,
        currentTime: 0,
        isPlaying: true,
        scope: 'preview',
      });
      return;
    }

    // 2. Play the whole book (Library card / book overview) — chapters sequenced.
    if (ariaLabel.startsWith('Play book ')) {
      const bookTitle = ariaLabel.replace('Play book ', '');
      setActiveTrack({
        trackName: bookTitle,
        subtitle: 'Audiobook · full',
        duration: 7200, // ~2h; adapter would sequence chapters
        currentTime: 0,
        isPlaying: true,
        scope: 'chapter',
      });
      return;
    }

    // 3. Play a chapter (chapter list / Studio / Review header).
    if (ariaLabel.startsWith('Play chapter ')) {
      const chapterRef = ariaLabel.replace('Play chapter ', '');
      setActiveTrack({
        trackName: `Chapter ${chapterRef}`,
        subtitle: 'Chapter playback',
        duration: 1690, // 28:10
        currentTime: 0,
        isPlaying: true,
        scope: 'chapter',
      });
      return;
    }

    // 4. Tap a transcript sentence to play from there (Review follow-along).
    if (ariaLabel.startsWith('Play from here: ')) {
      const sentence = ariaLabel.replace('Play from here: ', '');
      const truncated = sentence.length > 32 ? sentence.substring(0, 30) + '…' : sentence;
      setActiveTrack({
        trackName: `"${truncated}"`,
        subtitle: 'Chapter 7 · from section',
        duration: 8,
        currentTime: 0,
        isPlaying: true,
        scope: 'segment',
      });
      return;
    }

    // 5. Play test audio button in VoiceLab (specific — must precede the generic "Play ").
    if (ariaLabel === 'Play test audio') {
      setActiveTrack({
        trackName: 'test_audio.mp3',
        subtitle: 'Voice Lab Test',
        duration: 12,
        currentTime: 0,
        isPlaying: true,
        scope: 'preview',
      });
      return;
    }

    // 6. Play on a sample row in VoicesPane sample manager (generic — keep LAST).
    if (ariaLabel.startsWith('Play ')) {
      const sampleName = ariaLabel.replace('Play ', '');
      setActiveTrack({
        trackName: sampleName,
        subtitle: 'Sample Playback',
        duration: 8,
        currentTime: 0,
        isPlaying: true,
        scope: 'preview',
      });
      return;
    }

    // 4. Preview segment button in StudioPane (HoverSentenceControls)
    if (ariaLabel === 'Preview segment') {
      const outerSpan = target.closest('span');
      // If we clicked inside HoverSentenceControls, the segment text is inside the previous sibling span
      // Let's traverse the DOM to find it:
      const textSpan = outerSpan?.parentElement?.querySelector('[data-chunk-id]');
      const text = textSpan?.textContent?.trim() || "Stay close. The warden's lantern moves at dusk.";
      const cleanText = text.replace(/^["'\s]+|["'\s]+$/g, ''); // strip quotes
      const truncated = cleanText.length > 30 ? cleanText.substring(0, 28) + '...' : cleanText;

      setActiveTrack({
        trackName: `"${truncated}"`,
        subtitle: 'Chapter 7 · segment 14',
        duration: 7,
        currentTime: 0,
        isPlaying: true,
        scope: 'segment',
      });
      return;
    }
  };

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

  const queueCount = inFlightJobs.length + queuedJobs.length;

  return (
    <Col className="ns-root" onClick={handleGlobalClick} gap={0} style={{ height: '100%', position: 'relative' }}>
      {/* Caption */}
      <div className="ns-caption" style={{
        fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic',
        padding: '3px 10px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        Reviewable organization mockup. Queue drawer = check status from anywhere without losing your place. · v3.7 — modular split + Library/Manuscript/Publish/Studio feature additions
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
          queueCount={queueCount}
          isMobile={isMobile}
          onToggleMobileMenu={() => setMobileMenuOpen(o => !o)}
        />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Static Sidebar — shown only on desktop */}
          {!isMobile && (
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
          )}

          {/* Floating Mobile Sidebar Drawer backdrop overlay */}
          {isMobile && mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--overlay-backdrop)',
                zIndex: 40,
              }}
            />
          )}

          {/* Floating Mobile Sidebar Drawer container */}
          {isMobile && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 50,
                transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
                display: 'flex',
                boxShadow: mobileMenuOpen ? 'var(--shadow-xl)' : 'none',
              }}
            >
              <Rail
                active={showSplash ? null : activeRail}
                onSelect={(dest) => {
                  handleRailSelect(dest);
                  setMobileMenuOpen(false);
                }}
                collapsed={false}
                onToggle={() => {}}
                inBook={inBook}
                activeBookTab={activeBookTab}
                onBookTabSelect={(t) => {
                  handleBookTabSelect(t);
                  setMobileMenuOpen(false);
                }}
                activeChapter={activeChapter}
                onChapterSelect={(n) => {
                  setActiveChapter(n);
                  setMobileMenuOpen(false);
                }}
              />
            </div>
          )}

          <div className="ns-main-scroll" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
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
            inFlightJobs={inFlightJobs}
            setInFlightJobs={setInFlightJobs}
            queuedJobs={queuedJobs}
            setQueuedJobs={setQueuedJobs}
            paused={queuePaused}
            setPaused={setQueuePaused}
          />
        </div>

        {activeTrack && <PlayerBar activeTrack={activeTrack} setActiveTrack={setActiveTrack} />}
      </Col>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Stage wrapper

const SiteMockupElement: React.FC = () => (
  <div className="ns-stage-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <div className="ns-stage-shell" style={{
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
