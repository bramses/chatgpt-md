# Development Guide

## Build and Development Commands

```bash
# Development (watch mode)
npm run dev

# Production build (includes TypeScript type checking)
npm run build

# Lint TypeScript files
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Build with bundle analysis
npm run build:analyze

# Analyze existing bundle
npm run analyze

# Build and show size
npm run build:size

# Full analysis (build + analyze)
npm run build:full-analysis
```

## Build Process

The build process uses **esbuild** for fast bundling:
- **Entry point**: `src/main.ts`
- **Output**: `main.js`

### ESBuild Configuration

**esbuild.config.mjs** settings:

**Externals**: Obsidian API, Electron, CodeMirror modules marked as external

**Production mode**:
- Aggressive minification (whitespace, identifiers, syntax)
- Tree shaking enabled
- Console.log statements removed via `drop: ["console", "debugger"]`
- Legal comments stripped
- Pure annotations for better tree shaking
- Bundle analysis via metafile (if `ANALYZE=true`)

**Development mode**:
- Watch mode for automatic rebuilds
- Inline sourcemaps for debugging
- No minification

**Platform**: Node (uses Node.js built-in modules)

**Target**: ES2018

**Format**: CommonJS (required by Obsidian)

## TypeScript

- **Version**: TypeScript 5.9.3
- **Target**: ES2018
- **Type checking**: `tsc -noEmit -skipLibCheck`
- **Linting**: ESLint for code quality

## Project Structure

```
src/
├── core/              # Core infrastructure
│   ├── ServiceLocator.ts
│   ├── CommandRegistry.ts
│   └── CLAUDE.md      # Auto-loaded when working here
├── Services/          # Service implementations
│   ├── MessageService.ts
│   ├── EditorService.ts
│   ├── AiService.ts
│   ├── OpenAiService.ts
│   └── CLAUDE.md      # Auto-loaded when working here
├── Views/             # UI components
│   ├── AiModelSuggestModal.ts
│   └── CLAUDE.md      # Auto-loaded when working here
├── Models/            # TypeScript interfaces
│   ├── Config.ts
│   └── CLAUDE.md      # Auto-loaded when working here
├── Utilities/         # Helper functions
├── Constants.ts       # Global constants
└── main.ts           # Plugin entry point
```

## Common Development Tasks

### Adding a New AI Service

1. **Create service file** in `Services/` extending `BaseAiService`
   ```typescript
   export class NewService extends BaseAiService {
     protected serviceType = AI_SERVICE_NEW;
     protected getSystemMessageRole() { return "system"; }
     protected supportsSystemField() { return true; }
   }
   ```

2. **Add service constant** to `Constants.ts`
   ```typescript
   export const AI_SERVICE_NEW = "newservice";
   ```

3. **Add API endpoint** to `API_ENDPOINTS` in `Constants.ts`
   ```typescript
   [AI_SERVICE_NEW]: "/api/endpoint"
   ```

4. **Register in ServiceLocator** (`getAiApiService()` method)
   ```typescript
   case AI_SERVICE_NEW:
     return new NewService(...);
   ```

5. **Add configuration** to `Models/Config.ts`
   ```typescript
   interface NewServiceSettings {
     newServiceDefaultModel: string;
     newServiceUrl: string;
   }
   ```

6. **Add fetch function** for available models (if applicable)
   ```typescript
   export async function fetchAvailableNewServiceModels(url, apiKey) {
     // Implementation
   }
   ```

7. **Update CommandRegistry** to fetch models from new service

### Testing Locally

1. **Build the plugin**
   ```bash
   npm run build
   ```

2. **Copy to Obsidian plugins folder**
   ```bash
   # Example path (adjust for your setup)
   cp -r . ~/.obsidian/plugins/chatgpt-md/
   ```

3. **Reload Obsidian**
   - Use Command Palette: "Reload app without saving"
   - Or restart Obsidian

4. **Check console for errors**
   - Open Developer Tools: Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)

### Debugging

**Development mode**:
```bash
npm run dev
```
- Auto-rebuilds on file changes
- Inline sourcemaps for debugging
- Console.log statements preserved

**Browser console in Obsidian**:
- Press Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)
- Check Console tab for errors
- Use breakpoints in Sources tab

**Common debugging patterns**:
```typescript
console.log("[ChatGPT MD] Debug message:", data);
console.error("[ChatGPT MD] Error:", error);
```

Note: Console logs are removed in production builds.

## Code Style

### ESLint Configuration

Rules enforced:
- No `require()` imports (use ES6 `import` or dynamic `import()`)
- Unused variables must be prefixed with `_` (e.g., `_error`)
- TypeScript strict mode
- No `any` types (prefer explicit types)

### Fix linting issues
```bash
npm run lint:fix
```

## Platform Considerations

### Desktop vs Mobile

Code must work on both platforms:

**Desktop** (Electron):
- Node.js modules available
- Can use `http`, `https`, `url` modules
- Better CORS handling via `requestStream.ts`

**Mobile** (iOS/Android):
- No Node.js modules
- Must use Web APIs only
- Falls back to `fetch()` for HTTP

**Platform detection**:
```typescript
import { Platform } from "obsidian";

if (Platform.isMobile) {
  // Mobile-specific code
} else {
  // Desktop-specific code
}
```

### Dynamic Imports for Node.js Modules

Pattern used in `requestStream.ts`:
```typescript
(async () => {
  try {
    const http = await import("http");
    // Use http module
  } catch (_error) {
    // Fallback for mobile
  }
})();
```

## Performance Optimization

### Production Build

Optimizations applied:
- Tree shaking removes unused code
- Minification reduces bundle size
- Dead code elimination
- Console statements stripped

### Bundle Analysis

```bash
npm run build:analyze
```

Shows:
- Output bundle size
- Largest source files
- Dependency sizes

### Code Splitting

Not currently implemented but could be added for:
- Lazy loading AI service implementations
- On-demand UI component loading

## Dependencies

**Production**: None (all peer dependencies)

**Dev Dependencies**:
- `esbuild` - Fast bundler
- `typescript` - Type checking
- `eslint` - Code linting
- `obsidian` - Obsidian API types
- `@codemirror/*` - Editor API types
- `@types/node` - Node.js types

## Release Process

1. Update version in `manifest.json` and `package.json`
2. Run `npm run build` to create production bundle
3. Test in Obsidian
4. Commit changes
5. Create git tag
6. Push to GitHub
7. Create release with `main.js`, `manifest.json`, `styles.css`
