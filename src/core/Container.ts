export interface ServiceToken<T> {
  name: string;
  type?: T;
}

/**
 * Dependency Injection Container
 * Manages service registration and resolution with lazy loading support
 */
export class Container {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();

  /**
   * Register a service factory
   */
  register<T>(token: ServiceToken<T>, factory: () => T): void {
    this.factories.set(token.name, factory);
  }

  /**
   * Resolve a service
   * Services are created on first access (lazy loading)
   */
  resolve<T>(token: ServiceToken<T>): T {
    if (!this.services.has(token.name)) {
      const factory = this.factories.get(token.name);
      if (!factory) {
        throw new Error(`Service ${token.name} not registered`);
      }
      this.services.set(token.name, factory());
    }
    return this.services.get(token.name);
  }

  /**
   * Register a service with explicit lazy loading
   */
  registerLazy<T>(token: ServiceToken<T>, factory: () => T): void {
    this.factories.set(token.name, () => {
      const instance = factory();
      this.services.set(token.name, instance);
      return instance;
    });
  }

  /**
   * Register a singleton instance directly
   */
  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.services.set(token.name, instance);
  }

  /**
   * Check if a service is registered
   */
  has(token: ServiceToken<any>): boolean {
    return this.factories.has(token.name) || this.services.has(token.name);
  }

  /**
   * Create a scoped container for testing
   * Inherits all factories but creates new instances
   */
  createScope(): Container {
    const scopedContainer = new Container();
    // Copy all factories to the new container
    this.factories.forEach((factory, name) => {
      scopedContainer.factories.set(name, factory);
    });
    return scopedContainer;
  }

  /**
   * Clear all services and factories
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}

/**
 * Service tokens for type-safe dependency injection
 */
export const TOKENS = {
  // Core abstractions
  Editor: { name: "Editor" } as ServiceToken<import("./abstractions/IEditor").IEditor>,
  FileSystem: { name: "FileSystem" } as ServiceToken<import("./abstractions/IFileSystem").IFileSystem>,
  NotificationService: { name: "NotificationService" } as ServiceToken<
    import("./abstractions/INotificationService").INotificationService
  >,
  App: { name: "App" } as ServiceToken<import("./abstractions/IApp").IApp>,

  // Domain services
  MessageParser: { name: "MessageParser" } as ServiceToken<any>, // To be defined
  SettingsService: { name: "SettingsService" } as ServiceToken<any>, // To be defined
  AIProviderManager: { name: "AIProviderManager" } as ServiceToken<any>, // To be defined
  EditorService: { name: "EditorService" } as ServiceToken<any>, // To be defined
  FrontmatterService: { name: "FrontmatterService" } as ServiceToken<any>, // To be defined

  // Use cases
  ChatUseCase: { name: "ChatUseCase" } as ServiceToken<any>, // To be defined
  InferTitleUseCase: { name: "InferTitleUseCase" } as ServiceToken<any>, // To be defined

  // Infrastructure
  ObsidianApp: { name: "ObsidianApp" } as ServiceToken<import("obsidian").App>,
  ObsidianPlugin: { name: "ObsidianPlugin" } as ServiceToken<import("obsidian").Plugin>,
};
