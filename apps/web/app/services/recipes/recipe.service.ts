import { RecipeSpecSchema, type RecipeSpec, type ModuleType } from '@superapp/core';

export class RecipeService {
  parse(jsonString: string): RecipeSpec {
    const parsed = JSON.parse(jsonString);
    return RecipeSpecSchema.parse(parsed);
  }

  // Helpful for UI selection / filtering
  getType(spec: RecipeSpec): ModuleType {
    return spec.type;
  }
}
