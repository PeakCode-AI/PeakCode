import type http from "node:http";
import { randomUUID } from "node:crypto";

import Mime from "@effect/platform-node/Mime";
import {
  AuthBootstrapInput,
  AuthCreatePairingCredentialInput,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  type GatewayConfig,
  type GatewayUpstreamConfig,
  type GatewayUpstreamProvider,
} from "@peakcode/contracts";
import { DateTime, Effect, Exit, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  ATTACHMENTS_ROUTE_PREFIX,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths";
import { resolveAttachmentPathById } from "./attachmentStore.ts";
import {
  authErrorResponse,
  makeEffectAuthRequest,
  makeNodeAuthRequest,
  serveAuthHttpRoute,
} from "./auth/http";
import { ServerAuth } from "./auth/Services/ServerAuth";
import { ServerSecretStore } from "./auth/Services/ServerSecretStore";
import type { ServerAuthShape } from "./auth/Services/ServerAuth";
import type { ServerSecretStoreShape } from "./auth/Services/ServerSecretStore";
import type { SessionCredentialServiceShape } from "./auth/Services/SessionCredentialService";
import { SessionCredentialService } from "./auth/Services/SessionCredentialService";
import { deriveAuthClientMetadata } from "./auth/utils";
import { ServerConfig, type ServerConfigShape } from "./config";
import { LOCAL_IMAGE_ROUTE_PATH, resolveAllowedLocalImageFile } from "./localImageFiles.ts";
import type { ProjectFaviconResolverShape } from "./project/Services/ProjectFaviconResolver";
import { ProjectFaviconResolver } from "./project/Services/ProjectFaviconResolver";
import type { ServerReadiness } from "./server/readiness";
import { ServerSettingsService } from "./serverSettings";
import type { ServerSettingsShape } from "./serverSettings";

const PROJECT_FAVICON_CACHE_CONTROL = "public, max-age=3600";
const decodeBootstrapInput = Schema.decodeUnknownEffect(AuthBootstrapInput);
const decodeCreatePairingCredentialInput = Schema.decodeUnknownEffect(
  AuthCreatePairingCredentialInput,
);
const decodeRevokePairingLinkInput = Schema.decodeUnknownEffect(AuthRevokePairingLinkInput);
const decodeRevokeClientSessionInput = Schema.decodeUnknownEffect(AuthRevokeClientSessionInput);
const DEEPSEEK_GATEWAY_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
const DEEPSEEK_GATEWAY_MODEL_ALIASES = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
} as const;

export function makeEffectHttpRouteLayer(readiness: ServerReadiness) {
  return Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/health",
      readiness.getSnapshot.pipe(
        Effect.map((snapshot) =>
          HttpServerResponse.jsonUnsafe(
            {
              status: "ok",
              startupReady: snapshot.startupReady,
              pushBusReady: snapshot.pushBusReady,
              keybindingsReady: snapshot.keybindingsReady,
              terminalSubscriptionsReady: snapshot.terminalSubscriptionsReady,
              orchestrationSubscriptionsReady: snapshot.orchestrationSubscriptionsReady,
            },
            { status: 200 },
          ),
        ),
      ),
    ),
    authEffectRouteLayer,
    gatewayEffectRouteLayer,
    projectFaviconEffectRouteLayer,
    localImageEffectRouteLayer,
    attachmentsEffectRouteLayer,
    staticAndDevEffectRouteLayer,
  );
}

const requireAuthenticatedRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  yield* serverAuth.authenticateHttpRequest(makeEffectAuthRequest(request));
});

const requireGatewayRequestAccess = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const config = yield* ServerConfig;
  const url = HttpServerRequest.toURL(request);
  if (
    (url && isLegacyTokenAuthorized({ config, url })) ||
    isLegacyBearerAuthorized({ config, headers: request.headers })
  ) {
    return;
  }
  const serverAuth = yield* ServerAuth;
  yield* serverAuth.authenticateHttpRequest(makeEffectAuthRequest(request));
});

export function isLegacyTokenAuthorized(input: {
  readonly config: ServerConfigShape;
  readonly url: URL;
}): boolean {
  const legacyToken = input.url.searchParams.get("token");
  return !input.config.authToken || legacyToken === input.config.authToken;
}

export function isLegacyBearerAuthorized(input: {
  readonly config: ServerConfigShape;
  readonly headers: Record<string, string | string[] | undefined>;
}): boolean {
  if (!input.config.authToken) return true;
  const authorization = input.headers.authorization;
  const header = Array.isArray(authorization) ? authorization.join(", ") : authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length).trim() === input.config.authToken;
}

function encodeCookie(input: {
  readonly name: string;
  readonly value: string;
  readonly expiresAt: DateTime.DateTime;
}) {
  return `${encodeURIComponent(input.name)}=${encodeURIComponent(input.value)}; Expires=${DateTime.toDate(input.expiresAt).toUTCString()}; HttpOnly; Path=/; SameSite=Lax`;
}

const readEffectJson = (request: HttpServerRequest.HttpServerRequest, message: string) =>
  request.json.pipe(
    Effect.mapError(
      (cause) =>
        new (class extends Error {
          override readonly cause = cause;
        })(message),
    ),
  );

