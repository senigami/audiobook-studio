/**
 * VariantsTab.tsx — task 004 (voice-card-consolidation, P4)
 *
 * Thin wrapper around `VariantsSection` (per-variant switcher + rebuild/move/
 * delete/script/settings controls). Kept on disk as its own file (rather than
 * having `VoiceLabPage` render `VariantsSection` directly) so future
 * voice-level (not variant-scoped) additions have a natural home below the
 * disclosure, without VoiceLabPage itself growing another composition layer.
 *
 * Previously (tasks 004/005) this component also promoted a `VoiceSettingsPanel`
 * for the voice's *default* variant, since per-voice plugin settings had no
 * other reachable home. voices-variants-round2 task 009 moved engine-config
 * (including the same `VoiceSettingsPanel`) into `VariantEditor` itself, scoped
 * to whichever variant is currently selected in the switcher -- so the promoted
 * panel here was retired to avoid the same settings-editing UI existing in two
 * places (INV-VC-2's "settings" affordance now lives solely in `VariantEditor`,
 * default-variant-only no longer a limitation since every variant is reachable
 * via its own switcher tab).
 */
import React from 'react';
import { VariantsSection, type VariantsSectionProps } from '@/pages/VoiceLab/components/VariantsSection';

export type VariantsTabProps = VariantsSectionProps;

export const VariantsTab: React.FC<VariantsTabProps> = (props) => {
    return (
        <div className="variants-tab">
            <VariantsSection {...props} />
        </div>
    );
};
