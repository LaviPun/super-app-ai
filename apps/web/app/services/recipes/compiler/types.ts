export type DeployOperation =
  | { kind: 'THEME_ASSET_UPSERT'; themeId: string; key: string; value: string }
  | { kind: 'THEME_ASSET_DELETE'; themeId: string; key: string }
  | { kind: 'SHOP_METAFIELD_SET'; namespace: string; key: string; type: string; value: string }
  | { kind: 'SHOP_METAFIELD_DELETE'; namespace: string; key: string }
  | { kind: 'AUDIT'; action: string; details?: string };

export type CompileResult = {
  ops: DeployOperation[];
  compiledJson?: string;
};
