/**
 * Gateway Errors - Typed errors for gateway service operations.
 *
 * Gateway-specific errors complement ProviderServiceError for operations
 * like model discovery, routing, health monitoring, and configuration.
 */

import { Schema } from "effect";

/**
 * GatewayDiscoveryError - Failed to discover models from a provider.
 */
export class GatewayDiscoveryError extends Schema.TaggedErrorClass<GatewayDiscoveryError>()(
  "GatewayDiscoveryError",
  {
    provider: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Gateway discovery failed for '${this.provider}' in ${this.operation}: ${this.detail}`;
  }
}

/**
 * GatewayRoutingError - Model selection or routing failed.
 */
export class GatewayRoutingError extends Schema.TaggedErrorClass<GatewayRoutingError>()(
  "GatewayRoutingError",
  {
    provider: Schema.String,
    model: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Gateway routing failed for '${this.provider}/${this.model}' in ${this.operation}: ${this.detail}`;
  }
}

/**
 * GatewayHealthError - Provider health check failed.
 */
export class GatewayHealthError extends Schema.TaggedErrorClass<GatewayHealthError>()(
  "GatewayHealthError",
  {
    provider: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Gateway health check failed for '${this.provider}': ${this.detail}`;
  }
}

/**
 * GatewayConfigurationError - Gateway configuration read/write failed.
 */
export class GatewayConfigurationError extends Schema.TaggedErrorClass<GatewayConfigurationError>()(
  "GatewayConfigurationError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Gateway configuration error in ${this.operation}: ${this.detail}`;
  }
}

/**
 * GatewayCapabilitiesError - Failed to retrieve provider capabilities.
 */
export class GatewayCapabilitiesError extends Schema.TaggedErrorClass<GatewayCapabilitiesError>()(
  "GatewayCapabilitiesError",
  {
    provider: Schema.String,
    model: Schema.optional(Schema.String),
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    const modelPart = this.model ? `/${this.model}` : "";
    return `Gateway capabilities error for '${this.provider}${modelPart}': ${this.detail}`;
  }
}

export type GatewayError =
  | GatewayDiscoveryError
  | GatewayRoutingError
  | GatewayHealthError
  | GatewayConfigurationError
  | GatewayCapabilitiesError;
