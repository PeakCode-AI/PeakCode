import type {
  GatewayConfig,
  GatewayDiscoverModelsResult,
  GatewayModelDescriptor,
  GatewayProviderHealth,
  GatewaySecretStatus,
  GatewayUpstreamConfig,
  GatewayUpstreamProvider,
} from "@peakcode/contracts";
import { Effect, Layer } from "effect";

import { ServerSecretStore } from "../../../auth/Services/ServerSecretStore";
import { ServerSettingsService } from "../../../serverSettings";
import { GatewayConfigurationError, GatewayRoutingError } from "../Errors";
import { GatewayService, type GatewayServiceShape } from "../Services/GatewayService";

const textEncoder = new TextEncoder();

function secretName(provider: GatewayUpstreamProvider): string {
  return `gateway.upstream.${provider}.apiKey`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function modelIdsFor(upstream: GatewayUpstreamConfig): string[] {
  const ids = new Set<string>();
  if (upstream.defaultModel) {
    ids.add(upstream.defaultModel);
  }
  for (const model of upstream.customModels) {
    ids.add(model);
  }
  return Array.from(ids);
}

function modelsFor(upstream: GatewayUpstreamConfig): GatewayModelDescriptor[] {
  return modelIdsFor(upstream).map((id) => ({
    id,
    name: id,
    upstreamProvider: upstream.provider,
  }));
}

function findUpstream(
  config: GatewayConfig,
  provider: GatewayUpstreamProvider,
): GatewayUpstreamConfig | null {
  return config.upstreamProviders.find((upstream) => upstream.provider === provider) ?? null;
}

function applyGatewayPatch(
  current: GatewayConfig,
  patch: Parameters<GatewayServiceShape["updateGatewayConfig"]>[0],
): GatewayConfig {
  const upstreamPatchByProvider = new Map(
    (patch.upstreamProviders ?? []).map((upstreamPatch) => [upstreamPatch.provider, upstreamPatch]),
  );
  const patchedUpstreams =
    patch.upstreamProviders === undefined
      ? current.upstreamProviders
      : current.upstreamProviders.map((upstream) => {
          const upstreamPatch = upstreamPatchByProvider.get(upstream.provider);
          if (!upstreamPatch) {
            return upstream;
          }
          return {
            ...upstream,
            ...upstreamPatch,
            provider: upstream.provider,
            customModels: upstreamPatch.customModels ?? upstream.customModels,
            modelAliases: upstreamPatch.modelAliases ?? upstream.modelAliases,
          };
        });

  return {
    ...current,
    ...patch,
    upstreamProviders: patchedUpstreams,
  };
}

const secretStatusFor = (secretStore: ServerSecretStore, provider: GatewayUpstreamProvider) =>
  secretStore.get(secretName(provider)).pipe(
    Effect.map(
      (value): GatewaySecretStatus => ({
        provider,
        hasApiKey: value !== null && value.byteLength > 0,
      }),
    ),
    Effect.mapError(
      (cause) =>
        new GatewayConfigurationError({
          operation: "getSecretStatus",
          detail: `Failed to read API key status for '${provider}'.`,
          cause,
        }),
    ),
  );

export const makeGatewayServiceLive = Effect.gen(function* () {
  const serverSettings = yield* ServerSettingsService;
  const secretStore = yield* ServerSecretStore;

  const getConfig = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.gateway),
    Effect.mapError(
      (cause) =>
        new GatewayConfigurationError({
          operation: "getGatewayConfig",
          detail: "Failed to read gateway settings.",
          cause,
        }),
    ),
  );

  const getConfiguredSecretStatuses = Effect.gen(function* () {
    const config = yield* getConfig;
    const secrets = yield* Effect.all(
      config.upstreamProviders.map((upstream) => secretStatusFor(secretStore, upstream.provider)),
    );
    return { secrets };
  });

  const getUpstreams = (provider?: GatewayUpstreamProvider) =>
    getConfig.pipe(
      Effect.map((config) =>
        provider
          ? config.upstreamProviders.filter((upstream) => upstream.provider === provider)
          : config.upstreamProviders,
      ),
    );

  const discoverModels: GatewayServiceShape["discoverModels"] = (input) =>
    Effect.gen(function* () {
      const discoveredAt = nowIso();
      const upstreams = yield* getUpstreams(input.provider);
      const results: GatewayDiscoverModelsResult["results"] = upstreams.map((upstream) => ({
        provider: upstream.provider,
        models: modelsFor(upstream),
        source: "static",
        discoveredAt,
        cacheHit: false,
      }));
      return {
        results,
        totalProviders: results.length,
        discoveredAt,
      };
    });

  const selectModel: GatewayServiceShape["selectModel"] = (input) =>
    Effect.gen(function* () {
      const config = yield* getConfig;
      const provider = input.upstreamProvider ?? config.defaultUpstreamProvider;
      const upstream = findUpstream(config, provider);
      if (!upstream) {
        return yield* new GatewayRoutingError({
          provider,
          model: input.model ?? "",
          operation: "selectModel",
          detail: `Gateway upstream provider '${provider}' is not configured.`,
        });
      }
      if (!upstream.enabled) {
        return yield* new GatewayRoutingError({
          provider,
          model: input.model ?? "",
          operation: "selectModel",
          detail: `Gateway upstream provider '${provider}' is disabled.`,
        });
      }

      const requestedModel = input.model ?? upstream.defaultModel;
      if (!requestedModel) {
        return yield* new GatewayRoutingError({
          provider,
          model: "",
          operation: "selectModel",
          detail: `Gateway upstream provider '${provider}' has no default model.`,
        });
      }

      const resolvedModel = upstream.modelAliases[requestedModel] ?? requestedModel;
      return {
        upstreamProvider: provider,
        model: requestedModel,
        resolvedModel,
        baseUrl: upstream.baseUrl,
        protocol: upstream.protocol,
      };
    });

  const getAvailableProviders: GatewayServiceShape["getAvailableProviders"] = () =>
    Effect.gen(function* () {
      const config = yield* getConfig;
      const secretStatuses = yield* Effect.all(
        config.upstreamProviders.map((upstream) => secretStatusFor(secretStore, upstream.provider)),
      );
      const hasApiKeyByProvider = new Map(
        secretStatuses.map((status) => [status.provider, status.hasApiKey]),
      );
      return {
        providers: config.upstreamProviders.map((upstream) => {
          const hasApiKey = hasApiKeyByProvider.get(upstream.provider) ?? false;
          return {
            provider: upstream.provider,
            displayName: upstream.displayName,
            protocol: upstream.protocol,
            baseUrl: upstream.baseUrl,
            enabled: upstream.enabled,
            configured: upstream.enabled && upstream.baseUrl.trim().length > 0 && hasApiKey,
            hasApiKey,
            availableModelCount: modelIdsFor(upstream).length,
          };
        }),
      };
    });

  const getProviderHealth: GatewayServiceShape["getProviderHealth"] = (input) =>
    Effect.gen(function* () {
      const checkedAt = nowIso();
      const upstreams = yield* getUpstreams(input.provider);
      const secretStatuses = yield* Effect.all(
        upstreams.map((upstream) => secretStatusFor(secretStore, upstream.provider)),
      );
      const hasApiKeyByProvider = new Map(
        secretStatuses.map((status) => [status.provider, status.hasApiKey]),
      );
      const providers: GatewayProviderHealth[] = upstreams.map((upstream) => {
        const hasApiKey = hasApiKeyByProvider.get(upstream.provider) ?? false;
        const hasBaseUrl = upstream.baseUrl.trim().length > 0;
        const status =
          upstream.enabled && hasBaseUrl && hasApiKey
            ? "healthy"
            : upstream.enabled
              ? "degraded"
              : "unavailable";
        return {
          provider: upstream.provider,
          status,
          lastChecked: checkedAt,
          ...(status === "healthy"
            ? {}
            : {
                errorMessage: !upstream.enabled
                  ? "Provider is disabled."
                  : !hasBaseUrl
                    ? "Provider base URL is not configured."
                    : "Provider API key is not configured.",
              }),
          availableModels: modelIdsFor(upstream),
          consecutiveFailures: status === "healthy" ? 0 : 1,
        };
      });
      return { providers, checkedAt };
    });

  const updateGatewayConfig: GatewayServiceShape["updateGatewayConfig"] = (patch) =>
    Effect.gen(function* () {
      const current = yield* getConfig;
      const next = applyGatewayPatch(current, patch);
      const updated = yield* serverSettings.updateSettings({ gateway: next }).pipe(
        Effect.mapError(
          (cause) =>
            new GatewayConfigurationError({
              operation: "updateGatewayConfig",
              detail: "Failed to update gateway settings.",
              cause,
            }),
        ),
      );
      return updated.gateway;
    });

  const getCapabilities: GatewayServiceShape["getCapabilities"] = (input) =>
    Effect.gen(function* () {
      const config = yield* getConfig;
      const upstream = findUpstream(config, input.provider);
      if (!upstream) {
        return yield* new GatewayConfigurationError({
          operation: "getCapabilities",
          detail: `Gateway upstream provider '${input.provider}' is not configured.`,
        });
      }
      return {
        provider: upstream.provider,
        protocol: upstream.protocol,
        supportsRuntimeDiscovery: false,
      };
    });

  const setApiKey: GatewayServiceShape["setApiKey"] = (input) =>
    secretStore.set(secretName(input.provider), textEncoder.encode(input.apiKey)).pipe(
      Effect.mapError(
        (cause) =>
          new GatewayConfigurationError({
            operation: "setApiKey",
            detail: `Failed to store API key for '${input.provider}'.`,
            cause,
          }),
      ),
      Effect.flatMap(() => getConfiguredSecretStatuses),
    );

  const removeApiKey: GatewayServiceShape["removeApiKey"] = (input) =>
    secretStore.remove(secretName(input.provider)).pipe(
      Effect.mapError(
        (cause) =>
          new GatewayConfigurationError({
            operation: "removeApiKey",
            detail: `Failed to remove API key for '${input.provider}'.`,
            cause,
          }),
      ),
      Effect.flatMap(() => getConfiguredSecretStatuses),
    );

  return {
    discoverModels,
    selectModel,
    getAvailableProviders,
    getProviderHealth,
    getGatewayConfig: () => getConfig,
    updateGatewayConfig,
    getCapabilities,
    setApiKey,
    removeApiKey,
    getSecretStatus: () => getConfiguredSecretStatuses,
  } satisfies GatewayServiceShape;
});

export const GatewayServiceLive = Layer.effect(GatewayService, makeGatewayServiceLive);
