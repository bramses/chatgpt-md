# Integração Groq no ChatGPT MD

Este documento explica como usar o **Groq** com o plugin ChatGPT MD para Obsidian.

## 🚀 Configuração Rápida

### 1. Obter Chave da API Groq

1. Acesse [console.groq.com](https://console.groq.com)
2. Crie uma conta ou faça login
3. Vá para "API Keys" e crie uma nova chave
4. Copie a chave (formato: `sk-...`)

### 2. Configurar no Obsidian

1. Abra as configurações do plugin ChatGPT MD
2. Na seção "API Keys", adicione sua chave Groq
3. Na seção "Service URLs", verifique se a URL está como `https://api.groq.com`

## 📝 Como Usar

### Método 1: Frontmatter Específico

Crie um arquivo `.md` com o seguinte frontmatter:

```yaml
---
aiService: groq
model: llama3-70b-8192
temperature: 1
max_tokens: 300
stream: true
---
```

### Método 2: Configuração Padrão

Configure o Groq como serviço padrão no frontmatter padrão das configurações:

```yaml
---
system_commands: ['I am a helpful assistant.']
frequency_penalty: 0
max_tokens: 300
model: llama3-70b-8192
presence_penalty: 0
stream: true
temperature: 1
aiService: groq
---
```

## 🤖 Modelos Disponíveis

O Groq oferece os seguintes modelos:

- **llama3-70b-8192** (padrão) - Modelo mais rápido e eficiente
- **llama3-8b-8192** - Versão mais leve
- **mixtral-8x7b-32768** - Modelo Mixtral
- **gemma-7b-it** - Modelo Gemma

## ⚙️ Parâmetros Suportados

- `model`: Nome do modelo Groq
- `temperature`: Controle de criatividade (0-2)
- `max_tokens`: Máximo de tokens na resposta
- `top_p`: Controle de diversidade (0-1)
- `presence_penalty`: Penalidade por repetição (-2 a 2)
- `frequency_penalty`: Penalidade por frequência (-2 a 2)
- `stream`: Streaming de resposta (true/false)

## 🔧 Exemplo de Uso

```yaml
---
aiService: groq
model: llama3-70b-8192
temperature: 0.7
max_tokens: 500
stream: true
system_commands: ['You are a helpful coding assistant.']
---

role::user
Como posso implementar um algoritmo de ordenação em JavaScript?

role::assistant
Aqui estão algumas implementações de algoritmos de ordenação em JavaScript:

## Bubble Sort
```javascript
function bubbleSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            }
        }
    }
    return arr;
}
```

## Quick Sort
```javascript
function quickSort(arr) {
    if (arr.length <= 1) return arr;
    
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = arr.filter(x => x < pivot);
    const middle = arr.filter(x => x === pivot);
    const right = arr.filter(x => x > pivot);
    
    return [...quickSort(left), ...middle, ...quickSort(right)];
}
```

## Vantagens do Groq

- ⚡ **Velocidade**: Respostas muito rápidas
- 💰 **Custo**: Preços competitivos
- 🔒 **Privacidade**: Dados não são usados para treinamento
- 🌐 **Disponibilidade**: Alta disponibilidade da API

## 🛠️ Solução de Problemas

### Erro 401 - Chave Inválida
- Verifique se a chave da API está correta
- Certifique-se de que a chave não expirou

### Erro 429 - Rate Limit
- O Groq tem limites de taxa por minuto
- Aguarde alguns segundos e tente novamente

### Modelo Não Encontrado
- Verifique se o nome do modelo está correto
- Use um dos modelos listados acima

## 📚 Recursos Adicionais

- [Documentação da API Groq](https://console.groq.com/docs)
- [Console Groq](https://console.groq.com)
- [Modelos Disponíveis](https://console.groq.com/docs/models)

---

**Nota**: Esta integração foi implementada seguindo o padrão dos outros serviços do plugin ChatGPT MD, garantindo compatibilidade total com a estrutura existente. 