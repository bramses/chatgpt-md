import { ItemView, WorkspaceLeaf, Plugin } from "obsidian";
import { ChatSession } from "../core/ChatSession";
import { GroqService } from "../Services/GroqService";
import { ErrorService } from "../Services/ErrorService";
import { NotificationService } from "../Services/NotificationService";
import { ApiService } from "../Services/ApiService";
import { ApiAuthService } from "../Services/ApiAuthService";
import { ApiResponseParser } from "../Services/ApiResponseParser";
import { LogHelperDetailed } from "../Utilities/LogHelperDetailed";

export const VIEW_TYPE_CHATBOT_GROQ = "chatbot-groq-view";

export class ChatView extends ItemView {
  private textareaEl: HTMLTextAreaElement;
  private outputEl: HTMLDivElement;
  private sendBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private statusEl: HTMLDivElement;
  private inputContainer: HTMLDivElement;

  private chat = new ChatSession();
  
  private notificationService = new NotificationService();
  private errorService = new ErrorService(this.notificationService);
  private apiService = new ApiService(this.errorService, this.notificationService);
  private apiAuthService = new ApiAuthService(this.notificationService);
  private apiResponseParser = new ApiResponseParser(this.notificationService);

  private groq: GroqService;
  
  private plugin: Plugin;

  constructor(leaf: WorkspaceLeaf, plugin: Plugin) {
    super(leaf);
    this.plugin = plugin;
    this.groq = (this.plugin as any).serviceLocator.getAiApiService("groq");
    console.log("🤖 ChatView: Construtor chamado");
  }

  getViewType(): string {
    return VIEW_TYPE_CHATBOT_GROQ;
  }

  getDisplayText(): string {
    return "🤖 Chatbot Groq";
  }

