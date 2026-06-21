/**
 * BackupsStage — Phase 1 stub for the Backups book tab.
 *
 * Phase 2 will surface the full backup management UI here.
 * For now this confirms the tab is wired and navigable.
 */

export function BackupsStage() {
  return (
    <section className="backups-stage" aria-label="Backups">
      <div
        className="backups-stage__placeholder"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-6)',
          color: 'var(--text-secondary)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 'var(--type-callout)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          Backups
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--type-body)',
            color: 'var(--text-secondary)',
            maxWidth: 440,
          }}
        >
          Backup management coming in Phase 2. Use the Publish tab for audiobook assembly and export.
        </p>
      </div>
    </section>
  );
}
