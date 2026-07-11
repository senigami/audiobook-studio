/**
 * voiceLabStage — mounts the real NarratorCard for each fixture voice.
 *
 * All callbacks are no-ops (demo blocks destructive actions via demo-blocked-action).
 * Preview audio uses a silent WAV data-URI so play buttons don't 404.
 * Note: voice previews are placeholders — no real audio is generated in demo mode.
 */

import React, { useState } from 'react';
import { NarratorCard } from '@/pages/Voices/components/NarratorCard';
import { demoVoices, demoVoiceEngines } from '@/demo/fixtures/voiceFixtures';

const noop = () => {};
const noopAsync = async () => false as boolean;
const noopConfirm = () => {};

export const VoiceLabStageInner: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
      {demoVoices.map(({ speaker, profiles }) => (
        <NarratorCard
          key={speaker.id}
          speaker={speaker}
          profiles={profiles}
          testProgress={{}}
          buildingProfiles={{}}
          engines={demoVoiceEngines}
          isExpanded={expandedId === speaker.id}
          onToggleExpand={() =>
            setExpandedId(prev => (prev === speaker.id ? null : speaker.id))
          }
          onTest={noop}
          onDelete={noop}
          onMoveVariant={noop}
          onRefresh={noop}
          onEditTestText={noop}
          onBuildNow={noopAsync}
          requestConfirm={noopConfirm}
          onAddVariantClick={noop}
          onRenameClick={noop}
          onExportVoice={noop}
          onSetDefaultClick={noop}
        />
      ))}
    </div>
  );
};
