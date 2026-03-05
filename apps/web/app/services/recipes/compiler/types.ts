export type DeployOperation =
  | { kind: 'THEME_ASSET_UPSERT'; themeId: string; key: string; value: string }
  | { kind: 'THEME_ASSET_DELETE'; themeId: string; key: string }
  | { kind: 'SHOP_METAFIELD_SET'; namespace: string; key: string; type: string; value: string }
  | { kind: 'SHOP_METAFIELD_DELETE'; namespace: string; key: string }
  | { kind: 'AUDIT'; action: string; details?: string };

/** Payload for a theme module stored in shop metafield superapp.theme.modules (app extension renders from this). */
export type ThemeModulePayload = {
  type: string;
  name: string;
  config: Record<string, unknown>;
  style?: Record<string, unknown>;
};

export type CompileResult = {
  ops: DeployOperation[];
  compiledJson?: string;
  /** When set, PublishService merges this into shop metafield superapp.theme.modules (keyed by moduleId). */
  themeModulePayload?: ThemeModulePayload;
};
