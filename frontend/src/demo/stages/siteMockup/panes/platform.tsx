/**
 * siteMockup/panes/platform.tsx — EnginesPane + IntegrationsPane
 */
import React, { useState } from 'react';
import { Row, Col, Label, Chip, Btn, ProgressBar, PlannedChip, statusChip, onPill } from '../shared';

const SANITIZE_TOGGLES = [
  { label: 'quotes', on: true },
  { label: 'acronyms', on: true },
  { label: 'fractions', on: true },
  { label: 'dashes', on: true },
  { label: 'punctuation spacing', on: true },
  { label: 'ASCII', on: true },
  { label: 'terminal punctuation', on: false },
];

export const EnginesPane: React.FC = () => {
  const [xttsExpanded, setXttsExpanded] = useState(false);
  const [voxtralExpanded, setVoxtralExpanded] = useState(true);
  const [sanitizeToggles, setSanitizeToggles] = useState<boolean[]>(SANITIZE_TOGGLES.map(t => t.on));
  const [showTrustDialog, setShowTrustDialog] = useState(false);

  const toggleSanitize = (i: number) => {
    setSanitizeToggles(prev => prev.map((v, idx) => idx === i ? !v : v));
  };

  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Btn small onClick={() => setShowTrustDialog(true)}>⬆ Import plugin (.zip)</Btn>
        <Btn small>↺ Refresh</Btn>
      </Row>

      {showTrustDialog && (
        <div style={{
          background: 'var(--surface)', border: '1px solid #fbbf24',
          borderRadius: 8, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <Row gap={8} style={{ alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              Install plugin
            </span>
            <span onClick={() => setShowTrustDialog(false)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>✕</span>
          </Row>
          <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>MyCustomTTS</span>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>v0.3</span>
          </Row>
          <Col gap={3} style={{ marginBottom: 8 }}>
            {[
              { name: 'torch>=2.0', remote: false },
              { name: 'transformers>=4.38', remote: false },
              { name: 'mycustomtts-weights @ https://example.com/weights.tar.gz', remote: true },
            ].map((dep, i) => (
              <Row key={i} gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dep.name}
                </span>
                {dep.remote && (
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#d97706', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                    REMOTE
                  </span>
                )}
              </Row>
            ))}
          </Col>
          <div style={{
            fontSize: '0.6rem', color: '#92400e',
            background: '#fef3c7', border: '1px solid #fbbf24',
            borderRadius: 4, padding: '5px 8px', marginBottom: 10, lineHeight: 1.5,
          }}>
            Plugins run unsandboxed — install only from sources you trust.
          </div>
          <Row gap={6}>
            <Btn primary small onClick={() => setShowTrustDialog(false)}>Install</Btn>
            <Btn small onClick={() => setShowTrustDialog(false)}>Cancel</Btn>
          </Row>
        </div>
      )}

      {/* TTS Server diagnostics */}
      <div style={{
        background: 'var(--surface-alt)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>TTS Server diagnostics</div>
        </div>
        <Col gap={0}>
          {[
            {
              label: 'Server',
              value: (
                <Row gap={6} style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: '#22c55e' }}>●</span>
                  <span style={{ fontSize: '0.62rem', color: '#22c55e', fontWeight: 600 }}>running</span>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>· port 7862 · uptime 3h 12m</span>
                </Row>
              ),
            },
            {
              label: 'Last health check',
              value: <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>4s ago</span>,
            },
          ].map((row, i, arr) => (
            <Row key={row.label} gap={8} style={{
              padding: '6px 12px', alignItems: 'center',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', width: 120, flexShrink: 0 }}>{row.label}</span>
              {row.value}
            </Row>
          ))}
          <Row gap={8} style={{ padding: '6px 12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }} />
            <Btn small>↺ Restart server</Btn>
          </Row>
        </Col>
      </div>

      <Label>Installed</Label>
      <Col gap={8}>
        {/* XTTS v2 */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px' }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span onClick={() => setXttsExpanded(e => !e)} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
                {xttsExpanded ? '▾' : '›'}
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>🧩</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>XTTS v2</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>xtts · v2.0.3</div>
              </div>
              <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
                <span style={onPill}>ON</span>
                <span style={statusChip('#22c55e')}>READY</span>
                <span style={statusChip('#0ea5e9')}>VERIFIED</span>
                <Btn small>Verify</Btn>
              </Row>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginLeft: 44, marginTop: 4 }}>
              <Chip color="#0ea5e9">14.2 chars/s · high confidence</Chip>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Reset calibration</span>
            </Row>
          </div>

          {xttsExpanded && (
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 12px' }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Engine settings</div>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {[{ label: 'Speed', value: '1.0' }, { label: 'Temperature', value: '0.65' }, { label: 'Repetition penalty', value: '2.0' }, { label: 'Top-k', value: '50' }].map((row, i, arr) => (
                    <Row key={row.label} gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.value}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</span>
                    </Row>
                  ))}
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>generated from plugin settings_schema</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Text cleanup (sanitize) overrides</div>
                <Row gap={5} style={{ flexWrap: 'wrap' }}>
                  {SANITIZE_TOGGLES.map((tog, i) => (
                    <span key={tog.label} onClick={() => toggleSanitize(i)} style={{
                      cursor: 'pointer', fontSize: '0.6rem', padding: '2px 7px', borderRadius: 20,
                      border: `1px solid ${sanitizeToggles[i] ? 'var(--accent)' : 'var(--border)'}`,
                      background: sanitizeToggles[i] ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                      color: sanitizeToggles[i] ? 'var(--accent)' : 'var(--text-muted)',
                      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                    }}>
                      {sanitizeToggles[i] ? '✓' : '✗'} {tog.label}
                    </span>
                  ))}
                </Row>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>per-engine category overrides</div>
              </div>

              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Output QA</div>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>Max plausible speech rate</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>60 chars/s (0 = off)</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</span>
                  </Row>
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>rejects truncated renders</div>
              </div>

              {/* Dev-only row */}
              <div style={{
                marginTop: 6, padding: '5px 8px', borderRadius: 5,
                background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.35)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: '0.62rem', color: '#8b5cf6', fontFamily: 'monospace', fontWeight: 700, flex: 1, cursor: 'pointer' }}>
                  DEV console ▸ SCENARIOS
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>(visible in Developer Mode)</span>
              </div>
            </div>
          )}
        </div>

        {/* Voxtral */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px' }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span onClick={() => setVoxtralExpanded(e => !e)} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
                {voxtralExpanded ? '▾' : '›'}
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '1px solid #8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>☁</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>Voxtral (Mistral AI)</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>voxtral · v1.0.0</div>
              </div>
              <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', color: '#8b5cf6' }} title="Cloud engine">☁</span>
                <span style={onPill}>ON</span>
                <span style={statusChip('#22c55e')}>READY</span>
                <span style={statusChip('#0ea5e9')}>VERIFIED</span>
              </Row>
            </Row>
          </div>

          {voxtralExpanded && (
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 12px' }}>
              <div style={{ marginBottom: 10 }}>
                <Row gap={6} style={{ alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Voice Generation Speed</div>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Reset Baseline</span>
                </Row>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ padding: '5px 10px', background: 'var(--accent-tint-bg)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>51.4 characters/sec, 24% confidence</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>from 5 samples since 6/10/2026</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.58rem', color: '#d97706', marginBottom: 3 }}>
                  ⚠ Generate more text-to-speech renders to improve confidence in this speed estimate.
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  This calibrates Studio's render-time estimates and does not change voice speaking speed.
                </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                Engine by Mistral AI.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>View Documentation</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '5px 8px', marginBottom: 10, lineHeight: 1.5 }}>
                ☁ Privacy: cloud engines may send text and optional reference audio to external servers.
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Configuration</div>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>Mistral API Key</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>••••••••</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</span>
                  </Row>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-primary)' }}>Model</div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Mistral TTS model to use for synthesis.</div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>voxtral-mini-tts-2603 ▾</span>
                  </Row>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-primary)' }}>Output Format</div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Audio format for synthesis output.</div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>wav ▾</span>
                  </Row>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Latest Test Sample</div>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                  <Row gap={8} style={{ alignItems: 'center' }}>
                    <Row gap={5} style={{ alignItems: 'center', flex: 1 }}>
                      <span style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>▶</span>
                      <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>0:00 / 0:03</span>
                      <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 2, minWidth: 30 }}>
                        <div style={{ width: '0%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>🔊</span>
                    </Row>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Generated at: 6/11/2026, 10:09:47 AM
                    </span>
                  </Row>
                </div>
              </div>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <Btn small>▶ Run Test</Btn>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                  border: '1px solid var(--border)', color: 'var(--text-muted)',
                  background: 'var(--surface-alt)', cursor: 'not-allowed', opacity: 0.5,
                  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                }}>🛡 Verified</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '0.6rem', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                  🗑 Uninstall
                </span>
              </Row>
            </div>
          )}
        </div>

        {/* Mixed */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
          <Row gap={10} style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '1.2rem' }}>🧩</span>
            <div style={{ flex: 1 }}>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>Mixed</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>v1.0.1</span>
                <span style={{ fontSize: '0.52rem', padding: '1px 5px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>🔒 built-in</span>
              </Row>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Routes across installed engines</div>
            </div>
            <span style={{ fontSize: '0.5rem', color: '#22c55e' }}>●</span>
            <Chip color="#22c55e">Active</Chip>
            <Btn small>Configure</Btn>
          </Row>
        </div>

        {/* MyCustomTTS */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
          <Row gap={10} style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '1.2rem' }}>🧩</span>
            <div style={{ flex: 1 }}>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>MyCustomTTS</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>v0.3</span>
                <Chip color="#8b5cf6">user-installed</Chip>
              </Row>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Third-party plugin · GPU · Custom model</div>
            </div>
            <span style={{ fontSize: '0.5rem', color: '#22c55e' }}>●</span>
            <Chip color="#22c55e">Active</Chip>
            <Btn small>Configure</Btn>
            <span style={{ fontSize: '0.6rem', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>Uninstall</span>
          </Row>
        </div>
      </Col>

      {/* Browse store */}
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Label>Browse store</Label>
        <PlannedChip />
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>plugin store — GitHub discovery</span>
      </Row>
      <Col gap={6}>
        {[
          { name: 'WhisperTTS', author: 'audio-lab', stars: 142 },
          { name: 'CoquiLocal', author: 'coqui-community', stars: 89 },
          { name: 'BarkPlugin', author: 'suno-dev', stars: 234 },
        ].map(s => (
          <div key={s.name} style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '7px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: '1rem' }}>🧩</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginLeft: 6 }}>by {s.author}</span>
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>⭐ {s.stars}</span>
            <Btn small onClick={() => setShowTrustDialog(true)}>Install</Btn>
          </div>
        ))}
        <div style={{ fontSize: '0.58rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '4px 10px' }}>
          plugins run unsandboxed — deps reviewed before install
        </div>
      </Col>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// IntegrationsPane

const ApiConfigRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '6px 10px',
    display: 'flex', alignItems: 'center', gap: 8,
  }}>
    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 72, flexShrink: 0 }}>{label}</span>
    {children}
  </div>
);

