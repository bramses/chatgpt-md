# ChatGPT MD Changelog

## v3.0.0 (December 2025) - Privacy-First AI Tool Calling

### 🎯 Major Features

- **Privacy-First Tool Calling System**: AI assistants can now search your vault, read files, and search the web—with explicit human approval at every step
  - Three-layer approval architecture: approve execution → review results → approve sharing
  - No data reaches the LLM without your explicit consent
  - All tools disabled by default (opt-in feature)
- **Vault Search Tool**: AI can discover relevant notes in your vault
  - Multi-word OR search (matches ANY query word)
  - Searches both filenames and file content
  - Interactive results review: you select which files to share
  - Automatically excludes current file from search results
- **File Read Tool**: AI can request access to specific files
  - Granular file selection in approval modal
  - Full content reading with user consent
  - Batch reading support for multiple files
- **Web Search Tool (Experimental)**: AI can search the web using privacy-focused Brave Search API
  - 1,000 free queries/month with Brave Search API
  - Review and filter web results before sharing
  - Custom search provider support for self-hosted solutions
  - Optional full page content fetching

### 🔒 Privacy & Control

- **Human-in-the-Loop Architecture**: Every tool call requires explicit user approval before execution and before data sharing
- **Multi-Stage Approval Process**:
  1. Tool execution approval: see what the AI wants to do
  2. Results review: see what the tool found
  3. Selective sharing: choose exactly which results to share with AI
- **Data Minimization**: Share only the specific results you approve—nothing more
- **Full Transparency**: All tool requests displayed with clear descriptions of what will happen
- **Audit Trail**: Debug mode logs all tool calls and decisions for troubleshooting
- **Local Storage**: All API keys stored locally in Obsidian settings

### 🏗️ Technical Architecture

- **New Service Layer**:
  - `ToolService`: Orchestrates tool calling with approval workflow
  - `ToolRegistry`: Manages available tools and their configurations
  - `ToolExecutor`: Executes approved tools with security checks
  - `VaultTools`: Vault-specific tool implementations
  - `WebSearchService`: Web search integration with Brave Search API
  - `StreamingHandler`: Refactored streaming response processor
  - `Logger`: Comprehensive debug logging utility
- **Type-Safe Tool System**: Complete TypeScript interfaces for tools, approvals, and results
- **AI Service Refactoring**: All 6 AI services updated to support tool calling
  - OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio
  - Consistent tool interface across all providers
  - Improved streaming response handling
  - Better error handling and user feedback

### 🎨 User Interface

- **ToolApprovalModal**: Interactive modal for approving tool execution requests
  - Shows tool name, parameters, and description
  - File selection UI for file_read tool
  - Clear approve/cancel actions
- **SearchResultsApprovalModal**: Review and filter vault search results
  - Preview of found files with metadata
  - Multi-select interface for granular control
  - Shows file paths, names, and match counts
- **WebSearchApprovalModal**: Review and filter web search results
  - Displays titles, URLs, and snippets
  - Multi-select interface for result filtering
  - Preview of web content before sharing

### ⚙️ Configuration & Settings

- **New Settings Section**: "Tool Calling" with comprehensive configuration options
  - Enable/disable tool calling (disabled by default)
  - Enable/disable web search
  - Brave Search API key configuration
  - Custom search provider support
  - Maximum web search results (1-10)
  - Debug mode for detailed logging
- **Frontmatter Support**: Per-note tool calling configuration (coming soon)
- **Provider Flexibility**: Use Brave Search (default) or custom search endpoints

### 📦 Under the Hood

- **40 Files Changed**: 3,632 insertions, 2,176 deletions
- **Major Refactoring**: AI service implementations streamlined for tool support
- **Enhanced Streaming**: Better real-time response processing with tool call handling
- **Improved Error Handling**: Comprehensive error messages for tool failures
- **Performance Optimizations**: Efficient vault search with configurable limits
- **Code Quality**: Comprehensive TypeScript types for all tool-related functionality

### 🔧 Developer Experience

- **Debug Mode**: Detailed console logging for troubleshooting tool operations
- **Extensible Architecture**: Easy to add new tools in the future
- **Clear Interfaces**: Well-documented TypeScript interfaces for tool development
- **Service Locator Pattern**: Consistent dependency injection for tool services

### 🚀 Future Roadmap

