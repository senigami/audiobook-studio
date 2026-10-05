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
  PaneHeader,
  statusChip,
  onPill,
  ConceptBadge,
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

interface RegistryPlugin {
  id: string;
  name: string;
  author: string;
  version: string;
  stars: number;
  developerBadge: string;
  trustLevel: 'Official' | 'Verified' | 'Community' | 'Partner';
  dependencies: { name: string; remote: boolean }[];
  githubUrl: string;
  description: string;
}

const REGISTRY_PLUGINS: RegistryPlugin[] = [
  {
    id: 'xtts',
    name: 'XTTS Local Synthesis',
    author: 'Audiobook Factory',
    version: '2.0.3',
    stars: 142,
    developerBadge: 'Official Registry',
    trustLevel: 'Official',
    githubUrl: 'https://github.com/audiobook-factory/plugins-xtts',
    description: 'Official local voice cloning and text-to-speech plugin migrated out of the base app.',
    dependencies: [
      { name: 'torch>=2.0', remote: false },
      { name: 'transformers>=4.38', remote: false },
      { name: 'numpy>=1.22', remote: false },
    ],
  },
  {
    id: 'voxtral',
    name: 'Voxtral Cloud Engine',
    author: 'Audiobook Factory',
    version: '1.0.0',
    stars: 256,
    developerBadge: 'Official Registry',
    trustLevel: 'Official',
    githubUrl: 'https://github.com/audiobook-factory/plugins-voxtral',
    description: 'Official cloud synthesis plugin packaged as a downloadable repo install.',
    dependencies: [
      { name: 'requests>=2.28', remote: true },
      { name: 'pydantic>=2.0', remote: false },
    ],
  },
  {
    id: 'bark',
    name: 'Bark Audio Synthesis',
    author: 'Community Publisher',
    version: '1.2.0',
    stars: 320,
    developerBadge: 'Registry Preview',
    trustLevel: 'Community',
    githubUrl: 'https://github.com/audiobook-factory/community-bark-plugin',
    description: 'Community plugin preview with registry-hosted metadata, icon, dependencies, and install notes.',
    dependencies: [
      { name: 'torch>=2.0', remote: false },
      { name: 'transformers>=4.38', remote: false },
      { name: 'suno-bark-weights @ https://example.com/bark-weights.tar.gz', remote: true },
    ],
  }
];

const getSimulatedDeps = (urlOrFile: string) => {
  const lowercase = urlOrFile.toLowerCase();
  if (lowercase.includes('xtts')) {
    return [
      { name: 'torch>=2.0', remote: false },
      { name: 'transformers>=4.38', remote: false },
      { name: 'numpy>=1.22', remote: false },
    ];
  } else if (lowercase.includes('voxtral')) {
    return [
      { name: 'requests>=2.28', remote: true },
      { name: 'pydantic>=2.0', remote: false },
    ];
  } else if (lowercase.includes('bark')) {
    return [
      { name: 'torch>=2.0', remote: false },
      { name: 'transformers>=4.38', remote: false },
      { name: 'suno-bark-weights @ https://example.com/bark-weights.tar.gz', remote: true },
    ];
  } else {
    return [
      { name: 'torch>=2.0', remote: false },
      { name: 'numpy>=1.20', remote: false },
      { name: 'custom-package-weights @ https://example.com/custom.tar.gz', remote: true },
    ];
  }
};

