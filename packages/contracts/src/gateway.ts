import { Schema } from "effect";
import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas";

export const GatewayUpstreamProvider = Schema.Literals([
  "deepseek",
  "glm",
  "openrouter",
  "siliconflow",
  "custom",
]);
export type GatewayUpstreamProvider = typeof GatewayUpstreamProvider.Type;

export const GatewayUpstreamProtocol = Schema.Literals([
  "openai-compatible",
  "anthropic-compatible",
]);
export type GatewayUpstreamProtocol = typeof GatewayUpstreamProtocol.Type;

export const GatewayFallbackStrategy = Schema.Literals(["retry", "skip", "fail"]);
export type GatewayFallbackStrategy = typeof GatewayFallbackStrategy.Type;

export const GatewayModelDescriptor = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  upstreamProvider: GatewayUpstreamProvider,
});
export type GatewayModelDescriptor = typeof GatewayModelDescriptor.Type;

export const GatewayUpstreamConfig = Schema.Struct({
  provider: GatewayUpstreamProvider,
  displayName: TrimmedNonEmptyString,
  protocol: GatewayUpstreamProtocol,
  baseUrl: TrimmedString,
  enabled: Schema.Boolean,
  defaultModel: Schema.optional(TrimmedNonEmptyString),
  customModels: Schema.Array(TrimmedNonEmptyString),
  modelAliases: Schema.Record(TrimmedNonEmptyString, TrimmedNonEmptyString),
});
export type GatewayUpstreamConfig = typeof GatewayUpstreamConfig.Type;

export const GatewayConfig = Schema.Struct({
  enabled: Schema.Boolean,
  defaultUpstreamProvider: GatewayUpstreamProvider,
  upstreamProviders: Schema.Array(GatewayUpstreamConfig),
  healthCheckEnabled: Schema.Boolean,
  healthCheckIntervalMs: NonNegativeInt,
  discoveryCacheTtlMs: NonNegativeInt,
  fallbackStrategy: GatewayFallbackStrategy,
});
export type GatewayConfig = typeof GatewayConfig.Type;

export const GatewayUpstreamConfigPatch = Schema.Struct({
  provider: GatewayUpstreamProvider,
  displayName: Schema.optional(TrimmedNonEmptyString),
  protocol: Schema.optional(GatewayUpstreamProtocol),
  baseUrl: Schema.optional(TrimmedString),
  enabled: Schema.optional(Schema.Boolean),
  defaultModel: Schema.optional(TrimmedNonEmptyString),
  customModels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  modelAliases: Schema.optional(Schema.Record(TrimmedNonEmptyString, TrimmedNonEmptyString)),
});
export type GatewayUpstreamConfigPatch = typeof GatewayUpstreamConfigPatch.Type;

export const GatewayConfigPatch = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  defaultUpstreamProvider: Schema.optional(GatewayUpstreamProvider),
  upstreamProviders: Schema.optional(Schema.Array(GatewayUpstreamConfigPatch)),
  healthCheckEnabled: Schema.optional(Schema.Boolean),
  healthCheckIntervalMs: Schema.optional(NonNegativeInt),
  discoveryCacheTtlMs: Schema.optional(NonNegativeInt),
  fallbackStrategy: Schema.optional(GatewayFallbackStrategy),
});
export type GatewayConfigPatch = typeof GatewayConfigPatch.Type;

export const GatewaySecretStatus = Schema.Struct({
  provider: GatewayUpstreamProvider,
  hasApiKey: Schema.Boolean,
});
export type GatewaySecretStatus = typeof GatewaySecretStatus.Type;

export const GatewayUpstreamInfo = Schema.Struct({
  provider: GatewayUpstreamProvider,
  displayName: TrimmedNonEmptyString,
  protocol: GatewayUpstreamProtocol,
  baseUrl: TrimmedString,
  enabled: Schema.Boolean,
  configured: Schema.Boolean,
  hasApiKey: Schema.Boolean,
  availableModelCount: NonNegativeInt,
});
export type GatewayUpstreamInfo = typeof GatewayUpstreamInfo.Type;

export const GatewayAvailableProvidersResult = Schema.Struct({
  providers: Schema.Array(GatewayUpstreamInfo),
});
export type GatewayAvailableProvidersResult = typeof GatewayAvailableProvidersResult.Type;