Potential future enhancements:

- Additional tools: calendar integration, task management, graph analysis
- Configurable auto-approval rules for trusted tools
- Tool usage analytics (local only, privacy-focused)
- Batch file operations with granular control
- Advanced search operators and filters

### 📚 Knowledge Management Benefits

- **Context-Aware AI**: AI can discover relevant information from your vault
- **Research Augmentation**: Combine vault knowledge with web search results
- **Note Discovery**: Find connections between notes you might have missed
- **Enhanced Productivity**: AI with access to your knowledge base (with your permission)
- **Privacy-Preserved**: Full control over what information AI sees

### 🎓 Use Cases

- **Research Assistant**: "Search my vault for notes about quantum computing and find recent papers on the topic"
- **Knowledge Synthesis**: "Find all my meeting notes from Q3 and summarize the key decisions"
- **Cross-Reference**: "Search for notes mentioning both machine learning and productivity"
- **Web-Enhanced Writing**: "Search the web for the latest statistics on climate change and incorporate them"
- **Information Retrieval**: "Find my notes on project X and tell me the current status"

## v2.8.1-beta (August 2025) - CORS-Free Streaming & Network Improvements

### 🚀 Major Network Improvements

- **CORS-Free Streaming**: Implemented smart streaming that adapts to the environment
  - **Desktop**: Uses Node.js HTTP modules to bypass CORS completely
  - **Mobile**: Gracefully falls back to standard fetch() where Node.js is unavailable
  - Resolves connection issues with local services like LM Studio and Ollama on desktop
  - Better reliability for cloud services (OpenAI, Anthropic, etc.) on both platforms
- **IPv4/IPv6 Resolution**: Fixed localhost connection issues by forcing IPv4 resolution for local services
- **Unified Network Layer**: All HTTP requests now use Obsidian's native `requestUrl` or custom `requestStream` for consistency

### 🔧 Technical Improvements

- **Enhanced Error Handling**: Better error messages for network connection issues
- **Improved Local Service Support**: More reliable connections to LM Studio, Ollama, and other localhost services
- **Network Debugging**: Added better logging for troubleshooting connection issues

### 📦 Under the Hood

- Created adaptive `requestStream()` function that uses Node.js HTTP on desktop, fetch() on mobile
- Replaced all remaining `fetch()` calls with Obsidian's `requestUrl` for non-streaming requests
- Optimized network stack for both Electron (desktop) and mobile environments
- Environment detection ensures compatibility across all Obsidian platforms

## v2.8.0 (August 2025) - GPT-5 Model Support

### 🆕 New Features

- **Latest OpenAI Models**: Full support for OpenAI's newest GPT-5 family:
  - `gpt-5` - The flagship model with enhanced reasoning capabilities
  - `gpt-5-mini` - Optimized for speed and efficiency
  - `gpt-5-nano` - Ultra-lightweight for quick responses
  - `gpt-5-chat-latest` - Always-updated chat model

### 🔧 Technical Improvements

- **Smart Token Management**: Enhanced handling of token limit responses in non-streaming mode for more reliable interactions
- **Robust API Integration**: Improved response parsing and error handling for the new model endpoints
- **Performance Optimizations**: Refined message service architecture for faster processing

### 📦 Under the Hood

- Updated OpenAI service integration for GPT-5 compatibility
- Enhanced settings configuration for new model options
- Dependency updates for better security and performance

## v2.7.0 (August 2025) - Provider-Specific Default Models

### Major Features

- **Service-Specific Defaults**: Each AI provider now has its own default model configuration in settings
- **Enhanced Settings UI**: Redesigned settings panel with dedicated sections for each provider's default configurations
- **Better Model Prefixes**: Updated documentation with correct prefixes (`openai@gpt-4o`, `anthropic@claude-3-5-sonnet`, etc.)

### Improvements

- **Automatic Migration**: Previous settings are preserved and automatically upgraded
- **Dynamic Frontmatter**: Improved frontmatter generation based on provider-specific settings

## v2.6.0 (July 10, 2025) - Dependencies & Stability

### Improvements

- **Dependency Updates**: Upgraded all project dependencies to latest versions for improved security and performance
- **Code Stability**: General stability improvements and bug fixes

## v2.5.0 (June 27, 2025) - Anthropic Integration & Code Quality

