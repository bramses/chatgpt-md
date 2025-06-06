import { Notice } from "obsidian";
import { INotificationService } from "../core/abstractions/INotificationService";

export class ObsidianNotificationService implements INotificationService {
  private readonly defaultTimeout = 5000; // 5 seconds

  showInfo(message: string, timeout?: number): void {
    new Notice(message, timeout || this.defaultTimeout);
  }

  showWarning(message: string, timeout?: number): void {
    new Notice(`⚠️ ${message}`, timeout || this.defaultTimeout);
  }

  showError(message: string, timeout?: number): void {
    new Notice(`❌ ${message}`, timeout || this.defaultTimeout * 2); // Errors show longer
  }

  showSuccess(message: string, timeout?: number): void {
    new Notice(`✅ ${message}`, timeout || this.defaultTimeout);
  }
}
