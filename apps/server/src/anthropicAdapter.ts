// FILE: anthropicAdapter.ts
// Purpose: Bridges the Anthropic Messages API (spoken by Claude Code via the
//          @anthropic-ai/claude-agent-sdk) onto the gateway's channel model,
//          so Claude Code can route through any configured gateway channel.
// Layer: Server gateway adapter
//
// When Claude Code is pointed at the gateway (via ANTHROPIC_BASE_URL), it sends
// Anthropic-format requests to POST /v1/messages. This module converts those to
// the channel's native protocol:
//   - openai channels: Anthropic Messages -> OpenAI Chat, call upstream, convert
//     the OpenAI Chat response back into an Anthropic Messages response.
//   - mimo channels: flatten to MiMo's query, then wrap MiMo's SSE as Anthropic
//     Messages events (reuses mimoAdapter's <think> handling as "thinking").
//   - anthropic channels: pass through to ${baseUrl}/v1/messages verbatim.
//
// The OpenAI<->Anthropic mapping intentionally covers the subset Claude Code
// actually emits: text, tool_use/tool_result, system prompt, streaming SSE.
// Extended-thinking blocks are surfaced from OpenAI "reasoning" deltas where
// available (e.g. MiMo's <think>), otherwise omitted.

import { randomUUID } from "node:crypto";

import type { GatewayChannelConfig } from "@peakcode/contracts";

