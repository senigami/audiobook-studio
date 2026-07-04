import React from 'react';
import type { TtsEngine } from '@/types';
import { getEngineUi, getBadgeStyles } from '@/pages/Settings/settingsRouteHelpers';
import { EngineMetadataPanel } from '@/pages/Engines/components/EngineMetadataPanel';
import { JsonSchemaForm } from '@/pages/Settings/components/JsonSchemaForm';

const getSettingsSchemaWithoutComputedSpeed = (schema: any) => {
  if (!schema?.properties?.computer_speed_multiplier) {
    return schema;
  }
  const nextProperties = { ...schema.properties };
  delete nextProperties.computer_speed_multiplier;
  return {
    ...schema,
    properties: nextProperties,
  };
};

/** Engine settings panel: metadata header + JSON-schema-driven settings form. */
export const EngineSettingsForm: React.FC<{
  engine: TtsEngine;
  saving: boolean;
  onSave: (settings: Record<string, any>) => void | Promise<void>;
  onReset: (settingKey: string) => void | Promise<void>;
}> = ({ engine, saving, onSave, onReset }) => {
  const engineUi = getEngineUi(engine.settings_schema);
  const uiMetadata = engine.settings_schema?.['x-ui'];
  const hideSettingsPanel = Boolean(
    uiMetadata?.hidden ||
    (uiMetadata?.hide_settings_when_not_ready && engine.status !== 'ready' && engine.status !== 'unverified') ||
    (uiMetadata?.hide_settings_when_unverified && !engine.verified)
  );
  const settingsSchema = getSettingsSchemaWithoutComputedSpeed(engine.settings_schema);

  const shouldRender = !hideSettingsPanel && (
    engineUi ||
    settingsSchema?.description ||
    (engine.current_settings && Object.keys(engine.current_settings).length > 0)
  );

  if (!shouldRender) {
    return null;
  }

  return (
    <div style={{
      marginBottom: '1rem',
      padding: '1.25rem',
      borderRadius: '16px',
      border: '1px solid var(--accent-tint-border)',
      background: 'linear-gradient(180deg, var(--surface-tinted-light), var(--surface))'
    }}>
      {(engineUi || settingsSchema?.description) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <EngineMetadataPanel
            engine={engine}
            schema={settingsSchema}
            getBadgeStyles={getBadgeStyles}
            unframed={true}
          />
        </div>
      )}
      <JsonSchemaForm
        schema={settingsSchema}
        values={engine.current_settings || {}}
        onSave={onSave}
        onReset={onReset}
        busy={saving}
        engineVerified={engine.verified}
      />
    </div>
  );
};
