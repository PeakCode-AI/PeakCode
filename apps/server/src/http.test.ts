import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { DEFAULT_SERVER_SETTINGS, type ServerSettings } from "@peakcode/contracts";
import { DateTime, Effect, FileSystem, Path } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  createHttpRequestHandler,
  isLegacyBearerAuthorized,
  isLegacyTokenAuthorized,
} from "./http";
import type { ServerAuthShape } from "./auth/Services/ServerAuth";
import type { ServerSecretStoreShape } from "./auth/Services/ServerSecretStore";
import { deriveServerPaths, type ServerConfigShape } from "./config";
import type { ProjectFaviconResolverShape } from "./project/Services/ProjectFaviconResolver";
import type { ServerReadiness } from "./server/readiness";
import type { ServerSettingsShape } from "./serverSettings";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const readiness: ServerReadiness = {
  awaitServerReady: Effect.void,
  markHttpListening: Effect.void,
  markPushBusReady: Effect.void,
  markKeybindingsReady: Effect.void,
  markTerminalSubscriptionsReady: Effect.void,
  markOrchestrationSubscriptionsReady: Effect.void,
  getSnapshot: Effect.succeed({
    httpListening: true,
    pushBusReady: true,
    keybindingsReady: true,
    terminalSubscriptionsReady: false,
    orchestrationSubscriptionsReady: false,
    startupReady: false,
  }),
};

const projectFaviconResolver: ProjectFaviconResolverShape = {
  resolvePath: () => Effect.succeed(null),
};

async function makeConfig(overrides: Partial<ServerConfigShape> = {}): Promise<ServerConfigShape> {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "peakcode-http-test-"));
  tempDirs.push(baseDir);
  const derivedPaths = await Effect.runPromise(
    deriveServerPaths(baseDir, undefined).pipe(Effect.provide(NodeServices.layer)),
  );
  return {
    mode: "web",
    port: 0,
    host: undefined,
    cwd: baseDir,
    homeDir: os.homedir(),
    baseDir,
    ...derivedPaths,
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: true,
    authToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logProviderEvents: false,
    logWebSocketEvents: false,
    ...overrides,
  };
}

async function makeHandler(
  config: ServerConfigShape,
  auth?: {
    readonly serverAuth: ServerAuthShape;
    readonly cookieName: string;
  },
  gateway?: {
    readonly serverSettings: Pick<ServerSettingsShape, "getSettings">;
    readonly secretStore: Pick<ServerSecretStoreShape, "get">;
  },
): Promise<http.RequestListener> {
  const services = await Effect.runPromise(
    Effect.gen(function* () {
      return {
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
      };
    }).pipe(Effect.provide(NodeServices.layer)),
  );
  return createHttpRequestHandler({
    serverConfig: config,
    readiness,
    fileSystem: services.fileSystem,
    projectFaviconResolver,
    path: services.path,
    ...(auth
      ? {
          serverAuth: auth.serverAuth,
          sessionCredentials: { cookieName: auth.cookieName },
        }
      : {}),
    ...(gateway ?? {}),
  });
}

function makeGatewaySettings(gateway: ServerSettings["gateway"]): ServerSettings {
  return {
    ...DEFAULT_SERVER_SETTINGS,
    gateway,
  };
}

function makeGatewayDependencies(input: {
  readonly settings: ServerSettings;
  readonly apiKey?: string | null;
}): {
  readonly serverSettings: Pick<ServerSettingsShape, "getSettings">;
  readonly secretStore: Pick<ServerSecretStoreShape, "get">;
} {
  const encoder = new TextEncoder();
  return {
    serverSettings: {
      getSettings: Effect.succeed(input.settings),
    },
    secretStore: {
      get: (name) =>
        Effect.succeed(
          name === "gateway.upstream.deepseek.apiKey" && input.apiKey
            ? encoder.encode(input.apiKey)
            : null,
        ),
    },
  };
}

function makeAuthDescriptor() {
  return {
    policy: "loopback-browser" as const,
    bootstrapMethods: ["one-time-token" as const],
    sessionMethods: ["browser-session-cookie" as const, "bearer-session-token" as const],
    sessionCookieName: "t3_session",
  };
}

