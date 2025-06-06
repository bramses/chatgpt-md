import { INotificationService } from "../../src/core/abstractions/INotificationService";

export class MockNotificationService implements INotificationService {
  public notifications: Array<{ type: string; message: string; timeout?: number }> = [];

  showInfo(message: string, timeout?: number): void {
    this.notifications.push({ type: "info", message, timeout });
  }

  showWarning(message: string, timeout?: number): void {
    this.notifications.push({ type: "warning", message, timeout });
  }

  showError(message: string, timeout?: number): void {
    this.notifications.push({ type: "error", message, timeout });
  }

  showSuccess(message: string, timeout?: number): void {
    this.notifications.push({ type: "success", message, timeout });
  }

  // Test helper methods
  clear(): void {
    this.notifications = [];
  }

  getLastNotification(): { type: string; message: string; timeout?: number } | undefined {
    return this.notifications[this.notifications.length - 1];
  }

  hasNotification(type: string, message: string): boolean {
    return this.notifications.some((n) => n.type === type && n.message === message);
  }
}