// Live `EnginesPage.tsx` (post commit 2ec47472) splits this surface into two tabs — "Engines"
// (server diagnostics + registry + install) and "Module Settings" (per-engine schema-driven
// settings via `VoiceModulesPanel`/`JsonSchemaForm`). This mock mirrors that tab structure below,
// but keeps the "Module Settings" tab as a lighter representative view (the existing sanitize
// toggles + a pointer to each engine's inline settings in the Engines tab) rather than fully
// duplicating `JsonSchemaForm`'s dynamic schema rendering — a full 1:1 port wasn't judged worth
// the added mock complexity for a settings surface that's identical in spirit (per-engine config
// knobs), just reachable one click deeper here than in live.
export const EnginesPane: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'engines' | 'module-settings'>('engines');
  const [xttsExpanded, setXttsExpanded] = useState(false);
  const [voxtralExpanded, setVoxtralExpanded] = useState(true);
  const [sanitizeToggles, setSanitizeToggles] = useState<boolean[]>(SANITIZE_TOGGLES.map(t => t.on));

  // Custom states for Plugin Registry and Installer
  const [installedEngineIds, setInstalledEngineIds] = useState<string[]>(['neural-voice', 'voxtral', 'mixed', 'mycustomtts']);
  const [customInstalledPlugins, setCustomInstalledPlugins] = useState<RegistryPlugin[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<string>('xtts');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installMethod, setInstallMethod] = useState<'upload' | 'url'>('upload');
  const [githubUrl, setGithubUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<'input' | 'analyzing' | 'trust' | 'success'>('input');
  const [dragOver, setDragOver] = useState(false);

  // Interactive controls
  const [voxtralTestPlaying, setVoxtralTestPlaying] = useState(false);
  const [voxtralTestProgress, setVoxtralTestProgress] = useState(0);

  React.useEffect(() => {
    let interval: any;
    if (voxtralTestPlaying) {
      interval = setInterval(() => {
        setVoxtralTestProgress((prev) => {
          if (prev >= 100) {
            setVoxtralTestPlaying(false);
            return 0;
          }
          return prev + 10;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [voxtralTestPlaying]);

  React.useEffect(() => {
    if (modalStep === 'analyzing') {
      const timer = setTimeout(() => {
        setModalStep('trust');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [modalStep]);

  const toggleSanitize = (i: number) => {
    setSanitizeToggles(prev => prev.map((v, idx) => idx === i ? !v : v));
  };

  const handleApproveInstall = () => {
    let name = 'Custom Plugin';
    let id = 'custom';
    let version = '1.0.0';
    let description = 'User-imported custom text-to-speech plugin.';

    const source = installMethod === 'url' ? githubUrl : (uploadedFile || 'custom-plugin.zip');
    const lowercase = source.toLowerCase();

    if (lowercase.includes('xtts')) {
      name = 'XTTS Local Synthesis';
      id = 'xtts-local';
      version = '2.0.3';
      description = 'High-quality local neural voice cloning and text-to-speech plugin.';
    } else if (lowercase.includes('voxtral')) {
      name = 'Voxtral Cloud Engine';
      id = 'voxtral-cloud';
      version = '1.0.0';
      description = 'Cloud synthesis powered by Mistral AI models for lightning fast generation.';
    } else if (lowercase.includes('bark')) {
      name = 'Bark Audio Synthesis';
      id = 'bark';
      version = '1.2.0';
      description = 'Transformer-based audio generation model with highly expressive voice cloning.';
    } else {
      if (installMethod === 'url') {
        const parts = githubUrl.split('/');
        name = parts[parts.length - 1] || 'Custom GitHub Plugin';
        id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      } else if (uploadedFile) {
        name = uploadedFile.replace('.zip', '');
        id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
    }

    const newPlugin: RegistryPlugin = {
      id,
      name,
      author: installMethod === 'url' ? 'github-import' : 'local-import',
      version,
      stars: 0,
      developerBadge: 'Self-Installed',
      trustLevel: 'Community',
      githubUrl: installMethod === 'url' ? githubUrl : 'https://github.com/imported',
      description,
      dependencies: getSimulatedDeps(source),
    };

    if (id === 'xtts-local' || id === 'neural-voice') {
      if (!installedEngineIds.includes('neural-voice')) {
        setInstalledEngineIds(prev => [...prev, 'neural-voice']);
      }
    } else if (id === 'voxtral-cloud' || id === 'voxtral') {
      if (!installedEngineIds.includes('voxtral')) {
        setInstalledEngineIds(prev => [...prev, 'voxtral']);
      }
    } else {
      setCustomInstalledPlugins(prev => {
        if (prev.some(p => p.id === id)) return prev;
        return [...prev, newPlugin];
      });
    }

    setModalStep('success');
  };

  const selectedPlugin = REGISTRY_PLUGINS.find(p => p.id === selectedPluginId);

  const renderInstallModalContent = () => {
    const source = installMethod === 'url' ? githubUrl : (uploadedFile || '');
    const deps = getSimulatedDeps(source);

    switch (modalStep) {
      case 'input':
        return (
          <Col gap={12}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                Install Plugin
              </span>
              <button onClick={() => setShowInstallModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </Row>

            <Row gap={4} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
              <button
                type="button"
                onClick={() => setInstallMethod('upload')}
                style={{
                  padding: '4px 10px', fontSize: 'var(--type-micro)', fontWeight: 600, border: 'none', background: 'none',
                  color: installMethod === 'upload' ? 'var(--action-primary)' : 'var(--text-muted)',
                  borderBottom: installMethod === 'upload' ? '2px solid var(--action-primary)' : 'none',
                  cursor: 'pointer'
                }}
              >
                Upload ZIP
              </button>
              <button
                type="button"
                onClick={() => setInstallMethod('url')}
                style={{
                  padding: '4px 10px', fontSize: 'var(--type-micro)', fontWeight: 600, border: 'none', background: 'none',
                  color: installMethod === 'url' ? 'var(--action-primary)' : 'var(--text-muted)',
                  borderBottom: installMethod === 'url' ? '2px solid var(--action-primary)' : 'none',
                  cursor: 'pointer'
                }}
              >
                GitHub URL
              </button>
            </Row>

            {installMethod === 'upload' ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length) {
                    const file = e.dataTransfer.files[0];
                    if (file.name.endsWith('.zip')) {
                      setUploadedFile(file.name);
                    } else {
                      alert('Please upload a .zip file.');
                    }
                  }
                }}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--action-primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-card)',
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: dragOver ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.zip';
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files && files.length) {
                      setUploadedFile(files[0].name);
                    }
                  };
                  input.click();
                }}
              >
                <Upload size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px', display: 'block' }} />
                {uploadedFile ? (
                  <Col gap={4} style={{ alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {uploadedFile}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: 0,
                        fontFamily: 'inherit',
                        fontSize: 'var(--type-micro)',
                        color: 'var(--error)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </Col>
                ) : (
                  <Col gap={2}>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Drag &amp; drop plugin (.zip) here
                    </span>
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                      or click to browse local files
                    </span>
                  </Col>
                )}
              </div>
            ) : (
              <Col gap={4}>
                <label style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>
                  GitHub Repository URL
                </label>
                <input
                  type="text"
                  placeholder="https://github.com/audiobook-factory/plugins-xtts"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  style={{
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-button)',
                    padding: '6px 10px',
                    fontSize: 'var(--type-caption)',
                    color: 'var(--text-primary)',
                    width: '100%',
                  }}
                />
              </Col>
            )}

            <Row gap={6} style={{ justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn small onClick={() => setShowInstallModal(false)}>Cancel</Btn>
              <Btn
                small
                primary
                disabled={installMethod === 'upload' ? !uploadedFile : !githubUrl.trim()}
                onClick={() => setModalStep('analyzing')}
              >
                Install
              </Btn>
            </Row>
          </Col>
        );
      case 'analyzing':
        return (
          <Col gap={12} style={{ alignItems: 'center', padding: '20px 0' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)',
              borderTopColor: 'var(--action-primary)', animation: 'spin 1s linear infinite'
            }} />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Analyzing dependencies &amp; trust profile...
            </span>
          </Col>
        );
      case 'trust':
        return (
          <Col gap={12}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                Dependency Trust Analysis
              </span>
              <button onClick={() => setShowInstallModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </Row>

            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>
              We analyzed the package configuration and found the following dependencies:
            </div>

            <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 10px', background: 'var(--surface-alt)' }}>
              <Col gap={4}>
                {deps.map((dep, i) => (
                  <Row key={i} gap={6} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dep.name}
                    </span>
                    {dep.remote && (
                      <SemanticChip variant="warning">REMOTE</SemanticChip>
                    )}
                  </Row>
                ))}
              </Col>
            </Card>

            <div style={{
              fontSize: 'var(--type-micro)', color: 'var(--warning-text)',
              background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
              borderRadius: 4, padding: '6px 10px', lineHeight: 1.5,
            }}>
              <strong>Security Warning:</strong> Third-party plugins run unsandboxed on your system.
              This plugin requests filesystem and network permissions. Install only from sources you trust.
            </div>

            <Row gap={6} style={{ justifyContent: 'flex-end' }}>
              <Btn small onClick={() => setShowInstallModal(false)}>Cancel</Btn>
              <Btn small primary onClick={handleApproveInstall}>Approve &amp; Install</Btn>
            </Row>
          </Col>
        );
      case 'success':
        return (
          <Col gap={12} style={{ alignItems: 'center', padding: '10px 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--success-tint-bg)',
              border: '1px solid var(--success-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Check size={20} color="var(--success)" />
            </div>
            <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)' }}>
              Plugin Installed!
            </span>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', textAlign: 'center' }}>
              The engine has been registered successfully and is now active.
            </span>
            <Btn primary style={{ width: '100%', marginTop: 8 }} onClick={() => setShowInstallModal(false)}>
              Close
            </Btn>
          </Col>
        );
    }
  };

  return (
    <Col gap={14} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <PaneHeader
        title="Engines"
        subtitle="Install trusted synthesis engines, verify their setup, and review privacy boundaries before routing book renders."
        meta={<SemanticChip variant="success">TTS server healthy</SemanticChip>}
        actions={(
          <>
            <Btn small onClick={() => { setInstallMethod('upload'); setUploadedFile(null); setModalStep('input'); setShowInstallModal(true); }}>
              <Row gap={4} style={{ alignItems: 'center' }}>
                <Upload size={10} />
                Import plugin
              </Row>
            </Btn>
            <Btn small onClick={() => alert('Simulated plugin lists refreshed!')}>
              <Row gap={4} style={{ alignItems: 'center' }}>
                <RefreshCw size={10} />
                Refresh
              </Row>
            </Btn>
          </>
        )}
      />

      <div
        role="tablist"
        aria-label="Engines sections"
        style={{
          display: 'flex',
          gap: 4,
          alignSelf: 'flex-start',
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
        }}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'engines'}
          onClick={() => setActiveTab('engines')}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 'var(--type-caption)',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'engines' ? 'var(--action-primary)' : 'transparent',
            color: activeTab === 'engines' ? 'var(--text-on-accent)' : 'var(--text-muted)',
          }}
        >
          Engines
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'module-settings'}
          onClick={() => setActiveTab('module-settings')}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 'var(--type-caption)',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'module-settings' ? 'var(--action-primary)' : 'transparent',
            color: activeTab === 'module-settings' ? 'var(--text-on-accent)' : 'var(--text-muted)',
          }}
        >
          Module Settings
        </button>
      </div>

      {activeTab === 'engines' && (
        <>
      <Row gap={8} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {[
          { label: 'Installed engines', value: `${installedEngineIds.length + customInstalledPlugins.length}`, detail: '2 verified, 1 built-in', chip: 'ready' },
          { label: 'Official registry', value: `${REGISTRY_PLUGINS.length} plugins`, detail: 'XTTS and Voxtral ready to install', chip: 'trusted' },
          { label: 'Cloud boundary', value: 'Voxtral', detail: 'text may leave device', chip: 'review' },
        ].map(item => (
          <Card key={item.label} className="ns-hero-card" style={{ flex: '1 1 200px', padding: '10px 12px' }}>
            <Col gap={3}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{item.label}</span>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-headline)', color: 'var(--text-primary)', fontWeight: 800 }}>{item.value}</span>
                <SemanticChip variant={item.chip === 'review' ? 'warning' : 'success'}>{item.chip}</SemanticChip>
              </Row>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>{item.detail}</span>
            </Col>
          </Card>
        ))}
      </Row>

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
            <Btn small onClick={() => alert('TTS Server restarted!')}>
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
        {/* XTTS Local Synthesis */}
        {installedEngineIds.includes('neural-voice') && (
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px' }}>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <button
                  onClick={() => setXttsExpanded(e => !e)}
                  aria-label={xttsExpanded ? 'Collapse XTTS Local Synthesis' : 'Expand XTTS Local Synthesis'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: 0 }}
                >
                  {xttsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--action-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Puzzle size={14} color="var(--action-primary)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>XTTS Local Synthesis</div>
                  <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>neural-voice · v2.0.3</div>
                </div>
                <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
                  <span style={onPill}>ON</span>
                  <span style={statusChip('success')}>READY</span>
                  <span style={statusChip('cloud')}>VERIFIED</span>
                  <Btn small onClick={() => alert('XTTS Local Synthesis calibration verified!')}>Verify</Btn>
                </Row>
              </Row>
              <Row gap={6} style={{ alignItems: 'center', marginLeft: 44, marginTop: 4 }}>
                <SemanticChip variant="cloud">14.2 chars/s · high confidence</SemanticChip>
                <button
                  type="button"
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 'var(--type-micro)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => alert('Calibration reset completed!')}
                >
                  Reset calibration
                </button>
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
                        <button aria-label={`Edit ${row.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }} onClick={() => alert(`Edit simulated for ${row.label}`)}>
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
                          color: sanitizeToggles[i] ? 'var(--action-primary)' : 'var(--text-muted)',
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
                      <button aria-label="Edit max plausible speech rate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }} onClick={() => alert('Edit max speech rate')}>
                        <Pencil size={11} />
                      </button>
                    </Row>
                  </Card>
                  <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>rejects truncated renders</div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Voxtral */}
        {installedEngineIds.includes('voxtral') && (
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
                    <button
                      type="button"
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: 0,
                        fontFamily: 'inherit',
                        fontSize: 'var(--type-micro)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                      onClick={() => alert('Mistral voice generation speed calibrated!')}
                    >
                      Reset Baseline
                    </button>
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
                  <button
                    type="button"
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      fontFamily: 'inherit',
                      color: 'var(--action-primary)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                    onClick={() => alert('Showing Mistral AI Voxtral docs')}
                  >
                    View Documentation
                  </button>
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
                      <button aria-label="Edit Mistral API key" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }} onClick={() => alert('Mistral API Key edit')}>
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
                        <button aria-label="Play test sample" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', padding: 0 }} onClick={() => setVoxtralTestPlaying(!voxtralTestPlaying)}>
                          <Play size={13} />
                        </button>
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{voxtralTestPlaying ? `0:0${Math.floor(voxtralTestProgress / 25)}` : '0:00'} / 0:04</span>
                        <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 2, minWidth: 30 }}>
                          <div style={{ width: `${voxtralTestProgress}%`, height: '100%', background: 'var(--action-primary)', borderRadius: 2 }} />
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
                  <Btn small onClick={() => { setVoxtralTestProgress(0); setVoxtralTestPlaying(true); }}>
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
                    onClick={() => setInstalledEngineIds(prev => prev.filter(id => id !== 'voxtral'))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)', fontSize: 'var(--type-micro)', textDecoration: 'underline', flexShrink: 0 }}
                  >
                    <Trash2 size={10} />
                    Uninstall
                  </button>
                </Row>
              </div>
            )}
          </Card>
        )}

        {/* Mixed */}
        {installedEngineIds.includes('mixed') && (
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
              <Btn small onClick={() => alert('Mixed engine configuration options')}>Configure</Btn>
            </Row>
          </Card>
        )}

        {/* MyCustomTTS */}
        {installedEngineIds.includes('mycustomtts') && (
          <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 12px' }}>
            <Row gap={10} style={{ alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Puzzle size={14} color="var(--action-primary)" />
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
              <Btn small onClick={() => alert('MyCustomTTS config options')}>Configure</Btn>
              <button
                aria-label="Uninstall MyCustomTTS"
                onClick={() => setInstalledEngineIds(prev => prev.filter(id => id !== 'mycustomtts'))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 'var(--type-micro)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
              >
                <Trash2 size={10} />
                Uninstall
              </button>
            </Row>
          </Card>
        )}

        {/* Dynamically installed custom plugins */}
        {customInstalledPlugins.map(plugin => (
          <Card key={plugin.id} style={{ borderRadius: 'var(--radius-card)', padding: '8px 12px' }}>
            <Row gap={10} style={{ alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Puzzle size={14} color="var(--action-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <Row gap={6} style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>{plugin.name}</span>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>v{plugin.version}</span>
                  <SemanticChip variant="accent">user-installed</SemanticChip>
                </Row>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{plugin.description}</div>
              </div>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--success)' }}>●</span>
              <SemanticChip variant="success">Active</SemanticChip>
              <button
                aria-label={`Uninstall ${plugin.name}`}
                onClick={() => setCustomInstalledPlugins(prev => prev.filter(p => p.id !== plugin.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 'var(--type-micro)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
              >
                <Trash2 size={10} />
                Uninstall
              </button>
            </Row>
          </Card>
        ))}
      </Col>

      {/* Plugin Registry marketplace */}
      <Row gap={6} style={{ alignItems: 'center', marginTop: 14 }}>
        <Label>Plugin Registry</Label>
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>Official owner-controlled marketplace</span>
      </Row>

      <Row className="ns-platform-grid" gap={12} style={{ alignItems: 'flex-start' }}>
        {/* Left column: registry list */}
        <Col gap={6} style={{ flex: 1.2 }}>
          {REGISTRY_PLUGINS.map(plugin => {
            const isSelected = selectedPluginId === plugin.id;
            return (
              <Card
                key={plugin.id}
                onClick={() => setSelectedPluginId(plugin.id)}
                style={{
                  borderRadius: 'var(--radius-card)', padding: '10px 12px',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--action-primary)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--accent-tint-bg)' : 'var(--surface)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Row gap={8} style={{ alignItems: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isSelected ? 'var(--surface)' : 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Puzzle size={14} color={isSelected ? 'var(--action-primary)' : 'var(--text-secondary)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {plugin.name}
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                      by {plugin.author} · ★ {plugin.stars}
                    </div>
                  </div>
                  <Chip>{plugin.version}</Chip>
                </Row>
              </Card>
            );
          })}
        </Col>

        {/* Right column: selected details card */}
        <Col style={{ flex: 1, minWidth: 240 }}>
          {selectedPlugin ? (
            <Card style={{ borderRadius: 'var(--radius-card)', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Plugin Details
              </div>
              <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {selectedPlugin.name}
              </div>
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.4 }}>
                {selectedPlugin.description}
              </div>

              <Col gap={5} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--type-micro)', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Version</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>v{selectedPlugin.version}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--type-micro)', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Developer</span>
                  <SemanticChip variant="accent">{selectedPlugin.developerBadge}</SemanticChip>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--type-micro)', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trust Level</span>
                  <SemanticChip variant={selectedPlugin.trustLevel === 'Official' || selectedPlugin.trustLevel === 'Partner' ? 'success' : 'warning'}>
                    {selectedPlugin.trustLevel}
                  </SemanticChip>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--type-micro)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Repository</span>
                  <a
                    href={selectedPlugin.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--action-primary)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}
                  >
                    GitHub Link
                  </a>
                </div>
              </Col>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Dependencies
                </div>
                <Col gap={3}>
                  {selectedPlugin.dependencies.map((dep, idx) => (
                    <Row key={idx} gap={4} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--type-micro)', fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                        {dep.name}
                      </span>
                      {dep.remote && <SemanticChip variant="warning">REMOTE</SemanticChip>}
                    </Row>
                  ))}
                </Col>
              </div>

              <Btn
                primary
                small
                style={{ width: '100%' }}
                onClick={() => {
                  setGithubUrl(selectedPlugin.githubUrl);
                  setInstallMethod('url');
                  setModalStep('input');
                  setShowInstallModal(true);
                }}
              >
                Install Plugin
              </Btn>
            </Card>
          ) : (
            <Card style={{ borderRadius: 'var(--radius-card)', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px dashed var(--border)', background: 'var(--surface-alt)' }}>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Select a plugin to view details
              </span>
            </Card>
          )}
        </Col>
      </Row>
        </>
      )}

      {activeTab === 'module-settings' && (
        <Col gap={10}>
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Per-engine settings</div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <p style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Each installed engine&apos;s schema-driven settings (speed, temperature, cloud calibration, etc.)
                live inline under that engine&apos;s expandable row on the <strong>Engines</strong> tab — expand
                &quot;XTTS Local Synthesis&quot; or &quot;Voxtral (Mistral AI)&quot; there to edit them.
              </p>
            </div>
          </Card>

          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Text cleanup (sanitize) overrides</div>
            </div>
            <div style={{ padding: '10px 12px' }}>
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
                      color: sanitizeToggles[i] ? 'var(--action-primary)' : 'var(--text-muted)',
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
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 5 }}>per-engine category overrides</div>
            </div>
          </Card>
        </Col>
      )}

      {/* Install Modal Overlay */}
      {showInstallModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--overlay-backdrop)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'var(--blur-glass)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowInstallModal(false); }}
        >
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-panel)', padding: '18px 20px', width: 420,
            boxShadow: 'var(--shadow-xl)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {renderInstallModalContent()}
          </div>
        </div>
      )}
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
    method === 'POST' ? 'var(--action-primary)' :
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

export const IntegrationsPane: React.FC = () => {
  const [apiKey, setApiKey] = useState('sk-c102a94f8b9e11ef4a');
  const [lanEnabled, setLanEnabled] = useState(false);
  const [showLanWarning, setShowLanWarning] = useState(false);
  const [showKeyRotation, setShowKeyRotation] = useState(false);
  const [rateLimit, setRateLimit] = useState(60);
  const [isEditingRateLimit, setIsEditingRateLimit] = useState(false);
  const [priority, setPriority] = useState('studio first');

  // API Request Builder states
  const [endpoint, setEndpoint] = useState('POST /api/generate');
  const [textToSynthesize, setTextToSynthesize] = useState('Welcome to Audiobook Factory. This is a live API request builder test.');
  const [voiceAvatar, setVoiceAvatar] = useState('narrator_male');
  const [speed, setSpeed] = useState(1.0);
  const [isSending, setIsSending] = useState(false);
  const [requestLogs, setRequestLogs] = useState<{ request: string; response: string } | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  // Play progress animation
  React.useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlayProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 5;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleSendRequest = () => {
    setIsSending(true);
    setRequestLogs(null);
    setHasResult(false);
    setIsPlaying(false);
    setPlayProgress(0);

    setTimeout(() => {
      setIsSending(false);
      setHasResult(true);

      const reqJson = JSON.stringify({
        endpoint,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: {
          text: textToSynthesize,
          voice: voiceAvatar,
          speed: speed
        }
      }, null, 2);

      const respJson = JSON.stringify({
        status: "success",
        job_id: `job_${Math.random().toString(36).substring(2, 12)}`,
        audio_url: `/api/v1/audio/simulated_result.wav`,
        chars_processed: textToSynthesize.length,
        latency_ms: 850 + Math.floor(Math.random() * 400),
        format: "wav"
      }, null, 2);

      setRequestLogs({ request: reqJson, response: respJson });
    }, 1200);
  };

  const curlCommand = `curl -X POST http://localhost:8124${endpoint.split(' ')[1] || '/api/generate'} \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    text: textToSynthesize,
    voice: voiceAvatar,
    speed: speed
  }, null, 2).replace(/\n/g, '\n  ')}'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedApiKey(true);
    setTimeout(() => setCopiedApiKey(false), 1500);
  };

  const obfuscatedKey = apiKey.substring(0, 5) + '••••••••' + apiKey.substring(apiKey.length - 4);

  return (
    <Col gap={14} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
      <PaneHeader
        eyebrow="Integrations"
        title="Integrations"
        subtitle="Developer Integration Guide — generate audio from external tools, retrieve results, and inspect the exact request shape before connecting another app."
        meta={<SemanticChip variant="success">23 requests today</SemanticChip>}
        actions={(
          <>
            <Btn small onClick={() => setShowKeyRotation(true)}>Rotate key</Btn>
            <Btn small onClick={() => { setLanEnabled(true); setShowLanWarning(true); }}>LAN binding</Btn>
          </>
        )}
      />

      <Row gap={8} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {[
          { label: 'Active key', value: obfuscatedKey, detail: copiedApiKey ? 'copied' : 'local only', variant: 'accent' as const },
          { label: 'Rate limit', value: `${rateLimit}/min`, detail: priority, variant: 'neutral' as const },
          { label: 'Network', value: lanEnabled ? 'LAN enabled' : 'localhost', detail: lanEnabled ? 'review exposure' : 'private on this machine', variant: lanEnabled ? 'warning' as const : 'success' as const },
        ].map(item => (
          <Card key={item.label} className="ns-hero-card" style={{ flex: '1 1 210px', padding: '10px 12px' }}>
            <Col gap={3}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{item.label}</span>
              <span style={{ fontSize: item.label === 'Active key' ? 'var(--type-caption)' : 'var(--type-headline)', color: 'var(--text-primary)', fontWeight: 800, fontFamily: item.label === 'Active key' ? 'monospace' : undefined }}>{item.value}</span>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <SemanticChip variant={item.variant}>{item.detail}</SemanticChip>
              </Row>
            </Col>
          </Card>
        ))}
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
          Connect your applications to Studio 2.0&apos;s local TTS gateway — the authenticated <code>/api/v1/tts/*</code> API.
        </div>
        <Row className="ns-platform-grid" gap={8} style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-card)' }}>
            <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--action-primary)', marginBottom: 4 }}>Queued synthesis</div>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Send text to <code>POST /api/v1/tts/synthesize</code> to render audio with any installed engine — Studio handles chunking, engine routing, and job tracking, and you poll the job for the result.
            </div>
          </Card>
          <Card style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-card)' }}>
            <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--action-primary)', marginBottom: 4 }}>Immediate preview</div>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Use <code>POST /api/v1/tts/preview</code> for quick, synchronous text-to-audio — ideal for real-time applications or simple one-off synthesis.
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
          API keys protect local and LAN requests. Never expose these endpoints directly to the public internet.
          For remote access, place Studio behind a secure proxy layer such as Nginx or Cloudflare Tunnel with its own authentication.
        </div>
      </div>

      <div style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', padding: '8px 10px',
        fontSize: 'var(--type-micro)', color: 'var(--text-muted)', lineHeight: 1.55,
      }}>
        All external integrations should go through <code>/api/v1/tts/*</code>. Studio&apos;s other <code>/api/*</code> routes
        power the built-in web UI only — they are unauthenticated and not a supported external integration surface.
      </div>

      <Col gap={5}>
        <ApiSectionHead>1. Engine Discovery</ApiSectionHead>
        <ApiEndpointRow method="GET" path="/api/v1/tts/engines" desc="Lists registered TTS engines with status, verification state, and capabilities." />
        <ApiEndpointRow method="GET" path="/api/v1/tts/engines/{engine_id}" desc="Returns detailed metadata for a single engine." />
        <MonoBlock>{`{\n  "engines": [\n    { "engine_id": "xtts", "display_name": "XTTS", "status": "ready", "verified": true, ... }\n  ]\n}`}</MonoBlock>
      </Col>

      <Col gap={5}>
        <ApiSectionHead>2. Synthesis</ApiSectionHead>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
          Short requests (under 500 characters) return the audio file inline; longer requests are queued alongside Studio&apos;s own render jobs and return a <code>job_id</code> to poll.
        </div>
        <ApiEndpointRow method="POST" path="/api/v1/tts/synthesize" desc="Inline (<500 chars) or queued." />
        <ApiEndpointRow method="POST" path="/api/v1/tts/preview" desc="Always inline, capped at 500 chars." />
        <ApiEndpointRow method="GET" path="/api/v1/tts/jobs/{job_id}" desc="Poll queued job status." />
        <ApiEndpointRow method="GET" path="/api/v1/tts/jobs/{job_id}/audio" desc="Download completed audio." />
        <MonoBlock>{`curl -X POST http://localhost:8123/api/v1/tts/synthesize \\\n  -H "Authorization: Bearer your-api-key" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "engine_id": "xtts",\n    "text": "Hello from the API documentation.",\n    "voice_ref": "Dark Fantasy",\n    "output_format": "wav"\n  }' --output output.wav`}</MonoBlock>
      </Col>

      <Row gap={8} style={{ alignItems: 'center', paddingTop: 2 }}>
        <Row gap={4} style={{ alignItems: 'center', flex: 1 }}>
          <BookOpen size={12} color="var(--text-muted)" />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Full OpenAPI Schema</span>
        </Row>
        <Btn primary onClick={() => alert('View simulated OpenAPI Swagger spec')}>View Swagger Docs</Btn>
      </Row>

      {/* 4. Interactive API Request Builder */}
      <Col gap={6} style={{ marginTop: 14 }}>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <ApiSectionHead>4. Interactive API Request Builder</ApiSectionHead>
          <ConceptBadge title="Interactive request builder is a North Star concept — production ships the static docs panel above." />
        </Row>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
          Build and test an API request directly from this mockup to see the live curl commands, request/response payloads, and listen to the synthesized audio output.
        </div>

        <Card style={{ borderRadius: 'var(--radius-card)', padding: '12px 14px', background: 'var(--surface-alt)' }}>
          <Col gap={10}>
            {/* Endpoint selection */}
            <Col gap={2}>
              <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Select Endpoint</span>
              <select
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-button)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--type-caption)',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <option value="POST /api/generate">POST /api/generate (Managed Orchestration)</option>
                <option value="POST /api/processing_queue">POST /api/processing_queue (Submit to Queue)</option>
                <option value="POST /api/tts/synthesize">POST /api/tts/synthesize (Direct Server Access)</option>
              </select>
            </Col>

            {/* Text input */}
            <Col gap={2}>
              <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Text Input</span>
              <textarea
                value={textToSynthesize}
                onChange={(e) => setTextToSynthesize(e.target.value)}
                placeholder="Enter text to synthesize..."
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-button)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--type-caption)',
                  padding: '6px 8px',
                  minHeight: 50,
                  resize: 'vertical',
                  width: '100%',
                }}
              />
            </Col>

            {/* Voice picker & Speed slider */}
            <Row gap={12} style={{ alignItems: 'flex-start' }}>
              <Col gap={2} style={{ flex: 1.2 }}>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Voice Avatar</span>
                <Row gap={4} style={{ flexWrap: 'wrap' }}>
                  {[
                    { id: 'narrator_male', label: 'Narrator (M)' },
                    { id: 'studio_voice_female', label: 'Studio (F)' },
                    { id: 'coqui_custom', label: 'Custom' }
                  ].map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoiceAvatar(v.id)}
                      style={{
                        padding: '3px 8px',
                        fontSize: 'var(--type-micro)',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-round)',
                        border: `1px solid ${voiceAvatar === v.id ? 'var(--action-primary)' : 'var(--border)'}`,
                        background: voiceAvatar === v.id ? 'var(--accent-tint-bg)' : 'var(--surface)',
                        color: voiceAvatar === v.id ? 'var(--action-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </Row>
              </Col>

              <Col gap={2} style={{ flex: 0.8 }}>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Speed</span>
                <Row gap={6} style={{ alignItems: 'center' }}>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--action-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--type-micro)', fontFamily: 'monospace', minWidth: 26 }}>{speed.toFixed(1)}x</span>
                </Row>
              </Col>
            </Row>

            <Btn primary disabled={isSending || !textToSynthesize.trim()} onClick={handleSendRequest} style={{ width: '100%' }}>
              {isSending ? (
                <Row gap={4} style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--text-on-accent)',
                    borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite'
                  }} />
                  Sending Request...
                </Row>
              ) : 'Send Request'}
            </Btn>

            {/* Curl copy block */}
            <Col gap={2}>
              <Row gap={6} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Generated Curl Command</span>
                <span
                  onClick={handleCopyCurl}
                  style={{ fontSize: 'var(--type-micro)', color: 'var(--action-primary)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {copiedCurl ? 'Copied!' : 'Copy to CLI'}
                </span>
              </Row>
              <pre style={{
                background: 'var(--surface-code)', border: '1px solid var(--surface-code-border)',
                borderRadius: 'var(--radius-button)', padding: '6px 10px', margin: 0,
                fontSize: 'var(--type-micro)', fontFamily: 'monospace', color: 'var(--text-code-muted)',
                overflowX: 'auto', whiteSpace: 'pre'
              }}>{curlCommand}</pre>
            </Col>

            {/* Logs panel */}
            {requestLogs && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Col gap={3}>
                  <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>API Request payload</span>
                  <pre style={{
                    background: 'var(--surface-code)', border: '1px solid var(--surface-code-border)',
                    borderRadius: 'var(--radius-button)', padding: '6px 8px', margin: 0,
                    fontSize: 'var(--type-micro)', fontFamily: 'monospace', color: 'var(--text-code-muted)',
                    overflowX: 'auto', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap'
                  }}>{requestLogs.request}</pre>
                </Col>
                <Col gap={3}>
                  <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>API Response JSON</span>
                  <pre style={{
                    background: 'var(--surface-code)', border: '1px solid var(--surface-code-border)',
                    borderRadius: 'var(--radius-button)', padding: '6px 8px', margin: 0,
                    fontSize: 'var(--type-micro)', fontFamily: 'monospace', color: 'var(--text-code-muted)',
                    overflowX: 'auto', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap'
                  }}>{requestLogs.response}</pre>
                </Col>
              </div>
            )}

            {/* Audio result player strip */}
            {hasResult && (
              <Col gap={4}>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Simulated Audio Result</span>
                <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 10px', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)' }}>
                  <Row gap={8} style={{ alignItems: 'center' }}>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      style={{
                        background: 'var(--action-primary)',
                        border: 'none',
                        borderRadius: '50%',
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--text-on-accent)',
                        padding: 0
                      }}
                      aria-label={isPlaying ? "Pause audio preview" : "Play audio preview"}
                    >
                      {isPlaying ? <X size={10} /> : <Play size={10} style={{ marginLeft: 1 }} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 600 }}>simulated_result.wav</span>
                        <span>{isPlaying ? `0:0${Math.floor(playProgress / 25)}` : '0:00'} / 0:04</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: `${playProgress}%`, height: '100%', background: 'var(--action-primary)', transition: 'width 0.2s linear' }} />
                      </div>
                    </div>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); alert('Audio downloaded!'); }}
                      style={{ fontSize: 'var(--type-micro)', color: 'var(--action-primary)', textDecoration: 'underline', fontWeight: 600 }}
                    >
                      Download
                    </a>
                  </Row>
                </Card>
              </Col>
            )}
          </Col>
        </Card>
      </Col>

      <Card style={{ borderRadius: 'var(--radius-card)', padding: '10px 12px', marginTop: 8 }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Configuration</div>
        </Row>
        <Col gap={5}>
          <ApiConfigRow label="API Key">
            <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
              {obfuscatedKey}
            </span>
            <Btn small onClick={handleCopyApiKey}>{copiedApiKey ? 'Copied' : 'Copy'}</Btn>
            <Btn small onClick={() => setShowKeyRotation(true)}>Rotate</Btn>
            <ConceptBadge title="API key rotation is a North Star concept — not in the shipping Integrations page." />
          </ApiConfigRow>

          <ApiConfigRow label="Host">
            <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {lanEnabled ? '0.0.0.0 (LAN access enabled)' : '127.0.0.1 (loopback)'}
            </span>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>LAN Access</span>
              <ConceptBadge title="LAN-access toggle is a North Star concept — not in the shipping Integrations page." />
              <div
                role="switch"
                aria-checked={lanEnabled}
                aria-label="LAN Access"
                style={{ width: 28, height: 14, borderRadius: 'var(--radius-round)', background: lanEnabled ? 'var(--action-primary)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.15s', cursor: 'pointer' }}
                onClick={() => {
                  if (!lanEnabled) {
                    setShowLanWarning(true);
                  } else {
                    setLanEnabled(false);
                  }
                }}
              >
                <div style={{ position: 'absolute', top: 2, left: lanEnabled ? 16 : 2, width: 10, height: 10, borderRadius: '50%', background: 'var(--text-on-accent)', transition: 'left 0.15s' }} />
              </div>
            </Row>
          </ApiConfigRow>

          <ApiConfigRow label="Rate limit">
            {isEditingRateLimit ? (
              <Row gap={6} style={{ alignItems: 'center', flex: 1 }}>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="10"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--action-primary)' }}
                />
                <span style={{ fontSize: 'var(--type-micro)', fontFamily: 'monospace', minWidth: 44 }}>{rateLimit}/m</span>
                <Btn small onClick={() => setIsEditingRateLimit(false)}>Save</Btn>
              </Row>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
                  {rateLimit} req/min · unlimited chars
                </span>
                <Btn small onClick={() => setIsEditingRateLimit(true)}>Edit</Btn>
              </>
            )}
          </ApiConfigRow>

          <ApiConfigRow label="Priority">
            <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-button)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--type-caption)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                <option value="studio first">studio first</option>
                <option value="api first">api first</option>
                <option value="balanced">balanced</option>
              </select>
            </span>
          </ApiConfigRow>
        </Col>
      </Card>

      {/* Key Rotation Modal */}
      {showKeyRotation && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--overlay-backdrop)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'var(--blur-glass)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowKeyRotation(false); }}
        >
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-panel)', padding: '18px 20px', width: 340,
            boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Rotate API Key</div>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
              Rotating the key will immediately invalidate the current token. Applications using the old token will receive 401 Unauthorized errors.
            </div>
            <Btn
              primary
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => {
                const nextKey = `sk-${Math.random().toString(36).substring(2, 14)}ef4a`;
                setApiKey(nextKey);
                setShowKeyRotation(false);
              }}
            >
              Generate &amp; Apply New Key
            </Btn>
            <Btn style={{ width: '100%' }} onClick={() => setShowKeyRotation(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* LAN Warning Modal */}
      {showLanWarning && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--overlay-backdrop)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'var(--blur-glass)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowLanWarning(false); }}
        >
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--warning-tint-border)',
            borderRadius: 'var(--radius-panel)', padding: '18px 20px', width: 360,
            boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--warning-text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={18} color="var(--warning)" />
              Enable LAN Access?
            </div>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
              Enabling LAN access exposes the Studio 2.0 API endpoints to your local network. Any device on your network will be able to make synthesis and orchestration calls.
            </div>
            <div style={{
              fontSize: 'var(--type-micro)', color: 'var(--warning-text)',
              background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
              borderRadius: 4, padding: '5px 8px', marginBottom: 14, lineHeight: 1.4
            }}>
              Ensure you trust all devices on this network and that your local firewall is configured properly.
            </div>
            <Row gap={8} style={{ justifyContent: 'flex-end' }}>
              <Btn small onClick={() => setShowLanWarning(false)}>Cancel</Btn>
              <Btn
                small
                primary
                onClick={() => {
                  setLanEnabled(true);
                  setShowLanWarning(false);
                }}
              >
                Enable LAN Access
              </Btn>
            </Row>
          </div>
        </div>
      )}
    </Col>
  );
};
