/**
 * proposedTokens — local constants for design proposals from doc 10 (U3).
 *
 * These tokens DO NOT exist in tokens.css yet. The styleguide renders them
 * from these constants so the owner can evaluate the proposed scale without
 * any production code being changed. Approval → implementation is a separate step.
 */

export interface ProposedTypeStep {
  name: string;       // token name e.g. "--type-title"
  label: string;      // human label e.g. "Title"
  size: string;       // e.g. "1.5rem"
  weight: number;     // e.g. 700
  usage: string;      // where it would be used
}

export interface ProposedSpaceStep {
  name: string;       // e.g. "--space-1"
  value: string;      // e.g. "4px"
  label: string;
}

export interface ProposedDurationStep {
  name: string;       // e.g. "--duration-fast"
  value: string;      // e.g. "120ms"
  label: string;
  usage: string;
}

/** Proposed 6-step semantic type scale (U3) */
export const PROPOSED_TYPE_SCALE: ProposedTypeStep[] = [
  {
    name: '--type-title',
    label: 'Title',
    size: '1.5rem',
    weight: 700,
    usage: 'Page headings, modal titles, library card titles',
  },
  {
    name: '--type-headline',
    label: 'Headline',
    size: '1.125rem',
    weight: 600,
    usage: 'Section headings, panel headers, chapter names',
  },
  {
    name: '--type-body',
    label: 'Body',
    size: '0.9375rem',
    weight: 400,
    usage: 'Primary readable text — scripts, descriptions, list items',
  },
  {
    name: '--type-callout',
    label: 'Callout',
    size: '0.875rem',
    weight: 400,
    usage: 'Secondary info, sub-labels, form hints',
  },
  {
    name: '--type-caption',
    label: 'Caption',
    size: '0.75rem',
    weight: 500,
    usage: 'Timestamps, IDs, table cell text, badges',
  },
  {
    name: '--type-micro',
    label: 'Micro',
    size: '0.6875rem',
    weight: 600,
    usage: 'All-caps labels, status chips, keyboard shortcuts (min readable size)',
  },
];

/** Proposed spacing scale (U3) */
export const PROPOSED_SPACE_SCALE: ProposedSpaceStep[] = [
  { name: '--space-1', value: '4px',  label: 'xs — icon gaps, tight row padding' },
  { name: '--space-2', value: '8px',  label: 'sm — within-component padding' },
  { name: '--space-3', value: '12px', label: 'md — button horizontal padding, card inner gap' },
  { name: '--space-4', value: '16px', label: 'base — standard section padding' },
  { name: '--space-6', value: '24px', label: 'lg — panel padding, section gaps' },
  { name: '--space-8', value: '32px', label: 'xl — major section gaps' },
];

/** Proposed motion duration tokens (U3) */
export const PROPOSED_DURATION_SCALE: ProposedDurationStep[] = [
  {
    name: '--duration-fast',
    value: '120ms',
    label: 'Fast',
    usage: 'Hover state appearance, focus ring, simple color transitions',
  },
  {
    name: '--duration-base',
    value: '200ms',
    label: 'Base',
    usage: 'Standard UI transitions — panels sliding, cards expanding',
  },
  {
    name: '--duration-slow',
    value: '320ms',
    label: 'Slow',
    usage: 'Page-level route transitions, overlay enter/exit',
  },
];

/** Ad-hoc font sizes currently used in the codebase (U3 — "current" state) */
export interface AdHocSizeRecord {
  size: string;
  usedIn: string;
}

export const AD_HOC_SIZES: AdHocSizeRecord[] = [
  { size: '0.625rem',  usedIn: 'components.css badge labels (unreadable at this scale)' },
  { size: '0.65rem',   usedIn: 'DemoApp badge chip ("demo mode")' },
  { size: '0.6875rem', usedIn: 'Queue / micro labels' },
  { size: '0.75rem',   usedIn: 'ChapterHeader timestamps, status chips' },
  { size: '0.8rem',    usedIn: 'Layout nav labels, queue table captions' },
  { size: '0.85rem',   usedIn: 'Stage index card descriptions, action tooltips' },
  { size: '0.875rem',  usedIn: 'ConfirmModal body, callout text throughout' },
  { size: '0.9rem',    usedIn: 'GlassInput, ScriptView body text' },
  { size: '0.9375rem', usedIn: 'ProjectLibraryPage project titles' },
  { size: '1.4rem',    usedIn: 'StageIndex heading, chapter name headings' },
  { size: '2.75rem',   usedIn: 'Hero display text (ProjectLibraryPage large splash)' },
];