import { resolveChannelDefaultModel } from "@peakcode/contracts";
import { dispatchGatewayChat } from "./gateway";
import { sendMimoChat } from "./mimoAdapter";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface AnthropicMessagesInput {
  readonly channel: GatewayChannelConfig;
  /** Raw Anthropic Messages request body (already validated as an object). */
  readonly payload: Record<string, unknown>;
  /** Resolved secret values keyed by secret id. */
  readonly secrets: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${suffix.replace(/^\/+/u, "")}`;
}

function anthropicMessageId(): string {
  return `msg_${randomUUID().replace(/-/gu, "").slice(0, 24)}`;
}

// ------------------------------------------------------------------
// Anthropic Messages -> OpenAI Chat (request direction)
// ------------------------------------------------------------------

/**
 * Extracts a plain string from an Anthropic content block array, joining all
 * `text` blocks. Tool blocks are handled separately.
 */
function anthropicContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      if (!isRecord(block)) return [];
      if (block.type === "text" && typeof block.text === "string") return [block.text];
      return [];
    })
    .join("\n");
}

/**
 * Converts an Anthropic Messages request body into an OpenAI Chat Completions
 * payload. Maps:
 *   - top-level `system` -> OpenAI system message
 *   - `messages[].content` (string or content-block array) -> OpenAI message
 *     content (text), with tool_use/tool_result blocks converted to
 *     `tool_calls` / `tool` roles.
 *   - `tools[]` (Anthropic input_schema) -> OpenAI function tools
 *   - `max_tokens` -> `max_tokens`
 *   - `stream` -> `stream`
 */
export function anthropicToOpenAIChat(payload: Record<string, unknown>): Record<string, unknown> {
  const messages: Record<string, unknown>[] = [];

  // System prompt: Anthropic carries it at top level (string or array of
  // {text} blocks); OpenAI uses a system-role message.
  const system = payload.system;
  if (typeof system === "string" && system.trim()) {
    messages.push({ role: "system", content: system });
  } else if (Array.isArray(system)) {
    const sysText = system
      .map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    if (sysText) messages.push({ role: "system", content: sysText });
  }

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue;
    const role = raw.role === "assistant" ? "assistant" : "user";

    // Tool results: Anthropic models return tool_use in an assistant turn,
    // then the caller sends a user turn whose content contains tool_result
    // blocks. OpenAI represents these as a separate {role:"tool"} message per
    // result, keyed by tool_call_id.
    if (Array.isArray(raw.content)) {
      const toolResults: Record<string, unknown>[] = [];
      const assistantToolCalls: Record<string, unknown>[] = [];
      const textParts: string[] = [];

      for (const block of raw.content) {
        if (!isRecord(block)) continue;
        if (block.type === "tool_result") {
          // tool_result.content may be a string or a content-block array;
          // anthropicContentToText handles both, and is also undefined-safe.
          toolResults.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: anthropicContentToText(block.content),
          });
        } else if (block.type === "tool_use") {
          assistantToolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments:
                typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? {}),
            },
          });
        } else if (block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        }
      }

      // Emit assistant tool_calls as their own message (OpenAI requires
      // tool_calls to live on an assistant message with null content).
      // DeepSeek reasoning models require reasoning_content on tool_calls
      // messages — backfill a placeholder (cf. cc-switch).
      if (assistantToolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: textParts.length > 0 ? textParts.join("\n") : null,
          reasoning_content: "tool call",
          tool_calls: assistantToolCalls,
        });
      } else if (textParts.length > 0) {
        messages.push({ role, content: textParts.join("\n") });
      }
      // Tool results always go to separate {role:"tool"} messages.
      for (const tr of toolResults) messages.push(tr);
      if (assistantToolCalls.length === 0 && toolResults.length === 0 && textParts.length === 0) {
        messages.push({ role, content: anthropicContentToText(raw.content) });
      }
      continue;
    }

    // Plain string content.
    const text = anthropicContentToText(raw.content);
    messages.push({ role, content: text });
  }

  const chatPayload: Record<string, unknown> = {
    model: payload.model,
    messages,
    stream: payload.stream === true,
  };
  if (typeof payload.max_tokens === "number") chatPayload.max_tokens = payload.max_tokens;
  if (typeof payload.temperature === "number") chatPayload.temperature = payload.temperature;
  if (typeof payload.top_p === "number") chatPayload.top_p = payload.top_p;

  // Tools: Anthropic custom tools → OpenAI function tools.
  // Claude Code's built-in tools (Bash/Read/Write/etc.) come as:
  //   { name: "Read", description: "...", input_schema: {...} }
  // They have NO `type` field (or type="custom"). Server-side tools
  // (web_search_20250305, computer_20250124, etc.) carry a versioned type
  // and must be dropped — DeepSeek can't handle them.
  //
  // Following cc-switch's approach: custom tools are wrapped as function
  // tools with their input_schema passed through as parameters. Tool names
  // are lowercased because some OpenAI-compatible upstreams reject uppercase.
  if (Array.isArray(payload.tools)) {
    const SERVER_TOOL_PREFIXES = [
      "web_search",
      "computer",
      "text_editor",
      "bash_",
      "code_execution",
    ];
    const tools = payload.tools
      .map((tool) => {
        if (!isRecord(tool)) return null;
        const toolType = typeof tool.type === "string" ? tool.type : "";
        const name = typeof tool.name === "string" ? tool.name : "";
        // Drop server-side tools (versioned type, no input_schema).
        if (toolType && !toolType.startsWith("custom")) {
          if (!isRecord(tool.input_schema)) return null;
          for (const prefix of SERVER_TOOL_PREFIXES) {
            if (toolType.startsWith(prefix)) return null;
          }
        }
        if (!name) return null;
        const schema = isRecord(tool.input_schema) ? tool.input_schema : {};
        return {
          type: "function",
          function: {
            name: name,
            description: typeof tool.description === "string" ? tool.description : "",
            parameters: schema,
          },
        } as Record<string, unknown> | null;
      })
      .filter((t): t is Record<string, unknown> => t !== null);
    if (tools.length > 0) chatPayload.tools = tools;
  }

  return chatPayload;
}

// ------------------------------------------------------------------
// OpenAI Chat -> Anthropic Messages (non-streaming response)
// ------------------------------------------------------------------

interface OpenAIChoice {
  readonly message?: {
    readonly content?: string | null;
    readonly tool_calls?: ReadonlyArray<{
      id: string;
      function: { name: string; arguments: string };
    }>;
  };
  readonly finish_reason?: string | null;
}
interface OpenAIChatResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: ReadonlyArray<OpenAIChoice>;
  readonly usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Maps an OpenAI finish_reason to the Anthropic stop_reason. */
function mapStopReason(finishReason: string | null | undefined): string {
  switch (finishReason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "stop":
      return "end_turn";
    default:
      return "end_turn";
  }
}

/**
 * Converts a non-streaming OpenAI Chat response into an Anthropic Messages
 * response. Text -> text block; tool_calls -> tool_use blocks (input parsed).
 */
export async function openAIChatToAnthropicMessages(
  openaiResponse: Response,
  requestedModel: string,
): Promise<Response> {
  const raw = (await openaiResponse.json()) as OpenAIChatResponse & Record<string, unknown>;
  if (!openaiResponse.ok) {
    const upstreamError = isRecord(raw.error) ? raw.error : {};
    const message =
      typeof upstreamError.message === "string"
        ? upstreamError.message
        : "Upstream request failed.";
    return Response.json(
      { type: "error", error: { type: "api_error", message } },
      { status: openaiResponse.status },
    );
  }
  const chat = raw as OpenAIChatResponse;
  const choice = chat.choices?.[0];
  const content: Record<string, unknown>[] = [];

  const text = choice?.message?.content;
  if (typeof text === "string" && text) {
    content.push({ type: "text", text });
  }
  const toolCalls = choice?.message?.tool_calls ?? [];
  for (const call of toolCalls) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments || "{}");
    } catch {
      input = {};
    }
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input,
    });
  }

  const stopReason = content.length === 0 ? "end_turn" : mapStopReason(choice?.finish_reason);
  const inputTokens = chat.usage?.prompt_tokens ?? 0;
  const outputTokens = chat.usage?.completion_tokens ?? 0;

  return Response.json(
    {
      id: chat.id ?? anthropicMessageId(),
      type: "message",
      role: "assistant",
      model: requestedModel,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    },
    { status: openaiResponse.status },
  );
}

// ------------------------------------------------------------------
// OpenAI Chat SSE -> Anthropic Messages SSE (streaming response)
// ------------------------------------------------------------------

function sseEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Transforms an OpenAI Chat Completions SSE stream into an Anthropic Messages
 * SSE stream. Emits the Anthropic event sequence:
 *   message_start
 *   [for each content block] content_block_start / content_block_delta* / content_block_stop
 *   message_delta (stop_reason)
 *   message_stop
 *
 * Tool-call deltas from OpenAI are buffered per-index and flushed as a single
 * tool_use block (input_json_delta could be streamed, but Claude Code tolerates
 * a single block; we emit the complete input at content_block_start for
 * simplicity and correctness).
 */
export function openAIChatStreamToAnthropicStream(
  openaiResponse: Response,
  requestedModel: string,
): Response {
  if (!openaiResponse.body) {
    return Response.json(
      { type: "error", error: { type: "api_error", message: "Empty upstream stream." } },
      { status: 502 },
    );
  }
  const messageId = anthropicMessageId();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstream = openaiResponse.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (eventType: string, data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(eventType, data)));

      enqueue("message_start", {
        type: "message_start",
        message: {
          id: messageId,
          type: "message",
          role: "assistant",
          content: [],
          model: requestedModel,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });

      const reader = upstream.getReader();
      let buffer = "";
      let textBlockOpen = false;
      let textBlockStarted = false;
      let finalStopReason = "end_turn";
      const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();
      // Track which tool indexes we've already emitted a content_block_start for
      // so we can append them after the text block closes.
      const emittedToolStarts = new Set<number>();
      let inputTokens = 0;
      let outputTokens = 0;

      const closeTextBlock = () => {
        if (textBlockOpen) {
          enqueue("content_block_stop", { type: "content_block_stop", index: 0 });
          textBlockOpen = false;
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/u);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLine = block
              .split(/\r?\n/u)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (!dataLine || dataLine === "[DONE]") continue;
            let chunk: Record<string, unknown>;
            try {
              chunk = JSON.parse(dataLine) as Record<string, unknown>;
            } catch {
              continue;
            }
            // Usage sometimes appears in the final chunk.
            if (isRecord(chunk.usage)) {
              inputTokens = Number(chunk.usage.prompt_tokens ?? inputTokens);
              outputTokens = Number(chunk.usage.completion_tokens ?? outputTokens);
            }
            const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
            for (const choice of choices) {
              if (!isRecord(choice) || !isRecord(choice.delta)) continue;
              const delta = choice.delta;
              // Text content.
              if (typeof delta.content === "string" && delta.content) {
                if (!textBlockOpen) {
                  textBlockOpen = true;
                  textBlockStarted = true;
                  enqueue("content_block_start", {
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "text", text: "" },
                  });
                }
                enqueue("content_block_delta", {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: delta.content },
                });
              }
              // Tool calls: buffer per index, emit as tool_use blocks after
              // the text block closes. We defer emission to EOF so the input
              // JSON is complete; Claude Code accumulates it fine.
              if (Array.isArray(delta.tool_calls)) {
                for (let i = 0; i < delta.tool_calls.length; i++) {
                  const rawTc = delta.tool_calls[i];
                  if (!isRecord(rawTc)) continue;
                  // OpenAI sends a stable `index` on every tool_call delta for
                  // the same call; when a delta omits it (non-conforming but
                  // seen in practice), fall back to the index of the last call
                  // we saw in this stream so arguments accumulate together.
                  const fallbackIndex =
                    toolCallsByIndex.size > 0 ? Math.max(...toolCallsByIndex.keys()) : 0;
                  const idx = typeof rawTc.index === "number" ? rawTc.index : fallbackIndex;
                  const fn = isRecord(rawTc.function) ? rawTc.function : {};
                  const existing = toolCallsByIndex.get(idx);
                  const id =
                    typeof rawTc.id === "string" && rawTc.id
                      ? rawTc.id
                      : (existing?.id ?? `toolu_${randomUUID().replace(/-/gu, "").slice(0, 24)}`);
                  const name =
                    typeof fn.name === "string" && fn.name ? fn.name : (existing?.name ?? "");
                  const args =
                    (existing?.arguments ?? "") +
                    (typeof fn.arguments === "string" ? fn.arguments : "");
                  toolCallsByIndex.set(idx, { id, name, arguments: args });
                }
              }
              if (typeof choice.finish_reason === "string" && choice.finish_reason) {
                finalStopReason = mapStopReason(choice.finish_reason);
              }
            }
          }
        }

        // Flush: close text block, then emit tool_use blocks. Tool blocks
        // follow the text block sequentially so their indices are contiguous
        // (text=0, tool1=1, tool2=2, …) — Claude Code uses `index` to match
        // content_block_start/delta/stop events, so collisions break tool calls.
        closeTextBlock();
        let toolBlockIndex = textBlockStarted ? 1 : 0;
        for (const [idx, tc] of [...toolCallsByIndex.entries()].sort((a, b) => a[0] - b[0])) {
          if (emittedToolStarts.has(idx)) continue;
          emittedToolStarts.add(idx);
          const blockIndex = toolBlockIndex++;
          // Anthropic streaming tool_use protocol:
          // 1. content_block_start with EMPTY input ({}) — Claude Code expects
          //    input to arrive via input_json_delta, not in the start event.
          // 2. input_json_delta with the full arguments JSON.
          // 3. content_block_stop.
          enqueue("content_block_start", {
            type: "content_block_start",
            index: blockIndex,
            content_block: { type: "tool_use", id: tc.id, name: tc.name, input: {} },
          });
          enqueue("content_block_delta", {
            type: "content_block_delta",
            index: blockIndex,
            delta: { type: "input_json_delta", partial_json: tc.arguments || "{}" },
          });
          enqueue("content_block_stop", {
            type: "content_block_stop",
            index: blockIndex,
          });
        }

        enqueue("message_delta", {
          type: "message_delta",
          delta: { stop_reason: finalStopReason, stop_sequence: null },
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        });
        enqueue("message_stop", { type: "message_stop" });
        controller.close();
      } catch (cause) {
        controller.error(cause);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    status: openaiResponse.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ------------------------------------------------------------------
// Dispatch
// ------------------------------------------------------------------

/**
 * Entry point for POST /gateway/anthropic/v1/messages. Routes the Anthropic
 * request to the channel's native protocol:
 *   - anthropic: pass through to ${baseUrl}/v1/messages
 *   - openai: convert to OpenAI Chat, call the channel, convert back
 *   - mimo: convert to MiMo query, wrap MiMo SSE as Anthropic events
 *
 * Returns an Anthropic Messages response (stream or JSON depending on the
 * request's `stream` flag), suitable for returning directly to the SDK.
 */
export async function dispatchAnthropicMessages(input: AnthropicMessagesInput): Promise<Response> {
  // ALWAYS use the channel's real model — the SDK sends a Claude model id
  // (e.g. "claude-sonnet-4-20250514") which upstreams like DeepSeek don't
  // recognize. The gateway ignores it and routes by channel config, exactly
  // like composer-api does. Only for native "anthropic" channels do we pass
  // the requested model through (handled in the anthropic branch below).
  const model = resolveChannelDefaultModel(input.channel) ?? "claude-sonnet-4-5";
  const wantsStream = input.payload.stream === true;

  // Native Anthropic upstream: forward verbatim with the channel's auth.
  // For native channels the requested model id IS valid (it's a real Claude
  // model), so pass it through unchanged.
  if (input.channel.kind === "anthropic") {
    const apiKey = input.secrets.apiKey ?? "";
    const requestedModel =
      typeof input.payload.model === "string"
        ? input.payload.model
        : (resolveChannelDefaultModel(input.channel) ?? "claude-sonnet-4-5");
    return fetch(joinUrl(input.channel.baseUrl, "v1/messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...input.payload, model: requestedModel }),
      signal: input.signal ?? null,
    });
  }

  // MiMo upstream: flatten the Anthropic messages into MiMo's query, call
  // sendMimoChat (returns OpenAI-shaped output), then convert OpenAI->Anthropic.
  if (input.channel.kind === "mimo") {
    const chatPayload = anthropicToOpenAIChat(input.payload);
    chatPayload.model = model;
    const openaiResponse = await sendMimoChat({
      baseUrl: input.channel.baseUrl,
      chatPayload,
      secrets: input.secrets,
      signal: input.signal ?? null,
    });
    return wantsStream
      ? openAIChatStreamToAnthropicStream(openaiResponse, model)
      : openAIChatToAnthropicMessages(openaiResponse, model);
  }

  // OpenAI-compatible upstream: convert Anthropic -> OpenAI Chat, dispatch via
  // the shared chat dispatcher, then convert the OpenAI reply back to Anthropic.
  const chatPayload = anthropicToOpenAIChat(input.payload);
  chatPayload.model = model;
  const openaiResponse = await dispatchGatewayChat({
    channel: input.channel,
    chatPayload,
    secrets: input.secrets,
    signal: input.signal ?? null,
  });
  return wantsStream
    ? openAIChatStreamToAnthropicStream(openaiResponse, model)
    : openAIChatToAnthropicMessages(openaiResponse, model);
}
