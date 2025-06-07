import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { ModelSelectionUseCase } from "../usecases/ModelSelectionUseCase";

/**
 * Command for selecting AI models through a modal interface
 */
export class SelectModelCommand implements ICommand {
  id = "select-model-command";
  name = "Select Model";
  icon = "list";

  constructor(private modelSelectionUseCase: ModelSelectionUseCase) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Select model command requires an editor and view");
    }

    await this.modelSelectionUseCase.execute(context.editor, context.view);
  }
}
