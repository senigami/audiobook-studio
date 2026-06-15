/**
 * siteMockup/panes/platform.tsx — EnginesPane + IntegrationsPane
 */
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Upload,
  RefreshCw,
  Play,
  X,
  Puzzle,
  Cloud,
  Lock,
  Trash2,
  Shield,
  AlertTriangle,
  Check,
  Volume2,
  Star,
  BookOpen,
  Pencil,
} from 'lucide-react';
import {
  Row,
  Col,
  Label,
  Chip,
  SemanticChip,
  Card,
  Panel,
  Btn,
  PlannedChip,
  statusChip,
  onPill,
} from '../shared';

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
        <Btn small onClick={() => setShowTrustDialog(true)}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Upload size={10} />
            Import plugin (.zip)
          </Row>
        </Btn>
        <Btn small>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <RefreshCw size={10} />
            Refresh
          </Row>
        </Btn>
      </Row>

      {showTrustDialog && (
        <Panel style={{
          padding: '12px 14px',
          borderColor: 'var(--warning-tint-border)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <Row gap={8} style={{ alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              Install plugin
            </span>
            <button onClick={() => setShowTrustDialog(false)} aria-label="Close install dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <X size={14} />
            </button>
          </Row>
          <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>MyCustomTTS</span>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>v0.3</span>
          </Row>
          <Col gap={3} style={{ marginBottom: 8 }}>
            {[
              { name: 'torch>=2.0', remote: false },
              { name: 'transformers>=4.38', remote: false },
              { name: 'mycustomtts-weights @ https://example.com/weights.tar.gz', remote: true },
            ].map((dep, i) => (
              <Row key={i} gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dep.name}
                </span>
                {dep.remote && (
                  <SemanticChip variant="warning">REMOTE</SemanticChip>
                )}
              </Row>
            ))}
          </Col>
          <div style={{
            fontSize: 'var(--type-micro)', color: 'var(--warning-text)',
            background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
            borderRadius: 4, padding: '5px 8px', marginBottom: 10, lineHeight: 1.5,
          }}>
            Plugins run unsandboxed — install only from sources you trust.
          </div>
          <Row gap={6}>
            <Btn primary small onClick={() => setShowTrustDialog(false)}>Install</Btn>
            <Btn small onClick={() => setShowTrustDialog(false)}>Cancel</Btn>
          </Row>
        </Panel>
      )}

      {/* TTS Server diagnostics */}
      <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>TTS Server diagnostics</div>
        </div>
        <Col gap={0}>
          {[
            {
              label: 'Server',
              value: (
                <Row gap={6} style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--success)' }}>●</span>
                  <span style={{ fontSize: 'var(--type-caption)', color: 'var(--success-text)', fontWeight: 600 }}>running</span>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>· port 7862 · uptime 3h 12m</span>
                </Row>
              ),
            },
            {
              label: 'Last health check',
              value: <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>4s ago</span>,
            },
          ].map((row, i, arr) => (
            <Row key={row.label} gap={8} style={{
              padding: '6px 12px', alignItems: 'center',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: 120, flexShrink: 0 }}>{row.label}</span>
              {row.value}
            </Row>
          ))}
          <Row gap={8} style={{ padding: '6px 12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }} />
            <Btn small>
              <Row gap={4} style={{ alignItems: 'center' }}>
                <RefreshCw size={10} />
                Restart server
              </Row>
            </Btn>
          </Row>
        </Col>
      </Card>

      <Label>Installed</Label>
      <Col gap={8}>
        {/* XTTS v2 */}
        <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px' }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <button
                onClick={() => setXttsExpanded(e => !e)}
                aria-label={xttsExpanded ? 'Collapse XTTS v2' : 'Expand XTTS v2'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: 0 }}
              >
                {xttsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Puzzle size={14} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>XTTS v2</div>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>xtts · v2.0.3</div>
              </div>
              <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
                <span style={onPill}>ON</span>
                <span style={statusChip('success')}>READY</span>
                <span style={statusChip('cloud')}>VERIFIED</span>
                <Btn small>Verify</Btn>
              </Row>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginLeft: 44, marginTop: 4 }}>
              <SemanticChip variant="cloud">14.2 chars/s · high confidence</SemanticChip>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Reset calibration</span>
            </Row>
          </div>

          {xttsExpanded && (
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-alt)', padding: '10px 12px' }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Engine settings</div>
                <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  {[{ label: 'Speed', value: '1.0' }, { label: 'Temperature', value: '0.65' }, { label: 'Repetition penalty', value: '2.0' }, { label: 'Top-k', value: '50' }].map((row, i, arr) => (
                    <Row key={row.label} gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                      <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.value}</span>
                      <button aria-label={`Edit ${row.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                        <Pencil size={11} />
                      </button>
                    </Row>
                  ))}
                </Card>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>generated from plugin settings_schema</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Text cleanup (sanitize) overrides</div>
                <Row gap={5} style={{ flexWrap: 'wrap' }}>
                  {SANITIZE_TOGGLES.map((tog, i) => (
                    <button
                      key={tog.label}
                      onClick={() => toggleSanitize(i)}
                      aria-pressed={sanitizeToggles[i]}
                      aria-label={`Toggle ${tog.label} sanitization`}
                      style={{
                        cursor: 'pointer', fontSize: 'var(--type-micro)', padding: '2px 7px', borderRadius: 'var(--radius-round)',
                        border: `1px solid ${sanitizeToggles[i] ? 'var(--accent-tint-border)' : 'var(--border)'}`,
                        background: sanitizeToggles[i] ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                        color: sanitizeToggles[i] ? 'var(--accent)' : 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                      }}
                    >
                      {sanitizeToggles[i]
                        ? <Check size={9} />
                        : <X size={9} />}
                      {tog.label}
                    </button>
                  ))}
                </Row>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>per-engine category overrides</div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Output QA</div>
                <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>Max plausible speech rate</span>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>60 chars/s (0 = off)</span>
                    <button aria-label="Edit max plausible speech rate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                      <Pencil size={11} />
                    </button>
                  </Row>
                </Card>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>rejects truncated renders</div>
              </div>

              {/* Dev-only row */}
              <div style={{
                marginTop: 6, padding: '5px 8px', borderRadius: 'var(--radius-button)',
                background: 'var(--accent-tint-bg)', border: '1px dashed var(--accent-tint-border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 700, flex: 1, cursor: 'pointer' }}>
                  DEV console ▸ SCENARIOS
                </span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>(visible in Developer Mode)</span>
              </div>
            </div>
          )}
        </Card>

        {/* Voxtral */}
        <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px' }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <button
                onClick={() => setVoxtralExpanded(e => !e)}
                aria-label={voxtralExpanded ? 'Collapse Voxtral' : 'Expand Voxtral'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: 0 }}
              >
                {voxtralExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cloud-tint-bg)', border: '1px solid var(--cloud-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cloud size={14} color="var(--cloud-color)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>Voxtral (Mistral AI)</div>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>voxtral · v1.0.0</div>
              </div>
              <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
                <Cloud size={13} color="var(--cloud-color)" aria-label="Cloud engine" />
                <span style={onPill}>ON</span>
                <span style={statusChip('success')}>READY</span>
                <span style={statusChip('cloud')}>VERIFIED</span>
              </Row>
            </Row>
          </div>

          {voxtralExpanded && (
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-alt)', padding: '10px 12px' }}>
              <div style={{ marginBottom: 10 }}>
                <Row gap={6} style={{ alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Voice Generation Speed</div>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Reset Baseline</span>
                </Row>
                <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ padding: '5px 10px', background: 'var(--accent-tint-bg)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>51.4 characters/sec, 24% confidence</div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>from 5 samples since 6/10/2026</div>
                  </div>
                </Card>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} color="var(--warning)" />
                  Generate more text-to-speech renders to improve confidence in this speed estimate.
                </div>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  This calibrates Studio&apos;s render-time estimates and does not change voice speaking speed.
                </div>
              </div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 8 }}>
                Engine by Mistral AI.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>View Documentation</span>
              </div>

              {/* Cloud privacy notice */}
              <div style={{
                fontSize: 'var(--type-micro)', color: 'var(--warning-text)',
                background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
                borderRadius: 4, padding: '5px 8px', marginBottom: 10, lineHeight: 1.5,
                display: 'flex', gap: 6, alignItems: 'flex-start',
              }}>
                <Cloud size={11} color="var(--cloud-color)" style={{ flexShrink: 0, marginTop: 1 }} />
                Privacy: cloud engines may send text and optional reference audio to external servers.
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Configuration</div>
                <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>Mistral API Key</span>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>••••••••</span>
                    <button aria-label="Edit Mistral API key" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                      <Pencil size={11} />
                    </button>
                  </Row>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)' }}>Model</div>
                      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>Mistral TTS model to use for synthesis.</div>
                    </div>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      <Row gap={3} style={{ alignItems: 'center' }}>voxtral-mini-tts-2603 <ChevronDown size={10} /></Row>
                    </span>
                  </Row>
                  <Row gap={8} style={{ padding: '5px 10px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)' }}>Output Format</div>
                      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>Audio format for synthesis output.</div>
                    </div>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
                      <Row gap={3} style={{ alignItems: 'center' }}>wav <ChevronDown size={10} /></Row>
                    </span>
                  </Row>
                </Card>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Latest Test Sample</div>
                <Card style={{ borderRadius: 'var(--radius-card)', padding: '6px 10px' }}>
                  <Row gap={8} style={{ alignItems: 'center' }}>
                    <Row gap={5} style={{ alignItems: 'center', flex: 1 }}>
                      <button aria-label="Play test sample" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', padding: 0 }}>
                        <Play size={13} />
                      </button>
                      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>0:00 / 0:03</span>
                      <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 2, minWidth: 30 }}>
                        <div style={{ width: '0%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                      <Volume2 size={12} color="var(--text-muted)" />
                    </Row>
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Generated at: 6/11/2026, 10:09:47 AM
                    </span>
                  </Row>
                </Card>
              </div>

              <Row gap={6} style={{ alignItems: 'center' }}>
                <Btn small>
                  <Row gap={4} style={{ alignItems: 'center' }}>
                    <Play size={10} />
                    Run Test
                  </Row>
                </Btn>
                <span style={{
                  fontSize: 'var(--type-micro)', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-button)',
                  border: '1px solid var(--border)', color: 'var(--text-muted)',
                  background: 'var(--surface-alt)', cursor: 'not-allowed', opacity: 0.5,
                  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                }}>
                  <Shield size={10} />
                  Verified
                </span>
                <div style={{ flex: 1 }} />
                <button
                  aria-label="Uninstall Voxtral"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)', fontSize: 'var(--type-micro)', textDecoration: 'underline', flexShrink: 0 }}
                >
                  <Trash2 size={10} />
                  Uninstall
                </button>
              </Row>
            </div>
          )}
        </Card>

        {/* Mixed */}
        <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 12px' }}>
          <Row gap={10} style={{ alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-alt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Puzzle size={14} color="var(--text-secondary)" />
            </div>
            <div style={{ flex: 1 }}>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>Mixed</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>v1.0.1</span>
                <span style={{
                  fontSize: 'var(--type-micro)', padding: '1px 5px', borderRadius: 'var(--radius-round)',
                  border: '1px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text-muted)',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <Lock size={8} />
                  built-in
                </span>
              </Row>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Routes across installed engines</div>
            </div>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--success)' }}>●</span>
            <SemanticChip variant="success">Active</SemanticChip>
            <Btn small>Configure</Btn>
          </Row>
        </Card>

        {/* MyCustomTTS */}
        <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 12px' }}>
          <Row gap={10} style={{ alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Puzzle size={14} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>MyCustomTTS</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>v0.3</span>
                <SemanticChip variant="accent">user-installed</SemanticChip>
              </Row>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Third-party plugin · GPU · Custom model</div>
            </div>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--success)' }}>●</span>
            <SemanticChip variant="success">Active</SemanticChip>
            <Btn small>Configure</Btn>
            <button
              aria-label="Uninstall MyCustomTTS"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 'var(--type-micro)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
            >
              <Trash2 size={10} />
              Uninstall
            </button>
          </Row>
        </Card>
      </Col>

      {/* Browse store */}
      <Row gap={6} style={{ alignItems: 'center' }}>
        <Label>Browse store</Label>
        <PlannedChip />
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>plugin store — GitHub discovery</span>
      </Row>
      <Col gap={6}>
        {[
          { name: 'WhisperTTS', author: 'audio-lab', stars: 142 },
          { name: 'CoquiLocal', author: 'coqui-community', stars: 89 },
          { name: 'BarkPlugin', author: 'suno-dev', stars: 234 },
        ].map(s => (
          <Card key={s.name} style={{
            borderRadius: 'var(--radius-card)', padding: '7px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-alt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Puzzle size={14} color="var(--text-secondary)" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginLeft: 6 }}>by {s.author}</span>
            </div>
            <Row gap={3} style={{ alignItems: 'center' }}>
              <Star size={10} color="var(--warning)" fill="var(--warning)" />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{s.stars}</span>
            </Row>
            <Btn small onClick={() => setShowTrustDialog(true)}>Install</Btn>
          </Card>
        ))}
        <div style={{
          fontSize: 'var(--type-micro)', color: 'var(--warning-text)',
          background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
          borderRadius: 4, padding: '4px 10px',
        }}>
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
    borderRadius: 'var(--radius-button)', padding: '6px 10px',
    display: 'flex', alignItems: 'center', gap: 8,
  }}>
    <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', width: 72, flexShrink: 0 }}>{label}</span>
    {children}
  </div>
);

const ApiEndpointRow: React.FC<{ method: string; path: string; desc: string }> = ({ method, path, desc }) => {
  const methodColor =
    method === 'GET' ? 'var(--success-text)' :
    method === 'POST' ? 'var(--accent)' :
    'var(--warning-text)';
  return (
    <div style={{
      background: 'var(--surface-alt)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-button)', padding: '7px 10px',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{
        fontSize: 'var(--type-micro)', fontWeight: 800,
        color: methodColor,
        fontFamily: 'monospace', paddingTop: 1, width: 38, flexShrink: 0,
      }}>{method}</span>
      <span style={{ fontSize: 'var(--type-caption)', fontFamily: 'monospace', color: 'var(--text-primary)', flexShrink: 0, paddingTop: 1 }}>{path}</span>
      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1, paddingTop: 1 }}>{desc}</span>
    </div>
  );
};

const MonoBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre style={{
    background: 'var(--surface-code)', border: '1px solid var(--surface-code-border)',
    borderRadius: 'var(--radius-button)', padding: '8px 10px', margin: 0,
    fontSize: 'var(--type-micro)', fontFamily: 'monospace', color: 'var(--text-code-muted)',
    overflowX: 'auto', lineHeight: 1.5, whiteSpace: 'pre',
  }}>{children}</pre>
);

const ApiSectionHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase', paddingTop: 4,
  }}>{children}</div>
);

export const IntegrationsPane: React.FC = () => (
  <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
    <Row gap={8} style={{ alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>API</div>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Local API access, authentication, and queue priority.</div>
      </div>
      <SemanticChip variant="success">23 requests today</SemanticChip>
    </Row>

    {/* Developer integration guide */}
    <Panel style={{
      background: 'var(--accent-tint-bg)',
      borderColor: 'var(--accent-tint-border)',
      padding: '10px 12px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Developer Integration Guide</div>
      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 10 }}>
        Connect your applications to Studio 2.0 via the unified orchestration and synthesis API.
      </div>
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        <Card style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Unified Orchestration</div>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Use the /api endpoints to manage projects, chapters, and long-running generation jobs. Studio handles chunking, engine routing, and file management automatically.
          </div>
        </Card>
        <Card style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Direct Synthesis</div>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Call the TTS Server directly for raw text-to-audio requests. Ideal for real-time applications or simple synthesis tasks that don&apos;t require the Studio state machine.
          </div>
        </Card>
      </Row>
    </Panel>

    {/* Security note */}
    <div style={{
      background: 'var(--warning-tint-bg)',
      border: '1px solid var(--warning-tint-border)',
      borderRadius: 'var(--radius-card)', padding: '8px 10px',
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <AlertTriangle size={13} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--warning-text)' }}>Security Note — </strong>
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
      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
        The preferred way to generate audio is via the Studio processing queue — it handles retries, progress broadcast, and artifact management.
      </div>
      <ApiEndpointRow method="POST" path="/api/processing_queue" desc="Submit a chapter to the queue for managed generation." />
      <ApiEndpointRow method="WS" path="/ws" desc="Subscribe to live status and progress events for all active jobs." />
      <MonoBlock>{`{\n  "type": "studio_job_event",\n  "job_id": "job_abc123",\n  "status": "running",\n  "progress": 0.45,\n  "eta_seconds": 12\n}`}</MonoBlock>
    </Col>

    <Col gap={5}>
      <ApiSectionHead>3. Direct TTS Server Access</ApiSectionHead>
      <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
        When the TTS Server is enabled, you can bypass the Studio state machine for stateless synthesis.
      </div>
      <MonoBlock>{`POST http://localhost:8001/synthesize\n{\n  "engine_id": "tts_xtts",\n  "text": "Hello from Studio 2.0.",\n  "voice_ref": "narrator_default",\n  "output_path": "/tmp/out.wav"\n}`}</MonoBlock>
    </Col>

    <Row gap={8} style={{ alignItems: 'center', paddingTop: 2 }}>
      <Row gap={4} style={{ alignItems: 'center', flex: 1 }}>
        <BookOpen size={12} color="var(--text-muted)" />
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Full OpenAPI Schema</span>
      </Row>
      <Btn primary>View Swagger Docs</Btn>
    </Row>

    <Card style={{ borderRadius: 'var(--radius-card)', padding: '10px 12px' }}>
      <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Configuration</div>
      <Col gap={5}>
        <ApiConfigRow label="API Key">
          <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>sk-••••••••••••ef4a</span>
          <Btn small>Copy</Btn>
          <Btn small>Rotate</Btn>
        </ApiConfigRow>
        <ApiConfigRow label="Host">
          <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>127.0.0.1 (loopback)</span>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Chip>LAN</Chip>
            <PlannedChip />
          </Row>
        </ApiConfigRow>
        <ApiConfigRow label="Rate limit">
          <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>60 req/min · unlimited chars</span>
          <Btn small>Edit</Btn>
        </ApiConfigRow>
        <ApiConfigRow label="Priority">
          <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
            <Row gap={3} style={{ alignItems: 'center' }}>studio first <ChevronDown size={10} /></Row>
          </span>
        </ApiConfigRow>
      </Col>
    </Card>
  </Col>
);
