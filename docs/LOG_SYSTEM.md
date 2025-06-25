# Sistema de Log Detalhado - Chatbot Groq

## Visão Geral

O sistema de log detalhado do plugin Chatbot Groq foi projetado para capturar todos os detalhes técnicos, inputs do usuário, erros e eventos do sistema, facilitando o debug e desenvolvimento.

## Configuração

### Ativar Log Detalhado

1. Abra as configurações do plugin
2. Ative a opção "Log Detalhado"
3. Configure o caminho da pasta de log (padrão: `ChatGPT_MD/logs`)

### Estrutura dos Arquivos de Log

Os logs são salvos como arquivos Markdown organizados por data:
- `chatbot-groq-YYYY-MM-DD.md` - Log principal do dia
- `chatbot-groq-fallback.md` - Log de emergência

## Tipos de Log Disponíveis

### 1. Log Básico
```typescript
await LogHelperDetailed.logToFile(plugin, "Mensagem", context);
```

### 2. Log de Input do Usuário
```typescript
await LogHelperDetailed.logUserInput(plugin, inputData, context, additionalContext);
```

### 3. Log de Operações de Chat
```typescript
await LogHelperDetailed.logChatOperation(plugin, operation, details, context);
```

### 4. Log de Operações da API
```typescript
await LogHelperDetailed.logApiOperation(plugin, service, operation, details, context);
```

### 5. Log de Erros Detalhado
```typescript
await LogHelperDetailed.logError(plugin, error, context, additionalContext);
```

### 6. Log de Requisições HTTP
```typescript
await LogHelperDetailed.logHttpRequest(plugin, url, method, headers, body, context);
```

### 7. Log de Respostas HTTP
```typescript
await LogHelperDetailed.logHttpResponse(plugin, url, status, headers, body, context);
```

### 8. Log de Eventos do Sistema
```typescript
await LogHelperDetailed.logSystemEvent(plugin, event, details, context);
```

### 9. Log de Ações do Usuário
```typescript
await LogHelperDetailed.logUserAction(plugin, action, details, context);
```

### 10. Log de Performance
```typescript
await LogHelperDetailed.logPerformance(plugin, operation, duration, metadata);
```

## Contexto de Log (LogContext)

O `LogContext` permite capturar informações detalhadas:

```typescript
interface LogContext {
  operation?: string;           // Tipo de operação
  userId?: string;             // ID do usuário
  messageId?: string;          // ID da mensagem
  apiService?: string;         // Serviço de API
  model?: string;              // Modelo usado
  tokens?: number;             // Número de tokens
  duration?: number;           // Duração em ms
  error?: any;                 // Objeto de erro
  settings?: Partial<ChatGPT_MDSettings>; // Configurações
  metadata?: Record<string, any>; // Metadados adicionais
  
  // Campos específicos para desenvolvedor
  inputData?: any;             // Dados de entrada
  outputData?: any;            // Dados de saída
  requestHeaders?: Record<string, string>; // Headers da requisição
  responseHeaders?: Record<string, string>; // Headers da resposta
  requestBody?: any;           // Body da requisição
  responseBody?: any;          // Body da resposta
  stackTrace?: string;         // Stack trace personalizado
  callStack?: string[];        // Call stack
  performanceMetrics?: Record<string, number>; // Métricas de performance
  environmentInfo?: Record<string, any>; // Informações do ambiente
  userActions?: string[];      // Ações do usuário
  systemState?: Record<string, any>; // Estado do sistema
}
```

## Exemplos de Uso

### Log de Input do Usuário
```typescript
await LogHelperDetailed.logUserInput(plugin, {
  messageId: "msg_123",
  content: "Olá, como você está?",
  length: 20,
  timestamp: new Date().toISOString(),
  inputType: 'chat_message'
}, 'Mensagem do usuário enviada', {
  operation: 'chat_send',
  messageId: "msg_123",
  metadata: {
    inputLength: 20,
    chatHistoryLength: 5
  }
});
```

### Log de Erro Detalhado
```typescript
try {
  // Código que pode gerar erro
} catch (error) {
  await LogHelperDetailed.logError(plugin, error, "Erro no processamento da mensagem", {
    operation: 'chat_error',
    messageId: "msg_123",
    apiService: 'Groq',
    metadata: {
      errorType: error.constructor.name,
      errorMessage: error.message,
      chatHistoryLength: 5
    }
  });
}
```

### Log de Requisição HTTP
```typescript
await LogHelperDetailed.logHttpRequest(plugin, 
  'https://api.groq.com/v1/chat/completions', 
  'POST', 
  {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer [REDACTED]'
  }, 
  {
    messages: messages,
    model: "gemma-7b-it",
    max_tokens: 300
  }, 
  {
    operation: 'api_request',
    apiService: 'Groq',
    messageId: "msg_123"
  }
);
```

## Comandos de Teste

O plugin inclui comandos para testar o sistema de log:

1. **Testar Sistema de Log Detalhado** - Teste básico do sistema
2. **Verificar Arquivo de Log Detalhado** - Mostra informações do arquivo atual
3. **Listar Todos os Arquivos de Log** - Lista todos os arquivos de log
4. **Testar Todos os Tipos de Log de Desenvolvedor** - Teste completo de todos os tipos

## Estrutura do Arquivo de Log

Cada entrada de log inclui:

```markdown
## 📝 25/12/2024 14:30:45

**Mensagem:** 🤖 user_message_sent: {"messageId":"msg_123","content":"Olá"}

**Timestamp:** 2024-12-25T17:30:45.123Z
**Operação:** chat_send
**ID da Mensagem:** msg_123

### 📥 Dados de Input
```json
{
  "messageId": "msg_123",
  "content": "Olá",
  "length": 3,
  "timestamp": "2024-12-25T17:30:45.123Z"
}
```

### ⚙️ Configurações Relevantes
**Log Detalhado:** ✅ Ativado
**Pasta de Log:** ChatGPT_MD/logs
**Stream:** ❌ Desativado

### 📊 Metadados
**inputLength:** 3
**chatHistoryLength:** 1

### 💻 Informações do Sistema
**User Agent:** Mozilla/5.0...
**Plataforma:** Win32
**Memória:** 45MB / 128MB
**Tempo de Carregamento:** 1234.56ms

---
```

## Boas Práticas

1. **Sempre inclua contextos relevantes** - Use o `LogContext` para adicionar informações úteis
2. **Capture inputs e outputs** - Use `inputData` e `outputData` para debug
3. **Log erros com detalhes** - Inclua stack traces e informações de contexto
4. **Use IDs únicos** - Para rastrear operações específicas
5. **Monitore performance** - Use logs de performance para otimização
6. **Teste regularmente** - Use os comandos de teste para verificar o sistema

## Troubleshooting

### Log não está sendo gravado
1. Verifique se o log detalhado está ativado nas configurações
2. Verifique se a pasta de log existe e tem permissões
3. Use o comando "Verificar Arquivo de Log Detalhado"

### Arquivo de log muito grande
1. Considere implementar rotação de logs
2. Limpe logs antigos periodicamente
3. Ajuste o nível de detalhamento conforme necessário

### Performance impactada
1. Use logs assíncronos quando possível
2. Evite logs excessivos em loops
3. Considere desativar logs em produção se necessário

## Integração com Ferramentas de Debug

O sistema de log pode ser integrado com:
- **Console do navegador** - Logs aparecem no console
- **Ferramentas de desenvolvimento** - Para análise de performance
- **Sistemas de monitoramento** - Para alertas e métricas
- **Análise de logs** - Para insights de uso 