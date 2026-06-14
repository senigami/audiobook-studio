/**
 * Named z-index tiers for consistent layering across the application.
 */
export const LAYERS = {
  /** Main application header (top-level navigation). Always stays above content. */
  HEADER: 1200,

  /** Hover-expanded left rail overlay, below the header but above the main content. */
  RAIL_OVERLAY: 1150,

  /** Sticky navigation bars or breadcrumb strips. Should sit below the main header but above content. */
  STICKY_NAV: 10,

  /** Active state for overlapping tabbed interfaces to bring the active tab forward. */
  TAB_ACTIVE: 1,

  /** Background/inactive state for tabbed interfaces. */
  TAB_INACTIVE: 0,

  /** Player bar fixed at the bottom. */
  PLAYER_BAR: 1100,
};

