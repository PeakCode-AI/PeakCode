/**
 * Kimi Code ACP support - builds the `kimi acp` stdio command and resolves auth.
 *
 * @module KimiCodeAcpSupport
 */
import { type KimiCodeModelOptions } from "@peakcode/contracts";
import { Effect, Layer, Scope, ServiceMap } from "effect";
import type * as EffectAcpErrors from "effect-acp/errors";
import * as EffectAcpErrorsRuntime from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  AcpSessionRuntime,
  type AcpSessionRuntimeOptions,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "./AcpSessionRuntime.ts";

export interface KimiCodeAcpRuntimeSettings {
  readonly binaryPath?: string;
  readonly model?: string;
  readonly thinking?: KimiCodeModelOptions["thinking"];
}

export interface KimiCodeAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "resolveAuthMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly kimiCodeSettings: KimiCodeAcpRuntimeSettings | null | undefined;
}

export interface KimiCodeAcpModelSelectionErrorContext {
  readonly cause: EffectAcpErrors.AcpError;
  readonly method: "session/set_config_option";
}

/**
 * Kimi Code advertises a single `terminal`-type auth method. When credentials
 * already exist under the CLI home, `authenticate` is a no-op that returns an
 * empty result, so selecting it is safe and does not start a device-code flow.
 */
const KIMI_CODE_LOGIN_AUTH_METHOD_ID = "login";

/** Config option ids returned by `session/new`. */
export const KIMI_CODE_MODEL_CONFIG_ID = "model";
export const KIMI_CODE_THINKING_CONFIG_ID = "thinking";

/**
 * `kimi acp` takes no model or thinking flags; both are session config options
 * mutated after the session exists. The subcommand only accepts login flags, so
 * the spawn line stays minimal.
 */
export function buildKimiCodeAcpSpawnInput(
  kimiCodeSettings: KimiCodeAcpRuntimeSettings | null | undefined,
  cwd: string,
): AcpSpawnInput {
  return {
    command: kimiCodeSettings?.binaryPath || "kimi",
    args: ["acp"],
    cwd,
  };
}

function availableAuthMethodIds(
  initializeResult: EffectAcpSchema.InitializeResponse,
): ReadonlySet<string> {
  return new Set((initializeResult.authMethods ?? []).map((method) => method.id.trim()));
}

export const resolveKimiCodeAcpAuthMethodId = (
  initializeResult: EffectAcpSchema.InitializeResponse,
): Effect.Effect<string, EffectAcpErrors.AcpError> =>
  Effect.gen(function* () {
    const authMethodIds = availableAuthMethodIds(initializeResult);
    if (authMethodIds.has(KIMI_CODE_LOGIN_AUTH_METHOD_ID)) {
      return KIMI_CODE_LOGIN_AUTH_METHOD_ID;
    }
    return yield* new EffectAcpErrorsRuntime.AcpRequestError({
      code: -32602,
      errorMessage: "Kimi Code ACP authentication is unavailable.",
      data: {
        authMethods: [...authMethodIds],
        detail: "Run `kimi login` to authenticate the Kimi Code CLI.",
      },
    });
  });

export const makeKimiCodeAcpRuntime = (
  input: KimiCodeAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildKimiCodeAcpSpawnInput(input.kimiCodeSettings, input.cwd),
        resolveAuthMethodId: resolveKimiCodeAcpAuthMethodId,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return ServiceMap.getUnsafe(acpContext, AcpSessionRuntime);
  });

/**
 * ACP allows a select option's choices to be either a flat list or grouped, so
 * both shapes are flattened to the slug/name pairs the model picker expects.
 */
function flattenSelectChoices(
  options:
    | ReadonlyArray<EffectAcpSchema.SessionConfigSelectOption>
    | ReadonlyArray<EffectAcpSchema.SessionConfigSelectGroup>,
): ReadonlyArray<EffectAcpSchema.SessionConfigSelectOption> {
  return options.flatMap((entry) => ("group" in entry ? entry.options : [entry]));
}

/**
 * Reads the live model catalogue Kimi reports in the `model` config option.
 * This supersedes the static contract catalogue once a session exists.
 */
export function readKimiCodeModelChoices(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): ReadonlyArray<{ slug: string; name: string }> {
  const modelOption = configOptions.find((option) => option.id === KIMI_CODE_MODEL_CONFIG_ID);
  if (modelOption === undefined || modelOption.type !== "select") {
    return [];
  }
  return flattenSelectChoices(modelOption.options).map((choice) => ({
    slug: choice.value,
    name: choice.name || choice.value,
  }));
}

export function readKimiCodeCurrentModel(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): string | undefined {
  const modelOption = configOptions.find((option) => option.id === KIMI_CODE_MODEL_CONFIG_ID);
  return modelOption !== undefined && modelOption.type === "select"
    ? modelOption.currentValue
    : undefined;
}

/**
 * Applies model and thinking level through `session/set_config_option`, which
 * Kimi Code implements — so neither requires restarting the session.
 *
 * Each option is only written when the agent actually advertises it and the
 * requested value differs from what the agent reports, keeping session start
 * free of redundant round-trips.
 */
export function applyKimiCodeAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntimeShape, "getConfigOptions" | "setConfigOption">;
  readonly model: string | undefined;
  readonly options?: KimiCodeModelOptions | null | undefined;
  readonly mapError: (context: KimiCodeAcpModelSelectionErrorContext) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    const configOptions = yield* input.runtime.getConfigOptions;

    const desired: ReadonlyArray<{ configId: string; value: string }> = [
      ...(input.model ? [{ configId: KIMI_CODE_MODEL_CONFIG_ID, value: input.model }] : []),
      ...(input.options?.thinking
        ? [{ configId: KIMI_CODE_THINKING_CONFIG_ID, value: input.options.thinking }]
        : []),
    ];

    const pending = desired.filter(({ configId, value }) => {
      const option = configOptions.find((candidate) => candidate.id === configId);
      // Skip options the agent does not advertise, and no-op writes: both would
      // add a round-trip to every session start for no behavior change.
      return option !== undefined && option.type === "select" && option.currentValue !== value;
    });

    yield* Effect.forEach(
      pending,
      ({ configId, value }) =>
        input.runtime.setConfigOption(configId, value).pipe(
          Effect.asVoid,
          Effect.mapError((cause) =>
            input.mapError({ cause, method: "session/set_config_option" }),
          ),
        ),
      { discard: true },
    );
  });
}