### Major Features

- **Anthropic Claude API Support**: Complete integration with Anthropic's Claude models
  - Direct access to Claude 3 (Haiku, Sonnet, Opus) and Claude 3.5 models
  - Native Anthropic API integration with proper authentication
  - Support for Claude-specific system messages and context handling
  - Automatic model discovery and selection

### Code Quality & Development

- **ESLint Integration**: Added comprehensive ESLint configuration for better code quality
  - Automated code style enforcement
  - Fixed numerous linting issues across the codebase
- **Build Optimizations**: Enhanced build process with bundle analysis and optimization tools
- **Development Workflow**: Improved development tools and scripts for better maintainability

### Improvements

- **Model Prefix Consistency**: Standardized model naming conventions across all services (anthropic@claude-3-sonnet, etc.)
- **Service Simplification**: Streamlined AI service implementations and removed unnecessary complexity
- **Temperature Handling**: Improved temperature parameter handling for different model types (removed from o1 and o4 calls)

### Bug Fixes

- **System Messages**: Fixed Anthropic service to properly handle plugin-specific system messages
- **Service Discovery**: Enhanced service discovery when multiple API keys are configured

## v2.4.5 (June 27, 2025) - Frontmatter Stability

### Bug Fixes

- **Frontmatter Handling**: Centralized frontmatter operations to use only Obsidian's native methods, resolving various frontmatter-related issues and improving stability

## v2.4.3 (May 24, 2025) - Streaming & System Commands

### Major Features

- **LM Studio Integration**: Added support for LM Studio as a local AI service provider
  - Local model hosting and execution
  - Compatible with LM Studio's OpenAI-compatible API
  - Seamless integration with existing workflow

### Improvements

- **Enhanced Streaming**: More robust Server-Sent Events (SSE) handling with improved data payload processing
- **Markdown Table Rendering**: Improved table rendering with buffering for better formatting consistency
- **System Commands**: Enhanced system message handling with Obsidian-specific context and table formatting requirements
- **OpenAI API Compatibility**: Used developer role for OpenAI API calls for better conversation context

### Bug Fixes

- **API Response Parser**: Fixed issues with API response parsing across different services
- **SSE Data Handling**: More robust handling of streaming data payloads

### Development

- **Dependency Updates**: Updated all development dependencies to latest versions

## v2.4.0 (May 20, 2025) - OpenAI Model Compatibility

### Improvements

- **Enhanced OpenAI Compatibility**: Improved support for latest OpenAI models and API features
- **Model Detection**: Better automatic detection and handling of OpenAI model variants

## v2.3.5 (May 18, 2025) - Model Discovery Enhancement

### Features

- **Complete Model Visibility**: All available models from all configured services now appear in the model selection modal
- **Improved Model Discovery**: Enhanced model fetching and display across all AI service providers

### Improvements

- **Dependency Updates**: Updated project dependencies for better performance and security

## v2.3.4 (May 2025) - Startup & Service Discovery

### Bug Fixes

- **Service Discovery**: Fixed AI service discovery issues when only OpenRouter API key is provided
- **Startup Performance**: Made startup calls non-blocking to improve plugin load times

## v2.3.1 (April 25, 2025) - Model Fetching & Performance

### Features

- **Startup Model Fetching**: Automatically fetch available models from all configured services on plugin startup
- **Parallel Model Loading**: Models are now fetched in parallel for faster initialization

### Performance

- **Non-blocking Initialization**: Plugin startup is now faster with asynchronous model fetching

## v2.2.3 (April 2024) - Perplexity Citations Fix

### Bug Fixes

- **Perplexity Citations**: Fixed compatibility issues with updated Perplexity API response format for source citations
- **Ollama Streaming**: Reverted problematic CORS fix that was causing issues with Ollama streaming

## v2.2.2 (April 2024) - Service Improvements

### Improvements

- **Service Reliability**: Enhanced stability and reliability across all AI service providers
- **Error Handling**: Improved error messages and recovery mechanisms

## v2.2.1 (April 2024) - Bug Fixes

### Bug Fixes

- **General Stability**: Fixed various issues reported by users for improved stability
- **API Compatibility**: Enhanced compatibility with different API endpoints

## v2.2.0 (April 12, 2024) - URL Parameter Refactoring

### Service Configuration

