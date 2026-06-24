import { randomUUID } from "node:crypto";

import {
  resolveChannelDefaultModel,
  resolveChannelModels,
  resolveGatewayActiveChannel,
  type GatewayChannelConfig,
  type GatewayChannelId,
  type GatewayConfig,
} from "@peakcode/contracts";

import { mimoMissingSecrets, sendMimoChat } from "./mimoAdapter";

export const GATEWAY_ROUTE_PREFIX = "/gateway/openai/v1";
export const PEAKCODE_GATEWAY_CLIENT_API_KEY = "peakcode-managed";

/**
 * Secret-store key for one slot of a channel. Each channel declares its own
 * secret slots (see GatewayChannelSecretDef); this helper namespaces them so a
 * multi-secret channel (e.g. MiMo's three cookies) does not collide.
 */
export function gatewaySecretName(channelId: GatewayChannelId, secretId: string): string {
  return `gateway.channel.${channelId}.secret.${secretId}`;
}

export function resolveGatewayChannel(
  config: GatewayConfig,
  requestedModel: string | null,
): { channel: GatewayChannelConfig | null; model: string | null } {
  const slashIndex = requestedModel?.indexOf("/") ?? -1;
  const requestedChannelId = slashIndex > 0 ? requestedModel?.slice(0, slashIndex) : null;
  const activeChannel = resolveGatewayActiveChannel(config);
  const channel = config.channels.some((candidate) => candidate.id === requestedChannelId)
    ? (config.channels.find((candidate) => candidate.id === requestedChannelId) ?? null)
    : activeChannel;
  const model =
    requestedModel && requestedChannelId === channel?.id
      ? requestedModel.slice(slashIndex + 1)
      : requestedModel || (channel ? resolveChannelDefaultModel(channel) : null);
  return { channel, model };
}