  async onOpen() {
    console.log("🤖 ChatView: onOpen iniciado");
    
    await LogHelperDetailed.logToFile(this.plugin, "🤖 ChatView: Painel de chat aberto", {
      operation: 'view_open',
      metadata: {
        viewType: this.getViewType(),
        displayText: this.getDisplayText(),
        chatSessionId: this.chat.getMessageCount()
      }
    });
    
    const container = this.containerEl.children[1];
    container.empty();

    const wrapper = container.createDiv("chatbot-groq-container");
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 16px;
      background: var(--background-primary);
      font-family: var(--font-text);
    `;

    const header = wrapper.createDiv("chat-header");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--background-secondary);
      border-radius: 12px 12px 0 0;
      border-bottom: 1px solid var(--background-modifier-border);
      margin-bottom: 0;
    `;

    const title = header.createEl("h3", { text: "🤖 Chatbot Groq" });
    title.style.cssText = `
      margin: 0;
      color: var(--text-normal);
      font-size: 16px;
      font-weight: 600;
    `;

    this.clearBtn = header.createEl("button", { text: "🗑️ Limpar" });
    this.clearBtn.style.cssText = `
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-primary);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
    `;
    this.clearBtn.onclick = () => this.clearChat();

    this.outputEl = wrapper.createDiv("chat-output");
    this.outputEl.style.cssText = `
      flex: 1;
      overflow-y: auto;
      background: var(--background-secondary);
      border-radius: 0 0 12px 12px;
      padding: 16px;
      margin-bottom: 16px;
      border: 1px solid var(--background-modifier-border);
      border-top: none;
      min-height: 300px;
      max-height: 500px;
    `;

    this.addWelcomeMessage();

    this.inputContainer = wrapper.createDiv("chat-input-container");
    this.inputContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--background-secondary);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--background-modifier-border);
    `;

    this.textareaEl = this.inputContainer.createEl("textarea");
    this.textareaEl.placeholder = "Digite sua pergunta... (Ctrl+Enter para enviar)";
    this.textareaEl.rows = 3;
    this.textareaEl.style.cssText = `
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 2px solid var(--background-modifier-border);
      background: var(--background-primary);
      color: var(--text-normal);
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      min-height: 80px;
      transition: border-color 0.2s ease;
      box-sizing: border-box;
    `;

    const buttonContainer = this.inputContainer.createDiv("button-container");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    `;

    this.sendBtn = buttonContainer.createEl("button", { text: "Enviar" });
    this.sendBtn.style.cssText = `
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s ease;
      min-width: 100px;
    `;

    this.statusEl = buttonContainer.createEl("div", { text: "Pronto" });
    this.statusEl.style.cssText = `
      padding: 10px 16px;
      border-radius: 8px;
      background: var(--background-primary);
      color: var(--text-muted);
      font-size: 12px;
      display: flex;
      align-items: center;
      min-width: 80px;
      justify-content: center;
    `;

    this.sendBtn.onclick = () => this.sendPrompt();
    this.textareaEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.sendPrompt();
      }
    });

    this.textareaEl.focus();
  }

  private addWelcomeMessage() {
    const welcomeHtml = `
      <div style="text-align: center; padding: 20px; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0;">Bem-vindo ao Chatbot Groq</h2>
        <p style="margin: 0; color: var(--text-muted);">Faça uma pergunta para começar. Use Ctrl+Enter para enviar.</p>
      </div>
    `;
    this.outputEl.innerHTML = welcomeHtml;
  }

  private async clearChat() {
    const messageId = `msg_${Date.now()}`;
    await LogHelperDetailed.logChatOperation(this.plugin, "chat_cleared", {
      messageId,
      previousMessageCount: this.chat.getMessageCount()
    }, { operation: 'clear_chat', messageId });

    this.chat.reset();
    this.addWelcomeMessage();
    this.updateStatus("Chat limpo", "ready");
    this.notificationService.showNotification("Chat limpo.");
  }

  private updateStatus(message: string, type: "ready" | "processing" | "success" | "error" = "ready") {
    this.statusEl.textContent = message;
    // ... (resto da lógica de status)
  }

  private addMessage(content: string, isUser: boolean, isError: boolean = false) {
    const messageEl = this.outputEl.createEl("div", {
      cls: `chat-message ${isUser ? "user-message" : "bot-message"} ${
        isError ? "error-message" : ""
      }`,
    });

    const baseStyle = `
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      max-width: 85%;
      word-wrap: break-word;
      line-height: 1.5;
      font-size: 14px;
      position: relative;
    `;

    if (isUser) {
      messageEl.style.cssText =
        baseStyle +
        `
        background: linear-gradient(135deg, var(--interactive-accent), var(--interactive-accent-hover));
        color: var(--text-on-accent);
        margin-left: auto;
        border-bottom-right-radius: 6px;
      `;
    } else if (isError) {
      messageEl.style.cssText =
        baseStyle +
        `
        background: var(--background-modifier-error);
        color: var(--text-error);
        border-left: 4px solid var(--text-error);
        margin-right: auto;
      `;
    } else {
      messageEl.style.cssText =
        baseStyle +
        `
        background: var(--background-primary-alt);
        color: var(--text-normal);
        margin-right: auto;
        border-left: 4px solid var(--text-muted);
      `;
    }

    const senderIcon = isUser ? "👤" : isError ? "❌" : "🤖";
    const senderName = isUser ? "Você" : isError ? "Erro" : "Groq";

    messageEl.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px; opacity: 0.8;">${senderIcon} ${senderName}</div>
      <div style="white-space: pre-wrap;">${content}</div>
    `;
  }

  async sendPrompt() {
    const startTime = performance.now();
    const prompt = this.textareaEl.value.trim();
    if (!prompt) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await LogHelperDetailed.logUserInput(this.plugin, {
      messageId,
      content: prompt,
      timestamp: new Date().toISOString(),
    }, "Mensagem do usuário enviada");
    
    this.chat.addMessage("user", prompt);
    this.addMessage(prompt, true);
    this.textareaEl.value = "";
    this.textareaEl.disabled = true;
    this.sendBtn.disabled = true;
    this.sendBtn.textContent = "Processando...";
    this.updateStatus("Processando...", "processing");

    try {
      const settings = (this.plugin as any).serviceLocator.getSettingsService().getSettings();
      
      const resposta = await this.groq.chatWithFallback(prompt, settings, this.plugin);

      this.chat.addMessage("assistant", resposta);
      this.addMessage(resposta, false);
      this.updateStatus("Resposta enviada", "success");

      await LogHelperDetailed.logChatOperation(this.plugin, "bot_response_processed", {
        messageId,
        responseLength: resposta.length,
      }, { operation: 'chat_response', messageId });
      
    } catch (error: any) {
      const errorMessage = error.message || "Falha na comunicação com Groq";
      this.addMessage(errorMessage, false, true);
      this.updateStatus("Erro", "error");

      await LogHelperDetailed.logError(this.plugin, error, "Erro no processamento da mensagem", {
        operation: 'chat_error',
        messageId,
      });

    } finally {
      this.textareaEl.disabled = false;
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = "Enviar";
      this.textareaEl.focus();
      this.outputEl.scrollTop = this.outputEl.scrollHeight;

      const duration = performance.now() - startTime;
      await LogHelperDetailed.logPerformance(this.plugin, "complete_chat_operation", duration, {
        messageId,
        success: !this.statusEl.textContent?.includes("Erro"),
      });
    }
  }

  async onClose() {
    await LogHelperDetailed.logToFile(this.plugin, "🚪 ChatView: Painel de chat fechado", {
      operation: 'view_close',
    });
    console.log("ChatView fechado");
  }
} 