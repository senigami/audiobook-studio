import type { TtsEngine } from '@/types';

const mergeRecord = (base: Record<string, any> | undefined, override: Record<string, any> | undefined): Record<string, any> => {
  const merged = { ...(base || {}) };
  Object.entries(override || {}).forEach(([key, value]) => {
    const baseValue = merged[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      merged[key] = mergeRecord(baseValue, value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
};

export const mergeScenarioEngine = (engine: TtsEngine, scenarioDetail: Partial<TtsEngine> | undefined): TtsEngine => {
  if (!scenarioDetail) return engine;
  const {
    engine_id: _engineId,
    display_name: _displayName,
    version: _version,
    local: _local,
    cloud: _cloud,
    network: _network,
    languages: _languages,
    capabilities: _capabilities,
    resource: _resource,
    author: _author,
    homepage: _homepage,
    logo_url: _logoUrl,
    dev: _dev,
    ...stateOverrides
  } = scenarioDetail;
  return {
    ...engine,
    ...stateOverrides,
    current_settings: mergeRecord(engine.current_settings, stateOverrides.current_settings),
    settings_schema: mergeRecord(engine.settings_schema, stateOverrides.settings_schema),
  };
};
