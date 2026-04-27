import React from 'react';
import { Server, ShieldAlert, BookOpen } from 'lucide-react';
import { apiExampleStyle } from './settingsRouteHelpers';

export const ApiSettingsPanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-light) 0%, var(--surface) 100%)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '12px', background: 'var(--accent-tint)', color: 'var(--accent)' }}>
            <Server size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Developer Integration Guide</h2>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Connect your applications to Studio 2.0 via the unified orchestration and synthesis API.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)' }}>Unified Orchestration</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Use the <code>/api</code> endpoints to manage projects, chapters, and long-running generation jobs. 
              Studio handles chunking, engine routing, and file management automatically.
            </p>
          </div>
          <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)' }}>Direct Synthesis</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Call the <code>TTS Server</code> directly for raw text-to-audio requests. 
              Ideal for real-time applications or simple synthesis tasks that don't require the Studio state machine.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.25rem', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#92400e' }}>
        <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 900 }}>Security Note</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
            Studio 2.0 does not currently implement internal API secret keys. 
            <strong> Never expose these endpoints directly to the public internet.</strong> 
            If access outside localhost is required, place Studio behind a secure proxy layer (like Nginx or Cloudflare Tunnel) with its own authentication.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            1. Resource Discovery
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/engines</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Lists all registered TTS engines, their enablement status, and verification health.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/speaker-profiles</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Returns available voice profiles, engine assignments, and reference audio sample links.
                </div>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`// Response Example
{
  "engines": [
    { "engine_id": "voxtral", "enabled": true, "status": "ready" },
    { "engine_id": "xtts", "enabled": true, "status": "ready" }
  ]
}`}</pre>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            2. Orchestration & Generation
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The preferred way to generate audio is via the Studio processing queue. 
              This ensures proper resource management and provides detailed progress tracking.
            </p>
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>POST /api/processing_queue</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Submit chapter to queue</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>GET /api/jobs</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Poll job status & progress</span>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`curl -X POST http://localhost:8000/api/processing_queue \\
  -d "project_id=p-123&chapter_id=c-456&speaker_profile=Dark Fantasy"

// Polling response
{
  "job_id": "job_abc123",
  "status": "running",
  "progress": 0.45,
  "eta_seconds": 12
}`}</pre>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            3. Direct TTS Server Access
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              When the TTS Server is enabled, you can bypass the Studio state machine for stateless synthesis.
            </p>
            <pre style={apiExampleStyle}>{`POST http://localhost:8001/synthesize
Content-Type: application/json

{
  "engine_id": "voxtral",
  "text": "Hello from the API documentation.",
  "voice_ref": "Dark Fantasy",
  "output_path": "/path/to/output.wav"
}`}</pre>
          </div>
        </section>
      </div>

      <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Full OpenAPI Schema</span>
        </div>
        <a 
          href="/docs" 
          target="_blank" 
          rel="noreferrer"
          style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: 'var(--accent)', color: 'white', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 800 }}
        >
          View Swagger Docs
        </a>
      </div>
    </div>
  );
};