export const GatewayDiscoverySource = Schema.Literals(["runtime", "static", "fallback"]);
export type GatewayDiscoverySource = typeof GatewayDiscoverySource.Type;

export const GatewayModelDiscoveryResult = Schema.Struct({
  provider: GatewayUpstreamProvider,
  models: Schema.Array(GatewayModelDescriptor),
  source: GatewayDiscoverySource,
  discoveredAt: IsoDateTime,
  cacheHit: Schema.optional(Schema.Boolean),
});
export type GatewayModelDiscoveryResult = typeof GatewayModelDiscoveryResult.Type;

export const GatewayDiscoverModelsInput = Schema.Struct({
  provider: Schema.optional(GatewayUpstreamProvider),
  forceRefresh: Schema.optional(Schema.Boolean),
});
export type GatewayDiscoverModelsInput = typeof GatewayDiscoverModelsInput.Type;

export const GatewayDiscoverModelsResult = Schema.Struct({
  results: Schema.Array(GatewayModelDiscoveryResult),
  totalProviders: NonNegativeInt,
  discoveredAt: IsoDateTime,
});
export type GatewayDiscoverModelsResult = typeof GatewayDiscoverModelsResult.Type;

export const GatewayProviderStatus = Schema.Literals(["healthy", "degraded", "unavailable"]);
export type GatewayProviderStatus = typeof GatewayProviderStatus.Type;

export const GatewayProviderHealth = Schema.Struct({
  provider: GatewayUpstreamProvider,
  status: GatewayProviderStatus,
  lastChecked: IsoDateTime,
  latencyMs: Schema.optional(NonNegativeInt),
  errorMessage: Schema.optional(TrimmedNonEmptyString),
  availableModels: Schema.Array(TrimmedNonEmptyString),
  consecutiveFailures: NonNegativeInt,
});
export type GatewayProviderHealth = typeof GatewayProviderHealth.Type;

export const GatewayProviderHealthResult = Schema.Struct({
  providers: Schema.Array(GatewayProviderHealth),
  checkedAt: IsoDateTime,
});
export type GatewayProviderHealthResult = typeof GatewayProviderHealthResult.Type;

export const GatewayGetProviderHealthInput = Schema.Struct({
  provider: Schema.optional(GatewayUpstreamProvider),
});
export type GatewayGetProviderHealthInput = typeof GatewayGetProviderHealthInput.Type;

export const GatewayModelSelection = Schema.Struct({
  upstreamProvider: GatewayUpstreamProvider,
  model: TrimmedNonEmptyString,
  resolvedModel: TrimmedNonEmptyString,
  baseUrl: TrimmedString,
  protocol: GatewayUpstreamProtocol,
});
export type GatewayModelSelection = typeof GatewayModelSelection.Type;

export const GatewaySelectModelInput = Schema.Struct({
  upstreamProvider: Schema.optional(GatewayUpstreamProvider),
  model: Schema.optional(TrimmedNonEmptyString),
});
export type GatewaySelectModelInput = typeof GatewaySelectModelInput.Type;

export const GatewayCapabilities = Schema.Struct({
  provider: GatewayUpstreamProvider,
  protocol: GatewayUpstreamProtocol,
  supportsRuntimeDiscovery: Schema.Boolean,
});
export type GatewayCapabilities = typeof GatewayCapabilities.Type;

export const GatewayGetCapabilitiesInput = Schema.Struct({
  provider: GatewayUpstreamProvider,
});
export type GatewayGetCapabilitiesInput = typeof GatewayGetCapabilitiesInput.Type;

export const GatewaySetApiKeyInput = Schema.Struct({
  provider: GatewayUpstreamProvider,
  apiKey: TrimmedNonEmptyString,
});
export type GatewaySetApiKeyInput = typeof GatewaySetApiKeyInput.Type;

export const GatewayRemoveApiKeyInput = Schema.Struct({
  provider: GatewayUpstreamProvider,
});
export type GatewayRemoveApiKeyInput = typeof GatewayRemoveApiKeyInput.Type;

export const GatewaySecretStatusResult = Schema.Struct({
  secrets: Schema.Array(GatewaySecretStatus),
});
export type GatewaySecretStatusResult = typeof GatewaySecretStatusResult.Type;
