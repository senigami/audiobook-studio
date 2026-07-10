import React from 'react';
import { Server, ShieldAlert, BookOpen } from 'lucide-react';
import { apiExampleStyle } from '@/pages/Settings/settingsRouteHelpers';

export const ApiGuidePanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-light) 0%, var(--surface) 100%)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '12px', background: 'var(--accent-tint)', color: 'var(--accent)' }}>
            <Server size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Developer Integration Guide</h2>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Studio can act as a local TTS gateway for other applications via the external <code>/api/v1/tts</code> API.
            </p>
          </div>
        </div>

        <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--surface-glass-half)', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)' }}>External TTS Gateway</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            All external integrations should go through <code>/api/v1/tts/*</code>. It is disabled by default, guarded by an
            optional API key, and rate limited. Studio's other <code>/api/*</code> routes power the built-in web UI only —
            they are unauthenticated and not a supported external integration surface.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.25rem', borderRadius: '14px', background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)', color: 'var(--warning-text)' }}>
        <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 900 }}>Security Note</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
            The gateway is disabled by default. When enabled, it accepts a Bearer API key configured in Settings; leaving
            the key blank keeps it open for local-only use. A basic in-memory rate limiter (30 requests/minute per client
            IP by default) protects it from accidental flooding, but this is <strong>not a substitute for an edge rate
            limiter or reverse proxy</strong> if Studio is ever exposed beyond localhost.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            1. Engine Discovery
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/v1/tts/engines</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Lists registered TTS engines with status, verification state, and capabilities.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/v1/tts/engines/{'{engine_id}'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Returns detailed metadata for a single engine.
                </div>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`curl http://localhost:8123/api/v1/tts/engines \\
  -H "Authorization: Bearer your-api-key"

// Response Example
{
  "engines": [
    { "engine_id": "xtts", "display_name": "XTTS", "status": "ready", "verified": true, ... }
  ]
}`}</pre>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            2. Synthesis
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Submit text for synthesis. Short requests (under 500 characters) return the audio file inline; longer
              requests are queued alongside Studio's own render jobs (per the configured API priority mode) and return a
              <code> job_id</code> to poll.
            </p>
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>POST /api/v1/tts/synthesize</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inline (&lt;500 chars) or queued</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>POST /api/v1/tts/preview</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Always inline, capped at 500 chars</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>GET /api/v1/tts/jobs/{'{job_id}'}</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Poll queued job status</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>GET /api/v1/tts/jobs/{'{job_id}'}/audio</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Download completed audio</span>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`curl -X POST http://localhost:8123/api/v1/tts/synthesize \\
  -H "Authorization: Bearer your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "engine_id": "xtts",
    "text": "Hello from the API documentation.",
    "voice_ref": "Dark Fantasy",
    "output_format": "wav"
  }' --output output.wav`}</pre>
          </div>
        </section>
      </div>

        <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Full OpenAPI Schema</span>
        </div>
        <a
          href="/api/v1/tts/docs"
          target="_blank"
          rel="noreferrer"
          style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: 'var(--action-primary)', color: 'var(--on-action)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 800 }}
        >
          View Swagger Docs
        </a>
      </div>
    </div>
  );
};
