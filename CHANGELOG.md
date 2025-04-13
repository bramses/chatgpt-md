# ChatGPT MD Changelog

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
- **Template Organization**: Templates now appear in alphabetical order in the template suggest modal (fixes #91)

### Mobile Enhancements

- **Improved Mobile Support**: Enhanced Ollama support on mobile with a CORS-friendly request method
- **URL Priority Logic**: Refined URL priority for fetching available models

### Code Maintenance

- **Removed Unused Services**: Removed deprecated services for a cleaner codebase
- **Dependency Updates**: Updated project dependencies to latest versions

## v2.1.4 (Beta) - Endpoint Handling

### Improvements

- **Simplified URL and Endpoint Usage**: Streamlined the way service endpoints are handled across the application
- **Model Fetching Priority**: Improved URL priority for fetching available models

## v2.1.3 (Beta) - System Commands Update

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

## v2.1.0 (March 2024) - OpenRouter Integration

### Major Features

- **OpenRouter.ai Support**: Added support for OpenRouter.ai as an AI model provider
  - Access to models including Gemini, DeepSeek, Llama, Perplexity and more
  - Full list of models available at https://openrouter.ai/models
- **Model Selection Command**: Added new command `ChatGPT MD: Select Model` to choose from all available LLMs (OpenAI, Ollama, OpenRouter.ai) and set the current model for your note

## v2.0.5 (Beta) - Service Pattern Implementation

### Enhancements

- **Service Pattern**: Implemented a cleaner service pattern for settings management
- **Heading Improvements**: Enhanced heading prefix and default frontmatter

## v2.0.4 (Beta) - Settings Interface

### Enhancements

- **Settings Tab Enhancement**: Added API Keys and default URLs to the settings tab for easier configuration

## v2.0.3 (Beta) - Version Management

### Enhancements

- **Version Management**: Added comprehensive version management including beta versions
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
- **Cherry-picked Fixes**: Included missing fixes from other branches

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

## v1.4.0-1.4.2 (March 2023) - Streaming Improvements

### Features

- **Stop Button**: Added stop button for streaming
- **Custom URLs**: Added configurable URL support for different API endpoints

### Bug Fixes

- **Stream Issues**: Fixed stream passthrough issues
- **Promise Handling**: Fixed resolve/reject handling

### Improvements

- **Mobile Experience**: Improved streaming icon behavior on mobile devices

## v1.3.0 (March 2023) - Message Headings

### Features

- **Message Headings**: Added headings to messages for better organization

### Improvements

- **Code Blocks**: Enhanced code block handling for better syntax highlighting

## v1.2.0-1.2.1 (March 2023) - Streaming Enhancement

### Features

- **Streaming**: Implemented improved streaming functionality for real-time responses

### Bug Fixes

- **SSE Logic**: Enhanced error logic for Server-Sent Events

## v1.1.0-1.1.1 (March 2023) - Title Inference

### Features

- **Title Inference**: Added title inference functionality
- **Platform Logic**: Added platform-specific logic for better cross-platform support
- **Custom Dates**: Implemented custom date formatting

### Bug Fixes

- **Streaming**: Fixed streaming bugs for smoother experience
- **Title Inference**: Reduced message count required for title inference

## v1.0.0-1.0.2 (March 2023) - Initial Release

### Initial Release

- **Core Functionality**: Implemented the foundation of ChatGPT MD
- **Error Reporting**: Added comprehensive error reporting
- **iOS Support**: Added compatibility fixes for iOS
- **Status Bar**: Implemented status bar improvements

### Documentation

- **README**: Added comprehensive README with usage instructions
- **Tutorial**: Added YouTube tutorial mirror
- **License**: Added licensing information

---

For detailed information about each release, please visit the [GitHub repository](https://github.com/bramses/chatgpt-md).
