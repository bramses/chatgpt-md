import { Plugin, TFile } from "obsidian";
import { ChatGPT_MDSettings } from "../Models/Config";
import { SettingsService } from "../Services/SettingsService";

export interface LogContext {
  operation?: string;
  userId?: string;
  messageId?: string;
  apiService?: string;
  model?: string;
  tokens?: number;
  duration?: number;
  error?: any;
  settings?: Partial<ChatGPT_MDSettings>;
  metadata?: Record<string, any>;
}

export class LogHelper {
  static async logToFile(plugin: Plugin, message: string, context?: LogContext) {
    try {
      // Tenta obter as configurações através do SettingsService
      let settings: ChatGPT_MDSettings;
      
      // Verifica se o plugin tem um ServiceLocator configurado
      if ((plugin as any).serviceLocator) {
        const serviceLocator = (plugin as any).serviceLocator;
        const settingsService = serviceLocator.getSettingsService();
        settings = settingsService.getSettings();
      } else {
        // Fallback: tenta acessar diretamente do plugin
        settings = (plugin as any).settings ?? {};
      }

      // Verifica se o log detalhado está habilitado
      if (!settings.enableDetailedLog) {
        console.log("📝 Log detalhado desabilitado, pulando gravação:", message);
        return;
      }

      // Define o nome do arquivo de log
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const logFileName = `chatbot-groq-${today}.md`;
      
      // Define a pasta de log (dentro do vault)
      const logFolder = settings.detailedLogPath?.trim() || "ChatGPT_MD/logs";
      
      // Cria o caminho completo
      const logPath = `${logFolder}/${logFileName}`;
      
      const timestamp = new Date().toISOString();
      
      // Cria entrada de log detalhada
      const logEntry = this.createDetailedLogEntry(timestamp, message, context, settings);

      console.log("📝 Tentando gravar log em:", logPath);

      // Verifica se a pasta existe, se não, cria
      await this.ensureFolderExists(plugin, logFolder);

      // Verifica se o arquivo já existe
      const existingFile = plugin.app.vault.getAbstractFileByPath(logPath);
      
      let content = "";
      
      if (existingFile instanceof TFile) {
        // Arquivo existe, lê o conteúdo atual
        content = await plugin.app.vault.read(existingFile);
        content += "\n\n" + logEntry;
        console.log("✅ Log detalhado adicionado ao arquivo existente");
      } else {
        // Arquivo não existe, cria com cabeçalho
        content = `# Chatbot Groq - Log Detalhado ${today}

> Log detalhado gerado automaticamente pelo plugin ChatGPT MD Groq
> 
> **Data:** ${today}
> **Vault:** ${plugin.app.vault.getName()}
> **Plugin Version:** ${plugin.manifest.version}

---

${logEntry}`;
        console.log("✅ Arquivo de log detalhado criado com sucesso");
      }

      // Salva o arquivo
      await plugin.app.vault.create(logPath, content);
      console.log("📝 Log detalhado gravado com sucesso:", message.substring(0, 50) + "...");

    } catch (err) {
      // Se der erro, loga no console com detalhes
      console.error("❌ Erro ao gravar log detalhado:", err);
      console.error("📝 Mensagem que falhou:", message);
      console.error("🔧 Plugin info:", {
        manifest: plugin.manifest,
        vaultName: plugin.app.vault.getName(),
        context: context
      });
      
      // Tenta gravar em um local alternativo
      await this.fallbackLog(plugin, message, context, err);
    }
  }