const authEffectRouteLayer = HttpRouter.add(
  "*",
  "/api/auth/*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* ServerAuth;
    const sessions = yield* SessionCredentialService;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });
    const authRequest = makeEffectAuthRequest(request);

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      return HttpServerResponse.jsonUnsafe(yield* serverAuth.getSessionState(authRequest));
    }

    if (request.method === "POST" && url.pathname === "/api/auth/bootstrap") {
      const payload = yield* readEffectJson(request, "Invalid bootstrap payload.").pipe(
        Effect.flatMap(decodeBootstrapInput),
        Effect.mapError((cause) => ({
          message: "Invalid bootstrap payload.",
          status: 400 as const,
          cause,
        })),
      );
      const result = yield* serverAuth.exchangeBootstrapCredential(payload.credential, {
        ...deriveAuthClientMetadata({
          headers: request.headers,
          remoteAddress: request.remoteAddress ?? null,
        }),
      });
      return HttpServerResponse.jsonUnsafe(result.response, {
        headers: {
          "Set-Cookie": encodeCookie({
            name: sessions.cookieName,
            value: result.sessionToken,
            expiresAt: result.response.expiresAt,
          }),
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/bootstrap/bearer") {
      const payload = yield* readEffectJson(request, "Invalid bootstrap payload.").pipe(
        Effect.flatMap(decodeBootstrapInput),
        Effect.mapError((cause) => ({
          message: "Invalid bootstrap payload.",
          status: 400 as const,
          cause,
        })),
      );
      return HttpServerResponse.jsonUnsafe(
        yield* serverAuth.exchangeBootstrapCredentialForBearerSession(payload.credential, {
          ...deriveAuthClientMetadata({
            headers: request.headers,
            remoteAddress: request.remoteAddress ?? null,
          }),
        }),
      );
    }

    if (request.method === "POST" && url.pathname === "/api/auth/ws-token") {
      const session = yield* serverAuth.authenticateHttpRequest(authRequest);
      return HttpServerResponse.jsonUnsafe(yield* serverAuth.issueWebSocketToken(session));
    }

    if (request.method === "POST" && url.pathname === "/api/auth/pairing-token") {
      const session = yield* serverAuth.authenticateHttpRequest(authRequest);
      if (session.role !== "owner")
        return HttpServerResponse.jsonUnsafe(
          { error: "Only owner sessions can create pairing credentials." },
          { status: 403 },
        );
      const payload =
        Number(request.headers["content-length"] ?? "0") > 0
          ? yield* readEffectJson(request, "Invalid pairing credential payload.").pipe(
              Effect.flatMap(decodeCreatePairingCredentialInput),
              Effect.mapError((cause) => ({
                message: "Invalid pairing credential payload.",
                status: 400 as const,
                cause,
              })),
            )
          : {};
      return HttpServerResponse.jsonUnsafe(yield* serverAuth.issuePairingCredential(payload));
    }

    const ownerSession = Effect.gen(function* () {
      const session = yield* serverAuth.authenticateHttpRequest(authRequest);
      if (session.role !== "owner") {
        return yield* Effect.fail({
          message: "Only owner sessions can manage network access.",
          status: 403 as const,
        });
      }
      return session;
    });

    if (request.method === "GET" && url.pathname === "/api/auth/pairing-links") {
      yield* ownerSession;
      return HttpServerResponse.jsonUnsafe(yield* serverAuth.listPairingLinks());
    }

    if (request.method === "POST" && url.pathname === "/api/auth/pairing-links/revoke") {
      yield* ownerSession;
      const payload = yield* readEffectJson(request, "Invalid revoke pairing link payload.").pipe(
        Effect.flatMap(decodeRevokePairingLinkInput),
        Effect.mapError((cause) => ({
          message: "Invalid revoke pairing link payload.",
          status: 400 as const,
          cause,
        })),
      );
      return HttpServerResponse.jsonUnsafe({
        revoked: yield* serverAuth.revokePairingLink(payload.id),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/clients") {
      const session = yield* ownerSession;
      return HttpServerResponse.jsonUnsafe(yield* serverAuth.listClientSessions(session.sessionId));
    }

    if (request.method === "POST" && url.pathname === "/api/auth/clients/revoke") {
      const session = yield* ownerSession;
      const payload = yield* readEffectJson(request, "Invalid revoke client payload.").pipe(
        Effect.flatMap(decodeRevokeClientSessionInput),
        Effect.mapError((cause) => ({
          message: "Invalid revoke client payload.",
          status: 400 as const,
          cause,
        })),
      );
      return HttpServerResponse.jsonUnsafe({
        revoked: yield* serverAuth.revokeClientSession(session.sessionId, payload.sessionId),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/clients/revoke-others") {
      const session = yield* ownerSession;
      return HttpServerResponse.jsonUnsafe({
        revokedCount: yield* serverAuth.revokeOtherClientSessions(session.sessionId),
      });
    }

    return HttpServerResponse.text("Not Found", { status: 404 });
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          {
            error:
              error instanceof Error
                ? error.message
                : String((error as { message?: unknown }).message ?? error),
          },
          {
            status:
              typeof (error as { status?: unknown }).status === "number"
                ? (error as { status: number }).status
                : 500,
          },
        ),
      ),
    ),
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upstreamSecretName(provider: GatewayUpstreamProvider): string {
  return `gateway.upstream.${provider}.apiKey`;
}

function joinGatewayUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${suffix.replace(/^\/+/u, "")}`;
}

function makeGatewayJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function resolveGatewayUpstream(input: {
  readonly config: GatewayConfig;
  readonly model: string | null;
}): {
  readonly upstream: GatewayUpstreamConfig | null;
  readonly requestedModel: string | null;
  readonly resolvedModel: string | null;
} {
  const enabledProviders = new Set(input.config.upstreamProviders.map((upstream) => upstream.provider));
  const slashIndex = input.model?.indexOf("/") ?? -1;
  const prefixedProvider =
    input.model && slashIndex > 0
      ? (input.model.slice(0, slashIndex) as GatewayUpstreamProvider)
      : null;
  const provider =
    prefixedProvider && enabledProviders.has(prefixedProvider)
      ? prefixedProvider
      : input.config.defaultUpstreamProvider;
  const upstream =
    input.config.upstreamProviders.find((candidate) => candidate.provider === provider) ?? null;
  const requestedModel =
    input.model === provider
      ? (upstream?.defaultModel ?? null)
      : input.model && prefixedProvider === provider
        ? input.model.slice(slashIndex + 1)
        : input.model || upstream?.defaultModel || null;
  const modelAliases: Record<string, string> =
    upstream?.provider === "deepseek"
      ? { ...DEEPSEEK_GATEWAY_MODEL_ALIASES, ...upstream.modelAliases }
      : (upstream?.modelAliases ?? {});
  const resolvedModel = requestedModel
    ? (modelAliases[requestedModel] ?? requestedModel)
    : null;
  return { upstream, requestedModel, resolvedModel };
}

function gatewayErrorResponse(message: string, status: number) {
  return HttpServerResponse.jsonUnsafe(
    {
      error: {
        message,
        type: "peakcode_gateway_error",
      },
    },
    { status },
  );
}

function makeGatewayModelsPayload(gatewayConfig: GatewayConfig) {
  return {
    object: "list",
    data: gatewayConfig.upstreamProviders.flatMap((upstream) => {
      if (!upstream.enabled) return [];
      const modelIds = new Set<string>(upstream.customModels);
      if (upstream.defaultModel) modelIds.add(upstream.defaultModel);
      if (upstream.provider === "deepseek") {
        for (const model of DEEPSEEK_GATEWAY_MODELS) {
          modelIds.add(model);
        }
      }
      return Array.from(modelIds).map((model) => ({
        id: `${upstream.provider}/${model}`,
        object: "model",
        created: 0,
        owned_by: upstream.provider,
      }));
    }),
  };
}

async function proxyGatewayChatCompletion(input: {
  readonly gatewayConfig: GatewayConfig;
  readonly payload: Record<string, unknown>;
  readonly apiKey: string;
  readonly accept?: string | undefined;
}): Promise<Response> {
  const requestedModel = typeof input.payload.model === "string" ? input.payload.model.trim() : null;
  const { upstream, resolvedModel } = resolveGatewayUpstream({
    config: input.gatewayConfig,
    model: requestedModel,
  });
  if (!upstream) {
    return Response.json(
      { error: { message: "No gateway upstream provider is configured.", type: "peakcode_gateway_error" } },
      { status: 400 },
    );
  }
  if (!upstream.enabled) {
    return Response.json(
      {
        error: {
          message: `Gateway upstream provider '${upstream.provider}' is disabled.`,
          type: "peakcode_gateway_error",
        },
      },
      { status: 400 },
    );
  }
  if (upstream.protocol !== "openai-compatible") {
    return Response.json(
      {
        error: {
          message: `Gateway upstream provider '${upstream.provider}' is not OpenAI-compatible.`,
          type: "peakcode_gateway_error",
        },
      },
      { status: 400 },
    );
  }
  if (!resolvedModel) {
    return Response.json(
      {
        error: {
          message: `Gateway upstream provider '${upstream.provider}' has no model configured.`,
          type: "peakcode_gateway_error",
        },
      },
      { status: 400 },
    );
  }
  if (upstream.baseUrl.trim().length === 0) {
    return Response.json(
      {
        error: {
          message: `Gateway upstream provider '${upstream.provider}' has no base URL configured.`,
          type: "peakcode_gateway_error",
        },
      },
      { status: 400 },
    );
  }

  return fetch(joinGatewayUrl(upstream.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: input.accept ?? "application/json",
    },
    body: JSON.stringify({
      ...input.payload,
      model: resolvedModel,
    }),
  });
}

function readGatewayText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const text = value.text;
  if (typeof text === "string") return text;
  const content = value.content;
  if (typeof content === "string") return content;
  return null;
}

function flattenGatewayContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    return readGatewayText(content) ?? "";
  }
  return content
    .flatMap((part) => {
      const text = readGatewayText(part);
      return text ? [text] : [];
    })
    .join("\n");
}

function responseInputToChatMessages(payload: Record<string, unknown>): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  if (typeof payload.instructions === "string" && payload.instructions.trim().length > 0) {
    messages.push({ role: "system", content: payload.instructions });
  }

  const input = payload.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }

  if (!Array.isArray(input)) return messages;

  for (const item of input) {
    if (!isRecord(item)) continue;
    const roleValue = typeof item.role === "string" ? item.role : "user";
    const role = roleValue === "developer" ? "system" : roleValue;
    const content = flattenGatewayContentText(item.content ?? item.text);
    if (content.length > 0) {
      messages.push({ role, content });
      continue;
    }
    if (item.type === "function_call_output" && typeof item.output === "string") {
      messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
    }
  }

  return messages;
}

function responsesToolsToChatTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return undefined;
  const chatTools = tools.flatMap((tool) => {
    if (!isRecord(tool) || tool.type !== "function" || typeof tool.name !== "string") return [];
    return [
      {
        type: "function",
        function: {
          name: tool.name,
          description: typeof tool.description === "string" ? tool.description : undefined,
          parameters: isRecord(tool.parameters) ? tool.parameters : undefined,
          strict: typeof tool.strict === "boolean" ? tool.strict : undefined,
        },
      },
    ];
  });
  return chatTools.length > 0 ? chatTools : undefined;
}

function responsePayloadToChatPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const chatPayload: Record<string, unknown> = {
    model: payload.model,
    messages: responseInputToChatMessages(payload),
    stream: payload.stream === true,
  };
  for (const key of ["temperature", "top_p", "presence_penalty", "frequency_penalty"] as const) {
    if (payload[key] !== undefined) chatPayload[key] = payload[key];
  }
  if (payload.max_output_tokens !== undefined) chatPayload.max_tokens = payload.max_output_tokens;
  const tools = responsesToolsToChatTools(payload.tools);
  if (tools) chatPayload.tools = tools;
  if (payload.tool_choice !== undefined) chatPayload.tool_choice = payload.tool_choice;
  return chatPayload;
}

function makeResponseId(source: unknown): string {
  return typeof source === "string" && source.length > 0 ? source : `resp_${randomUUID()}`;
}

function chatMessageToResponseOutput(message: unknown): unknown[] {
  if (!isRecord(message)) return [];
  const output: unknown[] = [];
  const content = flattenGatewayContentText(message.content);
  if (content.length > 0) {
    output.push({
      id: `msg_${randomUUID()}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: content, annotations: [] }],
    });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      if (!isRecord(toolCall) || !isRecord(toolCall.function)) continue;
      output.push({
        id: typeof toolCall.id === "string" ? toolCall.id : `fc_${randomUUID()}`,
        type: "function_call",
        status: "completed",
        call_id: typeof toolCall.id === "string" ? toolCall.id : `call_${randomUUID()}`,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      });
    }
  }
  return output;
}

