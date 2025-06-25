# Assist Groq Niky

🚀 A seamless integration of ChatGPT, OpenRouter.ai and local LLMs via Ollama into Obsidian. Integrando a opção de utilizar a Key do Groq ao inves da Openai

**Versão 3.2.5 - Por: Paulo Boaventura - Repositório: [https://github.com/PauloBoaventura/chatgpt-md-groq](https://github.com/PauloBoaventura/chatgpt-md-groq)**

![Chatting with links about vacation plans](images/chat-with-link.gif)

## What's New in v3.2.5 🚀
- **🤖 Chatbot Interativo com Groq**: Novo sistema de chat interativo que permite conversar com a IA Groq diretamente nos arquivos `.md`
- **🇧🇷 Suporte ao Português Brasileiro**: Idioma português brasileiro adicionado como opção padrão
- **🌐 GPT-4o Web Search Integration**: Experience the power of `gpt-4o-search-preview` - now your conversations can directly access and cite information from the web, bringing real-time knowledge into your notes
- **Enhanced Model Support**: Added compatibility with OpenAI's latest models:
  - **Reasoning Models**: Full support for o1, o3, and o4-mini models designed for complex reasoning tasks
  - **Next-Gen GPT Models**: Access to gpt-4.1 (Flagship GPT model for complex tasks) and gpt-4.5 (Largest and most capable GPT model)
- **Better Default Settings**: Upgraded from gpt-4o-mini to the more capable but still cost-effective gpt-4.1-mini
- **Smart Parameter Handling**: Automatically omits breaking parameters when using search models
- **Improved Model Filtering**: Better filtering of non-chat models from model selection lists

## A simple and quick Start 🏁
Get started in just a few simple steps:

1. **Install Assist Groq Niky**: Go to `Settings > Community Plugins > Browse`, search for `Assist Groq Niky` and click `Install`.
2. **Add your API keys**: In the plugin settings, add your OpenAI API key, Groq API key, OpenRouter.ai API key, and/or install Ollama and local LLMs of your choice.
3. **Start chatting**: Use the `Assist Groq Niky: Chat` command (`cmd + p` or `ctrl + p`) to start a conversation from any note.
4. **Use Interactive Chatbot**: Use the `Enviar mensagem ao chatbot Groq` command for interactive conversations with Groq.

💡 *Pro tip*: Set up a hotkey for the best experience! Go to `Settings > Hotkeys`, search for `Assist Groq Niky: Chat` and add your preferred keybinding (e.g., `cmd + j`).

Start chatting, don't worry too much about the more advanced features. They will come naturally :-) 

## Features
* **Interactive conversations**: 
  * Engage directly with ChatGPT, OpenRouter.ai models, and Ollama from any Markdown note, edit questions or responses on-the-fly, and continue the chat seamlessly.
* **🤖 Chatbot Interativo com Groq**: 
  * Sistema de chat interativo que mantém histórico de conversas e permite conversar diretamente com a IA Groq.
* **Privacy & Zero API Costs:** 
  * Use local LLMs via Ollama, keeping your chats on your computer and avoiding API costs.
* **Web Access Models:**
  * Get real-time information from the web with OpenAI's `gpt-4o-search-preview` and Perplexity's `openrouter@perplexity/llama-3.1-sonar-small-128k-online` (via openrouter.ai).
* **Multiple AI Providers:**
  * Choose from OpenAI, Groq, OpenRouter.ai (with access to models like Gemini, Claude, DeepSeek, Llama, Perplexity), or local models via Ollama.
* **System Commands:** 
  * Instruct the LLM via system commands to get the best possible answers.
* **Link context**: 
  * Provide links to any other note in your vault for added context during conversations with Markdown or Wiki links.
* **Per-note Configuration:** 
  * Overwrite default settings via frontmatter for individual notes using params from [OpenAI API](https://platform.openai.com/docs/api-reference/chat), [Groq API](https://console.groq.com/docs), [OpenRouter.ai](https://openrouter.ai/docs), or [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion).
* **Markdown Support:** 
  * Enjoy full rendering of lists, code blocks, and more from all responses.
* **Minimal Setup:** 
  * Utilize your OpenAI API key, Groq API key, OpenRouter.ai API key, or install any LLM locally via Ollama.
* **Comment Blocks:** 
  * Ignore parts of your notes using comment blocks.
* **Chat Templates**: 
  * Use and share frontmatter templates for recurring scenarios. Explore [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates).

## Privacy and Security

Assist Groq Niky is 
- only storing data locally in your vault, with zero tracking and no 3rd party integrations except direct calls to the AI APIs (OpenAI, Groq, OpenRouter.ai).
- allowing you to use Ollama, a local LLM installation for offline conversation-based knowledge exploration.

### Default Configuration
The plugin comes with a well-balanced pre-configuration to get you started immediately. 
You can change the global settings or use the local parameters in any note via frontmatter
(start typing `---` in the first line of your note to add properties)
```
---
system_commands: ['I am a helpful assistant.']
temperature: 0.3
top_p: 1
max_tokens: 300
presence_penalty: 0.5
frequency_penalty: 0.5
stream: true
stop: null
n: 1
model: gpt-4.1-mini

# Service-specific URLs (optional, will use global settings if not specified)
openaiUrl: https://api.openai.com
groqUrl: https://api.groq.com
# openrouterUrl: https://openrouter.ai
# ollamaUrl: http://localhost:11434
---
```
💡 Pro tip: Increasing `max_tokens` to a higher value e.g. `4096` for more complex tasks like reasoning, coding or text creation.
The default model `gpt-4.1-mini` is a good compromise between fast and cheap responses. Change this if you have more complex needs.

### Multi Model Chats
You can set and change the model for each request in your note. 
Specify the `model` property via frontmatter:

for openAI models
```
---
model: gpt-4o
system_commands: [act as a senior javascript developer]
---
```
for Groq models
```
---
model: llama3-70b-8192
aiService: groq
system_commands: [act as a helpful assistant]
---
```
prefix it with `local@` for Ollama for local LLMs.
```
---
model: local@gemma2:27b
temperature: 1
---
```


The AI responses will keep the used model name in the response title for future reference.
You can find the list of your installed Ollama model names from your terminal via `ollama list` or the available openAI model names online on this [openAI models](https://platform.openai.com/docs/models) page.

### Service URLs
Each AI service has its own dedicated URL parameter that can be configured globally in settings or per-note via frontmatter:

```
---
# For OpenAI
openaiUrl: https://api.openai.com

# For Groq
groqUrl: https://api.groq.com

# For OpenRouter
openrouterUrl: https://openrouter.ai

# For Ollama
ollamaUrl: http://localhost:11434
---
```

The default URLs are:
- OpenAI: `https://api.openai.com`
- Groq: `https://api.groq.com`
- OpenRouter: `https://openrouter.ai`
- Ollama: `http://localhost:11434`

Note: Previous versions used a single `url` parameter which is now deprecated. Please update your templates and notes to use the service-specific URL parameters.

### Commands 👨‍💻
Run commands from Obsidian's command pallet via `cmd + p` or `ctrl + p` and start typing `assist groq` or set hotkeys
(a chat command hotkey is highly recommended for effortless chats (I use `cmd + j`, which works fantastic, because your index finger is already resting on that key)).

#### Main Commands
- **Chat**: Parse the file and interact with ChatGPT. Assign a hotkey, e.g. `cmd + j`.
- **Enviar mensagem ao chatbot Groq**: Interactive chatbot with Groq that maintains conversation history.
- **Limpar histórico do chat**: Clear the interactive chat history.
  
#### Creation Commands
- **New Chat with Highlighted Text**: Start a chat using highlighted text and default frontmatter in `Chat Folder`.
- **New Chat From Template**: Create chats from templates in `Chat Template Folder`.

#### Utility Commands
- **Infer Title**: Automatically generate a note title based on the notes content. Configurable to auto-run after 4+ messages.
- **Add Comment Block**: Insert comment blocks for parts of your note that should be ignored.
- **Select Model**: Choose from all available LLMs (OpenAI, Groq, OpenRouter.ai, Ollama) and set the current model for your note.

#### Maintenance Commands
- **Clear Chat**: Remove all messages while retaining frontmatter.
- **Stop Streaming (Desktop Only)**: Halt ongoing streams if necessary.

#### Formatting Tools
- **Add Divider**: Insert horizontal rulers to organize content visually.

## Beta Testing 🧪
Want to try the latest features before they're officially released? You can beta test Assist Groq Niky using the [BRAT (Beta Reviewer's Auto-update Tool)](https://github.com/TfTHacker/obsidian42-brat) community plugin:

1. Install the BRAT plugin from Obsidian's Community Plugins
2. Open BRAT settings and add `PauloBoaventura/chatgpt-md-groq` as a beta plugin
3. Select "latest version" from the dropdown in the BRAT plugin settings
4. Enable the Assist Groq Niky plugin in your community plugins list

This gives you early access to new features while they're still being developed and tested.

⚠️ **WARNING**: Beta testing is dangerous and happens at your own risk. Always test beta versions on a new empty vault, not on your main vault. Beta features can break and possibly lead to data loss.

## FAQs ❓
#### How do I start chatting with Assist Groq Niky?
Use the `Assist Groq Niky: Chat` command from the Obsidian command Palette (`cmd + p` or `ctrl + p`) to start a conversation from any note.

#### How do I use the interactive Groq chatbot?
Use the `Enviar mensagem ao chatbot Groq` command to start an interactive conversation with Groq that maintains conversation history.

#### Can I set up a hotkey for the `Assist Groq Niky: Chat` command?
Yes, you should! Go to `Settings > Hotkeys`, search for `Assist Groq Niky: Chat` and add your preferred keybinding (e.g., `cmd + j`).

#### How do I use chat and reasoning models?
You can use OpenAI's GPT 3 and 4 models, Groq models (like llama3-70b-8192), various models through OpenRouter.ai (like Claude, Gemini, DeepSeek, Llama, Perplexity), or any model you have installed via Ollama.
DeepSeek-r1:7b works great for reasoning locally via Ollama.

#### How do I use a custom endpoint?
Ensure your custom API adheres to OpenAI's specifications, such as Azure's hosted endpoints. Consult your provider for API key management details.

#### Where should I add my API keys?
In the plugin settings, add your OpenAI API key, Groq API key, OpenRouter.ai API key, and/or install Ollama and local LLMs of your choice.

#### What happened to the 'url' parameter in the frontmatter?
The single 'url' parameter is now deprecated. In v2.2.0 and higher, we've introduced service-specific URL parameters: `openaiUrl`, `groqUrl`, `openrouterUrl`, and `ollamaUrl`. This allows for more flexibility and clarity when configuring different services. Please update your templates and notes accordingly.

🤖 Enjoy exploring the power of Assist Groq Niky in your Obsidian vault!🚀

## Contributions Welcome 🤝
Pull requests, bug reports, and all other forms of contribution are welcomed and highly encouraged!* :octocat:

## About the Developer ✍️
Paulo Boaventura is the developer of Assist Groq Niky, a fork of ChatGPT MD that integrates Groq API support and interactive chatbot functionality. The plugin is designed to provide seamless AI assistance within Obsidian while maintaining privacy and offering multiple AI provider options.

**Repository**: [https://github.com/PauloBoaventura/chatgpt-md-groq](https://github.com/PauloBoaventura/chatgpt-md-groq)

Happy writing with Assist Groq Niky! 💻 🎉