export function makeGatewayModelsPayload(config: GatewayConfig) {
  return {
    object: "list",
    data: config.channels.flatMap((channel) =>
      channel.enabled && channel.baseUrl
        ? resolveChannelModels(channel).map((model) => ({
            id: `${channel.id}/${model.id}`,
            object: "model",
            created: 0,
            owned_by: channel.id,
          }))
        : [],
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RESPONSE_CONTEXT_LIMIT = 512;
const responseContextStore = new Map<string, unknown[]>();

function rememberResponseContext(
  responseId: string,
  contextInputItems: readonly unknown[] | undefined,
  outputItems: readonly unknown[],
) {
  if (!contextInputItems) return;
  responseContextStore.set(responseId, [...contextInputItems, ...outputItems]);
  while (responseContextStore.size > RESPONSE_CONTEXT_LIMIT) {
    const oldestKey = responseContextStore.keys().next().value;
    if (!oldestKey) break;
    responseContextStore.delete(oldestKey);
  }
}

function responseInputItems(payload: Record<string, unknown>): unknown[] {
  if (payload.input === undefined || payload.input === null) return [];
  return Array.isArray(payload.input) ? [...payload.input] : [payload.input];
}

function responseContextInputItems(payload: Record<string, unknown>): unknown[] {
  const inputItems = responseInputItems(payload);
  const previousId =
    typeof payload.previous_response_id === "string" ? payload.previous_response_id.trim() : "";
  if (!previousId) return inputItems;
  return [...(responseContextStore.get(previousId) ?? []), ...inputItems];
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${suffix.replace(/^\/+/u, "")}`;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!isRecord(part)) return [];
      const text = part.text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n");
}

function responsesContentToChatContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content ?? "";

  type ResponseContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
  const parts: Array<ResponseContentPart> = content.flatMap<ResponseContentPart>((part) => {
    if (!isRecord(part)) return [];
    if (
      (part.type === "input_text" || part.type === "output_text" || part.type === "text") &&
      typeof part.text === "string"
    ) {
      return [{ type: "text", text: part.text }];
    }
    if (part.type === "input_image" && typeof part.image_url === "string") {
      return [{ type: "image_url", image_url: { url: part.image_url } }];
    }
    return [];
  });

  if (parts.length === 0) return "";
  if (parts.every((part) => part.type === "text")) {
    return parts.map((part) => part.text).join("\n");
  }
  return parts;
}

function responsesInputToMessages(
  payload: Record<string, unknown>,
  inputItems: readonly unknown[] = responseContextInputItems(payload),
): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  if (typeof payload.instructions === "string" && payload.instructions.trim()) {
    messages.push({ role: "system", content: payload.instructions });
  }

  // Track pending tool_call ids so we can detect missing tool responses and
  // backfill placeholders (DeepSeek rejects tool_calls without matching tool messages).
  const pendingToolCallIds: string[] = [];

  for (const item of inputItems) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item });
      continue;
    }
    if (!isRecord(item)) continue;
    if (item.type === "function_call_output") {
      const callId = typeof item.call_id === "string" ? item.call_id : "";
      messages.push({
        role: "tool",
        tool_call_id: callId,
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? ""),
      });
      // Mark this call_id as resolved.
      const idx = pendingToolCallIds.indexOf(callId);
      if (idx >= 0) pendingToolCallIds.splice(idx, 1);
      continue;
    }
    if (item.type === "function_call") {
      // Before adding a new assistant tool_calls message, backfill any
      // unresolved tool responses from a previous tool_calls message.
      // DeepSeek rejects "tool_calls must be followed by tool messages".
      if (pendingToolCallIds.length > 0) {
        for (const unresolvedId of pendingToolCallIds) {
          messages.push({
            role: "tool",
            tool_call_id: unresolvedId,
            content: "",
          });
        }
        pendingToolCallIds.length = 0;
      }

      const callId = item.call_id ?? item.id ?? `call_${randomUUID()}`;
      pendingToolCallIds.push(callId as string);
      messages.push({
        role: "assistant",
        content: null,
        // DeepSeek reasoning models require every assistant message with
        // tool_calls to carry a non-empty `reasoning_content`. Backfill a
        // placeholder so the upstream doesn't reject the request.
        // (cf. cc-switch ensure_tool_call_reasoning_content)
        reasoning_content: "tool call",
        tool_calls: [
          {
            id: callId,
            type: "function",
            function: {
              name: item.name,
              arguments:
                typeof item.arguments === "string"
                  ? item.arguments
                  : JSON.stringify(item.arguments ?? {}),
            },
          },
        ],
      });
      continue;
    }
    const role = item.role === "developer" ? "system" : (item.role ?? "user");
    messages.push({
      role,
      content: responsesContentToChatContent(item.content ?? item.text ?? ""),
    });
  }

  // Backfill any trailing unresolved tool calls. DeepSeek rejects a request
  // where the last assistant message has tool_calls but no matching tool
  // responses follow it.
  if (pendingToolCallIds.length > 0) {
    for (const unresolvedId of pendingToolCallIds) {
      messages.push({
        role: "tool",
        tool_call_id: unresolvedId,
        content: "",
      });
    }
  }

  return messages;
}

function responsesToolsToChatTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return undefined;
  const converted = tools.flatMap((tool) => {
    if (!isRecord(tool) || tool.type !== "function" || typeof tool.name !== "string") return [];
    return [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: tool.strict,
        },
      },
    ];
  });
  return converted.length > 0 ? converted : undefined;
}

export function responsesPayloadToChatPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return responsesPayloadToChatPayloadWithContext(payload).chatPayload;
}

export function responsesPayloadToChatPayloadWithContext(payload: Record<string, unknown>): {
  chatPayload: Record<string, unknown>;
  contextInputItems: unknown[];
} {
  const contextInputItems = responseContextInputItems(payload);
  const result: Record<string, unknown> = {
    model: payload.model,
    messages: responsesInputToMessages(payload, contextInputItems),
    stream: payload.stream === true,
  };
  const tools = responsesToolsToChatTools(payload.tools);
  if (tools) result.tools = tools;
  if (payload.tool_choice !== undefined) result.tool_choice = payload.tool_choice;
  if (payload.temperature !== undefined) result.temperature = payload.temperature;
  if (payload.top_p !== undefined) result.top_p = payload.top_p;
  if (payload.max_output_tokens !== undefined) result.max_tokens = payload.max_output_tokens;
  return { chatPayload: result, contextInputItems };
}

export async function proxyGatewayChat(input: {
  config: GatewayConfig;
  payload: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal | null;
}): Promise<Response> {
  const requestedModel =
    typeof input.payload.model === "string" ? input.payload.model.trim() : null;
  const { channel, model } = resolveGatewayChannel(input.config, requestedModel);
  if (!channel || !channel.enabled || !channel.baseUrl || !model) {
    return Response.json(
      { error: { type: "peakcode_gateway_error", message: "Gateway channel is not configured." } },
      { status: 400 },
    );
  }
  return fetch(joinUrl(channel.baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: input.payload.stream === true ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({ ...input.payload, model }),
    signal: input.signal ?? null,
  });
}

function chatToolCallsToResponseItems(toolCalls: unknown): unknown[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.flatMap((toolCall) => {
    if (!isRecord(toolCall) || !isRecord(toolCall.function)) return [];
    const callId =
      typeof toolCall.id === "string" && toolCall.id ? toolCall.id : `call_${randomUUID()}`;
    return [
      {
        id: `fc_${randomUUID()}`,
        type: "function_call",
        status: "completed",
        call_id: callId,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments ?? "{}",
      },
    ];
  });
}

export async function chatResponseToResponsesResponse(
  response: Response,
  requestedModel: unknown,
  contextInputItems?: readonly unknown[],
): Promise<Response> {
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isRecord(payload))
    return Response.json(payload, { status: response.status });
  const firstChoice =
    Array.isArray(payload.choices) && isRecord(payload.choices[0]) ? payload.choices[0] : null;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null;
  const output: unknown[] = [];
  const text = message ? textFromContent(message.content) : "";
  if (text) {
    output.push({
      id: `msg_${randomUUID()}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    });
  }
  if (message) output.push(...chatToolCallsToResponseItems(message.tool_calls));
  const responseId = typeof payload.id === "string" ? payload.id : `resp_${randomUUID()}`;
  rememberResponseContext(responseId, contextInputItems, output);
  return Response.json(
    {
      id: responseId,
      object: "response",
      created_at:
        typeof payload.created === "number" ? payload.created : Math.floor(Date.now() / 1000),
      status: "completed",
      model: requestedModel ?? payload.model,
      output,
      usage: payload.usage,
    },
    { status: response.status },
  );
}

