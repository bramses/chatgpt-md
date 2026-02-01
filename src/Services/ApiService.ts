import { requestUrl } from "obsidian";
import { ApiAuthService } from "./ApiAuthService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { requestStream } from "./requestStream";
import { parseNonStreamingResponse } from "src/Utilities/ResponseHelpers";
import { validateNonEmpty, validateUrl } from "src/Utilities/InputValidator";

/**
 * ApiService handles all API communication for the application
 * It centralizes request logic, error handling, and response processing
 */
export class ApiService {
  private abortController: AbortController | null = null;
  private wasStreamingAborted: boolean = false;
  private errorService: ErrorService;
  private notificationService: NotificationService;
  private apiAuthService: ApiAuthService;

  constructor(errorService?: ErrorService, notificationService?: NotificationService, apiAuthService?: ApiAuthService) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService();
  }

  /**
   * Make a non-streaming API request
   * @param url The API endpoint URL
   * @param payload The request payload
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns The parsed response data
   */
  async makeNonStreamingRequest(
    url: string,
    payload: any,
    headers: Record<string, string>,
    serviceType: string
  ): Promise<any> {
    try {
      // Validate input parameters
      validateUrl(url);
      validateNonEmpty(serviceType, "Service type");

      const responseUrl = await requestUrl({
        url,
        method: "POST",
        headers,
        contentType: "application/json",
        body: JSON.stringify(payload),
        throw: false,
      });

      const data = responseUrl.json;

      if (data?.error) {
        return this.errorService.handleApiError({ error: data.error }, serviceType, {
          returnForChat: true,
          showNotification: true,
          context: { model: payload.model, url },
        });
      }

      return parseNonStreamingResponse(data, serviceType);
    } catch (error) {
      return this.errorService.handleApiError(error, serviceType, {
        returnForChat: true,
        showNotification: true,
        context: { model: payload.model, url },
      });
    }
  }

  /**
   * Make a GET request to fetch data
   * @param url The API endpoint URL
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns The parsed response data
   */
  async makeGetRequest(url: string, headers: Record<string, string>, serviceType: string): Promise<any> {
    try {
      const responseObj = await requestUrl({
        url,
        method: "GET",
        headers,
        throw: false,
      });

      if (responseObj.status !== 200) {
        throw new Error(`Failed to fetch data from ${url}: ${responseObj.status}`);
      }

      return responseObj.json;
    } catch (error) {
      console.error(`Error making GET request to ${serviceType}:`, error);
      throw error;
    }
  }

  /**
   * Handle HTTP errors from responses
   */
  private async handleHttpError(response: Response, serviceType: string, payload: any, url: string): Promise<Error> {
    let errorData: any;

    try {
      errorData = await response.json();
    } catch (_) {
      errorData = { status: response.status, statusText: response.statusText };
    }

    const error = this.errorService.handleApiError(errorData, serviceType, {
      returnForChat: false,
      showNotification: true,
      context: { model: payload.model, url, status: response.status },
    });

    return new Error(error);
  }

  /**
   * Handle request errors
   */
  private handleRequestError(error: any, serviceType: string, payload: any, url: string): never {
    return this.errorService.handleApiError(error, serviceType, {
      returnForChat: false,
      showNotification: true,
      context: { model: payload.model, url },
    }) as never;
  }

  /**
   * Set the abort controller for external streaming implementations
   * This allows AI SDK streaming to use the same abort mechanism
   */
  setAbortController(controller: AbortController): void {
    this.abortController = controller;
    this.wasStreamingAborted = false;
  }

  /**
   * Stop any ongoing streaming request
   */
  stopStreaming(): void {
    if (this.abortController) {
      this.wasStreamingAborted = true;
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if streaming was aborted
   */
  wasAborted(): boolean {
    return this.wasStreamingAborted;
  }

  /**
   * Reset the aborted flag
   */
  resetAbortedFlag(): void {
    this.wasStreamingAborted = false;
  }

  /**
   * Create a fetch-compatible function that uses requestStream
   * This allows third-party libraries (like AI SDK) to use Obsidian's requestUrl under the hood
   * @returns A fetch-compatible function
   */
  createFetchAdapter(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      const requestOptions = {
        url,
        method: init?.method || "GET",
        headers: init?.headers
          ? typeof init.headers === "object" && "forEach" in init.headers
            ? this.convertHeadersToRecord(init.headers as Headers)
            : (init.headers as Record<string, string>)
          : {},
        body: init?.body ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined,
        signal: init?.signal || undefined,
      };

      return requestStream(requestOptions);
    };
  }

  /**
   * Convert Headers object to plain Record
   */
  private convertHeadersToRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
}
