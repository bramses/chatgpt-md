import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { TitleInferenceUseCase } from "../usecases/TitleInferenceUseCase";

/**
 * Command for inferring titles from chat content
 */
export class InferTitleCommand implements ICommand {
  id = "infer-title";
  name = "Infer title";
  icon = "subtitles";

  constructor(private titleInferenceUseCase: TitleInferenceUseCase) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Infer title command requires an editor and view");
    }

    // Create a status update function that does nothing for manual title inference
    const updateStatus = (_message: string) => {
      // Could be enhanced to show status in UI if needed
    };

    await this.titleInferenceUseCase.execute(context.editor, context.view, updateStatus);
  }
}
