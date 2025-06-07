import { ChatUseCase, ChatUseCaseDependencies } from "../../../src/usecases/ChatUseCase";
import { MockEditor } from "../../helpers/MockEditor";
import { MockNotificationService } from "../../helpers/MockNotificationService";
import { IView } from "../../../src/core/abstractions/IView";
import { DEFAULT_SETTINGS } from "../../../src/Models/Config";

// Mock Platform directly
jest.mock("obsidian", () => ({
  Platform: {
    isMobile: false,
  },
}));

// Mock the TextHelpers functions
jest.mock("../../../src/Utilities/TextHelpers", () => ({
  getHeadingPrefix: jest.fn().mockReturnValue("## "),
  isTitleTimestampFormat: jest.fn().mockReturnValue(true),
}));

describe("ChatUseCase", () => {
  let useCase: ChatUseCase;
  let mockDependencies: jest.Mocked<ChatUseCaseDependencies>;
  let mockNotificationService: MockNotificationService;
  let mockEditor: MockEditor;
  let mockView: jest.Mocked<IView>;
  let mockUpdateStatus: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console.error to suppress expected error outputs
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    mockNotificationService = new MockNotificationService();
    mockEditor = new MockEditor();

    mockView = {
      getFile: jest.fn().mockReturnValue({ basename: "test-chat.md", path: "/test/test-chat.md", extension: "md" }),
      getContent: jest.fn().mockResolvedValue(""),
      setContent: jest.fn().mockResolvedValue(undefined),
      getPath: jest.fn().mockReturnValue("/test/test-chat.md"),
    };

    mockDependencies = {
      getSettings: jest.fn().mockReturnValue({
        ...DEFAULT_SETTINGS,
        generateAtCursor: false,
        headingLevel: 2,
        autoInferTitle: false,
      }),
      getFrontmatter: jest.fn().mockReturnValue({
        model: "gpt-4",
        aiService: "openai",
      }),
      getMessages: jest.fn().mockResolvedValue({
        messages: ["Hello", "How are you?"],
        messagesWithRole: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "How are you?" },
        ],
      }),
      getAiService: jest.fn().mockReturnValue({
        callAIAPI: jest.fn().mockResolvedValue({
          fullString: "I'm doing well, thank you!",
          model: "gpt-4",
        }),
      }),
      getApiKey: jest.fn().mockReturnValue("test-api-key"),
      getAiApiUrls: jest.fn().mockReturnValue({
        openai: "https://api.openai.com/v1",
      }),
      moveCursorToEnd: jest.fn(),
      processResponse: jest.fn(),
      inferTitle: jest.fn().mockResolvedValue(undefined),
    };

    mockUpdateStatus = jest.fn();

    useCase = new ChatUseCase(mockDependencies, mockNotificationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe("Successful Chat Execution", () => {
    it("should execute chat successfully with basic flow", async () => {
      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.titleInferred).toBe(false);

      expect(mockDependencies.getSettings).toHaveBeenCalled();
      expect(mockDependencies.getFrontmatter).toHaveBeenCalledWith(mockView, expect.any(Object));
      expect(mockDependencies.getMessages).toHaveBeenCalledWith(mockEditor, expect.any(Object));
      expect(mockDependencies.processResponse).toHaveBeenCalled();
    });

    it("should move cursor to end when generateAtCursor is false", async () => {
      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockDependencies.moveCursorToEnd).toHaveBeenCalledWith(mockEditor);
    });

    it("should not move cursor when generateAtCursor is true", async () => {
      mockDependencies.getSettings.mockReturnValue({
        ...DEFAULT_SETTINGS,
        generateAtCursor: true,
      });

      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockDependencies.moveCursorToEnd).not.toHaveBeenCalled();
    });

    it("should show status notifications on desktop", async () => {
      // Platform.isMobile is already mocked as false
      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockUpdateStatus).toHaveBeenCalledWith("Calling gpt-4");
      expect(mockUpdateStatus).toHaveBeenCalledWith(""); // Clear status
    });

    it("should show mobile notifications on mobile platform", async () => {
      // Mock Platform.isMobile as true for this test
      const { Platform } = require("obsidian");
      Platform.isMobile = true;

      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockNotificationService.hasNotification("info", "[ChatGPT MD] Calling gpt-4")).toBe(true);

      // Reset to default
      Platform.isMobile = false;
    });
  });

  describe("Auto Title Inference", () => {
    beforeEach(() => {
      mockDependencies.getSettings.mockReturnValue({
        ...DEFAULT_SETTINGS,
        autoInferTitle: true,
        dateFormat: "YYYY-MM-DD-HH-mm-ss",
      });

      // Mock a timestamp filename that should trigger title inference
      mockView.getFile.mockReturnValue({
        basename: "2024-01-15-14-30-45", // Timestamp format
        path: "/test/2024-01-15-14-30-45.md",
        extension: "md",
      });

      // Mock more than MIN_AUTO_INFER_MESSAGES (which is 3)
      mockDependencies.getMessages.mockResolvedValue({
        messages: ["Hello", "How are you?", "I'm fine", "Great!", "Perfect"], // 5 messages > 3
        messagesWithRole: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "How are you?" },
          { role: "user", content: "I'm fine" },
          { role: "assistant", content: "Great!" },
          { role: "user", content: "Perfect" },
        ],
      });
    });

    it("should infer title when conditions are met", async () => {
      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.success).toBe(true);
      expect(result.titleInferred).toBe(true);
      expect(mockDependencies.inferTitle).toHaveBeenCalled();
    });

    it("should not infer title when autoInferTitle is disabled", async () => {
      mockDependencies.getSettings.mockReturnValue({
        ...DEFAULT_SETTINGS,
        autoInferTitle: false,
      });

      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.titleInferred).toBe(false);
      expect(mockDependencies.inferTitle).not.toHaveBeenCalled();
    });

    it("should not infer title when filename is not timestamp format", async () => {
      // Override the mock for this specific test
      const { isTitleTimestampFormat } = require("../../../src/Utilities/TextHelpers");
      isTitleTimestampFormat.mockReturnValue(false);

      mockView.getFile.mockReturnValue({
        basename: "my-custom-chat",
        path: "/test/my-custom-chat.md",
        extension: "md",
      });

      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.titleInferred).toBe(false);
      expect(mockDependencies.inferTitle).not.toHaveBeenCalled();

      // Reset to default for other tests
      isTitleTimestampFormat.mockReturnValue(true);
    });

    it("should handle title inference errors gracefully", async () => {
      (mockDependencies.inferTitle as jest.Mock).mockRejectedValue(new Error("Title inference failed"));

      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.success).toBe(true); // Main chat should still succeed
      expect(result.titleInferred).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle settings error", async () => {
      mockDependencies.getSettings.mockImplementation(() => {
        throw new Error("Settings error");
      });

      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Settings error");
    });

    it("should handle AI API error", async () => {
      const aiService = mockDependencies.getAiService("openai");
      aiService.callAIAPI.mockRejectedValue(new Error("API call failed"));

      const result = await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API call failed");
    });

    it("should show mobile error notification on mobile platform", async () => {
      // Mock Platform.isMobile as true for this test
      const { Platform } = require("obsidian");
      Platform.isMobile = true;

      mockDependencies.getMessages.mockRejectedValue(new Error("Test error"));

      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockNotificationService.hasNotification("error", "[ChatGPT MD] Error: Test error")).toBe(true);

      // Reset to default
      Platform.isMobile = false;
    });

    it("should clear status on error", async () => {
      mockDependencies.getMessages.mockRejectedValue(new Error("Test error"));

      await useCase.execute(mockEditor, mockView, mockUpdateStatus);

      expect(mockUpdateStatus).toHaveBeenCalledWith(""); // Status cleared
    });
  });

  describe("Default Model Selection", () => {
    it("should return correct default model for OpenAI", () => {
      const defaultModel = (useCase as any).getDefaultModelForService("openai");
      expect(defaultModel).toBe("gpt-4");
    });

    it("should return correct default model for Ollama", () => {
      const defaultModel = (useCase as any).getDefaultModelForService("ollama");
      expect(defaultModel).toBe("llama2");
    });

    it("should return correct default model for unknown service", () => {
      const defaultModel = (useCase as any).getDefaultModelForService("unknown");
      expect(defaultModel).toBe("gpt-4");
    });
  });
});
