import { StopStreamingCommand, StopStreamingDependencies } from "../../../src/commands/StopStreamingCommand";
import { ICommandContext } from "../../../src/commands/interfaces/ICommand";

describe("StopStreamingCommand", () => {
  let command: StopStreamingCommand;
  let mockDeps: StopStreamingDependencies;
  let context: ICommandContext;

  beforeEach(() => {
    mockDeps = {
      stopAllStreaming: jest.fn(),
    };

    command = new StopStreamingCommand(mockDeps);

    context = {
      app: {} as any,
    };
  });

  describe("properties", () => {
    it("should have correct id", () => {
      expect(command.id).toBe("stop-streaming");
    });

    it("should have correct name", () => {
      expect(command.name).toBe("Stop streaming");
    });

    it("should have correct icon", () => {
      expect(command.icon).toBe("octagon");
    });
  });

  describe("execute", () => {
    it("should call stopAllStreaming on dependencies", async () => {
      await command.execute(context);

      expect(mockDeps.stopAllStreaming).toHaveBeenCalledTimes(1);
    });

    it("should work without editor", async () => {
      // Ensure no editor is provided
      context.editor = undefined;
      context.view = undefined;

      // Should not throw
      await expect(command.execute(context)).resolves.not.toThrow();
      expect(mockDeps.stopAllStreaming).toHaveBeenCalled();
    });

    it("should complete successfully", async () => {
      const result = await command.execute(context);

      expect(result).toBeUndefined(); // Command returns void
    });
  });
});
