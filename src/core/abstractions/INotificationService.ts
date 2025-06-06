export interface INotificationService {
  /**
   * Show an informational notification
   */
  showInfo(message: string, timeout?: number): void;

  /**
   * Show a warning notification
   */
  showWarning(message: string, timeout?: number): void;

  /**
   * Show an error notification
   */
  showError(message: string, timeout?: number): void;

  /**
   * Show a success notification
   */
  showSuccess(message: string, timeout?: number): void;
}
