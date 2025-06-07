import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { INotificationService } from "../core/abstractions/INotificationService";

export interface ChooseChatTemplateDependencies {
  createNewChatFromTemplate(settings: any, dateString: string): Promise<void>;
  getDate(date: Date, format: string): string;
  getSettings(): any;
}

/**
 * Command for creating a new chat from a template
 */
export class ChooseChatTemplateCommand implements ICommand {
  id = "choose-chat-template";
  name = "Create new chat from template";
  icon = "layout-template";

  constructor(
    private deps: ChooseChatTemplateDependencies,
    private notificationService: INotificationService
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    const settings = this.deps.getSettings();

    if (!settings.dateFormat) {
      this.notificationService.showError(
        "date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss"
      );
      return;
    }

    try {
      const dateString = this.deps.getDate(new Date(), settings.dateFormat);
      await this.deps.createNewChatFromTemplate(settings, dateString);
    } catch (error) {
      const _errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ChatGPT MD] Error creating new chat from template:", error);
      this.notificationService.showError("[ChatGPT MD] Error creating new chat from template, check console");
    }
  }
}
