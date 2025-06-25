import { ChatSession } from "./ChatSession";
import { GroqService } from "../Services/GroqService";
import { ErrorService } from "../Services/ErrorService";
import { NotificationService } from "../Services/NotificationService";
import { ApiService } from "../Services/ApiService";
import { ApiAuthService } from "../Services/ApiAuthService";
import { ApiResponseParser } from "../Services/ApiResponseParser";
import { Message } from "../Models/Message";
import { DEFAULT_GROQ_CONFIG } from "../Services/GroqService";

const chat = new ChatSession();

// Criar instâncias dos serviços necessários
const notificationService = new NotificationService();
const errorService = new ErrorService(notificationService);
const apiService = new ApiService(errorService, notificationService);
const apiAuthService = new ApiAuthService(notificationService);
const apiResponseParser = new ApiResponseParser(notificationService);

// Criar instância do GroqService com todos os serviços
const groq = new GroqService(
  errorService,
  notificationService,
  apiService,
  apiAuthService,
  apiResponseParser
);

export async function handleChatInteraction(input: string): Promise<string> {
  try {
    // Adicionar mensagem do usuário ao histórico
    chat.addMessage("user", input);

    // Preparar mensagens para a API
    const messages: Message[] = chat.getMessages().map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Configuração do Groq
    const config = {
      ...DEFAULT_GROQ_CONFIG,
      model: "mixtral-8x7b-32768",
      max_tokens: 200,
      temperature: 0.5,
      stream: false
    };

    // Chamar a API do Groq
    const response = await groq.callAIAPI(
      messages,
      config,
      "🤖 ",
      config.url,
      undefined, // editor (não necessário para esta função)
      false, // generateAtCursor
      undefined, // apiKey (será obtido das configurações)
      undefined // settings
    );

    // Processar resposta
    if (response && response.fullString) {
      const output = response.fullString.replace(/^🤖\s*/, "").trim();
      chat.addMessage("assistant", output);
      return output;
    } else {
      throw new Error("Resposta vazia da API");
    }

  } catch (error: unknown) {
    console.error("Erro no chat interativo:", error);
    const errorMessage = error instanceof Error ? error.message : "Falha na comunicação com Groq";
    
    // Em caso de erro, retornar uma resposta de fallback
    const fallbackResponse = "⚠️ Desculpe, não consegui processar sua mensagem. Verifique sua conexão e tente novamente.";
    chat.addMessage("assistant", fallbackResponse);
    
    return fallbackResponse;
  }
}

export function resetChat(): void {
  chat.reset();
} 