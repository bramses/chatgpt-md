# Project Spec: AI Agent Wizard

## Summary

Add an AI-powered wizard to the agent creation flow that helps users create ideal agents for their use case. The wizard uses AI to generate a name, appropriate temperature, and comprehensive prompt from a user's description of their desired agent.

## User Flow

### Entry Point
User invokes "Create new agent" command (existing).

### Step 1: Mode Selection
Modal opens with two choices:
- **Manual Mode** - Opens the current form (name, model, temperature, message)
- **AI Wizard** - Starts the AI-assisted creation flow

### Step 2: AI Wizard - Configuration
User provides:
- **Model Selection** - Dropdown/autocomplete to pick which AI model generates the agent (uses existing model list)
- **Agent Idea** - Textarea describing what they want the agent to do

A **"Create with AI"** button submits to the selected model.
A **"Back"** button returns to Step 1.

### Step 3: AI Generation
- Loading state shown while AI processes
- AI returns structured response: `{ name, temperature, prompt }`
- On success: pre-fills the manual form (Step 4)
- On error: shows error notice, stays on Step 2

### Step 4: Review & Edit (Pre-filled Manual Form)
The existing manual form is shown with AI-generated values:
- **Agent Name** - Pre-filled with AI-suggested name
- **Model** - Pre-filled with the model selected in Step 2
- **Temperature** - Pre-filled with AI-suggested temperature (0-2)
- **Agent Message** - Pre-filled with AI-generated comprehensive prompt

User can edit any field. Two buttons:
- **"Create Agent"** - Creates the agent file (existing behavior)
- **"Back"** - Returns to Step 2 to adjust model/idea and regenerate

## AI Wizard System Prompt

The internal system prompt for the AI wizard should instruct the model to:
1. Analyze the user's agent idea
2. Generate a concise, descriptive name
3. Select an appropriate temperature (lower for factual/precise tasks, higher for creative tasks)
4. Create a comprehensive system prompt that defines the agent's role, capabilities, constraints, and behavior patterns

Response format: JSON with `name`, `temperature`, and `prompt` fields.

## Technical Requirements

- Reuse existing `AiProviderService` for the AI call
- Non-streaming `generateText` call (we need the full response to parse JSON)
- The wizard model selection uses the same `availableModels` list
- Error handling for malformed AI responses (fallback gracefully)
- Loading indicator during AI generation

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/Views/CreateAgentModal.ts` | **Modify** | Add multi-step wizard flow with mode selection |
| `src/Commands/AgentHandlers.ts` | **Modify** | Pass additional services to modal for AI calls |
| `src/Constants.ts` | **Modify** | Add wizard-related constants (system prompt) |

## Non-Goals
- No new services needed (reuse AiProviderService)
- No settings changes (wizard uses existing model list and API keys)
- No new commands (reuses existing create-agent command)
