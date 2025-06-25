import { Plugin, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import { ServiceLocator } from "./core/ServiceLocator";
import { CommandRegistry } from "./core/CommandRegistry";
import { registerChatCommand } from "./core/ChatCommand";
import { ChatView, VIEW_TYPE_CHATBOT_GROQ } from "./ui/ChatView";
import { LogHelperDetailed } from "./Utilities/LogHelperDetailed";

export default class ChatGPT_MD extends Plugin {
  public serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;

  async onload() {
    // Log de início de carregamento
    await LogHelperDetailed.logToFile(this, "🚀 Iniciando carregamento do plugin Chatbot Groq", {
      operation: 'plugin_load_start',
      metadata: {
        pluginVersion: this.manifest.version,
        vaultName: this.app.vault.getName(),
        timestamp: new Date().toISOString()
      }
    });

    // Carregar estilos CSS
    this.loadStyles();

    // Initialize service locator with plugin instance
    this.serviceLocator = new ServiceLocator(this.app, this);

    // Get settings service and ensure migrations run first
    const settingsService = this.serviceLocator.getSettingsService();
    await settingsService.loadSettings();
    await settingsService.migrateSettings();

    // Log das configurações carregadas
    await LogHelperDetailed.logSettings(this, settingsService.getSettings(), "Configurações carregadas no startup");

    // Add settings tab after migrations have completed
    await settingsService.addSettingTab();

    // Initialize command registry with services
    this.commandRegistry = new CommandRegistry(this, this.serviceLocator, settingsService);
    this.commandRegistry.registerCommands();

    // Register interactive chat commands
    registerChatCommand(this);

    // Registrar a view do chatbot
    this.registerView(
      VIEW_TYPE_CHATBOT_GROQ,
      (leaf: WorkspaceLeaf) => new ChatView(leaf, this)
    );

    // Adiciona ícone no menu lateral (ribbon) - agora abre o painel de chat
    this.addRibbonIcon("bot", "Abrir Chatbot Groq", async () => {
      await this.activateChatView();
    });

    // Adicionar comando para testar o log
    this.addCommand({
      id: 'test-log-system',
      name: 'Testar Sistema de Log Detalhado',
      callback: async () => {
        const settings = settingsService.getSettings();
        if (!settings.enableDetailedLog) {
          new Notice("❌ Log detalhado está desabilitado nas configurações!");
          return;
        }
        
        const success = await LogHelperDetailed.testLog(this);
        if (success) {
          new Notice("✅ Teste de log detalhado realizado com sucesso! Verifique o arquivo de log.");
        } else {
          new Notice("❌ Teste de log detalhado falhou! Verifique o console para detalhes.");
        }
      }
    });

    // Adicionar comando para verificar o arquivo de log
    this.addCommand({
      id: 'check-log-file',
      name: 'Verificar Arquivo de Log Detalhado',
      callback: async () => {
        await LogHelperDetailed.checkLogFile(this);
        new Notice("📄 Informações do arquivo de log detalhado mostradas no console!");
      }
    });

    // Adicionar comando para listar todos os arquivos de log
    this.addCommand({
      id: 'list-log-files',
      name: 'Listar Todos os Arquivos de Log',
      callback: async () => {
        await LogHelperDetailed.listLogFiles(this);
        new Notice("📁 Lista de arquivos de log mostrada no console!");
      }
    });

    // Adicionar comando para testar todos os tipos de log de desenvolvedor
    this.addCommand({
      id: 'test-all-log-types',
      name: 'Testar Todos os Tipos de Log de Desenvolvedor',
      callback: async () => {
        const settings = settingsService.getSettings();
        if (!settings.enableDetailedLog) {
          new Notice("❌ Log detalhado está desabilitado nas configurações!");
          return;
        }
        
        try {
          console.log("🧪 Iniciando teste completo de todos os tipos de log...");
          
          // Teste de input do usuário
          await LogHelperDetailed.logUserInput(this, {
            testType: 'user_input_test',
            content: 'Teste de input do usuário',
            timestamp: new Date().toISOString()
          }, 'Teste de captura de input do usuário');

          // Teste de requisição HTTP
          await LogHelperDetailed.logHttpRequest(this, 'https://api.test.com', 'POST', {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          }, {
            test: true,
            message: 'Teste de requisição HTTP'
          }, {
            operation: 'test',
            metadata: { testType: 'http_request' }
          });

          // Teste de resposta HTTP
          await LogHelperDetailed.logHttpResponse(this, 'https://api.test.com', 200, {
            'Content-Type': 'application/json',
            'X-Test-Header': 'test-value'
          }, {
            success: true,
            data: 'Teste de resposta HTTP'
          }, {
            operation: 'test',
            metadata: { testType: 'http_response' }
          });

          // Teste de evento do sistema
          await LogHelperDetailed.logSystemEvent(this, 'test_system_event', {
            testType: 'system_event_test',
            timestamp: new Date().toISOString()
          }, {
            operation: 'test',
            metadata: { testType: 'system_event' }
          });

          // Teste de ação do usuário
          await LogHelperDetailed.logUserAction(this, 'test_user_action', {
            testType: 'user_action_test',
            timestamp: new Date().toISOString()
          }, {
            operation: 'test',
            metadata: { testType: 'user_action' }
          });

          // Teste de performance
          const startTime = performance.now();
          await new Promise(resolve => setTimeout(resolve, 50));
          const duration = performance.now() - startTime;
          
          await LogHelperDetailed.logPerformance(this, 'test_performance', duration, {
            testType: 'performance_test',
            artificialDelay: 50
          });

          // Teste de erro simulado
          await LogHelperDetailed.logError(this, new Error('Erro de teste simulado para desenvolvedor'), 'Teste de sistema de erro detalhado', {
            operation: 'test',
            metadata: {
              testType: 'error_simulation',
              errorPurpose: 'developer_testing'
            }
          });

          new Notice("✅ Teste completo de todos os tipos de log realizado com sucesso!");
          console.log("✅ Teste completo de todos os tipos de log concluído com sucesso");
          
        } catch (error) {
          console.error("❌ Teste completo de log falhou:", error);
          new Notice("❌ Teste completo de log falhou! Verifique o console para detalhes.");
        }
      }
    });

    // Adicionar comando para testar a configuração da Groq
    this.addCommand({
      id: 'test-groq-configuration',
      name: 'Testar Configuração da Groq',
      callback: async () => {
        try {
          const settings = settingsService.getSettings();
          const groqService = this.serviceLocator.getAiApiService('groq') as any;
          
          if (groqService && typeof groqService.testConfiguration === 'function') {
            const result = await groqService.testConfiguration(settings);
            
            if (result.success) {
              new Notice("✅ " + result.message.split('\n')[0]);
              console.log("✅ Teste da configuração da Groq:", result.message);
            } else {
              new Notice("❌ " + result.message);
              console.error("❌ Teste da configuração da Groq falhou:", result.message);
            }
          } else {
            new Notice("❌ Serviço Groq não disponível para teste");
            console.error("❌ Serviço Groq não disponível para teste");
          }
        } catch (error) {
          console.error("❌ Erro ao testar configuração da Groq:", error);
          new Notice("❌ Erro ao testar configuração da Groq: " + error);
        }
      }
    });

    // Initialize available models after registry is created, but don't block startup
    // Run model initialization in the background
    this.commandRegistry.initializeAvailableModels().catch((error) => {
      console.error("[ChatGPT MD] Error initializing models in background:", error);
      LogHelperDetailed.logError(this, error, "Erro ao inicializar modelos em background");
    });

    // Log de inicialização bem-sucedida
    await LogHelperDetailed.logToFile(this, "🚀 Plugin Chatbot Groq inicializado com sucesso", {
      operation: 'plugin_startup',
      metadata: {
        pluginVersion: this.manifest.version,
        vaultName: this.app.vault.getName(),
        servicesInitialized: {
          serviceLocator: !!this.serviceLocator,
          settingsService: !!settingsService,
          commandRegistry: !!this.commandRegistry
        }
      }
    });

    // Log do evento do sistema
    await LogHelperDetailed.logSystemEvent(this, "plugin_loaded", {
      pluginVersion: this.manifest.version,
      vaultName: this.app.vault.getName(),
      servicesInitialized: {
        serviceLocator: !!this.serviceLocator,
        settingsService: !!settingsService,
        commandRegistry: !!this.commandRegistry
      },
      timestamp: new Date().toISOString()
    }, {
      operation: 'system_event',
      metadata: {
        eventType: 'plugin_loaded',
        pluginVersion: this.manifest.version
      }
    });

    console.log("🤖 Plugin Chatbot Groq com painel lateral ativado");
  }

  private loadStyles() {
    // Carregar estilos CSS do plugin
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = this.app.vault.adapter.getResourcePath('styles.css');
    document.head.appendChild(link);
  }

  async activateChatView() {
    // Log da tentativa de ativação
    await LogHelperDetailed.logUserAction(this, "activate_chat_view", {
      timestamp: new Date().toISOString()
    }, {
      operation: 'user_action',
      metadata: {
        actionType: 'activate_chat_view'
      }
    });

    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT_GROQ);
    if (leaves.length === 0) {
      // Abrir o painel no lado direito
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_CHATBOT_GROQ,
          active: true,
        });

        // Log de sucesso
        await LogHelperDetailed.logSystemEvent(this, "chat_view_activated", {
          method: 'new_leaf',
          timestamp: new Date().toISOString()
        }, {
          operation: 'system_event',
          metadata: {
            eventType: 'chat_view_activated',
            method: 'new_leaf'
          }
        });
      } else {
        new Notice("Não foi possível abrir o painel lateral do Chatbot.");
        await LogHelperDetailed.logError(this, new Error("Falha ao abrir painel"), "Não foi possível abrir o painel lateral", {
          operation: 'error',
          metadata: {
            errorType: 'view_activation_failed',
            reason: 'no_right_leaf_available'
          }
        });
      }
    } else {
      // Se já existe, apenas revelar
      this.app.workspace.revealLeaf(leaves[0]);

      // Log de sucesso
      await LogHelperDetailed.logSystemEvent(this, "chat_view_revealed", {
        method: 'reveal_existing',
        timestamp: new Date().toISOString()
      }, {
        operation: 'system_event',
        metadata: {
          eventType: 'chat_view_revealed',
          method: 'reveal_existing'
        }
      });
    }
  }

  onunload() {
    // Log de início de desligamento
    LogHelperDetailed.logToFile(this, "🔄 Iniciando desligamento do plugin Chatbot Groq", {
      operation: 'plugin_unload_start',
      metadata: {
        shutdownTime: new Date().toISOString(),
        reason: 'plugin_unload'
      }
    });

    // Limpar todas as views do chatbot ao descarregar o plugin
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATBOT_GROQ).forEach((leaf) => leaf.detach());
    
    // Log do evento do sistema
    LogHelperDetailed.logSystemEvent(this, "plugin_unloaded", {
      shutdownTime: new Date().toISOString(),
      reason: 'plugin_unload',
      timestamp: new Date().toISOString()
    }, {
      operation: 'system_event',
      metadata: {
        eventType: 'plugin_unloaded',
        reason: 'plugin_unload'
      }
    });
    
    // Log de desligamento
    LogHelperDetailed.logToFile(this, "🔄 Plugin Chatbot sendo descarregado", {
      operation: 'plugin_shutdown',
      metadata: {
        shutdownTime: new Date().toISOString(),
        reason: 'plugin_unload'
      }
    });
    
    console.log("🧹 Plugin Chatbot descarregado");
  }
}