- **Service-Specific URLs**: Each AI service now has its own dedicated URL parameter in both global settings and note frontmatter:
  - `openaiUrl` for OpenAI API
  - `openrouterUrl` for OpenRouter.ai
  - `ollamaUrl` for Ollama
- **Automatic Settings Migration**: Added migration logic to standardize service URLs for better consistency and compatibility

### Feature Enhancements

- **Perplexity Source Citations**: Added support for web source citations when using Perplexity models via OpenRouter.ai. Access models like openrouter@perplexity/llama-3.1-sonar-small-128k-online and openrouter@perplexity/llama-3.1-sonar-large-128k-online without needing a Perplexity Pro subscription.

### Bug Fixes & Improvements

- **Fixed Ollama Streaming**: Resolved CORS issues when using Ollama on mobile devices with an alternative request method
- **Better Error Handling**: Improved feedback for service type and API key validation issues
- **System Commands Fix**: Fixed missing system commands from notes' frontmatter
- **Consistent API Endpoints**: Simplified URL and endpoint usage across all services
- **Template Organization**: Templates now appear in alphabetical order in the template suggest modal

### Mobile Enhancements

- **Improved Mobile Support**: Enhanced Ollama support on mobile with a CORS-friendly request method
- **URL Priority Logic**: Refined URL priority for fetching available models

### Code Maintenance

- **Removed Unused Services**: Removed deprecated services for a cleaner codebase
- **Dependency Updates**: Updated project dependencies to latest versions

## v2.1.5 (March 2024) - Stability Update

### Improvements

- **General Stability**: Various stability improvements and bug fixes
- **Performance**: Enhanced overall plugin performance

## v2.1.4 (March 2024) - Endpoint Handling

### Improvements

- **Simplified URL and Endpoint Usage**: Streamlined the way service endpoints are handled across the application
- **Model Fetching Priority**: Improved URL priority for fetching available models

## v2.1.3 (March 2024) - System Commands Update

### Enhancements

- **System Command Handling**: Fixed system commands from settings not being applied correctly
- **Code Cleanup**: Removed unused services and improved code organization
- **Template Improvements**: Added alphabetical ordering to templates in the template suggestion modal
- **Settings Framework**: Introduced a robust settings migration framework
- **Citation Support**: Added support for Perplexity response citations

## v2.1.2 (March 2024) - Stability Improvements

### Enhancements

- **Bug Fixes**: Fixed various issues reported by users after the 2.1.0 release
- **Performance Improvements**: Enhanced overall stability and performance

## v2.1.1 (March 2024) - Minor Fixes

### Bug Fixes

- **Service Discovery**: Improved service discovery and model selection
- **UI Improvements**: Enhanced user interface elements

## v2.1.0 (March 2024) - OpenRouter Integration

### Major Features

- **OpenRouter.ai Support**: Added support for OpenRouter.ai as an AI model provider
  - Access to models including Gemini, DeepSeek, Llama, Perplexity and more
  - Full list of models available at https://openrouter.ai/models
- **Model Selection Command**: Added new command `ChatGPT MD: Select Model` to choose from all available LLMs (OpenAI, Ollama, OpenRouter.ai) and set the current model for your note

## v2.0.5 (February 2024) - Service Pattern Implementation

### Enhancements

- **Service Pattern**: Implemented a cleaner service pattern for settings management
- **Heading Improvements**: Enhanced heading prefix and default frontmatter

## v2.0.4 (February 2024) - Settings Interface

### Enhancements

- **Settings Tab Enhancement**: Added API Keys and default URLs to the settings tab for easier configuration

## v2.0.3 (February 2024) - Version Management

### Enhancements

- **Version Management**: Added comprehensive version management
- **Title Inference Fix**: Prevented error messages from becoming note titles
- **API Communication**: Simplified communication between services

## v2.0.2 (February 2024) - Model Discovery

### Enhancements

- **Model Discovery**: Added a command to list all available models across services
- **Stream Management**: Improved stream handling and responsiveness

## v2.0.1 (February 2024) - Maintenance Update

### Enhancements

- **Clear Chat Fix**: Fixed the clear chat command when frontmatter is missing
- **Dependency Updates**: Updated all dependencies to latest versions

## v2.0.0 (February 2024) - Architecture Overhaul

### Major Features & Improvements

