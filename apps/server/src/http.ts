import type http from "node:http";

import Mime from "@effect/platform-node/Mime";
import {
  AuthBootstrapInput,
  AuthCreatePairingCredentialInput,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
} from "@peakcode/contracts";
import { DateTime, Effect, Exit, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  ATTACHMENTS_ROUTE_PREFIX,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths";
import { resolveAttachmentPathById } from "./attachmentStore.ts";
import { authErrorResponse, makeEffectAuthRequest, serveAuthHttpRoute } from "./auth/http";
import { ServerAuth } from "./auth/Services/ServerAuth";
import { ServerSecretStore } from "./auth/Services/ServerSecretStore";
import type { ServerAuthShape } from "./auth/Services/ServerAuth";
import type { SessionCredentialServiceShape } from "./auth/Services/SessionCredentialService";
import { SessionCredentialService } from "./auth/Services/SessionCredentialService";
import { deriveAuthClientMetadata } from "./auth/utils";
import { ServerConfig, type ServerConfigShape } from "./config";
import {
  GATEWAY_ROUTE_PREFIX,
  PEAKCODE_GATEWAY_CLIENT_API_KEY,
  gatewaySecretName,
  makeGatewayModelsPayload,
  dispatchGatewayChat,
  responsesPayloadToChatPayloadWithContext,
  chatResponseToResponsesResponse,
  chatStreamToResponsesStream,
  resolveGatewayChannel,
} from "./gateway";
import { dispatchAnthropicMessages } from "./anthropicAdapter";

/** Anthropic Messages API mount point (Claude Code routes here via ANTHROPIC_BASE_URL). */
const ANTHROPIC_GATEWAY_PREFIX = "/gateway/anthropic/v1";
import { LOCAL_IMAGE_ROUTE_PATH, resolveAllowedLocalImageFile } from "./localImageFiles.ts";
import type { ProjectFaviconResolverShape } from "./project/Services/ProjectFaviconResolver";
import { ProjectFaviconResolver } from "./project/Services/ProjectFaviconResolver";
import type { ServerReadiness } from "./server/readiness";
import { ServerSettingsService } from "./serverSettings";

const PROJECT_FAVICON_CACHE_CONTROL = "public, max-age=3600";
const decodeBootstrapInput = Schema.decodeUnknownEffect(AuthBootstrapInput);
const decodeCreatePairingCredentialInput = Schema.decodeUnknownEffect(
  AuthCreatePairingCredentialInput,
);
const decodeRevokePairingLinkInput = Schema.decodeUnknownEffect(AuthRevokePairingLinkInput);
const decodeRevokeClientSessionInput = Schema.decodeUnknownEffect(AuthRevokeClientSessionInput);

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
    projectFaviconEffectRouteLayer,
    localImageEffectRouteLayer,
    attachmentsEffectRouteLayer,
    gatewayEffectRouteLayer,
    anthropicGatewayEffectRouteLayer,
    staticAndDevEffectRouteLayer,
  );
}

const requireAuthenticatedRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gatewayErrorResponse(message: string, status: number) {
  return HttpServerResponse.jsonUnsafe(
    { error: { type: "peakcode_gateway_error", message } },
    { status },
  );
}

function headerString(
  headers: Record<string, string | readonly string[] | undefined>,
  name: string,
): string {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
  if (Array.isArray(entry)) return entry[0] ?? "";
  return (entry as string | undefined) ?? "";
}

function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return (
    address === "localhost" ||
    address === "::1" ||
    address.startsWith("127.") ||
    address.startsWith("::ffff:127.")
  );
}

export function isPeakCodeGatewaySentinelAuthorized(input: {
  readonly headers: Record<string, string | readonly string[] | undefined>;
  readonly remoteAddress: string | null | undefined;
}): boolean {
  if (!isLoopbackAddress(input.remoteAddress)) return false;
  const authorization = headerString(input.headers, "authorization");
  const bearer = authorization.replace(/^Bearer\s+/iu, "").trim();
  const xApiKey = headerString(input.headers, "x-api-key").trim();
  const anthropicApiKey = headerString(input.headers, "anthropic-api-key").trim();
  return [bearer, xApiKey, anthropicApiKey].some(
    (value) => value === PEAKCODE_GATEWAY_CLIENT_API_KEY,
  );
}

function hasPeakCodeGatewaySentinelAccess(request: HttpServerRequest.HttpServerRequest): boolean {
  return isPeakCodeGatewaySentinelAuthorized({
    headers: request.headers,
    remoteAddress: request.remoteAddress ?? null,
  });
}

const requireGatewayRequestAccess = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const config = yield* ServerConfig;
  if (hasPeakCodeGatewaySentinelAccess(request)) return;
  const url = HttpServerRequest.toURL(request);
  if (url && isLegacyTokenAuthorized({ config, url })) return;
  const serverAuth = yield* ServerAuth;
  yield* serverAuth.authenticateHttpRequest(makeEffectAuthRequest(request));
});

