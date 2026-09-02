// FILE: KimiCodeAcpSupport.test.ts
// Purpose: Covers the Kimi Code spawn line, auth method resolution, and config-option handling.
// Layer: Provider ACP support tests
// Depends on: KimiCodeAcpSupport exports and the ACP schema shapes.

import { describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  applyKimiCodeAcpModelSelection,
  buildKimiCodeAcpSpawnInput,
  readKimiCodeCurrentModel,
  readKimiCodeModelChoices,
  resolveKimiCodeAcpAuthMethodId,
} from "./KimiCodeAcpSupport.ts";

// Mirrors the live `session/new` response from Kimi Code CLI 0.39.1.
const MODEL_OPTION = {
  type: "select",
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "kimi-code/k3-256k",
  options: [
    { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
    { value: "kimi-code/k3", name: "K3" },
    { value: "kimi-code/k3-256k", name: "K3-256k" },
  ],
} as unknown as EffectAcpSchema.SessionConfigOption;

const THINKING_OPTION = {
  type: "select",
  id: "thinking",
  name: "Thinking",
  category: "thought_level",
  currentValue: "high",
  options: [
    { value: "low", name: "Thinking Low" },
    { value: "high", name: "Thinking High" },
  ],
} as unknown as EffectAcpSchema.SessionConfigOption;

const CONFIG_OPTIONS = [MODEL_OPTION, THINKING_OPTION];

describe("buildKimiCodeAcpSpawnInput", () => {
  it("runs `kimi acp` with no model flags, since model is a session config option", () => {
    expect(buildKimiCodeAcpSpawnInput({ model: "kimi-code/k3" }, "/repo")).toEqual({
      command: "kimi",
      args: ["acp"],
      cwd: "/repo",
    });
  });

  it("honors a configured binary path", () => {
    expect(buildKimiCodeAcpSpawnInput({ binaryPath: "/opt/kimi" }, "/repo").command).toBe(
      "/opt/kimi",
    );
  });
});

describe("resolveKimiCodeAcpAuthMethodId", () => {
  it("selects the terminal login method Kimi advertises", async () => {
    const result = await Effect.runPromise(
      resolveKimiCodeAcpAuthMethodId({
        authMethods: [{ id: "login", name: "Login with Kimi account", type: "terminal" }],
      } as unknown as EffectAcpSchema.InitializeResponse),
    );
    expect(result).toBe("login");
  });

  it("fails with a `kimi login` hint when no known method is advertised", async () => {
    const exit = await Effect.runPromiseExit(
      resolveKimiCodeAcpAuthMethodId({
        authMethods: [],
      } as unknown as EffectAcpSchema.InitializeResponse),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("readKimiCodeModelChoices", () => {
  it("reads the live catalogue from the model config option", () => {
    expect(readKimiCodeModelChoices(CONFIG_OPTIONS)).toEqual([
      { slug: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
      { slug: "kimi-code/k3", name: "K3" },
      { slug: "kimi-code/k3-256k", name: "K3-256k" },
    ]);
  });

  it("flattens grouped select choices", () => {
    const grouped = [
      {
        type: "select",
        id: "model",
        name: "Model",
        currentValue: "a",
        options: [{ group: "g1", name: "Group 1", options: [{ value: "a", name: "A" }] }],
      },
    ] as unknown as ReadonlyArray<EffectAcpSchema.SessionConfigOption>;
    expect(readKimiCodeModelChoices(grouped)).toEqual([{ slug: "a", name: "A" }]);
  });

  it("returns nothing when the agent advertises no model option", () => {
    expect(readKimiCodeModelChoices([THINKING_OPTION])).toEqual([]);
    expect(readKimiCodeCurrentModel([THINKING_OPTION])).toBeUndefined();
  });

  it("reads the agent's current model", () => {
    expect(readKimiCodeCurrentModel(CONFIG_OPTIONS)).toBe("kimi-code/k3-256k");
  });
});

describe("applyKimiCodeAcpModelSelection", () => {
  const makeRuntime = () => {
    const setConfigOption = vi.fn(() => Effect.succeed({} as never));
    return {
      setConfigOption,
      runtime: {
        getConfigOptions: Effect.succeed(CONFIG_OPTIONS),
        setConfigOption: setConfigOption as never,
      },
    };
  };

  it("writes model and thinking when they differ from the agent's current values", async () => {
    const { runtime, setConfigOption } = makeRuntime();
    await Effect.runPromise(
      applyKimiCodeAcpModelSelection({
        runtime,
        model: "kimi-code/k3",
        options: { thinking: "low" },
        mapError: (context) => new Error(context.method),
      }),
    );
    expect(setConfigOption.mock.calls).toEqual([
      ["model", "kimi-code/k3"],
      ["thinking", "low"],
    ]);
  });

  it("skips writes that would not change anything", async () => {
    const { runtime, setConfigOption } = makeRuntime();
    await Effect.runPromise(
      applyKimiCodeAcpModelSelection({
        runtime,
        model: "kimi-code/k3-256k",
        options: { thinking: "high" },
        mapError: (context) => new Error(context.method),
      }),
    );
    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it("skips options the agent does not advertise", async () => {
    const setConfigOption = vi.fn(() => Effect.succeed({} as never));
    await Effect.runPromise(
      applyKimiCodeAcpModelSelection({
        runtime: {
          getConfigOptions: Effect.succeed([MODEL_OPTION]),
          setConfigOption: setConfigOption as never,
        },
        model: "kimi-code/k3-256k",
        options: { thinking: "low" },
        mapError: (context) => new Error(context.method),
      }),
    );
    expect(setConfigOption).not.toHaveBeenCalled();
  });
});
