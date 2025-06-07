import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { ChatUseCase } from "../usecases/ChatUseCase";
import { INotificationService } from "../core/abstractions/INotificationService";

export interface ChatCommandDependencies {
  updateStatusBar(text: string): void;
  isMobile: boolean;
}

/**
 * Command for executing chat operations with AI services
 */
export class ChatCommand implements ICommand {
  id = "call-chatgpt-api";
  name = "Chat";
  icon = "message-circle";

  constructor(
    private chatUseCase: ChatUseCase,
    private notificationService: INotificationService,
    private deps: ChatCommandDependencies
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Chat command requires an editor and view");
    }

    // Create status update function
    const updateStatus = (message: string) => {
      if (this.deps.isMobile) {
        this.notificationService.showInfo(`[ChatGPT MD] ${message}`);
      } else {
        this.deps.updateStatusBar(message);
      }
    };

    try {
      const result = await this.chatUseCase.execute(context.editor, context.view, updateStatus);

      if (!result.success && result.error) {
        if (this.deps.isMobile) {
          this.notificationService.showError(`[ChatGPT MD] ${result.error}`, 9000);
        }
        console.error("[ChatGPT MD] Chat error:", result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.deps.isMobile) {
        this.notificationService.showError(`[ChatGPT MD] ${errorMessage}`, 9000);
      }
      console.error("[ChatGPT MD] Chat execution failed:", error);
    } finally {
      // Clear status bar
      this.deps.updateStatusBar("");
    }
  }
}
