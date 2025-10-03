export interface AppConfig {
  app: {
    title: string;
    initializing: string;
  };
}

export class AppConfigService {
  private static instance: AppConfigService;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): AppConfigService {
    if (!AppConfigService.instance) {
      AppConfigService.instance = new AppConfigService();
    }
    return AppConfigService.instance;
  }

  public async getConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    // Return default values for web app
    this.config = {
      app: {
        title: 'DataPilot',
        initializing: 'Initializing...'
      }
    };
    return this.config;
  }

  public async getAppTitle(): Promise<string> {
    const config = await this.getConfig();
    return config.app.title;
  }

  public async getAppInitializing(): Promise<string> {
    const config = await this.getConfig();
    return config.app.initializing;
  }
}

// Export singleton instance
export const appConfigService = AppConfigService.getInstance();
