# Phase 8: Shell Cutover And Product Hardening

## Objective

Finish the visible Studio 2.0 shell and the highest-value product seams before opening the system outward. Phase 8 starts with the queue moving into the right-side companion drawer so users can manage work without losing page context.

## Deliverables

- queue drawer cutover as the primary queue surface
- queue tab opens the right-side drawer without navigating away from the current page
- `/queue` remains as a compatibility/deep-link entry that resolves into the queue drawer behavior
- queue-related actions open or focus the drawer instead of redirecting the user to a dedicated queue page
- `GlobalQueue` is adapted for drawer density, scrolling, and constrained-width controls
- project snapshot and export-manifest foundation is implemented in the project domain
- dated project backup/export bundle foundation is implemented with clear artifact-included vs regenerate-on-import reporting
- plugin setup, dependency, and recovery diagnostics are clearer in the schema-driven engine settings surface
- fake, stale, or misleading legacy repair/backfill paths are retired, deprecated, or replaced with explicit behavior
- phase docs and product docs are synchronized with the post-Phase-7 settings and shell reality

## Deliverables Checklist

- [ ] Queue drawer shell behavior implemented
- [ ] Queue tab opens the drawer while preserving the current route
- [ ] Queue compatibility route/deep link behavior implemented
- [ ] Queue action flows updated to focus the drawer
- [ ] Drawer-optimized queue layout and controls implemented
- [ ] Project snapshot creation implemented through the project domain
- [ ] Project export manifest implemented through the project domain
- [ ] First backup/export bundle mode implemented
- [ ] Plugin setup and diagnostics UX hardened without engine-specific UI branches
- [ ] Legacy backfill/repair placeholders audited and explicitly handled
- [ ] Phase and product docs updated to match shipped behavior

## Scope

- preserve the generic plugin and engine model
- keep settings schema-driven and plugin-owned
- do not reintroduce `SettingsTray`
- treat the queue as a global companion surface, not a destination-first page
- prioritize concrete user-visible product improvements over cleanup for its own sake
- only remove legacy paths after the replacement behavior is proven
- project portability work should start with clear metadata and manifest contracts before full restore UX

## Tests

- shell/navigation tests for queue drawer open/close behavior
- compatibility tests for `/queue` deep links and refresh behavior
- targeted queue component tests in drawer-width conditions
- enqueue and queue-focus interaction tests from project and chapter surfaces
- project snapshot and export manifest tests
- backup/export bundle validation tests
- plugin diagnostics and engine-card behavior tests
- frontend build
- targeted backend regression suite

## Verification Checklist

- [ ] Queue drawer navigation tests pass
- [ ] Queue compatibility/deep-link tests pass
- [ ] Queue component tests pass in the drawer layout
- [ ] Project snapshot tests pass
- [ ] Project export manifest tests pass
- [ ] Backup/export bundle validation passes
- [ ] Plugin diagnostics tests pass
- [ ] Frontend build passes
- [ ] Targeted backend regression passes

## Exit Gate

- the queue is a stable right-side companion surface that does not pull users away from their current work
- Studio has a real project snapshot/export foundation for portability and backup work
- plugin setup and recovery UX are clear without breaking the generic schema-driven model
- stale legacy placeholders no longer misrepresent product behavior
