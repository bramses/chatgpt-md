import { requestUrl } from "obsidian";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { AI_SERVICE_OLLAMA, LOCALHOST, LOCALHOST_IP } from "src/Constants";

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

      // Special handling for Ollama requests - detect if running on mobile by checking the URL
      // This addresses CORS issues when accessing from a non-localhost URL
      if (serviceType === AI_SERVICE_OLLAMA && !url.includes(LOCALHOST) && !url.includes(LOCALHOST_IP)) {
        return await this.makeOllamaRequestWithFallback(url, payload, headers);
      }

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
   * Makes an Ollama request using Obsidian's requestUrl to bypass CORS issues
   * This method uses a non-streaming request but simulates a streaming response
   * for compatibility with the streaming handler
   */
  private async makeOllamaRequestWithFallback(
    url: string,
    payload: any,
    headers: Record<string, string>
  ): Promise<Response> {
    try {
      console.log(`[ChatGPT MD] Using CORS-friendly Ollama request method`);

      // Make a regular non-streaming request
      const nonStreamingPayload = {
        ...payload,
        stream: false, // Force non-streaming for this request
      };

      const responseObj = await requestUrl({
        url,
        method: "POST",
        headers,
        contentType: "application/json",
        body: JSON.stringify(nonStreamingPayload),
        throw: false,
      });

      if (responseObj.status !== 200) {
        const error = new Error(`Ollama request failed with status ${responseObj.status}`);
        throw error;
      }

      // Create a ReadableStream that will output the response data
      const responseData = responseObj.json;
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // Simulate streaming by writing the response in chunks
      // This is done asynchronously so we can return the response immediately
      (async () => {
        if (responseData.message && responseData.message.content) {
          // Handle chat completion format
          const content = responseData.message.content;
          const chunkSize = 10; // Characters per chunk

          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.substring(i, i + chunkSize);
            const chunkObj = { message: { content: chunk } };
            await writer.write(new TextEncoder().encode(JSON.stringify(chunkObj) + "\n"));
            // Small delay to simulate streaming
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        } else if (responseData.response) {
          // Handle generate API format
          const content = responseData.response;
          const chunkSize = 10; // Characters per chunk

          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.substring(i, i + chunkSize);
            const chunkObj = { response: chunk };
            await writer.write(new TextEncoder().encode(JSON.stringify(chunkObj) + "\n"));
            // Small delay to simulate streaming
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        await writer.close();
      })();

      // Create a mock Response with the ReadableStream
      return new Response(readable, {
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "Content-Type": "application/json",
        }),
      });
    } catch (error) {
      console.error("[ChatGPT MD] Error using fallback Ollama request method:", error);
      throw error;
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
