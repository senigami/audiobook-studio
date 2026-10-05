/**
 * siteMockup/panes/activity.tsx — Activity pane
 */
import React, { useState } from 'react';
import { PauseCircle, Check, X } from 'lucide-react';
import { Row, Col, Label, SemanticChip, Btn, IN_FLIGHT_JOBS, Card, Panel, PaneHeader } from '../shared';
import { SegmentRenderStrip } from '../SegmentRenderStrip';

export const ActivityPane: React.FC = () => {
  const [historyFilter, setHistoryFilter] = useState<'All' | 'Renders' | 'Samples' | 'API'>('All');
  return (
    <Col gap={14} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <PaneHeader
        eyebrow="Activity"
        title="Queue and render history"
        subtitle="Monitor running renders, inspect recent failures, and compare engine speed without leaving the current book."
        meta={<SemanticChip variant="accent">2 running</SemanticChip>}
        actions={(
          <Btn small style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PauseCircle size={12} strokeWidth={2} />
            Pause queue
          </Btn>
        )}
      />

      <Row gap={8} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {[
          { label: 'Queued work', value: '4 jobs', detail: '~46m remaining', variant: 'accent' as const },
          { label: 'Generated today', value: '3h 18m', detail: '42 chapters', variant: 'success' as const },
          { label: 'Needs attention', value: '1 failed', detail: 'Mixed Ch 1', variant: 'warning' as const },
        ].map(stat => (
          <Card key={stat.label} className="ns-activity-card" style={{ flex: '1 1 170px', padding: '10px 12px' }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{stat.label}</span>
                <span style={{ fontSize: 'var(--type-headline)', color: 'var(--text-primary)', fontWeight: 800 }}>{stat.value}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>{stat.detail}</span>
              </Col>
              <SemanticChip variant={stat.variant}>{stat.variant === 'warning' ? 'review' : 'live'}</SemanticChip>
            </Row>
          </Card>
        ))}
      </Row>

      <Row className="ns-activity-grid" gap={12} style={{ alignItems: 'flex-start' }}>
        <Col gap={8} style={{ flex: 2 }}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Label>Now</Label>
            <div style={{ flex: 1 }} />
          </Row>
          {IN_FLIGHT_JOBS.map(job => (
            <Card key={job.title} style={{ padding: '8px 10px' }}>
              <Row gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--type-callout)', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{job.title}</span>
                <SemanticChip variant="neutral">{job.engine}</SemanticChip>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{job.eta}</span>
              </Row>
              <SegmentRenderStrip plan={job.plan} />
            </Card>
          ))}

          <Row gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Label>History</Label>
            {(['All', 'Renders', 'Samples', 'API'] as const).map(f => (
              <SemanticChip key={f} variant={historyFilter === f ? 'accent' : 'neutral'} onClick={() => setHistoryFilter(f)}>{f}</SemanticChip>
            ))}
          </Row>
          <Panel style={{ overflow: 'hidden', padding: 0 }}>
            {[
              { job: 'Whispering Vale — Ch 6', engine: 'XTTS', dur: '14m 22s', ago: '2h ago', ok: true },
              { job: 'Iron Meridian — Ch 2', engine: 'XTTS', dur: '11m 05s', ago: '3h ago', ok: true },
              { job: 'Echoes of Ember — Ch 4', engine: 'Voxtral', dur: '9m 48s', ago: '5h ago', ok: true },
              { job: 'Whispering Vale — Ch 5', engine: 'XTTS', dur: '13m 11s', ago: 'yesterday', ok: true },
              { job: 'Iron Meridian — Ch 1', engine: 'Mixed', dur: '18m 33s', ago: '2d ago', ok: false },
            ].map((row, i, arr) => (
              <Row key={row.job} gap={6} style={{
                padding: '5px 10px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 3 }}>{row.job}</span>
                <SemanticChip variant="neutral">{row.engine}</SemanticChip>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>{row.dur}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>{row.ago}</span>
                <SemanticChip variant={row.ok ? 'success' : 'error'}>{row.ok ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <X size={12} strokeWidth={2.4} aria-hidden="true" />}</SemanticChip>
              </Row>
            ))}
          </Panel>
        </Col>

        <Col gap={8} style={{ flex: 1 }}>
          <Label>Stats</Label>

          {/* System resource strip (CPU/RAM/VRAM) */}
          <Panel style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              System
            </div>
            <Col gap={5}>
              {[
                { label: 'CPU', pct: 34, value: '34%' },
                { label: 'RAM', pct: 58, value: '18.6/32 GB' },
                { label: 'VRAM', pct: 71, value: '71%' },
              ].map(row => (
                <Row key={row.label} gap={8} style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', width: 34, flexShrink: 0 }}>{row.label}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${row.pct}%`, height: '100%', background: row.pct >= 90 ? 'var(--error)' : row.pct >= 70 ? 'var(--warning-text-strong)' : 'var(--accent)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', fontFamily: 'monospace', width: 74, textAlign: 'right', flexShrink: 0 }}>{row.value}</span>
                </Row>
              ))}
            </Col>
          </Panel>

          {/* Queue stats ETA rollup */}
          <Row gap={6} style={{
            alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--radius-button)',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)',
          }}>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontWeight: 700 }}>Queue</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border)' }} />
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontWeight: 700 }}>~46m remaining</span>
          </Row>

          <Panel style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)', fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Engine calibration
            </div>
            {[
              { engine: 'XTTS',    speed: '14.2 c/s', conf: 'high', variant: 'success' as const },
              { engine: 'Voxtral', speed: '9.1 c/s',  conf: 'med',  variant: 'warning' as const },
            ].map((e, i, arr) => (
              <Row key={e.engine} gap={6} style={{ padding: '6px 10px', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>{e.engine}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.speed}</span>
                {/* Confidence dot: tokenized via SemanticChip */}
                <SemanticChip variant={e.variant}>{e.conf}</SemanticChip>
              </Row>
            ))}
          </Panel>
          <Card style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>Production</div>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', marginTop: 3 }}>
              23h 41m generated · 312 chapters
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', marginTop: 8, height: 24 }}>
              {[6, 9, 14, 11, 18, 22, 17].map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h / 22 * 100}%`,
                  background: i === 6 ? 'var(--action-primary)' : 'var(--border)',
                  borderRadius: 2, opacity: 0.8,
                }} />
              ))}
            </div>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 3 }}>Last 7 days</div>
          </Card>
        </Col>
      </Row>
    </Col>
  );
};
