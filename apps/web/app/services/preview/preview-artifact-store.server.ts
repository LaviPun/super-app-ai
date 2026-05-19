import type { PreviewArtifact } from './preview-contracts';

export interface PreviewArtifactStore {
  put(artifact: PreviewArtifact): Promise<PreviewArtifact>;
  get(id: string): Promise<PreviewArtifact | null>;
}

export class LocalPreviewArtifactStore implements PreviewArtifactStore {
  private readonly artifacts = new Map<string, PreviewArtifact>();

  async put(artifact: PreviewArtifact): Promise<PreviewArtifact> {
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async get(id: string): Promise<PreviewArtifact | null> {
    return this.artifacts.get(id) ?? null;
  }

  clear() {
    this.artifacts.clear();
  }
}

const localPreviewArtifactStore = new LocalPreviewArtifactStore();

export function getPreviewArtifactStore(): PreviewArtifactStore {
  return localPreviewArtifactStore;
}