function makeFakeServerAuth(overrides: Partial<ServerAuthShape> = {}): ServerAuthShape {
  const expiresAt = Effect.runSync(DateTime.now);
  const descriptor = makeAuthDescriptor();
  return {
    getDescriptor: () => Effect.succeed(descriptor),
    getSessionState: () =>
      Effect.succeed({
        authenticated: false,
        auth: descriptor,
      }),
    exchangeBootstrapCredential: () =>
      Effect.succeed({
        response: {
          authenticated: true,
          role: "client",
          sessionMethod: "browser-session-cookie",
          expiresAt,
        },
        sessionToken: "session-token",
      }),
    exchangeBootstrapCredentialForBearerSession: () =>
      Effect.succeed({
        authenticated: true,
        role: "client",
        sessionMethod: "bearer-session-token",
        expiresAt,
        sessionToken: "bearer-session-token",
      }),
    issuePairingCredential: () =>
      Effect.succeed({ id: "pairing-id", credential: "PAIRINGTOKEN", expiresAt }),
    listPairingLinks: () => Effect.succeed([]),
    revokePairingLink: () => Effect.succeed(true),
    listClientSessions: () => Effect.succeed([]),
    revokeClientSession: () => Effect.succeed(true),
    revokeOtherClientSessions: () => Effect.succeed(1),
    authenticateHttpRequest: () =>
      Effect.succeed({
        sessionId: "session-id" as never,
        subject: "owner",
        method: "browser-session-cookie",
        role: "owner",
        expiresAt,
      }),
    authenticateWebSocketUpgrade: () =>
      Effect.succeed({
        sessionId: "session-id" as never,
        subject: "owner",
        method: "browser-session-cookie",
        role: "owner",
        expiresAt,
      }),
    issueWebSocketToken: () => Effect.succeed({ token: "ws-token", expiresAt }),
    issueStartupPairingUrl: () => Effect.succeed("http://127.0.0.1:3773/pair#token=PAIRINGTOKEN"),
    ...overrides,
  } satisfies ServerAuthShape;
}

