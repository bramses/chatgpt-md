# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Version: 2.8.0
- Major focus: GPT-5 model support and enhanced token management
- Key features: Full support for OpenAI's GPT-5 family (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-chat-latest) with smart token handling and performance optimizations

## Development Commands

```bash
# Development
yarn dev                       # Start development build with watch mode
yarn build                     # Build for production with TypeScript checks
yarn build:analyze             # Build with bundle analysis
yarn build:size                # Build and show main.js file size
yarn analyze                   # Analyze bundle composition
yarn build:full-analysis       # Full build and analysis

# Code Quality
yarn lint                      # Run ESLint on src files
yarn lint:fix                  # Fix ESLint issues automatically

# No dedicated test suite - manual testing via Obsidian plugin development

# Version Management
yarn version                   # Bump version and update manifest/versions.json
yarn update-version            # Update version manually
```

## Architecture Overview

### Core Architecture
This is an Obsidian plugin that integrates multiple AI services (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LmStudio) into Obsidian notes using a service-oriented architecture with dependency injection.

**Main Components:**
- **ServiceLocator** (`src/core/ServiceLocator.ts`): Central dependency injection container that manages all services
- **CommandRegistry** (`src/core/CommandRegistry.ts`): Registers all Obsidian commands and handles model initialization
- **Main Plugin** (`src/main.ts`): Entry point that initializes ServiceLocator and CommandRegistry

### Service Architecture
All AI services implement `IAiApiService` interface. Each service handles:
- Authentication via `ApiAuthService`
- Request/response parsing via `ApiResponseParser` 
- Streaming and non-streaming API calls
- Service-specific configuration and error handling

**Service Registration**: ServiceLocator uses a factory pattern - services are instantiated on-demand via `getAiApiService(serviceType)` with dependency injection.

**Key Services:**
- **AI Services** (`src/Services/*Service.ts`): OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LmStudio
- **EditorService**: Manages editor interactions and content manipulation  
- **MessageService**: Handles chat message processing, validation, and token management
- **FrontmatterService**: Manages YAML frontmatter configuration per note with provider-specific defaults
- **TemplateService**: Handles chat templates and note creation
- **SettingsService**: Manages global and provider-specific configuration settings
- **ApiResponseParser**: Centralized parsing of API responses across all services
- **ApiAuthService**: Handles authentication logic for all AI providers

### Adding New AI Services
Follow the comprehensive guide in `docs/CREATE_SERVICE.md`. The pattern involves:
1. Creating service class implementing `IAiApiService`
2. Adding constants, config interfaces, and model fetching
3. Updating ServiceLocator factory method, ApiAuthService, ApiResponseParser
4. Adding settings UI and frontmatter integration
5. Updating command registry for model detection

**Critical**: ServiceLocator's `getAiApiService()` now throws error for unknown service types instead of falling back to smart provider selection.

### Configuration System
- **Global Settings**: Stored via Obsidian's settings API in `SettingsService`
- **Provider-Specific Defaults**: Each AI service has its own default model configuration (v2.7.0+)  
- **Per-Note Config**: YAML frontmatter overrides global settings using standard OpenAI API parameters
- **Service Detection**: Automatic based on model names (e.g., `ollama@gemma2:27b`, `gemini@gemini-1.5-pro`, `anthropic@claude-3-5-sonnet`) or service-specific URLs
- **Smart Provider Selection**: Automatically selects best available service based on API keys and model availability
- **Settings Migration**: Automatic migration system for configuration updates across versions

### Key Files for Development
- `src/main.ts`: Plugin entry point with service initialization
- `src/core/ServiceLocator.ts`: Central dependency injection container  
- `src/core/CommandRegistry.ts`: Command registration and model management
- `src/Services/AiService.ts`: Base service class and provider detection logic
- `src/Services/ApiResponseParser.ts`: Centralized API response parsing
- `src/Services/ApiAuthService.ts`: Authentication management for all providers
- `src/Services/SettingsService.ts`: Configuration and migration management
- `src/Models/Config.ts`: Configuration interfaces and defaults
- `src/Constants.ts`: Service constants, API endpoints, and supported models
- `docs/CREATE_SERVICE.md`: Complete guide for adding new AI services
- `docs/BUILD_OPTIMIZATION.md`: Bundle optimization and performance guidelines

### Build System
- **ESBuild**: Used for bundling with configuration in `esbuild.config.mjs`
- **TypeScript**: Strict type checking with `tsconfig.json`
- **ESLint**: Code quality with `eslint.config.js` using modern flat config
- **Bundle Analysis**: Available via analyze scripts for optimization (see `scripts/analyze-bundle.mjs`)
- **Version Management**: Automated via `version-bump.mjs` and `update-version.mjs` scripts

### Testing and Quality Assurance
- **No dedicated test suite**: This plugin relies on manual testing within Obsidian
- **Code Quality**: Enforced via ESLint with TypeScript-specific rules
- **Type Safety**: Full TypeScript coverage with strict checking enabled
- **Manual Testing**: Test in actual Obsidian environment with various AI providers