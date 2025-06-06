import { ICommand, ICommandContext } from "./interfaces/ICommand";

export interface StopStreamingDependencies {
  stopAllStreaming(): void;
}

/**
 * Command to stop all streaming AI responses
 * This is a simple command that doesn't require an editor
 */
export class StopStreamingCommand implements ICommand {
  id = "stop-streaming";
  name = "Stop streaming";
  icon = "octagon";

  constructor(private deps: StopStreamingDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    // No editor required for this command
    this.deps.stopAllStreaming();
  }
}