function sse(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function chatStreamToResponsesStream(
  response: Response,
  requestedModel: unknown,
  contextInputItems?: readonly unknown[],
): Response {
  if (!response.body) {
    return Response.json(
      { error: { type: "peakcode_gateway_error", message: "Upstream returned an empty stream." } },
      { status: 502 },
    );
  }
  const responseId = `resp_${randomUUID()}`;
  const messageId = `msg_${randomUUID()}`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const body = response.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event)));
      send({
        type: "response.created",
        response: {
          id: responseId,
          object: "response",
          status: "in_progress",
          model: requestedModel,
          output: [],
        },
      });
      send({
        type: "response.in_progress",
        response: {
          id: responseId,
          object: "response",
          status: "in_progress",
          model: requestedModel,
          output: [],
        },
      });
      let buffer = "";
      let text = "";
      let messageStarted = false;
      const toolCalls = new Map<
        number,
        { id: string; callId: string; name: string; arguments: string; outputIndex: number }
      >();
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/u);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const data = block
              .split(/\r?\n/u)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (!data || data === "[DONE]") continue;
            let chunk: unknown;
            try {
              chunk = JSON.parse(data);
            } catch {
              continue;
            }
            if (!isRecord(chunk) || !Array.isArray(chunk.choices)) continue;
            for (const choice of chunk.choices) {
              if (!isRecord(choice) || !isRecord(choice.delta)) continue;
              const delta = choice.delta;
              if (typeof delta.content === "string" && delta.content) {
                if (!messageStarted) {
                  messageStarted = true;
                  send({
                    type: "response.output_item.added",
                    output_index: 0,
                    item: {
                      id: messageId,
                      type: "message",
                      status: "in_progress",
                      role: "assistant",
                      content: [],
                    },
                  });
                  send({
                    type: "response.content_part.added",
                    item_id: messageId,
                    output_index: 0,
                    content_index: 0,
                    part: { type: "output_text", text: "", annotations: [] },
                  });
                }
                text += delta.content;
                send({
                  type: "response.output_text.delta",
                  item_id: messageId,
                  output_index: 0,
                  content_index: 0,
                  delta: delta.content,
                });
              }
              if (!Array.isArray(delta.tool_calls)) continue;
              for (const rawToolCall of delta.tool_calls) {
                if (!isRecord(rawToolCall)) continue;
                const index = typeof rawToolCall.index === "number" ? rawToolCall.index : 0;
                const fn = isRecord(rawToolCall.function) ? rawToolCall.function : {};
                let toolCall = toolCalls.get(index);
                if (!toolCall) {
                  const callId =
                    typeof rawToolCall.id === "string" && rawToolCall.id
                      ? rawToolCall.id
                      : `call_${randomUUID()}`;
                  toolCall = {
                    id: `fc_${randomUUID()}`,
                    callId,
                    name: typeof fn.name === "string" ? fn.name : "",
                    arguments: "",
                    outputIndex: (messageStarted ? 1 : 0) + toolCalls.size,
                  };
                  toolCalls.set(index, toolCall);
                  send({
                    type: "response.output_item.added",
                    output_index: toolCall.outputIndex,
                    item: {
                      id: toolCall.id,
                      type: "function_call",
                      status: "in_progress",
                      call_id: callId,
                      name: toolCall.name,
                      arguments: "",
                    },
                  });
                }
                if (typeof fn.name === "string" && fn.name) toolCall.name = fn.name;
                if (typeof fn.arguments === "string" && fn.arguments) {
                  toolCall.arguments += fn.arguments;
                  send({
                    type: "response.function_call_arguments.delta",
                    item_id: toolCall.id,
                    output_index: toolCall.outputIndex,
                    delta: fn.arguments,
                  });
                }
              }
            }
          }
        }
        if (messageStarted) {
          send({
            type: "response.output_text.done",
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            text,
          });
          send({
            type: "response.content_part.done",
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            part: { type: "output_text", text, annotations: [] },
          });
          send({
            type: "response.output_item.done",
            output_index: 0,
            item: {
              id: messageId,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [{ type: "output_text", text, annotations: [] }],
            },
          });
        }
        for (const toolCall of toolCalls.values()) {
          send({
            type: "response.function_call_arguments.done",
            item_id: toolCall.id,
            output_index: toolCall.outputIndex,
            arguments: toolCall.arguments,
          });
          send({
            type: "response.output_item.done",
            output_index: toolCall.outputIndex,
            item: {
              id: toolCall.id,
              type: "function_call",
              status: "completed",
              call_id: toolCall.callId,
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          });
        }
        const output = [
          ...(messageStarted
            ? [
                {
                  id: messageId,
                  type: "message",
                  status: "completed",
                  role: "assistant",
                  content: [{ type: "output_text", text, annotations: [] }],
                },
              ]
            : []),
          ...Array.from(toolCalls.values()).map((toolCall) => ({
            id: toolCall.id,
            type: "function_call",
            status: "completed",
            call_id: toolCall.callId,
            name: toolCall.name,
            arguments: toolCall.arguments,
          })),
        ];
        rememberResponseContext(responseId, contextInputItems, output);
        send({
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            status: "completed",
            model: requestedModel,
            output,
          },
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (cause) {
        controller.error(cause);
      } finally {
        reader.releaseLock();
      }
    },
  });
  return new Response(stream, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ------------------------------------------------------------------
// Channel-adapter dispatcher
// ------------------------------------------------------------------
// Routes a normalized OpenAI chat/completions payload to the right upstream
// protocol handler based on the resolved channel `kind`. `openai` channels
// (DeepSeek, Kimi, ...) forward the payload verbatim; `mimo` channels
// translate to/from Xiaomi MiMo's private protocol (see mimoAdapter.ts).
//
// The dispatcher always returns an OpenAI-shaped chat/completions Response
// (stream or JSON), so the /responses route can uniformly feed it into the
// existing chat<->responses converters above.

export interface GatewayChatRequest {
  /** The resolved upstream channel. The caller has already done model routing. */
  readonly channel: GatewayChannelConfig;
  /**
   * OpenAI chat/completions payload. `model` is the resolved upstream model
   * (channel prefix already stripped by resolveGatewayChannel).
   */
  readonly chatPayload: Record<string, unknown>;
  /** Resolved secret values keyed by secret id; missing slots are omitted. */
  readonly secrets: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal | null;
}

async function sendOpenaiChat(request: GatewayChatRequest): Promise<Response> {
  // proxyGatewayChat re-resolves the channel from `config`; we already have a
  // single resolved channel, so pass a one-channel config and re-stamp the
  // model to the resolved value to keep the upstream body shape stable.
  return proxyGatewayChat({
    config: {
      enabled: true,
      activeChannelId: request.channel.id,
      channels: [request.channel],
    },
    payload: request.chatPayload,
    apiKey: request.secrets.apiKey ?? "",
    signal: request.signal ?? null,
  });
}

async function sendMimoChatRequest(request: GatewayChatRequest): Promise<Response> {
  const missing = mimoMissingSecrets(request.secrets);
  if (missing.length > 0) {
    return Response.json(
      {
        error: {
          type: "peakcode_gateway_error",
          message: `MiMo channel '${request.channel.id}' is missing required secrets: ${missing.join(", ")}.`,
        },
      },
      { status: 401 },
    );
  }
  return sendMimoChat({
    baseUrl: request.channel.baseUrl,
    chatPayload: request.chatPayload,
    secrets: request.secrets,
    signal: request.signal ?? null,
  });
}

/**
 * Dispatches a gateway chat request to the adapter matching the channel kind.
 * Throws for unknown kinds (unreachable while `kind` stays a closed literal);
 * callers should treat a throw as a 500.
 */
export function dispatchGatewayChat(request: GatewayChatRequest): Promise<Response> {
  switch (request.channel.kind) {
    case "openai":
      return sendOpenaiChat(request);
    case "mimo":
      return sendMimoChatRequest(request);
    case "anthropic":
      // Anthropic-native channels speak the Messages API, not OpenAI Chat.
      // Callers must route them through dispatchAnthropicMessages instead.
      throw new Error(
        "Anthropic-native channels cannot be dispatched via the OpenAI Chat path; use /gateway/anthropic/v1/messages.",
      );
    default: {
      const exhaustive: never = request.channel.kind;
      throw new Error(`Unsupported gateway channel kind: ${String(exhaustive)}`);
    }
  }
}
