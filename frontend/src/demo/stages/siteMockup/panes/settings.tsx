/**
 * siteMockup/panes/settings.tsx — Settings pane (General/About/Developer)
 */
import React, { useState } from 'react';
import { Row, Col, Chip, Btn } from '../shared';

export const SettingsPane: React.FC = () => {
  const [settingsTab, setSettingsTab] = useState<'General' | 'About' | 'Developer'>('General');
  const [devMode, setDevMode] = useState(false);

  const SETTINGS_TABS: ('General' | 'About' | 'Developer')[] = devMode
    ? ['General', 'About', 'Developer']
    : ['General', 'About'];

  const activeTab = settingsTab === 'Developer' && !devMode ? 'General' : settingsTab;

  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <Row gap={6}>
        {SETTINGS_TABS.map(tab => (
          <div
            key={tab}
            onClick={() => setSettingsTab(tab)}
            style={{
              fontSize: '0.68rem', fontWeight: 600, padding: '3px 12px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${activeTab === tab ? 'var(--accent)' : 'var(--border)'}`,
              background: activeTab === tab ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {tab}
          </div>
        ))}
      </Row>

      {activeTab === 'General' && (
        <Col gap={6}>
          <div style={{
            fontSize: '0.62rem', color: 'var(--text-muted)',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '4px 10px', marginBottom: 2,
          }}>
            Engines &amp; Integrations live under PLATFORM — Settings is intentionally thin.
          </div>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {/* Theme */}
            <div style={{ fontSize: '0.68rem', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Theme</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>System ▾</span>
            </div>
            {/* Stability Mode */}
            <div style={{ fontSize: '0.68rem', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Col gap={1} style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-primary)' }}>Stability Mode</span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>conservative text cleanup before synthesis</span>
              </Col>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Off ▾</span>
            </div>
            {/* Default Engine */}
            <div style={{ fontSize: '0.68rem', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Default Engine</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>XTTS v2 ▾</span>
            </div>
            {/* Default Voice */}
            <div style={{ fontSize: '0.68rem', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Default Voice</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Studio Voice ▾</span>
            </div>
            {/* Developer Mode */}
            <div
              style={{ fontSize: '0.68rem', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => {
                const next = !devMode;
                setDevMode(next);
                if (!next && settingsTab === 'Developer') setSettingsTab('General');
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Developer Mode</span>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{devMode ? 'On' : 'Off'}</span>
                <div style={{ width: 28, height: 14, borderRadius: 7, background: devMode ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
                  <div style={{ position: 'absolute', top: 2, left: devMode ? 16 : 2, width: 10, height: 10, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </div>
              </Row>
            </div>
          </div>
        </Col>
      )}

      {activeTab === 'About' && (
        <Col gap={10}>
          <Row gap={8} style={{ alignItems: 'stretch' }}>
            {/* Studio Version */}
            <div style={{ flex: 1, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>2.0.0</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4 }}>Release Channel: Stable</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Studio Version</div>
            </div>
            {/* Engine Plugins */}
            <div style={{ flex: 1, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>3 loaded</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>Mixed Synthesis · Voxtral (Mistral AI) · XTTS (Local)</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Engine Plugins</div>
            </div>
            {/* Production Tally */}
            <div style={{ flex: 1, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <Btn small>Reset</Btn>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>1h 2m</span>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AUDIO</span>
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                9,504 words<br />53,145 characters
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>⟳ Tally since Jun 2, 2026</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Production Tally</div>
            </div>
          </Row>

          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0 2px' }}>
            Resetting tally starts a new count from now without deleting historical render rows.
          </div>

          <div>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Runtime Diagnostics</div>
            <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {[
                { label: 'Frontend Client', sub: 'online', chip: 'http://127.0.0.1:5174', chipColor: undefined as string | undefined },
                { label: 'Backend Runtime', sub: 'Service Bridge', chip: 'Managed Subprocess (TTS Server @ 7862)', chipColor: undefined as string | undefined },
                { label: 'Orchestrator', sub: undefined, chip: 'Studio 2.0', chipColor: undefined as string | undefined },
                { label: 'Backend API', sub: 'http://127.0.0.1:8124 · port 8124 · Responding to Studio API requests.', chip: 'online', chipColor: '#22c55e' },
              ].map((row) => (
                <div key={row.label} style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</div>
                    {row.sub && <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{row.sub}</div>}
                  </div>
                  <Chip color={row.chipColor}>{row.chip}</Chip>
                </div>
              ))}
              <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-primary)' }}>TTS Server</div>
                  <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>http://127.0.0.1:7862 · port 7862 · Loaded plugins responded successfully.</div>
                </div>
                <Row gap={6} style={{ alignItems: 'center', flexShrink: 0 }}>
                  <Chip color="#22c55e">healthy</Chip>
                  <Btn small>Restart</Btn>
                </Row>
              </div>
            </div>
          </div>

          <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: '9px 12px', fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Audiobook Studio 2.0 is a modular platform powered by a decoupled TTS Server and plugin architecture.
            The About tab provides diagnostic visibility into the service bridge, production efficiency, and runtime health.
          </div>
        </Col>
      )}

      {activeTab === 'Developer' && devMode && (
        <Col gap={6}>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: 'Progress harness', href: '/debug/progress' },
              { label: 'Event stream', href: '/debug/events' },
              { label: 'Design spec sheet', href: '/debug/design' },
              { label: 'TTS API Swagger', href: '/api/v1/tts/docs' },
            ].map((link, i, arr) => (
              <div key={link.label} style={{
                padding: '7px 12px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--accent)' }}>{link.label}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{link.href} ↗</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 4px' }}>
            enables debug-copy buttons in queue + chapter toolbar
          </div>
        </Col>
      )}
    </Col>
  );
};