async function chatCompletionToResponsePayload(response: Response, requestedModel: unknown): Promise<Response> {
  const payload = await response.json();
  if (!response.ok) return makeGatewayJsonResponse(payload, response.status);
  const firstChoice =
    isRecord(payload) && Array.isArray(payload.choices) && isRecord(payload.choices[0])
      ? payload.choices[0]
      : null;
  const responsePayload = {
    id: makeResponseId(isRecord(payload) ? payload.id : null),
    object: "response",
    created_at:
      isRecord(payload) && typeof payload.created === "number"
        ? payload.created
        : Math.floor(Date.now() / 1000),
    status: "completed",
    model:
      typeof requestedModel === "string"
        ? requestedModel
        : isRecord(payload) && typeof payload.model === "string"
          ? payload.model
          : undefined,
    output: firstChoice ? chatMessageToResponseOutput(firstChoice.message) : [],
    usage: isRecord(payload) ? payload.usage : undefined,
  };
  return makeGatewayJsonResponse(responsePayload, response.status);
}

function encodeGatewaySseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamChatCompletionAsResponse(input: {
  readonly upstreamResponse: Response;
  readonly requestedModel: unknown;
}): Response {
  const responseId = `resp_${randomUUID()}`;
  const itemId = `msg_${randomUUID()}`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstreamBody = input.upstreamResponse.body;
  if (!upstreamBody) {
    return makeGatewayJsonResponse(
      { error: { message: "Gateway upstream stream was empty.", type: "peakcode_gateway_error" } },
      502,
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(encodeGatewaySseEvent(event, data)));
      send("response.created", {
        type: "response.created",
        response: {
          id: responseId,
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          status: "in_progress",
          model: input.requestedModel,
          output: [],
        },
      });
      send("response.output_item.added", {
        type: "response.output_item.added",
        output_index: 0,
        item: { id: itemId, type: "message", status: "in_progress", role: "assistant", content: [] },
      });
      send("response.content_part.added", {
        type: "response.content_part.added",
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      });

      const reader = upstreamBody.getReader();
      let buffer = "";
      let text = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const rawEvent of events) {
            const dataLines = rawEvent
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice("data:".length).trim());
            const data = dataLines.join("\n");
            if (!data || data === "[DONE]") continue;
            const chunk = JSON.parse(data) as unknown;
            const choices = isRecord(chunk) && Array.isArray(chunk.choices) ? chunk.choices : [];
            for (const choice of choices) {
              if (!isRecord(choice) || !isRecord(choice.delta)) continue;
              const delta = choice.delta.content;
              if (typeof delta !== "string" || delta.length === 0) continue;
              text += delta;
              send("response.output_text.delta", {
                type: "response.output_text.delta",
                response_id: responseId,
                item_id: itemId,
                output_index: 0,
                content_index: 0,
                delta,
              });
            }
          }
        }
        send("response.output_text.done", {
          type: "response.output_text.done",
          response_id: responseId,
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          text,
        });
        send("response.content_part.done", {
          type: "response.content_part.done",
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text, annotations: [] },
        });
        send("response.output_item.done", {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: itemId,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text, annotations: [] }],
          },
        });
        send("response.completed", {
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            status: "completed",
            model: input.requestedModel,
            output: [
              {
                id: itemId,
                type: "message",
                status: "completed",
                role: "assistant",
                content: [{ type: "output_text", text, annotations: [] }],
              },
            ],
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
    status: input.upstreamResponse.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function proxyGatewayResponse(input: {
  readonly gatewayConfig: GatewayConfig;
  readonly payload: Record<string, unknown>;
  readonly apiKey: string;
  readonly accept?: string | undefined;
}): Promise<Response> {
  const chatPayload = responsePayloadToChatPayload(input.payload);
  const upstreamResponse = await proxyGatewayChatCompletion({
    gatewayConfig: input.gatewayConfig,
    payload: chatPayload,
    apiKey: input.apiKey,
    accept: chatPayload.stream === true ? "text/event-stream" : input.accept,
  });
  if (!upstreamResponse.ok) return upstreamResponse;
  if (chatPayload.stream === true) {
    return streamChatCompletionAsResponse({
      upstreamResponse,
      requestedModel: input.payload.model,
    });
  }
  return chatCompletionToResponsePayload(upstreamResponse, input.payload.model);
}

const gatewayEffectRouteLayer = HttpRouter.add(
  "*",
  "/gateway/openai/v1/*",
  Effect.gen(function* () {
    yield* requireGatewayRequestAccess;

    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return gatewayErrorResponse("Bad Request", 400);

    const settings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;
    const gatewayConfig = (yield* settings.getSettings).gateway;
    if (!gatewayConfig.enabled) {
      return gatewayErrorResponse("PeakCode gateway is disabled.", 503);
    }

    if (request.method === "GET" && url.pathname === "/gateway/openai/v1/models") {
      return HttpServerResponse.jsonUnsafe(makeGatewayModelsPayload(gatewayConfig));
    }

    const isChatCompletions = url.pathname === "/gateway/openai/v1/chat/completions";
    const isResponses = url.pathname === "/gateway/openai/v1/responses";
    if (request.method !== "POST" || (!isChatCompletions && !isResponses)) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const payload = yield* readEffectJson(request, "Invalid gateway OpenAI-compatible payload.").pipe(
      Effect.mapError(() => ({ message: "Invalid JSON request body.", status: 400 as const })),
    );
    if (!isRecord(payload)) {
      return gatewayErrorResponse("Request body must be a JSON object.", 400);
    }

    const requestedModel = typeof payload.model === "string" ? payload.model.trim() : null;
    const { upstream } = resolveGatewayUpstream({
      config: gatewayConfig,
      model: requestedModel,
    });
    if (!upstream) {
      return gatewayErrorResponse("No gateway upstream provider is configured.", 400);
    }
    if (!upstream.enabled) {
      return gatewayErrorResponse(`Gateway upstream provider '${upstream.provider}' is disabled.`, 400);
    }
    const apiKeyBytes = yield* secretStore.get(upstreamSecretName(upstream.provider));
    const apiKey = apiKeyBytes ? new TextDecoder().decode(apiKeyBytes).trim() : "";
    if (apiKey.length === 0) {
      return gatewayErrorResponse(
        `Gateway upstream provider '${upstream.provider}' has no API key configured.`,
        401,
      );
    }

    const acceptHeader = Array.isArray(request.headers.accept)
      ? request.headers.accept.join(", ")
      : request.headers.accept;
    const upstreamResponse = yield* Effect.tryPromise({
      try: () =>
        isResponses
          ? proxyGatewayResponse({
              gatewayConfig,
              payload,
              apiKey,
              accept: acceptHeader,
            })
          : proxyGatewayChatCompletion({
              gatewayConfig,
              payload,
              apiKey,
              accept: acceptHeader,
            }),
      catch: (cause) => ({
        message: cause instanceof Error ? cause.message : "Gateway upstream request failed.",
        status: 502 as const,
      }),
    });

    return HttpServerResponse.fromWeb(upstreamResponse);
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        gatewayErrorResponse(
          typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "Gateway request failed.",
          typeof (error as { status?: unknown }).status === "number"
            ? (error as { status: number }).status
            : 500,
        ),
      ),
    ),
  ),
);

const projectFaviconEffectRouteLayer = HttpRouter.add(
  "GET",
  "/api/project-favicon",
  Effect.gen(function* () {
    yield* requireAuthenticatedRequest.pipe(
      Effect.catchTag("AuthError", (error) => Effect.fail(error)),
    );
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });
    const projectCwd = url.searchParams.get("cwd");
    if (!projectCwd) return HttpServerResponse.text("Missing cwd parameter", { status: 400 });
    const resolver = yield* ProjectFaviconResolver;
    const faviconPath = yield* resolver.resolvePath(projectCwd);
    if (!faviconPath) {
      if (url.searchParams.get("fallback") === "none")
        return HttpServerResponse.empty({ status: 204 });
      return HttpServerResponse.text(FALLBACK_FAVICON_SVG, {
        status: 200,
        contentType: "image/svg+xml",
        headers: { "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL },
      });
    }
    return yield* HttpServerResponse.file(faviconPath, {
      status: 200,
      headers: { "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL },
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", (error) => Effect.succeed(authErrorResponse(error)))),
);

export const localImageEffectRouteLayer = HttpRouter.add(
  "GET",
  LOCAL_IMAGE_ROUTE_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

    const config = yield* ServerConfig;
    if (!isLegacyTokenAuthorized({ config, url })) {
      yield* requireAuthenticatedRequest;
    }

    const imageFile = yield* Effect.promise(() =>
      resolveAllowedLocalImageFile({
        requestedPath: url.searchParams.get("path"),
        cwd: url.searchParams.get("cwd"),
      }).catch(() => null),
    );
    if (!imageFile) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    // Read the bytes ourselves (mirrors the static-asset route) instead of relying on
    // HttpServerResponse.file, which depends on Etag.Generator/Path services and was
    // failing with a 500 on the local-image preview/download path.
    const fileSystem = yield* FileSystem.FileSystem;
    const data = yield* fileSystem
      .readFile(imageFile.path)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const isDownload = url.searchParams.get("download") === "1";
    const safeFileName = imageFile.fileName.replaceAll('"', "");
    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType: Mime.getType(imageFile.path) ?? "application/octet-stream",
      headers: {
        "Cache-Control": "private, max-age=60",
        ...(isDownload ? { "Content-Disposition": `attachment; filename="${safeFileName}"` } : {}),
      },
    });
  }).pipe(Effect.catchTag("AuthError", (error) => Effect.succeed(authErrorResponse(error)))),
);

export const attachmentsEffectRouteLayer = HttpRouter.add(
  "GET",
  `${ATTACHMENTS_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

    const config = yield* ServerConfig;
    // Desktop image tags cannot attach Authorization headers; preserve the same
    // startup token rule that the WebSocket route already accepts.
    if (!isLegacyTokenAuthorized({ config, url })) {
      yield* requireAuthenticatedRequest;
    }

    const rawRelativePath = url.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length);
    const normalizedRelativePath = normalizeAttachmentRelativePath(rawRelativePath);
    if (!normalizedRelativePath) {
      return HttpServerResponse.text("Invalid attachment path", { status: 400 });
    }

    const isIdLookup =
      !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
    const filePath = isIdLookup
      ? resolveAttachmentPathById({
          attachmentsDir: config.attachmentsDir,
          attachmentId: normalizedRelativePath,
        })
      : resolveAttachmentRelativePath({
          attachmentsDir: config.attachmentsDir,
          relativePath: normalizedRelativePath,
        });
    if (!filePath) {
      return HttpServerResponse.text(isIdLookup ? "Not Found" : "Invalid attachment path", {
        status: isIdLookup ? 404 : 400,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    // Mirror local-image serving instead of using HttpServerResponse.file; the Effect
    // route stack used by the desktop server can miss that helper's file services.
    const data = yield* fileSystem
      .readFile(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType: Mime.getType(filePath) ?? "application/octet-stream",
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }).pipe(Effect.catchTag("AuthError", (error) => Effect.succeed(authErrorResponse(error)))),
);

const staticAndDevEffectRouteLayer = HttpRouter.add(
  "GET",
  "*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

    const config = yield* ServerConfig;
    if (config.devUrl) {
      return HttpServerResponse.redirect(config.devUrl.toString(), { status: 302 });
    }

    if (!config.staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staticRoot = path.resolve(config.staticDir);
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const rawRelativePath = requestPath.replace(/^[/\\]+/, "");
    const relativePath = path.normalize(rawRelativePath).replace(/^[/\\]+/, "");
    if (
      relativePath.length === 0 ||
      rawRelativePath.startsWith("..") ||
      relativePath.startsWith("..") ||
      relativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const isWithinStaticRoot = (candidate: string) =>
      candidate === staticRoot ||
      candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);

    let filePath = path.resolve(staticRoot, relativePath);
    if (!isWithinStaticRoot(filePath)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }
    if (!path.extname(filePath)) {
      filePath = path.resolve(filePath, "index.html");
      if (!isWithinStaticRoot(filePath)) {
        return HttpServerResponse.text("Invalid static file path", { status: 400 });
      }
    }

    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      const indexPath = path.resolve(staticRoot, "index.html");
      const indexData = yield* fileSystem
        .readFile(indexPath)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      if (!indexData) return HttpServerResponse.text("Not Found", { status: 404 });
      return HttpServerResponse.uint8Array(indexData, {
        status: 200,
        contentType: "text/html; charset=utf-8",
      });
    }

    const data = yield* fileSystem
      .readFile(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) return HttpServerResponse.text("Internal Server Error", { status: 500 });
    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType: Mime.getType(filePath) ?? "application/octet-stream",
    });
  }),
);

const FALLBACK_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6b728080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-fallback="project-favicon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>`;

type Respond = (
  statusCode: number,
  headers: Record<string, string | Array<string>>,
  body?: string | Uint8Array,
) => void;

export interface HttpRequestHandlerOptions {
  readonly serverConfig: ServerConfigShape;
  readonly readiness: ServerReadiness;
  readonly fileSystem: FileSystem.FileSystem;
  readonly projectFaviconResolver: ProjectFaviconResolverShape;
  readonly path: Path.Path;
  readonly serverAuth?: ServerAuthShape;
  readonly sessionCredentials?: Pick<SessionCredentialServiceShape, "cookieName">;
  readonly serverSettings?: Pick<ServerSettingsShape, "getSettings">;
  readonly secretStore?: Pick<ServerSecretStoreShape, "get">;
}

function makeResponder(res: http.ServerResponse): Respond {
  return (statusCode, headers, body) => {
    res.writeHead(statusCode, headers);
    res.end(body);
  };
}

export function createHttpRequestHandler({
  serverConfig,
  readiness,
  fileSystem,
  projectFaviconResolver,
  path,
  serverAuth,
  sessionCredentials,
  serverSettings,
  secretStore,
}: HttpRequestHandlerOptions): http.RequestListener {
  const { port, staticDir, devUrl } = serverConfig;

  return (req, res) => {
    const respond = makeResponder(res);

    void Effect.runPromise(
      Effect.gen(function* () {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);

        if (url.pathname === "/health") {
          const readinessSnapshot = yield* readiness.getSnapshot;
          respond(
            200,
            { "Content-Type": "application/json; charset=utf-8" },
            JSON.stringify({
              status: "ok",
              startupReady: readinessSnapshot.startupReady,
              pushBusReady: readinessSnapshot.pushBusReady,
              keybindingsReady: readinessSnapshot.keybindingsReady,
              terminalSubscriptionsReady: readinessSnapshot.terminalSubscriptionsReady,
              orchestrationSubscriptionsReady: readinessSnapshot.orchestrationSubscriptionsReady,
            }),
          );
          return;
        }

        if (url.pathname === "/api/project-favicon") {
          yield* serveProjectFavicon({
            url,
            res,
            respond,
            fileSystem,
            projectFaviconResolver,
          });
          return;
        }

        if (url.pathname.startsWith("/api/auth/")) {
          if (!serverAuth || !sessionCredentials) {
            respond(503, { "Content-Type": "text/plain" }, "Auth service unavailable");
            return;
          }
          const handled = yield* serveAuthHttpRoute({
            url,
            req,
            respond,
            serverAuth,
            sessionCredentials,
          });
          if (handled) return;
        }

        if (url.pathname.startsWith("/gateway/openai/v1/")) {
          if (!serverSettings || !secretStore) {
            respond(503, { "Content-Type": "text/plain" }, "Gateway service unavailable");
            return;
          }
          yield* serveGatewayOpenAi({
            url,
            req,
            respond,
            serverConfig,
            serverAuth,
            serverSettings,
            secretStore,
          });
          return;
        }

        if (url.pathname.startsWith(ATTACHMENTS_ROUTE_PREFIX)) {
          yield* serveAttachment({
            url,
            res,
            respond,
            serverConfig,
            fileSystem,
          });
          return;
        }

        if (devUrl) {
          respond(302, { Location: devUrl.href });
          return;
        }

        if (!staticDir) {
          respond(
            503,
            { "Content-Type": "text/plain" },
            "No static directory configured and no dev URL set.",
          );
          return;
        }

        yield* serveStaticAsset({
          url,
          respond,
          staticDir,
          fileSystem,
          path,
        });
      }),
    ).catch(() => {
      if (!res.headersSent) {
        respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
      }
    });
  };
}

const serveProjectFavicon = Effect.fn(function* (input: {
  readonly url: URL;
  readonly res: http.ServerResponse;
  readonly respond: Respond;
  readonly fileSystem: FileSystem.FileSystem;
  readonly projectFaviconResolver: ProjectFaviconResolverShape;
}) {
  const projectCwd = input.url.searchParams.get("cwd");
  if (!projectCwd) {
    input.respond(400, { "Content-Type": "text/plain" }, "Missing cwd parameter");
    return;
  }

  const faviconPath = yield* input.projectFaviconResolver.resolvePath(projectCwd);
  if (!faviconPath) {
    if (input.url.searchParams.get("fallback") === "none") {
      input.respond(204, { "Cache-Control": "public, max-age=3600" });
      return;
    }
    input.respond(
      200,
      {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
      FALLBACK_FAVICON_SVG,
    );
    return;
  }

  const data = yield* input.fileSystem
    .readFile(faviconPath)
    .pipe(Effect.catch(() => Effect.succeed(null)));
  if (!data) {
    input.respond(500, { "Content-Type": "text/plain" }, "Read error");
    return;
  }

  input.respond(
    200,
    {
      "Content-Type": Mime.getType(faviconPath) ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
    data,
  );
});

const serveAttachment = Effect.fn(function* (input: {
  readonly url: URL;
  readonly res: http.ServerResponse;
  readonly respond: Respond;
  readonly serverConfig: ServerConfigShape;
  readonly fileSystem: FileSystem.FileSystem;
}) {
  const rawRelativePath = input.url.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length);
  const normalizedRelativePath = normalizeAttachmentRelativePath(rawRelativePath);
  if (!normalizedRelativePath) {
    input.respond(400, { "Content-Type": "text/plain" }, "Invalid attachment path");
    return;
  }

  const isIdLookup = !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
  const filePath = isIdLookup
    ? resolveAttachmentPathById({
        attachmentsDir: input.serverConfig.attachmentsDir,
        attachmentId: normalizedRelativePath,
      })
    : resolveAttachmentRelativePath({
        attachmentsDir: input.serverConfig.attachmentsDir,
        relativePath: normalizedRelativePath,
      });
  if (!filePath) {
    input.respond(
      isIdLookup ? 404 : 400,
      { "Content-Type": "text/plain" },
      isIdLookup ? "Not Found" : "Invalid attachment path",
    );
    return;
  }

  const fileInfo = yield* input.fileSystem
    .stat(filePath)
    .pipe(Effect.catch(() => Effect.succeed(null)));
  if (!fileInfo || fileInfo.type !== "File") {
    input.respond(404, { "Content-Type": "text/plain" }, "Not Found");
    return;
  }

  const contentType = Mime.getType(filePath) ?? "application/octet-stream";
  input.res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  const streamExit = yield* Stream.runForEach(input.fileSystem.stream(filePath), (chunk) =>
    Effect.sync(() => {
      if (!input.res.destroyed) {
        input.res.write(chunk);
      }
    }),
  ).pipe(Effect.exit);
  if (Exit.isFailure(streamExit)) {
    if (!input.res.destroyed) {
      input.res.destroy();
    }
    return;
  }
  if (!input.res.writableEnded) {
    input.res.end();
  }
});

async function readNodeRequestBody(req: http.IncomingMessage, limitBytes = 8 * 1024 * 1024) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > limitBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const serveGatewayOpenAi = Effect.fn(function* (input: {
  readonly url: URL;
  readonly req: http.IncomingMessage;
  readonly respond: Respond;
  readonly serverConfig: ServerConfigShape;
  readonly serverAuth?: ServerAuthShape;
  readonly serverSettings: Pick<ServerSettingsShape, "getSettings">;
  readonly secretStore: Pick<ServerSecretStoreShape, "get">;
}) {
  if (
    !isLegacyTokenAuthorized({ config: input.serverConfig, url: input.url }) &&
    !isLegacyBearerAuthorized({ config: input.serverConfig, headers: input.req.headers })
  ) {
    if (!input.serverAuth) {
      input.respond(
        401,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          error: { message: "Authentication required.", type: "peakcode_gateway_error" },
        }),
      );
      return;
    }
    const authExit = yield* input.serverAuth
      .authenticateHttpRequest(makeNodeAuthRequest({ req: input.req, url: input.url }))
      .pipe(Effect.exit);
    if (Exit.isFailure(authExit)) {
      input.respond(
        401,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          error: { message: "Authentication required.", type: "peakcode_gateway_error" },
        }),
      );
      return;
    }
  }

  const gatewayConfig = (yield* input.serverSettings.getSettings).gateway;
  if (!gatewayConfig.enabled) {
    input.respond(
      503,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({
        error: { message: "PeakCode gateway is disabled.", type: "peakcode_gateway_error" },
      }),
    );
    return;
  }

  if (input.req.method === "GET" && input.url.pathname === "/gateway/openai/v1/models") {
    input.respond(
      200,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify(makeGatewayModelsPayload(gatewayConfig)),
    );
    return;
  }

  const isChatCompletions = input.url.pathname === "/gateway/openai/v1/chat/completions";
  const isResponses = input.url.pathname === "/gateway/openai/v1/responses";
  if (input.req.method !== "POST" || (!isChatCompletions && !isResponses)) {
    input.respond(404, { "Content-Type": "text/plain" }, "Not Found");
    return;
  }

  const rawBody = yield* Effect.tryPromise({
    try: () => readNodeRequestBody(input.req),
    catch: () => new Error("Invalid JSON request body."),
  }).pipe(
    Effect.catch(() => {
      input.respond(
        400,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          error: { message: "Invalid JSON request body.", type: "peakcode_gateway_error" },
        }),
      );
      return Effect.succeed(null);
    }),
  );
  if (rawBody === null) return;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    input.respond(
      400,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({
        error: { message: "Invalid JSON request body.", type: "peakcode_gateway_error" },
      }),
    );
    return;
  }
  if (!isRecord(payload)) {
    input.respond(
      400,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({
        error: {
          message: "Request body must be a JSON object.",
          type: "peakcode_gateway_error",
        },
      }),
    );
    return;
  }

  const requestedModel = typeof payload.model === "string" ? payload.model.trim() : null;
  const { upstream } = resolveGatewayUpstream({ config: gatewayConfig, model: requestedModel });
  if (!upstream) {
    input.respond(
      400,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({
        error: {
          message: "No gateway upstream provider is configured.",
          type: "peakcode_gateway_error",
        },
      }),
    );
    return;
  }

  const apiKeyBytes = yield* input.secretStore.get(upstreamSecretName(upstream.provider));
  const apiKey = apiKeyBytes ? new TextDecoder().decode(apiKeyBytes).trim() : "";
  if (apiKey.length === 0) {
    input.respond(
      401,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({
        error: {
          message: `Gateway upstream provider '${upstream.provider}' has no API key configured.`,
          type: "peakcode_gateway_error",
        },
      }),
    );
    return;
  }

  const acceptHeader = Array.isArray(input.req.headers.accept)
    ? input.req.headers.accept.join(", ")
    : input.req.headers.accept;
  const upstreamResponse = yield* Effect.tryPromise({
    try: () =>
      isResponses
        ? proxyGatewayResponse({
            gatewayConfig,
            payload,
            apiKey,
            accept: acceptHeader,
          })
        : proxyGatewayChatCompletion({
            gatewayConfig,
            payload,
            apiKey,
            accept: acceptHeader,
          }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error("Gateway upstream request failed."),
  }).pipe(
    Effect.catch((cause) => {
      input.respond(
        502,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({
          error: {
            message: cause.message || "Gateway upstream request failed.",
            type: "peakcode_gateway_error",
          },
        }),
      );
      return Effect.succeed(null);
    }),
  );
  if (upstreamResponse === null) return;

  const responseBody = yield* Effect.promise(() =>
    upstreamResponse.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
  );
  const headers: Record<string, string | string[]> = {};
  upstreamResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  input.respond(upstreamResponse.status, headers, responseBody);
});

