# 🤖 Chatbot Interativo com Groq

## 📋 Visão Geral

Este plugin agora inclui um **chatbot interativo** que permite conversar com a IA Groq diretamente nos arquivos `.md` do Obsidian, mantendo o histórico da conversa.

## 🚀 Como Usar

### 1. **Ativar o Plugin**
- Vá em `Configurações` → `Plugins da Comunidade`
- Ative o plugin "ChatGPT MD"
- Configure sua chave da API Groq nas configurações

### 2. **Usar o Chatbot**
1. Abra um arquivo `.md` no Obsidian
2. Digite sua mensagem ou selecione um texto
3. Pressione `Ctrl+P` (ou `Cmd+P` no Mac)
4. Digite: **"Enviar mensagem ao chatbot Groq"**
5. Pressione Enter

### 3. **Resultado**
O plugin irá:
- Enviar sua mensagem para a Groq
- Receber a resposta da IA
- Inserir automaticamente no arquivo no formato:

```markdown
👤: Quem foi Alan Turing?

🤖: Alan Turing foi um matemático britânico, considerado o pai da ciência da computação...
```

## 🎯 Comandos Disponíveis

### 📝 **Enviar mensagem ao chatbot Groq**
- **Atalho**: `Ctrl+P` → "Enviar mensagem ao chatbot Groq"
- **Função**: Envia texto selecionado ou todo o conteúdo para a Groq
- **Resultado**: Insere resposta da IA no arquivo

### 🗑️ **Limpar histórico do chat**
- **Atalho**: `Ctrl+P` → "Limpar histórico do chat"
- **Função**: Limpa o histórico de conversa em memória
- **Resultado**: Chat volta ao estado inicial

## ⚙️ Configurações

### **Modelo Padrão**
- **Modelo**: `llama3-70b-8192`
- **Tokens máximos**: 500
- **Temperatura**: 0.7
- **Modo**: Não-streaming (resposta completa)

### **Personalização**
Para alterar as configurações, edite o arquivo `src/core/ChatCommand.ts`:

```typescript
const config = {
  ...DEFAULT_GROQ_CONFIG,
  model: "llama3-70b-8192", // Altere o modelo aqui
  max_tokens: 500,          // Altere o número de tokens
  temperature: 0.7,         // Altere a criatividade (0-1)
  stream: false             // true para streaming, false para resposta completa
};
```

## 🔧 Arquivos Implementados

### 📁 `src/core/ChatSession.ts`
- Gerencia o histórico de mensagens
- Métodos: `addMessage()`, `getContext()`, `reset()`

### 📁 `src/core/ChatCommand.ts`
- Comandos do chatbot interativo
- Integração com GroqService
- Tratamento de erros

### 📁 `src/main.ts`
- Registro dos comandos no plugin
- Inicialização do chatbot

## 🧪 Teste Rápido

1. **Crie um novo arquivo** `.md`
2. **Digite**: "Explique o que é inteligência artificial"
3. **Selecione o texto**
4. **Pressione**: `Ctrl+P` → "Enviar mensagem ao chatbot Groq"
5. **Aguarde** a resposta da Groq

## 💡 Dicas de Uso

### **Conversas Longas**
- O chatbot mantém o contexto da conversa
- Cada nova mensagem inclui o histórico anterior
- Use "Limpar histórico" para começar uma nova conversa

### **Seleção de Texto**
- **Com seleção**: Envia apenas o texto selecionado
- **Sem seleção**: Envia todo o conteúdo do arquivo

### **Formatação**
- As respostas são inseridas automaticamente
- Formato: `👤: [sua mensagem]` e `🤖: [resposta da IA]`

## 🐛 Solução de Problemas

### **Erro de API**
- Verifique se a chave da Groq está configurada
- Confirme se há conexão com a internet
- Verifique se a chave tem créditos disponíveis

### **Resposta Vazia**
- Tente reduzir o número de tokens
- Verifique se o modelo está disponível
- Teste com uma mensagem mais simples

### **Plugin Não Responde**
- Reinicie o Obsidian
- Verifique se o plugin está ativo
- Confirme se não há erros no console

## 🔮 Próximas Funcionalidades

- [ ] **Memória por arquivo**: Salvar histórico em cada `.md`
- [ ] **Modelos múltiplos**: Escolher entre diferentes modelos Groq
- [ ] **Templates de conversa**: Iniciar com prompts pré-definidos
- [ ] **Exportar conversas**: Salvar conversas em formato JSON
- [ ] **Interface visual**: Modal para conversas mais longas

---

**🎉 Agora você tem um chatbot interativo completo no Obsidian!** 