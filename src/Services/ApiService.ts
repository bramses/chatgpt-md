import { requestUrl } from "obsidian";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

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
  private apiResponseParser: ApiResponseParser;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService();
    this.apiResponseParser = apiResponseParser || new ApiResponseParser();
  }

  /**
   * Make a streaming API request
   * @param url The API endpoint URL
   * @param payload The request payload
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns A Response object for streaming
   */
  async makeStreamingRequest(
    url: string,
    payload: any,
    headers: Record<string, string>,
    serviceType: string
  ): Promise<Response> {
    try {
      console.log(`[ChatGPT MD] Making streaming request to ${serviceType}`, payload);

      this.abortController = new AbortController();

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw await this.handleHttpError(response, serviceType, payload, url);
      }

      if (!response.body) {
        throw new Error("The response body was empty");
      }

      return response;
    } catch (error) {
      return this.handleRequestError(error, serviceType, payload, url);
    }
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
      console.log(`[ChatGPT MD] Making non-streaming request to ${serviceType}`, payload);

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

      return this.apiResponseParser.parseNonStreamingResponse(data, serviceType);
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
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data from ${url}`);
      }

      const data = await response.json();
      return data;
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
    } catch (e) {
      errorData = { status: response.status, statusText: response.statusText };
    }

    const error = this.errorService.handleApiError(errorData, serviceType, {
      returnForChat: false,
      showNotification: true,
      context: { model: payload.model, url, status: response.status },
    });

    return new Error(typeof error === "string" ? error : JSON.stringify(error));
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
}
