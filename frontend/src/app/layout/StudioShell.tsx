// Studio app shell boundary for Studio 2.0.
//
// This module will eventually compose global navigation, layout chrome,
// reconnect banners, and route-level feature framing for the new app shell.

import { createChapterBreadcrumbs, createProjectBreadcrumbs } from '../navigation/breadcrumbs';
import {
  COMPANION_SURFACES,
  GLOBAL_NAVIGATION_NODES,
  PROJECT_NAVIGATION_NODES,
} from '../navigation/model';
import { createProjectSubnav } from '../navigation/project-subnav';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/app/navigation/model.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
  'frontend/src/app/navigation/project-subnav.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/features',
  'frontend/src/components',
];

export const createStudioShell = () => {
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    GLOBAL_NAVIGATION_NODES,
    PROJECT_NAVIGATION_NODES,
    COMPANION_SURFACES,
    createProjectBreadcrumbs,
    createChapterBreadcrumbs,
    createProjectSubnav,
  ]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
