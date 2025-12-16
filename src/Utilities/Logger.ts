/**
 * Centralized logging utility with debug mode support
 * Allows enabling/disabling debug logs without removing code
 */
export class Logger {
  private static debugEnabled = false;

  /**
   * Enable or disable debug logging
   */
  static setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Get current debug status
   */
  static isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Log debug messages (only shown when debug is enabled)
   */
  static debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.log(`[ChatGPT MD] ${message}`, ...args);
    }
  }

  /**
   * Log info messages (always shown)
   */
  static info(message: string, ...args: any[]): void {
    console.log(`[ChatGPT MD] ${message}`, ...args);
  }

  /**
   * Log warning messages (always shown)
   */
  static warn(message: string, ...args: any[]): void {
    console.warn(`[ChatGPT MD] ${message}`, ...args);
  }

  /**
   * Log error messages (always shown)
   */
  static error(message: string, ...args: any[]): void {
    console.error(`[ChatGPT MD] ${message}`, ...args);
  }
}
