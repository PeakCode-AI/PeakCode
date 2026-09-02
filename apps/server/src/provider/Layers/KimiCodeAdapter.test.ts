// FILE: KimiCodeAdapter.test.ts
// Purpose: Covers Kimi-specific adapter guards for turn scoping and prompt-defect promotion.
// Layer: Provider adapter tests
// Depends on: KimiCodeAdapter helper exports and shared contract ids.

import { TurnId } from "@peakcode/contracts";
import { describe, expect, it } from "vitest";

import {
  isRenderableKimiCodeAssistantDelta,
  kimiCodePromptDefectToAdapterError,
  scopeKimiCodeRuntimeItemIdForTurn,
  scopeKimiCodeToolCallStateForTurn,
} from "./KimiCodeAdapter.ts";

describe("KimiCodeAdapter runtime event scoping", () => {
  it("makes reused ACP assistant segment ids unique per Peak Code turn", () => {
    const providerItemId = "assistant:kimi-session:segment:5";

    expect(scopeKimiCodeRuntimeItemIdForTurn(TurnId.makeUnsafe("turn-a"), providerItemId)).toBe(
      "kimiCode:turn-a:assistant:kimi-session:segment:5",
    );
    expect(scopeKimiCodeRuntimeItemIdForTurn(TurnId.makeUnsafe("turn-b"), providerItemId)).toBe(
      "kimiCode:turn-b:assistant:kimi-session:segment:5",
    );
  });

  it("preserves the provider tool id while scoping the runtime item id", () => {
    const scoped = scopeKimiCodeToolCallStateForTurn(TurnId.makeUnsafe("turn-a"), {
      toolCallId: "call-1",
      kind: "execute",
      status: "completed",
      title: "Ran command",
      data: { toolCallId: "call-1" },
    });

    expect(scoped.toolCallId).toBe("kimiCode:turn-a:call-1");
    expect(scoped.data).toMatchObject({
      toolCallId: "call-1",
      providerToolCallId: "call-1",
    });
  });

  it("only treats visible assistant text as renderable Kimi content", () => {
    expect(isRenderableKimiCodeAssistantDelta({ streamKind: "assistant_text", text: "done" })).toBe(
      true,
    );
    expect(isRenderableKimiCodeAssistantDelta({ streamKind: "assistant_text", text: "   " })).toBe(
      false,
    );
  });
});

describe("kimiCodePromptDefectToAdapterError", () => {
  // Regression: Kimi returns quota/auth refusals as a JSON-RPC error whose
  // payload fails schema decode, reaching the adapter as a defect. Before this
  // mapping the prompt fiber's `Effect.ignoreCause` swallowed it and the turn
  // never produced a terminal event — the thread spun forever. Observed live as
  // "403 You've reached your weekly (7-day) usage limit".
  it("promotes an Error defect and preserves its message", () => {
    const error = kimiCodePromptDefectToAdapterError(
      new Error("Authentication required: 403 You've reached your weekly (7-day) usage limit."),
    );
    expect(error.provider).toBe("kimiCode");
    expect(error.method).toBe("session/prompt");
    expect(error.detail).toContain("weekly (7-day) usage limit");
  });

  it("promotes a string defect", () => {
    expect(kimiCodePromptDefectToAdapterError("boom").detail).toBe("boom");
  });

  it("falls back to a readable message for opaque defects", () => {
    expect(kimiCodePromptDefectToAdapterError({ weird: true }).detail).toBe(
      "Kimi Code ended the turn with an unexpected error.",
    );
    expect(kimiCodePromptDefectToAdapterError("   ").detail).toBe(
      "Kimi Code ended the turn with an unexpected error.",
    );
  });
});
