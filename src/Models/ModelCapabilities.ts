/**
 * Simple map of model ID -> supports tools
 */
export class ModelCapabilitiesCache {
  private cache: Map<string, boolean> = new Map();

  setSupportsTools(modelId: string, supports: boolean): void {
    this.cache.set(modelId, supports);
  }

  supportsTools(modelId: string): boolean | undefined {
    return this.cache.get(modelId);
  }

  clear(): void {
    this.cache.clear();
  }
}