- **Service Architecture**: Complete refactoring to use service-based architecture
- **Multiple AI Providers**: Support for OpenAI, Ollama, and OpenRouter
- **Enhanced Error Handling**: Better error messages and recovery mechanisms
- **Context Links**: Added ability to include content from linked notes
- **Model Name Display**: Added model name to assistant divider for better tracking
- **Documentation**: Completely rewritten README with clearer instructions

## v1.7.0 (February 2024) - Service Architecture

### Enhancements

- **Editor Service**: Improved editor service for better text handling
- **Dependency Updates**: Updated all dependencies to latest versions
- **Context Links**: Inline link content into messages to the API for better context
- **Chat Delimiters**: Removed chat delimiters from inlined messages

## v1.6.0 (January 2024) - Code Refactoring

### Code Improvements & Refactoring

- **Centralized Updates**: Streamlined statusBar updates and improved response processing
- **Constants**: Added command IDs and other important strings as constants
- **Service Migration**: Moved helper methods to EditorService and OpenAiService
- **Code Organization**: Improved code structure and imports
- **Configuration**: Added more configuration values
- **Model Extraction**: Extracted data structures to Models
- **UI Components**: Moved ChatTemplatesSuggestModal and Settings to Views

### Bug Fixes

- **Frontmatter**: Fixed missing frontmatter overwrite with default settings
- **Title Inference**: Added check for chat folder before renaming inferred title

### Development Updates

- **Dependencies**: Upgraded all dependencies
- **Code Style**: Added .prettierrc configuration
- **Build Process**: Fixed TypeScript build issues

## v1.5.0 (April 2023) - Comment Blocks

### Features

- **ChatGPT Comments**: Added functionality to ignore parts of your notes using comment blocks
- **Conversation Cleanup**: Added command to clear conversation except frontmatter
- **Language Setting**: Added setting for inferring title language

### Improvements

- **Source Mode**: New chat files now open in source mode for immediate editing

## v1.4.3 (March 2023) - Bug Fixes

### Bug Fixes

- **Template Creation**: Fixed new chat from template when `chats` folder is missing
- **Title Inference**: Fixed infer title error that was causing issues

## v1.4.2 (March 2023) - Mobile Improvements

### Improvements

- **Mobile Experience**: Improved streaming icon behavior on mobile devices

## v1.4.1 (March 2023) - Stream Fixes

### Bug Fixes

- **Stream Issues**: Fixed stream passthrough issues
- **Promise Handling**: Fixed resolve/reject handling

## v1.4.0 (March 2023) - Streaming Features

### Features

- **Stop Button**: Added stop button for streaming
- **Custom URLs**: Added configurable URL support for different API endpoints

## v1.3.0 (March 2023) - Message Headings

### Features

- **Message Headings**: Added headings to messages for better organization

### Improvements

- **Code Blocks**: Enhanced code block handling for better syntax highlighting

## v1.2.1 (March 2023) - Streaming Fix

### Bug Fixes

- **SSE Logic**: Enhanced error logic for Server-Sent Events

## v1.2.0 (March 2023) - Streaming Enhancement

### Features

- **Streaming**: Implemented improved streaming functionality for real-time responses

## v1.1.1 (March 2023) - Title Inference Fix

### Bug Fixes

- **Streaming**: Fixed streaming bugs for smoother experience
- **Title Inference**: Reduced message count required for title inference

## v1.1.0 (March 2023) - Title Inference

### Features

- **Title Inference**: Added title inference functionality
- **Platform Logic**: Added platform-specific logic for better cross-platform support
- **Custom Dates**: Implemented custom date formatting

## v1.0.2 (March 2023) - iOS Support

### Bug Fixes

- **iOS Support**: Added compatibility fixes for iOS
- **Status Bar**: Implemented status bar improvements

## v1.0.1 (March 2023) - Error Reporting

### Enhancements

- **Error Reporting**: Added comprehensive error reporting

## v1.0.0 (March 2023) - Initial Release

### Initial Release

- **Core Functionality**: Implemented the foundation of ChatGPT MD
- **Documentation**: Added comprehensive README with usage instructions
- **Tutorial**: Added YouTube tutorial mirror
- **License**: Added licensing information

---

For detailed information about each release, please visit the [GitHub repository](https://github.com/bramses/chatgpt-md).