const gatewayEffectRouteLayer = HttpRouter.add(
  "*",
  `${GATEWAY_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    yield* requireGatewayRequestAccess;

    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return gatewayErrorResponse("Bad Request", 400);

    const serverSettings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;
    const gatewayConfig = (yield* serverSettings.getSettings).gateway;
    if (!gatewayConfig.enabled) {
      return gatewayErrorResponse("PeakCode gateway is disabled.", 503);
    }

    if (request.method === "GET" && url.pathname === `${GATEWAY_ROUTE_PREFIX}/models`) {
      return HttpServerResponse.jsonUnsafe(makeGatewayModelsPayload(gatewayConfig));
    }

    const isChatCompletions = url.pathname === `${GATEWAY_ROUTE_PREFIX}/chat/completions`;
    const isResponses = url.pathname === `${GATEWAY_ROUTE_PREFIX}/responses`;
    if (request.method !== "POST" || (!isChatCompletions && !isResponses)) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const payload = yield* readEffectJson(request, "Invalid gateway request payload.").pipe(
      Effect.mapError(() => ({ message: "Invalid JSON request body.", status: 400 as const })),
    );
    if (!isRecord(payload)) {
      return gatewayErrorResponse("Request body must be a JSON object.", 400);
    }

    const requestedModel = typeof payload.model === "string" ? payload.model.trim() : null;
    const { channel: upstream, model } = resolveGatewayChannel(gatewayConfig, requestedModel);
    if (!upstream) {
      return gatewayErrorResponse("No gateway channel is configured.", 400);
    }
    if (!upstream.enabled) {
      return gatewayErrorResponse(`Gateway channel '${upstream.id}' is disabled.`, 400);
    }
    if (!upstream.baseUrl || !model) {
      return gatewayErrorResponse(
        `Gateway channel '${upstream.id}' is missing a Base URL or model.`,
        400,
      );
    }
    // Load every secret slot the channel declares. Missing slots are simply
    // omitted from the map; per-kind validation (e.g. MiMo needs all three
    // cookies) happens inside the adapter.
    const secretEntries = yield* Effect.all(
      upstream.secrets.map((def) =>
        secretStore
          .get(gatewaySecretName(upstream.id, def.id))
          .pipe(
            Effect.map((bytes): [string, string] => [
              def.id,
              bytes ? new TextDecoder().decode(bytes).trim() : "",
            ]),
          ),
      ),
    );
    const secrets: Record<string, string> = {};
    for (const [secretId, value] of secretEntries) {
      if (value) secrets[secretId] = value;
    }
    // Every channel needs at least its primary `apiKey` slot populated when
    // talking to an OpenAI-compatible upstream. MiMo validates its own three
    // cookies inside the adapter, so we only enforce the openai baseline here.
    if (upstream.kind === "openai" && !secrets.apiKey) {
      return gatewayErrorResponse(
        `Gateway channel '${upstream.id}' has no API key configured.`,
        401,
      );
    }

    try {
      if (isResponses) {
        const { chatPayload, contextInputItems } =
          responsesPayloadToChatPayloadWithContext(payload);
        chatPayload.model = model;
        const upstreamResponse = yield* Effect.tryPromise({
          try: () =>
            dispatchGatewayChat({
              channel: upstream,
              chatPayload: chatPayload as Record<string, unknown>,
              secrets,
            }),
          catch: (cause) => ({
            message: cause instanceof Error ? cause.message : "Gateway upstream request failed.",
            status: 502 as const,
          }),
        });
        const response = upstreamResponse.headers.get("content-type")?.includes("text/event-stream")
          ? chatStreamToResponsesStream(upstreamResponse, requestedModel, contextInputItems)
          : yield* Effect.tryPromise({
              try: () =>
                chatResponseToResponsesResponse(
                  upstreamResponse,
                  requestedModel,
                  contextInputItems,
                ),
              catch: () => ({
                message: "Failed to convert gateway response.",
                status: 502 as const,
              }),
            });
        return HttpServerResponse.fromWeb(response);
      }

      const upstreamResponse = yield* Effect.tryPromise({
        try: () =>
          dispatchGatewayChat({
            channel: upstream,
            chatPayload: { ...payload, model } as Record<string, unknown>,
            secrets,
          }),
        catch: (cause) => ({
          message: cause instanceof Error ? cause.message : "Gateway upstream request failed.",
          status: 502 as const,
        }),
      });

      return HttpServerResponse.fromWeb(upstreamResponse);
    } catch (error) {
      return gatewayErrorResponse(
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Gateway request failed.",
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 500,
      );
    }
  }),
);

/**
 * Anthropic Messages API route. Claude Code is redirected here via
 * ANTHROPIC_BASE_URL=http://127.0.0.1:<port>/gateway/anthropic/v1 and posts
 * Anthropic-format requests to /v1/messages. The adapter converts the request
 * to the channel's native protocol (openai chat, mimo, or anthropic passthrough)
 * and converts the response back to Anthropic Messages format.
 */
const anthropicGatewayEffectRouteLayer = HttpRouter.add(
  "*",
  `${ANTHROPIC_GATEWAY_PREFIX}/*`,
  Effect.gen(function* () {
    yield* requireGatewayRequestAccess;

    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return gatewayErrorResponse("Bad Request", 400);

    const serverSettings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;
    const gatewayConfig = (yield* serverSettings.getSettings).gateway;
    if (!gatewayConfig.enabled) {
      return gatewayErrorResponse("PeakCode gateway is disabled.", 503);
    }

    // Return the channel's real models in Anthropic's /v1/models shape so
    // Claude Code shows the actual upstream model (e.g. "deepseek-chat") and
    // its startup probe passes. The gateway routes by channel config, so the
    // model id the SDK picks here is what gets forwarded upstream.
    if (request.method === "GET" && url.pathname === `${ANTHROPIC_GATEWAY_PREFIX}/models`) {
      const activeChannel = gatewayConfig.channels.find(
        (ch) => ch.id === gatewayConfig.activeChannelId,
      );
      const modelList = activeChannel
        ? (activeChannel.models.length > 0
            ? activeChannel.models
            : [{ id: activeChannel.model, label: activeChannel.model }]
          ).map((m) => ({
            type: "model" as const,
            id: m.id,
            display_name: m.label,
            created_at: "2025-01-01T00:00:00Z",
          }))
        : [];
      return HttpServerResponse.jsonUnsafe({ data: modelList });
    }

    // Claude Code calls /messages/count_tokens during startup to estimate
    // token usage. Return a rough estimate so it doesn't think the model is
    // unavailable. A precise count would require an upstream round-trip.
    if (url.pathname === `${ANTHROPIC_GATEWAY_PREFIX}/messages/count_tokens`) {
      const body = yield* readEffectJson(request, "Invalid count_tokens body.").pipe(
        Effect.orElseSucceed(() => ({}) as Record<string, unknown>),
      );
      const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
      const system = isRecord(body) && typeof body.system === "string" ? body.system : "";
      const inputTokens = Math.ceil((system.length + JSON.stringify(messages).length) / 4);
      return HttpServerResponse.jsonUnsafe({ input_tokens: Math.max(inputTokens, 1) });
    }

    if (url.pathname !== `${ANTHROPIC_GATEWAY_PREFIX}/messages`) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    if (request.method !== "POST") {
      return HttpServerResponse.text("Method Not Allowed", { status: 405 });
    }

    const payload = yield* readEffectJson(request, "Invalid gateway request payload.").pipe(
      Effect.mapError(() => ({ message: "Invalid JSON request body.", status: 400 as const })),
    );
    if (!isRecord(payload)) {
      return gatewayErrorResponse("Request body must be a JSON object.", 400);
    }

    const requestedModel = typeof payload.model === "string" ? payload.model.trim() : null;
    const { channel: upstream, model } = resolveGatewayChannel(gatewayConfig, requestedModel);
    if (!upstream) {
      return gatewayErrorResponse("No gateway channel is configured.", 400);
    }
    if (!upstream.enabled) {
      return gatewayErrorResponse(`Gateway channel '${upstream.id}' is disabled.`, 400);
    }
    if (!upstream.baseUrl || !model) {
      return gatewayErrorResponse(
        `Gateway channel '${upstream.id}' is missing a Base URL or model.`,
        400,
      );
    }

    const secretEntries = yield* Effect.all(
      upstream.secrets.map((def) =>
        secretStore
          .get(gatewaySecretName(upstream.id, def.id))
          .pipe(
            Effect.map((bytes): [string, string] => [
              def.id,
              bytes ? new TextDecoder().decode(bytes).trim() : "",
            ]),
          ),
      ),
    );
    const secrets: Record<string, string> = {};
    for (const [secretId, value] of secretEntries) {
      if (value) secrets[secretId] = value;
    }
    // anthropic-passthrough and openai channels both need an apiKey; MiMo
    // validates its cookies inside the adapter.
    if (upstream.kind !== "mimo" && !secrets.apiKey) {
      return gatewayErrorResponse(
        `Gateway channel '${upstream.id}' has no API key configured.`,
        401,
      );
    }

    try {
      const response = yield* Effect.tryPromise({
        try: () =>
          dispatchAnthropicMessages({
            channel: upstream,
            payload: { ...payload, model },
            secrets,
          }),
        catch: (cause) => ({
          message: cause instanceof Error ? cause.message : "Gateway upstream request failed.",
          status: 502 as const,
        }),
      });
      return HttpServerResponse.fromWeb(response);
    } catch (error) {
      return gatewayErrorResponse(
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Gateway request failed.",
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 500,
      );
    }
  }),
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
