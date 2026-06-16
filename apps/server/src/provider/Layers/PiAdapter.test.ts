// FILE: PiAdapter.test.ts
// Purpose: Verifies Pi adapter model discovery exposes only SDK-supported thinking levels.
// Layer: Provider adapter tests
// Depends on: PiAdapter discovery helpers and Pi model metadata shapes.

import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { getPiSupportedThinkingOptions, withLocalPiModelAdditions } from "./PiAdapter";

function makePiModel(input: {
  reasoning: boolean;
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
}): Pick<Model<Api>, "reasoning" | "thinkingLevelMap"> {
  return {
    reasoning: input.reasoning,
    ...(input.thinkingLevelMap !== undefined ? { thinkingLevelMap: input.thinkingLevelMap } : {}),
  };
}

function makeAvailableModel(input: {
  provider: string;
  id: string;
  name?: string;
}): Model<Api> {
  return {
    id: input.id,
    name: input.name ?? input.id,
    api: "anthropic-messages",
    provider: input.provider,
    baseUrl: "https://example.test/anthropic",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

describe("getPiSupportedThinkingOptions", () => {
  it("hides thinking controls for non-reasoning models", () => {
    expect(getPiSupportedThinkingOptions(makePiModel({ reasoning: false }))).toEqual([]);
  });

  it("advertises xhigh only when the concrete Pi model supports it", () => {
    const withoutXHigh = getPiSupportedThinkingOptions(makePiModel({ reasoning: true }));
    const withXHigh = getPiSupportedThinkingOptions(
      makePiModel({ reasoning: true, thinkingLevelMap: { xhigh: "xhigh" } }),
    );

    expect(withoutXHigh.map((option) => option.value)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(withXHigh.map((option) => option.value)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("respects provider-level disabled thinking levels", () => {
    const options = getPiSupportedThinkingOptions(
      makePiModel({
        reasoning: true,
        thinkingLevelMap: {
          off: null,
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
        },
      }),
    );

    expect(options.map((option) => option.value)).toEqual(["minimal", "low", "medium", "high"]);
  });
});

describe("withLocalPiModelAdditions", () => {
  it("adds MiniMax-M3 for MiniMax China when the provider is available", () => {
    const models = [makeAvailableModel({ provider: "minimax-cn", id: "MiniMax-M2.7" })];

    expect(withLocalPiModelAdditions(models, models).map((model) => model.id)).toContain(
      "MiniMax-M3",
    );
  });

  it("does not add MiniMax-M3 when MiniMax China is not available", () => {
    const models = [makeAvailableModel({ provider: "anthropic", id: "claude-test" })];

    expect(withLocalPiModelAdditions(models, models).map((model) => model.id)).not.toContain(
      "MiniMax-M3",
    );
  });

  it("does not duplicate MiniMax-M3 when the SDK already provides it", () => {
    const models = [
      makeAvailableModel({ provider: "minimax-cn", id: "MiniMax-M2.7" }),
      makeAvailableModel({ provider: "minimax-cn", id: "MiniMax-M3" }),
    ];

    expect(
      withLocalPiModelAdditions(models, models).filter(
        (model) => model.provider === "minimax-cn" && model.id === "MiniMax-M3",
      ),
    ).toHaveLength(1);
  });
});