async function withServer<T>(
  handler: http.RequestListener,
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || !address) {
    throw new Error("Expected TCP server address");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("createHttpRequestHandler", () => {
  it("recognizes the desktop startup token for legacy attachment requests", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });

    expect(
      isLegacyTokenAuthorized({
        config,
        url: new URL("http://127.0.0.1:3773/attachments/attachment-id?token=desktop-secret"),
      }),
    ).toBe(true);
    expect(
      isLegacyTokenAuthorized({
        config,
        url: new URL("http://127.0.0.1:3773/attachments/attachment-id?token=wrong"),
      }),
    ).toBe(false);
  });

  it("recognizes the desktop startup token from OpenAI-compatible bearer requests", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });

    expect(
      isLegacyBearerAuthorized({
        config,
        headers: { authorization: "Bearer desktop-secret" },
      }),
    ).toBe(true);
    expect(
      isLegacyBearerAuthorized({
        config,
        headers: { authorization: "Bearer wrong" },
      }),
    ).toBe(false);
  });

  it("serves gateway OpenAI-compatible model metadata", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });
    const settings = makeGatewaySettings({
      ...DEFAULT_SERVER_SETTINGS.gateway,
      enabled: true,
    });
    const handler = await makeHandler(
      config,
      undefined,
      makeGatewayDependencies({ settings, apiKey: "upstream-key" }),
    );

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/gateway/openai/v1/models`, {
        headers: { Authorization: "Bearer desktop-secret" },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        object: "list",
        data: expect.arrayContaining([
          expect.objectContaining({ id: "deepseek/deepseek-v4-flash", object: "model" }),
          expect.objectContaining({ id: "deepseek/deepseek-v4-pro", object: "model" }),
        ]),
      });
    });
  });

  it("proxies gateway OpenAI-compatible chat completions to the selected upstream", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });
    const observed: {
      path?: string;
      authorization?: string;
      body?: Record<string, unknown>;
    } = {};
    await withServer(
      async (req, res) => {
        observed.path = req.url;
        observed.authorization = req.headers.authorization;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        observed.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "chatcmpl-test", object: "chat.completion", choices: [] }));
      },
      async (upstreamOrigin) => {
        const settings = makeGatewaySettings({
          ...DEFAULT_SERVER_SETTINGS.gateway,
          enabled: true,
          upstreamProviders: [
            {
              provider: "deepseek",
              displayName: "DeepSeek",
              protocol: "openai-compatible",
              baseUrl: `${upstreamOrigin}/v1`,
              enabled: true,
              defaultModel: "deepseek-v4-flash",
              customModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
              modelAliases: {},
            },
          ],
        });
        const handler = await makeHandler(
          config,
          undefined,
          makeGatewayDependencies({ settings, apiKey: "upstream-key" }),
        );

        await withServer(handler, async (origin) => {
          const response = await fetch(`${origin}/gateway/openai/v1/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: "Bearer desktop-secret",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek/deepseek-v4-pro",
              messages: [{ role: "user", content: "hello" }],
            }),
          });

          expect(response.status).toBe(200);
          await expect(response.json()).resolves.toMatchObject({
            id: "chatcmpl-test",
            object: "chat.completion",
          });
        });
      },
    );

    expect(observed.path).toBe("/v1/chat/completions");
    expect(observed.authorization).toBe("Bearer upstream-key");
    expect(observed.body).toMatchObject({
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("maps provider-only DeepSeek requests from legacy defaults to V4 Flash", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });
    const observed: { body?: Record<string, unknown> } = {};
    await withServer(
      async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        observed.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "chatcmpl-test", object: "chat.completion", choices: [] }));
      },
      async (upstreamOrigin) => {
        const settings = makeGatewaySettings({
          ...DEFAULT_SERVER_SETTINGS.gateway,
          enabled: true,
          upstreamProviders: [
            {
              provider: "deepseek",
              displayName: "DeepSeek",
              protocol: "openai-compatible",
              baseUrl: `${upstreamOrigin}/v1`,
              enabled: true,
              defaultModel: "deepseek-chat",
              customModels: ["deepseek-chat", "deepseek-reasoner"],
              modelAliases: {},
            },
          ],
        });
        const handler = await makeHandler(
          config,
          undefined,
          makeGatewayDependencies({ settings, apiKey: "upstream-key" }),
        );

        await withServer(handler, async (origin) => {
          const response = await fetch(`${origin}/gateway/openai/v1/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: "Bearer desktop-secret",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek",
              messages: [{ role: "user", content: "hello" }],
            }),
          });

          expect(response.status).toBe(200);
        });
      },
    );

    expect(observed.body).toMatchObject({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("rejects gateway chat completions when the selected upstream API key is missing", async () => {
    const config = await makeConfig({ authToken: "desktop-secret" });
    const settings = makeGatewaySettings({
      ...DEFAULT_SERVER_SETTINGS.gateway,
      enabled: true,
    });
    const handler = await makeHandler(
      config,
      undefined,
      makeGatewayDependencies({ settings, apiKey: null }),
    );

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/gateway/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: "Bearer desktop-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-v4-flash",
          messages: [{ role: "user", content: "hello" }],
        }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          message: "Gateway upstream provider 'deepseek' has no API key configured.",
          type: "peakcode_gateway_error",
        },
      });
    });
  });

  it("serves health readiness JSON", async () => {
    const config = await makeConfig();
    const handler = await makeHandler(config);

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toMatchObject({
        status: "ok",
        startupReady: false,
        pushBusReady: true,
      });
    });
  });

  it("preserves dev URL redirect behavior", async () => {
    const config = await makeConfig({ devUrl: new URL("http://localhost:5173/") });
    const handler = await makeHandler(config);

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/anything`, { redirect: "manual" });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:5173/");
    });
  });

  it("serves static files and SPA fallback", async () => {
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "peakcode-static-test-"));
    tempDirs.push(staticDir);
    fs.writeFileSync(path.join(staticDir, "index.html"), "<main>app</main>");
    fs.writeFileSync(path.join(staticDir, "asset.txt"), "asset");
    const config = await makeConfig({ staticDir });
    const handler = await makeHandler(config);

    await withServer(handler, async (origin) => {
      const indexResponse = await fetch(`${origin}/missing-route`);
      expect(indexResponse.status).toBe(200);
      await expect(indexResponse.text()).resolves.toBe("<main>app</main>");

      const assetResponse = await fetch(`${origin}/asset.txt`);
      expect(assetResponse.status).toBe(200);
      await expect(assetResponse.text()).resolves.toBe("asset");
    });
  });

  it("serves attachments by id with immutable cache headers", async () => {
    const config = await makeConfig();
    fs.mkdirSync(config.attachmentsDir, { recursive: true });
    fs.writeFileSync(path.join(config.attachmentsDir, "attachment-id.bin"), "payload");
    const handler = await makeHandler(config);

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/attachments/attachment-id`);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      await expect(response.text()).resolves.toBe("payload");
    });
  });

  it("serves auth session state before dev/static fallback", async () => {
    const config = await makeConfig({ devUrl: new URL("http://localhost:5173/") });
    const handler = await makeHandler(config, {
      serverAuth: makeFakeServerAuth(),
      cookieName: "t3_session",
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/auth/session`, { redirect: "manual" });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toMatchObject({
        authenticated: false,
        auth: {
          policy: "loopback-browser",
        },
      });
    });
  });

  it("sets a session cookie on auth bootstrap", async () => {
    const config = await makeConfig();
    const handler = await makeHandler(config, {
      serverAuth: makeFakeServerAuth(),
      cookieName: "t3_session",
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: "PAIRINGTOKEN" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("t3_session=session-token");
      await expect(response.json()).resolves.toMatchObject({
        authenticated: true,
        sessionMethod: "browser-session-cookie",
      });
    });
  });
});