const serveStaticAsset = Effect.fn(function* (input: {
  readonly url: URL;
  readonly respond: Respond;
  readonly staticDir: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  const staticRoot = input.path.resolve(input.staticDir);
  const staticRequestPath = input.url.pathname === "/" ? "/index.html" : input.url.pathname;
  const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
  const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
  const staticRelativePath = input.path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
  const hasPathTraversalSegment = staticRelativePath.startsWith("..");
  if (
    staticRelativePath.length === 0 ||
    hasRawLeadingParentSegment ||
    hasPathTraversalSegment ||
    staticRelativePath.includes("\0")
  ) {
    input.respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
    return;
  }

  const isWithinStaticRoot = (candidate: string) =>
    candidate === staticRoot ||
    candidate.startsWith(
      staticRoot.endsWith(input.path.sep) ? staticRoot : `${staticRoot}${input.path.sep}`,
    );

  let filePath = input.path.resolve(staticRoot, staticRelativePath);
  if (!isWithinStaticRoot(filePath)) {
    input.respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
    return;
  }

  const ext = input.path.extname(filePath);
  if (!ext) {
    filePath = input.path.resolve(filePath, "index.html");
    if (!isWithinStaticRoot(filePath)) {
      input.respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
      return;
    }
  }

  const fileInfo = yield* input.fileSystem
    .stat(filePath)
    .pipe(Effect.catch(() => Effect.succeed(null)));
  if (!fileInfo || fileInfo.type !== "File") {
    const indexPath = input.path.resolve(staticRoot, "index.html");
    const indexData = yield* input.fileSystem
      .readFile(indexPath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!indexData) {
      input.respond(404, { "Content-Type": "text/plain" }, "Not Found");
      return;
    }
    input.respond(200, { "Content-Type": "text/html; charset=utf-8" }, indexData);
    return;
  }

  const contentType = Mime.getType(filePath) ?? "application/octet-stream";
  const data = yield* input.fileSystem
    .readFile(filePath)
    .pipe(Effect.catch(() => Effect.succeed(null)));
  if (!data) {
    input.respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
    return;
  }
  input.respond(200, { "Content-Type": contentType }, data);
});
