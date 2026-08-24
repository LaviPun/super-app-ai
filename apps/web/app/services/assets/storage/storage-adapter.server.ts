import type { StorageObjectRef, StorageVisibility } from '@superapp/platform-contracts';

export type PutObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  visibility: StorageVisibility;
  metadata?: Record<string, string>;
};

export type PutObjectResult = StorageObjectRef;

export type GetObjectResult = {
  body: Uint8Array;
  contentType: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  readonly provider: StorageObjectRef['provider'];
  readonly bucket: string;
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(key: string): Promise<GetObjectResult>;
  deleteObject(key: string): Promise<void>;
  createSignedUrl(key: string, options: { expiresInSeconds: number }): Promise<string>;
}

export class StorageAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'StorageAdapterError';
    this.code = code;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
