/**
 * GatewayService - Unified gateway service for model routing and provider abstraction.
 *
 * Gateway provides a unified interface over ProviderService for:
 * - Model discovery (runtime + static fallback)
 * - Model selection and routing
 * - Provider health monitoring
 * - Gateway configuration
 *
 * @module GatewayService
 */
import type {
  GatewayAvailableProvidersResult,
  GatewayCapabilities,
  GatewayConfig,
  GatewayConfigPatch,
  GatewayDiscoverModelsInput,
  GatewayDiscoverModelsResult,
  GatewayGetCapabilitiesInput,
  GatewayGetProviderHealthInput,
  GatewayModelSelection,
  GatewayProviderHealthResult,
  GatewayRemoveApiKeyInput,
  GatewaySecretStatusResult,
  GatewaySelectModelInput,
  GatewaySetApiKeyInput,
} from "@peakcode/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { GatewayError } from "../Errors";

/**
 * GatewayServiceShape - Service API for unified gateway operations.
 */
export interface GatewayServiceShape {
  /**
   * Discover available models from providers.
   */
  readonly discoverModels: (
    input: GatewayDiscoverModelsInput,
  ) => Effect.Effect<GatewayDiscoverModelsResult, GatewayError>;

  /**
   * Select a model with routing and alias resolution.
   */
  readonly selectModel: (
    input: GatewaySelectModelInput,
  ) => Effect.Effect<GatewayModelSelection, GatewayError>;

  /**
   * Get available providers with their status.
   */
  readonly getAvailableProviders: () => Effect.Effect<
    GatewayAvailableProvidersResult,
    GatewayError
  >;

  /**
   * Get health status for one or all providers.
   */
  readonly getProviderHealth: (
    input: GatewayGetProviderHealthInput,
  ) => Effect.Effect<GatewayProviderHealthResult, GatewayError>;

  /**
   * Get current gateway configuration.
   */
  readonly getGatewayConfig: () => Effect.Effect<GatewayConfig, GatewayError>;

  /**
   * Update gateway configuration.
   */
  readonly updateGatewayConfig: (
    patch: GatewayConfigPatch,
  ) => Effect.Effect<GatewayConfig, GatewayError>;

  /**
   * Get capabilities for a provider + optional model.
   */
  readonly getCapabilities: (
    input: GatewayGetCapabilitiesInput,
  ) => Effect.Effect<GatewayCapabilities, GatewayError>;

  /**
   * Store a provider API key without exposing it through settings.
   */
  readonly setApiKey: (
    input: GatewaySetApiKeyInput,
  ) => Effect.Effect<GatewaySecretStatusResult, GatewayError>;

  /**
   * Remove a stored provider API key.
   */
  readonly removeApiKey: (
    input: GatewayRemoveApiKeyInput,
  ) => Effect.Effect<GatewaySecretStatusResult, GatewayError>;

  /**
   * Return secret presence only; never returns secret values.
   */
  readonly getSecretStatus: () => Effect.Effect<GatewaySecretStatusResult, GatewayError>;
}

/**
 * GatewayService - Service tag for the unified gateway.
 */
export class GatewayService extends ServiceMap.Service<GatewayService, GatewayServiceShape>()(
  "t3/provider/Gateway/GatewayService",
) {}
