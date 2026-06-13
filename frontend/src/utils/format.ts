export function formatLength(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;

  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
