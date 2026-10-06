/**
 * Resolves a file from the demo's public folder against the Vite base. The
 * demo is built with a relative base so it works from any path on a site;
 * a root-absolute path would point at the site root and 404 under a subpath.
 */
export const demoAsset = (p: string): string =>
  `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;
