import { Notice } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { AGENT_FOLDER_TYPE, CHOOSE_AGENT_COMMAND_ID, CREATE_AGENT_COMMAND_ID } from "src/Constants";
import { CallbackCommandHandler, CommandMetadata } from "./CommandHandler";
import { AgentSuggestModal } from "src/Views/AgentSuggestModal";
import { CreateAgentModal } from "src/Views/CreateAgentModal";
import { ModelSelectHandler } from "./ModelSelectHandler";

/**
 * Handler for choosing an agent from the agent folder
 */
export class ChooseAgentHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const { agentService, fileService, settingsService } = this.services;
    const settings = settingsService.getSettings();

    if (!settings.agentFolder || settings.agentFolder.trim() === "") {
      new Notice("[ChatGPT MD] No agent folder value found. Please set one in settings.");
      return;
    }

    const folderExists = await fileService.ensureFolderExists(settings.agentFolder, AGENT_FOLDER_TYPE);
    if (!folderExists) return;

    new AgentSuggestModal(this.services.app, agentService, settingsService, settings).open();
  }

  getCommand(): CommandMetadata {
    return {
      id: CHOOSE_AGENT_COMMAND_ID,
      name: "Choose agent",
      icon: "bot",
    };
  }
}

/**
 * Handler for creating a new agent
 */
export class CreateAgentHandler implements CallbackCommandHandler {
  constructor(
    private services: ServiceContainer,
    private modelSelectHandler: ModelSelectHandler
  ) {}

  async execute(): Promise<void> {
    const { agentService, fileService, settingsService } = this.services;
    const settings = settingsService.getSettings();

    if (!settings.agentFolder || settings.agentFolder.trim() === "") {
      new Notice("[ChatGPT MD] No agent folder value found. Please set one in settings.");
      return;
    }

    const folderExists = await fileService.ensureFolderExists(settings.agentFolder, AGENT_FOLDER_TYPE);
    if (!folderExists) return;

    const availableModels = this.modelSelectHandler.getAvailableModels();
    new CreateAgentModal(this.services.app, agentService, settings, availableModels, this.services).open();
  }

  getCommand(): CommandMetadata {
    return {
      id: CREATE_AGENT_COMMAND_ID,
      name: "Create new agent",
      icon: "bot-message-square",
    };
  }
}