const ApiEndpointRow: React.FC<{ method: string; path: string; desc: string }> = ({ method, path, desc }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '7px 10px',
    display: 'flex', alignItems: 'flex-start', gap: 8,
  }}>
    <span style={{
      fontSize: '0.55rem', fontWeight: 800,
      color: method === 'GET' ? '#22c55e' : method === 'POST' ? 'var(--accent)' : '#f59e0b',
      fontFamily: 'monospace', paddingTop: 1, width: 38, flexShrink: 0,
    }}>{method}</span>
    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'var(--text-primary)', flexShrink: 0, paddingTop: 1 }}>{path}</span>
    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flex: 1, paddingTop: 1 }}>{desc}</span>
  </div>
);

const MonoBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '8px 10px', margin: 0,
    fontSize: '0.58rem', fontFamily: 'monospace', color: 'var(--text-secondary)',
    overflowX: 'auto', lineHeight: 1.5, whiteSpace: 'pre',
  }}>{children}</pre>
);

const ApiSectionHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase', paddingTop: 4,
  }}>{children}</div>
);

export const IntegrationsPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={8} style={{ alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>API</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Local API access, authentication, and queue priority.</div>
      </div>
      <Chip color="#22c55e">23 requests today</Chip>
    </Row>

    <div style={{
      background: 'color-mix(in srgb, var(--accent) 6%, var(--surface-alt))',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
      borderRadius: 7, padding: '10px 12px',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Developer Integration Guide</div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        Connect your applications to Studio 2.0 via the unified orchestration and synthesis API.
      </div>
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Unified Orchestration</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Use the /api endpoints to manage projects, chapters, and long-running generation jobs. Studio handles chunking, engine routing, and file management automatically.
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Direct Synthesis</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Call the TTS Server directly for raw text-to-audio requests. Ideal for real-time applications or simple synthesis tasks that don&apos;t require the Studio state machine.
          </div>
        </div>
      </Row>
    </div>

    <div style={{
      background: 'color-mix(in srgb, #f59e0b 10%, var(--surface-alt))',
      border: '1px solid color-mix(in srgb, #f59e0b 35%, var(--border))',
      borderRadius: 6, padding: '8px 10px',
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>⚠</span>
      <div style={{ fontSize: '0.58rem', color: '#b45309', lineHeight: 1.55 }}>
        <strong style={{ color: '#92400e' }}>Security Note — </strong>
        Studio 2.0 does not currently implement internal API secret keys. Never expose these endpoints directly to the public internet.
        If access outside localhost is required, place Studio behind a secure proxy layer (like Nginx or Cloudflare Tunnel) with its own authentication.
      </div>
    </div>

    <Col gap={5}>
      <ApiSectionHead>1. Resource Discovery</ApiSectionHead>
      <ApiEndpointRow method="GET" path="/api/engines" desc="Lists all registered TTS engines, their enablement status, and verification health." />
      <ApiEndpointRow method="GET" path="/api/speaker-profiles" desc="Returns available voice profiles, engine assignments, and reference audio sample links." />
      <MonoBlock>{`{\n  "engines": [\n    { "engine_id": "cloud-engine", "enabled": true, "status": "ready" },\n    { "engine_id": "tts_xtts",    "enabled": true, "status": "ready" },\n    { "engine_id": "tts_mixed",   "enabled": false,"status": "disabled" }\n  ]\n}`}</MonoBlock>
    </Col>

    <Col gap={5}>
      <ApiSectionHead>2. Orchestration &amp; Generation</ApiSectionHead>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
        The preferred way to generate audio is via the Studio processing queue — it handles retries, progress broadcast, and artifact management.
      </div>
      <ApiEndpointRow method="POST" path="/api/processing_queue" desc="Submit a chapter to the queue for managed generation." />
      <ApiEndpointRow method="WS" path="/ws" desc="Subscribe to live status and progress events for all active jobs." />
      <MonoBlock>{`{\n  "type": "studio_job_event",\n  "job_id": "job_abc123",\n  "status": "running",\n  "progress": 0.45,\n  "eta_seconds": 12\n}`}</MonoBlock>
    </Col>

    <Col gap={5}>
      <ApiSectionHead>3. Direct TTS Server Access</ApiSectionHead>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
        When the TTS Server is enabled, you can bypass the Studio state machine for stateless synthesis.
      </div>
      <MonoBlock>{`POST http://localhost:8001/synthesize\n{\n  "engine_id": "tts_xtts",\n  "text": "Hello from Studio 2.0.",\n  "voice_ref": "narrator_default",\n  "output_path": "/tmp/out.wav"\n}`}</MonoBlock>
    </Col>

    <Row gap={8} style={{ alignItems: 'center', paddingTop: 2 }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', flex: 1 }}>📖 Full OpenAPI Schema</span>
      <Btn primary>View Swagger Docs</Btn>
    </Row>

    <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Configuration</div>
      <Col gap={5}>
        <ApiConfigRow label="API Key">
          <span style={{ flex: 1, fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>sk-••••••••••••ef4a</span>
          <Btn small>Copy</Btn>
          <Btn small>Rotate</Btn>
        </ApiConfigRow>
        <ApiConfigRow label="Host">
          <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>127.0.0.1 (loopback)</span>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Chip>LAN</Chip>
            <PlannedChip />
          </Row>
        </ApiConfigRow>
        <ApiConfigRow label="Rate limit">
          <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)' }}>60 req/min · unlimited chars</span>
          <Btn small>Edit</Btn>
        </ApiConfigRow>
        <ApiConfigRow label="Priority">
          <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)' }}>studio first ▾</span>
        </ApiConfigRow>
      </Col>
    </div>
  </Col>
);