  /**
   * Cria uma entrada de log detalhada com todas as informações
   */
  private static createDetailedLogEntry(timestamp: string, message: string, context?: LogContext, settings?: ChatGPT_MDSettings): string {
    const startTime = new Date(timestamp);
    const formattedTime = startTime.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let logEntry = `## 📝 ${formattedTime}

**Mensagem:** ${message}

**Timestamp:** ${timestamp}
**Operação:** ${context?.operation || 'N/A'}
**ID da Mensagem:** ${context?.messageId || 'N/A'}`;

    // Adiciona informações da API se disponíveis
    if (context?.apiService) {
      logEntry += `\n**Serviço de IA:** ${context.apiService}`;
    }

    if (context?.model) {
      logEntry += `\n**Modelo:** ${context.model}`;
    }

    if (context?.tokens) {
      logEntry += `\n**Tokens:** ${context.tokens}`;
    }

    if (context?.duration) {
      logEntry += `\n**Duração:** ${context.duration}ms`;
    }

    // Adiciona configurações relevantes
    if (settings) {
      logEntry += `\n\n### ⚙️ Configurações Relevantes
**Log Detalhado:** ${settings.enableDetailedLog ? '✅ Ativado' : '❌ Desativado'}
**Pasta de Log:** ${settings.detailedLogPath || 'ChatGPT_MD/logs (padrão)'}
**Stream:** ${settings.stream ? '✅ Ativado' : '❌ Desativado'}
**Gerar no Cursor:** ${settings.generateAtCursor ? '✅ Ativado' : '❌ Desativado'}
**Inferir Título:** ${settings.autoInferTitle ? '✅ Ativado' : '❌ Desativado'}`;

      // Adiciona URLs dos serviços se disponíveis
      if (settings.groqUrl) {
        logEntry += `\n**URL Groq:** ${settings.groqUrl}`;
      }
      if (settings.openaiUrl) {
        logEntry += `\n**URL OpenAI:** ${settings.openaiUrl}`;
      }
      if (settings.openrouterUrl) {
        logEntry += `\n**URL OpenRouter:** ${settings.openrouterUrl}`;
      }
    }

    // Adiciona metadados se disponíveis
    if (context?.metadata && Object.keys(context.metadata).length > 0) {
      logEntry += `\n\n### 📊 Metadados
`;
      for (const [key, value] of Object.entries(context.metadata)) {
        if (typeof value === 'object') {
          logEntry += `**${key}:** \`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
        } else {
          logEntry += `**${key}:** ${value}\n`;
        }
      }
    }

    // Adiciona informações de erro se disponíveis
    if (context?.error) {
      logEntry += `\n\n### ❌ Erro Detalhado
**Tipo:** ${context.error.name || 'Error'}
**Mensagem:** ${context.error.message || context.error}
**Stack:** \`\`\`
${context.error.stack || 'N/A'}
\`\`\``;
    }

    // Adiciona informações do sistema
    logEntry += `\n\n### 💻 Informações do Sistema
**User Agent:** ${navigator.userAgent}
**Plataforma:** ${navigator.platform}
**Memória:** ${(performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024)}MB` : 'N/A'}
**Tempo de Carregamento:** ${performance.now().toFixed(2)}ms`;

    logEntry += `\n\n---`;

    return logEntry;
  }

  /**
   * Log específico para operações de chat
   */
  static async logChatOperation(plugin: Plugin, operation: string, details: any, context?: LogContext) {
    const message = `🤖 ${operation}: ${JSON.stringify(details, null, 2)}`;
    await this.logToFile(plugin, message, {
      ...context,
      operation: 'chat',
      metadata: {
        chatOperation: operation,
        details: details
      }
    });
  }

  /**
   * Log específico para operações da API
   */
  static async logApiOperation(plugin: Plugin, service: string, operation: string, details: any, context?: LogContext) {
    const message = `🌐 API ${service} - ${operation}: ${JSON.stringify(details, null, 2)}`;
    await this.logToFile(plugin, message, {
      ...context,
      operation: 'api',
      apiService: service,
      metadata: {
        apiOperation: operation,
        service: service,
        details: details
      }
    });
  }

  /**
   * Log específico para erros
   */
  static async logError(plugin: Plugin, error: any, context?: string, additionalContext?: LogContext) {
    const message = `❌ ERRO: ${context || 'Erro não especificado'}`;
    await this.logToFile(plugin, message, {
      ...additionalContext,
      operation: 'error',
      error: error,
      metadata: {
        errorContext: context,
        errorType: error?.constructor?.name || 'Unknown',
        errorMessage: error?.message || error?.toString() || 'Unknown error'
      }
    });
  }

  /**
   * Log específico para configurações
   */
  static async logSettings(plugin: Plugin, settings: ChatGPT_MDSettings, context?: string) {
    const message = `⚙️ CONFIGURAÇÕES: ${context || 'Configurações carregadas'}`;
    await this.logToFile(plugin, message, {
      operation: 'settings',
      settings: settings,
      metadata: {
        settingsContext: context,
        settingsKeys: Object.keys(settings)
      }
    });
  }

  /**
   * Log específico para performance
   */
  static async logPerformance(plugin: Plugin, operation: string, duration: number, metadata?: Record<string, any>) {
    const message = `⚡ PERFORMANCE: ${operation} - ${duration}ms`;
    await this.logToFile(plugin, message, {
      operation: 'performance',
      duration: duration,
      metadata: {
        performanceOperation: operation,
        ...metadata
      }
    });
  }

  /**
   * Garante que a pasta existe, criando se necessário
   */
  private static async ensureFolderExists(plugin: Plugin, folderPath: string): Promise<void> {
    try {
      const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await plugin.app.vault.createFolder(folderPath);
        console.log("✅ Pasta criada:", folderPath);
      } else {
        console.log("✅ Pasta já existe:", folderPath);
      }
    } catch (error) {
      console.error("❌ Erro ao criar pasta:", error);
      throw error;
    }
  }

  /**
   * Método de fallback para gravar log em local alternativo
   */
  private static async fallbackLog(plugin: Plugin, message: string, context?: LogContext, originalError?: any) {
    try {
      const fallbackPath = "ChatGPT_MD/logs/chatbot-groq-fallback.md";
      const timestamp = new Date().toISOString();
      const logEntry = this.createDetailedLogEntry(timestamp, `FALLBACK: ${message}`, context);
      
      console.log("🔄 Tentando gravar log de fallback em:", fallbackPath);
      
      // Garante que a pasta existe
      await this.ensureFolderExists(plugin, "ChatGPT_MD/logs");
      
      // Verifica se o arquivo de fallback existe
      const existingFile = plugin.app.vault.getAbstractFileByPath(fallbackPath);
      
      let content = "";
      
      if (existingFile instanceof TFile) {
        content = await plugin.app.vault.read(existingFile);
        content += "\n\n" + logEntry;
      } else {
        content = `# Chatbot Groq - Log de Fallback

> Log de emergência gerado automaticamente pelo plugin ChatGPT MD Groq

---

${logEntry}`;
      }
      
      await plugin.app.vault.create(fallbackPath, content);
      console.log("✅ Log de fallback gravado com sucesso");
      
    } catch (fallbackError) {
      console.error("❌ Erro no log de fallback:", fallbackError);
    }
  }

  /**
   * Método para testar se o log está funcionando
   */
  static async testLog(plugin: Plugin): Promise<boolean> {
    try {
      console.log("🧪 Iniciando teste de log detalhado...");
      
      // Teste básico
      await this.logToFile(plugin, "🧪 TESTE: Log detalhado está funcionando corretamente!", {
        operation: 'test',
        metadata: {
          testType: 'basic',
          testTime: new Date().toISOString()
        }
      });

      // Teste de performance
      const startTime = performance.now();
      await new Promise(resolve => setTimeout(resolve, 100));
      const duration = performance.now() - startTime;
      
      await this.logPerformance(plugin, 'test-operation', duration, {
        testType: 'performance',
        artificialDelay: 100
      });

      // Teste de erro simulado
      await this.logError(plugin, new Error('Erro de teste simulado'), 'Teste de sistema de erro', {
        operation: 'test',
        metadata: {
          testType: 'error-simulation'
        }
      });

      console.log("✅ Teste de log detalhado concluído com sucesso");
      return true;
    } catch (error) {
      console.error("❌ Teste de log detalhado falhou:", error);
      return false;
    }
  }

  /**
   * Método para verificar se o arquivo de log existe e mostrar informações
   */
  static async checkLogFile(plugin: Plugin): Promise<void> {
    try {
      let settings: ChatGPT_MDSettings;
      
      if ((plugin as any).serviceLocator) {
        const serviceLocator = (plugin as any).serviceLocator;
        const settingsService = serviceLocator.getSettingsService();
        settings = settingsService.getSettings();
      } else {
        settings = (plugin as any).settings ?? {};
      }

      const today = new Date().toISOString().split('T')[0];
      const logFolder = settings.detailedLogPath?.trim() || "ChatGPT_MD/logs";
      const logFileName = `chatbot-groq-${today}.md`;
      const logPath = `${logFolder}/${logFileName}`;
      
      const file = plugin.app.vault.getAbstractFileByPath(logPath);
      
      if (file instanceof TFile) {
        const content = await plugin.app.vault.read(file);
        const lines = content.split('\n').filter(line => line.trim());
        const logEntries = content.split('## 📝').length - 1;
        
        console.log("📄 Arquivo de log detalhado encontrado:", logPath);
        console.log("📊 Total de linhas:", lines.length);
        console.log("📝 Total de entradas de log:", logEntries);
        console.log("📅 Data do arquivo:", today);
        console.log("📏 Tamanho do arquivo:", content.length, "caracteres");
        
        // Mostra as últimas 3 entradas de log
        const sections = content.split('## 📝').slice(-3);
        console.log("📝 Últimas 3 entradas do log:");
        sections.forEach((section, index) => {
          const firstLine = section.split('\n')[0];
          console.log(`   ${index + 1}. ${firstLine.substring(0, 100)}...`);
        });
        
      } else {
        console.log("❌ Arquivo de log detalhado não encontrado:", logPath);
        console.log("💡 Verifique se o log detalhado está ativado nas configurações");
      }
      
    } catch (error) {
      console.error("❌ Erro ao verificar arquivo de log:", error);
    }
  }

  /**
   * Método para listar todos os arquivos de log
   */
  static async listLogFiles(plugin: Plugin): Promise<void> {
    try {
      let settings: ChatGPT_MDSettings;
      
      if ((plugin as any).serviceLocator) {
        const serviceLocator = (plugin as any).serviceLocator;
        const settingsService = serviceLocator.getSettingsService();
        settings = settingsService.getSettings();
      } else {
        settings = (plugin as any).settings ?? {};
      }

      const logFolder = settings.detailedLogPath?.trim() || "ChatGPT_MD/logs";
      
      // Lista todos os arquivos na pasta de log
      const files = plugin.app.vault.getFiles().filter(file => 
        file.path.startsWith(logFolder) && file.name.includes('chatbot-groq')
      );
      
      if (files.length > 0) {
        console.log("📁 Arquivos de log detalhado encontrados:");
        for (const file of files) {
          const content = await plugin.app.vault.read(file);
          const logEntries = content.split('## 📝').length - 1;
          console.log(`   📄 ${file.name} (${file.path}) - ${logEntries} entradas`);
        }
      } else {
        console.log("📁 Nenhum arquivo de log encontrado na pasta:", logFolder);
      }
      
    } catch (error) {
      console.error("❌ Erro ao listar arquivos de log:", error);
    }
  }
} 