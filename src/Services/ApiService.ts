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

      // If the request failed, handle the error
      if (responseUrl.status !== 200) {
        console.error(`[ChatGPT MD] API request failed with status ${responseUrl.status}:`, responseUrl.text);
        throw new Error(`API request failed with status ${responseUrl.status}: ${responseUrl.text}`);
      }

      let data;
      try {
        data = responseUrl.json;
      } catch (error) {
        console.error(`[ChatGPT MD] Failed to parse JSON response:`, responseUrl.text);
        throw new Error(`Failed to parse JSON response: ${responseUrl.text}`);
      }

      // Add detailed logging for the API response
      if (url.includes("/api/embeddings")) {
        console.log(`[ChatGPT MD] Received embedding response from ${serviceType}:`, {
          status: responseUrl.status,
          hasEmbedding: !!data?.embedding,
          embeddingLength: data?.embedding?.length || 0,
          embeddingType: data?.embedding ? typeof data.embedding : "undefined",
          isArray: Array.isArray(data?.embedding),
          responseSize: JSON.stringify(data).length,
          responseTime: responseUrl.headers?.["x-response-time"] || "unknown",
        });

        // Log warning for potentially problematic responses
        if (!data?.embedding) {
          console.warn(`[ChatGPT MD] Missing embedding in response from ${serviceType}:`, data);
        } else if (!Array.isArray(data.embedding)) {
          console.warn(
            `[ChatGPT MD] Invalid embedding format from ${serviceType} (not an array):`,
            typeof data.embedding
          );
        } else if (data.embedding.length === 0) {
          console.warn(`[ChatGPT MD] Empty embedding array from ${serviceType}`);
        }
      }

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
      console.log(`[ChatGPT MD] Making GET request to ${serviceType}`);

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
    } catch (e) {
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
