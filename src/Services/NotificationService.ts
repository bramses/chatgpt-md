import { Notice } from "obsidian";

/**
 * Service for handling notifications and user feedback
 */
export class NotificationService {
  /**
   * Show a notification to the user
   * @param message The message to display
   * @param duration The duration in milliseconds to show the notification
   */
  showNotification(message: string, duration: number = 5000): void {
    new Notice(message, duration);
  }

  /**
   * Format a message for display in the chat
   * @param message The message to format
   * @param isError Whether this is an error message
   */
  formatChatMessage(message: string, isError: boolean = false): string {
    if (isError) {
      return `I am sorry. ${message}`;
    }
    return message;
  }

  /**
   * Show a success notification
   * @param message The success message
   */
  showSuccess(message: string): void {
    this.showNotification(`✅ ${message}`, 3000);
  }

  /**
   * Show a warning notification
   * @param message The warning message
   */
  showWarning(message: string): void {
    this.showNotification(`⚠️ ${message}`, 5000);
  }

  /**
   * Show an error notification
   * @param message The error message
   */
  showError(message: string): void {
    this.showNotification(`❌ ${message}`, 7000);
  }
}
