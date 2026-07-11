/**
 * siteMockup/panes/settings.tsx — Settings pane (General/About/Developer)
 */
import React, { useState } from 'react';
import { ExternalLink, RefreshCw, ChevronDown, Globe2, Check } from 'lucide-react';
import { Row, Col, Chip, SemanticChip, Card, Btn, PaneHeader } from '../shared';

const APP_LANGUAGES = [
  { code: 'en', label: 'English', complete: true },
  { code: 'es', label: 'Español', complete: false },
  { code: 'fr', label: 'Français', complete: false },
  { code: 'de', label: 'Deutsch', complete: false },
  { code: 'pt', label: 'Português', complete: false },
  { code: 'ja', label: '日本語', complete: false },
];

const LanguageSelector: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('en');
  const current = APP_LANGUAGES.find(l => l.code === lang) ?? APP_LANGUAGES[0];

  return (
    <div style={{ position: 'relative' }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
        style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
      >
        {current.label}<ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
      </span>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} aria-hidden="true" />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)',
            minWidth: 180, padding: '4px 0', textAlign: 'left',
          }}>
            {APP_LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => { setLang(l.code); setOpen(false); }}
                style={{
                  width: '100%', border: 0, background: l.code === lang ? 'var(--accent-tint-bg)' : 'transparent',
                  fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                  padding: '6px 12px', fontSize: 'var(--type-caption)',
                  color: l.code === lang ? 'var(--accent)' : 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>{l.label}</span>
                {!l.complete && <SemanticChip variant="warning">partial</SemanticChip>}
                {l.code === lang && <Check size={12} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const SettingsPane: React.FC = () => {
  const [settingsTab, setSettingsTab] = useState<'General' | 'About' | 'Developer'>('General');
  const [devMode, setDevMode] = useState(false);

  const SETTINGS_TABS: ('General' | 'About' | 'Developer')[] = devMode
    ? ['General', 'About', 'Developer']
    : ['General', 'About'];

  const activeTab = settingsTab === 'Developer' && !devMode ? 'General' : settingsTab;

  return (
    <Col gap={14} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <PaneHeader
        eyebrow="Manage"
        title="Settings"
        subtitle="Keep the main preferences thin; engine setup and API controls live in their own focused platform pages."
        meta={<SemanticChip variant="success">Saved locally</SemanticChip>}
      />

      <Row gap={8} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {[
          { label: 'Appearance', value: 'System', detail: 'follows device theme' },
          { label: 'Default voice', value: 'Studio Voice', detail: 'used for new books' },
          { label: 'Developer mode', value: devMode ? 'On' : 'Off', detail: devMode ? 'debug surfaces visible' : 'simple interface' },
        ].map(item => (
          <Card key={item.label} className="ns-hero-card" style={{ flex: '1 1 190px', padding: '10px 12px' }}>
            <Col gap={3}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{item.label}</span>
              <span style={{ fontSize: 'var(--type-headline)', color: 'var(--text-primary)', fontWeight: 800 }}>{item.value}</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>{item.detail}</span>
            </Col>
          </Card>
        ))}
      </Row>

      <Row gap={6}>
        {SETTINGS_TABS.map(tab => (
          <button
            type="button"
            key={tab}
            onClick={() => setSettingsTab(tab)}
            style={{
              fontSize: 'var(--type-caption)', fontWeight: 600, padding: '3px 12px', borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${activeTab === tab ? 'var(--accent)' : 'var(--border)'}`,
              background: activeTab === tab ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            {tab}
          </button>
        ))}
      </Row>

      {activeTab === 'General' && (
        <Col gap={6}>
          <div style={{
            fontSize: 'var(--type-micro)', color: 'var(--text-muted)',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)',
            borderRadius: 'var(--radius-button)', padding: '4px 10px', marginBottom: 2,
          }}>
            Engine plugins and API integrations are managed under the ENGINES and INTEGRATIONS rails.
          </div>
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            {/* Theme */}
            <div className="ns-settings-list-row" style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Theme</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>System<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></span>
            </div>
            {/* Language (app display language — i18n scaffold, see TASKS.md deferred/post-v2.0) */}
            <div className="ns-settings-list-row" style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Col gap={1} style={{ flex: 1 }}>
                <Row gap={5} style={{ alignItems: 'center' }}>
                  <Globe2 size={11} color="var(--text-muted)" aria-hidden="true" />
                  <span style={{ color: 'var(--text-primary)' }}>Language</span>
                </Row>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>app display language — voices keep their own spoken language</span>
              </Col>
              <LanguageSelector />
            </div>
            {/* Stability Mode */}
            <div className="ns-settings-list-row" style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Col gap={1} style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-primary)' }}>Stability Mode</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>conservative text cleanup before synthesis</span>
              </Col>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Off<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></span>
            </div>
            {/* Default Engine */}
            <div className="ns-settings-list-row" style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Default Engine</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Neural Voice Engine<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></span>
            </div>
            {/* Default Voice */}
            <div className="ns-settings-list-row" style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)' }}>Default Voice</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Studio Voice<ChevronDown size={12} strokeWidth={2} aria-hidden="true" /></span>
            </div>
            {/* Developer Mode */}
            <div
              className="ns-settings-list-row"
              style={{ fontSize: 'var(--type-caption)', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => {
                const next = !devMode;
                setDevMode(next);
                if (!next && settingsTab === 'Developer') setSettingsTab('General');
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Developer Mode</span>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>{devMode ? 'On' : 'Off'}</span>
                <div
                  role="switch"
                  aria-checked={devMode}
                  aria-label="Developer Mode"
                  style={{ width: 28, height: 14, borderRadius: 'var(--radius-round)', background: devMode ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}
                >
                  <div style={{ position: 'absolute', top: 2, left: devMode ? 16 : 2, width: 10, height: 10, borderRadius: '50%', background: 'var(--text-on-accent)', transition: 'left 0.15s' }} />
                </div>
              </Row>
            </div>
          </Card>
        </Col>
      )}

      {activeTab === 'About' && (
        <Col gap={10}>
          <Row gap={8} style={{ alignItems: 'stretch' }}>
            {/* Studio Version */}
            <Card style={{ flex: 1, borderRadius: 'var(--radius-card)', padding: '10px 12px' }}>
              <div style={{ fontSize: 'var(--type-title)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>2.0.0</div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 4 }}>Release Channel: Stable</div>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Studio Version</div>
            </Card>
            {/* Engine Plugins */}
            <Card style={{ flex: 1, borderRadius: 'var(--radius-card)', padding: '10px 12px' }}>
              <div style={{ fontSize: 'var(--type-title)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>3 loaded</div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>Mixed Synthesis · Voxtral (Mistral AI) · XTTS (Local)</div>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Engine Plugins</div>
            </Card>
            {/* Production Tally */}
            <Card style={{ flex: 1, borderRadius: 'var(--radius-card)', padding: '10px 12px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <Btn small>Reset</Btn>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 'var(--type-title)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>1h 2m</span>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AUDIO</span>
              </div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                9,504 words<br />53,145 characters
              </div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 3 }}>
                <RefreshCw size={9} />
                Tally since Jun 2, 2026
              </div>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>Production Tally</div>
            </Card>
          </Row>

          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0 2px' }}>
            Resetting tally starts a new count from now without deleting historical render rows.
          </div>

          <div>
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Runtime Diagnostics</div>
            <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
              {[
                { label: 'Frontend Client', sub: 'online', chip: 'http://127.0.0.1:5174', chipVariant: undefined as 'success' | 'neutral' | undefined },
                { label: 'Backend Runtime', sub: 'Service Bridge', chip: 'Managed Subprocess (TTS Server @ 7862)', chipVariant: undefined as 'success' | 'neutral' | undefined },
                { label: 'Orchestrator', sub: undefined as string | undefined, chip: 'Studio 2.0', chipVariant: undefined as 'success' | 'neutral' | undefined },
                { label: 'Backend API', sub: 'http://127.0.0.1:8124 · port 8124 · Responding to Studio API requests.', chip: 'online', chipVariant: 'success' as const },
              ].map((row) => (
                <div key={row.label} style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</div>
                    {row.sub && <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.4 }}>{row.sub}</div>}
                  </div>
                  {row.chipVariant
                    ? <SemanticChip variant={row.chipVariant}>{row.chip}</SemanticChip>
                    : <Chip>{row.chip}</Chip>}
                </div>
              ))}
              <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>TTS Server</div>
                  <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.4 }}>http://127.0.0.1:7862 · port 7862 · Loaded plugins responded successfully.</div>
                </div>
                <Row gap={6} style={{ alignItems: 'center', flexShrink: 0 }}>
                  <SemanticChip variant="success">healthy</SemanticChip>
                  <Btn small>
                    <Row gap={3} style={{ alignItems: 'center' }}>
                      <RefreshCw size={9} />
                      Restart
                    </Row>
                  </Btn>
                </Row>
              </div>
            </Card>
          </div>

          <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-card)', padding: '9px 12px', fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Audiobook Studio 2.0 is a modular platform powered by a decoupled TTS Server and plugin architecture.
            The About tab provides diagnostic visibility into the service bridge, production efficiency, and runtime health.
          </div>
        </Col>
      )}

      {activeTab === 'Developer' && devMode && (
        <Col gap={6}>
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
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
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)' }}>{link.label}</span>
                <Row gap={4} style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{link.href}</span>
                  <ExternalLink size={10} color="var(--text-muted)" />
                </Row>
              </div>
            ))}
          </Card>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 4px' }}>
            enables debug-copy buttons in queue + chapter toolbar
          </div>
        </Col>
      )}
    </Col>
  );
};
