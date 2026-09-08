import { describe, expect, test } from "bun:test";
import { resolveLaunchModel } from "../task-lifecycle";

describe("resolveLaunchModel", () => {
  test("parses an explicit provider/model-id override", async () => {
    const model = await resolveLaunchModel({} as never, {
      model: "openrouter/deepseek/deepseek-v4-flash",
      parentSessionID: "ses_parent",
    });
    expect(model).toEqual({ providerID: "openrouter", modelID: "deepseek/deepseek-v4-flash" });
  });

  test("inherits the parent session model when no override is given", async () => {
    const client = {
      session: {
        get: async () => ({
          data: { model: { providerID: "openrouter", id: "deepseek/deepseek-v4-pro" } },
        }),
      },
    };
    const model = await resolveLaunchModel(client as never, { parentSessionID: "ses_parent" });
    expect(model).toEqual({ providerID: "openrouter", modelID: "deepseek/deepseek-v4-pro" });
  });

  test("returns undefined when the parent has no model", async () => {
    const client = { session: { get: async () => ({ data: { model: null } }) } };
    const model = await resolveLaunchModel(client as never, { parentSessionID: "ses_parent" });
    expect(model).toBeUndefined();
  });

  test("throws on an invalid override without a provider", async () => {
    try {
      await resolveLaunchModel({} as never, {
        model: "no-provider-slash",
        parentSessionID: "ses_parent",
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("Invalid model override");
    }
  });
});
