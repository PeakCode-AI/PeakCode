import { ThreadId } from "@peakcode/contracts";
import { describe, expect, it } from "vitest";
import { type ChatMessage } from "../types";
import {
  buildThreadHandoffImportedMessages,
  resolveThreadHandoffBadgeLabel,
} from "./threadHandoff";

function chatMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "role" | "text">,
): ChatMessage {
  return {
    id: "message-1" as ChatMessage["id"],
    createdAt: "2026-01-01T00:00:00.000Z",
    streaming: false,
    ...overrides,
  };
}

describe("resolveThreadHandoffBadgeLabel", () => {
  it("labels a thread that a handoff produced", () => {
    expect(
      resolveThreadHandoffBadgeLabel({
        handoff: {
          sourceThreadId: ThreadId.makeUnsafe("thread-source"),
          sourceProvider: "pi",
          importedAt: "2026-01-01T00:00:00.000Z",
          bootstrapStatus: "completed",
        },
      }),
    ).toBe("Handoff from Pi");
  });

  it("labels a thread that carries no handoff", () => {
    expect(resolveThreadHandoffBadgeLabel({ handoff: null })).toBeNull();
    expect(resolveThreadHandoffBadgeLabel({})).toBeNull();
  });
});

describe("buildThreadHandoffImportedMessages", () => {
  it("copies finished user and assistant messages and skips the rest", () => {
    const imported = buildThreadHandoffImportedMessages({
      messages: [
        chatMessage({ role: "user", text: "first" }),
        chatMessage({ role: "assistant", text: "second", completedAt: "2026-01-01T00:00:05.000Z" }),
        chatMessage({ role: "assistant", text: "still streaming", streaming: true }),
        chatMessage({ role: "system", text: "system notice" }),
      ],
    });

    expect(imported.map((message) => [message.role, message.text])).toEqual([
      ["user", "first"],
      ["assistant", "second"],
    ]);
    expect(imported[1]?.updatedAt).toBe("2026-01-01T00:00:05.000Z");
    expect(imported[0]?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops the assistant selection a user prompt quotes back", () => {
    const [imported] = buildThreadHandoffImportedMessages({
      messages: [
        chatMessage({
          role: "user",
          text: "explain this\n<assistant_selection>\n- assistant message quote:\nold answer\n</assistant_selection>",
        }),
      ],
    });

    expect(imported?.text).toBe("explain this");
  });

  it("carries attachments over to the imported copy", () => {
    const [imported] = buildThreadHandoffImportedMessages({
      messages: [
        chatMessage({
          role: "user",
          text: "look at this",
          attachments: [
            {
              type: "image",
              id: "attachment-1",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 1234,
            },
          ],
        }),
      ],
    });

    expect(imported?.attachments).toEqual([
      {
        type: "image",
        id: "attachment-1",
        name: "shot.png",
        mimeType: "image/png",
        sizeBytes: 1234,
      },
    ]);
  });
});
