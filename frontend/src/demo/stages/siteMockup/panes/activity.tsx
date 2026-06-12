/**
 * siteMockup/panes/activity.tsx — Activity pane
 */
import React, { useState } from 'react';
import { Row, Col, Label, Chip, Btn, ProgressBar, IN_FLIGHT_JOBS } from '../shared';

export const ActivityPane: React.FC = () => {
  const [historyFilter, setHistoryFilter] = useState<'All' | 'Renders' | 'Samples' | 'API'>('All');
  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <Col gap={8} style={{ flex: 2 }}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Label>Now</Label>
            <div style={{ flex: 1 }} />
            <Btn small>⏸ Pause queue</Btn>
          </Row>
          {IN_FLIGHT_JOBS.map(job => (
            <div key={job.title} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px',
            }}>
              <Row gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{job.title}</span>
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

          <Row gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Label>History</Label>
            {(['All', 'Renders', 'Samples', 'API'] as const).map(f => (
              <Chip key={f} active={historyFilter === f} onClick={() => setHistoryFilter(f)}>{f}</Chip>
            ))}
          </Row>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
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
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Engine calibration
            </div>
            {[
              { engine: 'XTTS', speed: '14.2 c/s', conf: 'high', color: '#22c55e' },
              { engine: 'Voxtral', speed: '9.1 c/s', conf: 'med', color: '#f59e0b' },
            ].map((e, i, arr) => (
              <Row key={e.engine} gap={6} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>{e.engine}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.speed}</span>
                <span style={{ fontSize: '0.55rem', color: e.color }}>●{e.conf}</span>
              </Row>
            ))}
          </div>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>Production</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: 3 }}>
              23h 41m generated · 312 chapters
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', marginTop: 8, height: 24 }}>
              {[6, 9, 14, 11, 18, 22, 17].map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h / 22 * 100}%`,
                  background: i === 6 ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 2, opacity: 0.8,
                }} />
              ))}
            </div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 3 }}>Last 7 days</div>
          </div>
        </Col>
      </Row>
    </Col>
  );
};
