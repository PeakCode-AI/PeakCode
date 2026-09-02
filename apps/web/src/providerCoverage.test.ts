// FILE: providerCoverage.test.ts
// Purpose: Guards the hand-maintained provider lists that TypeScript cannot check.
// Layer: Web provider wiring tests

import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@peakcode/contracts";
import { describe, expect, it } from "vitest";

import { PROVIDER_OPTIONS } from "./session-logic";
import { DEFAULT_PROVIDER_ORDER } from "./providerOrdering";

/**
 * `PROVIDER_DISPLAY_NAMES` is a `Record<ProviderKind, string>`, so the compiler
 * forces it to stay exhaustive. That makes its keys the canonical provider list
 * to check the hand-maintained arrays against.
 */
const ALL_PROVIDER_KINDS = Object.keys(PROVIDER_DISPLAY_NAMES) as ProviderKind[];

/**
 * Adding a provider has repeatedly missed one of these lists. They are plain
 * arrays rather than exhaustive Records, so a missing entry type-checks and
 * lints cleanly and only shows up as the provider silently vanishing from the
 * UI — or, for `toLegacyProvider`, as a persisted thread quietly reopening on
 * the wrong provider. These assertions fail loudly instead.
 */
describe("provider list coverage", () => {
  it("offers every provider in the composer picker", () => {
    expect(new Set(PROVIDER_OPTIONS.map((option) => option.value))).toEqual(
      new Set(ALL_PROVIDER_KINDS),
    );
  });

  it("orders every provider by default", () => {
    expect(new Set(DEFAULT_PROVIDER_ORDER)).toEqual(new Set(ALL_PROVIDER_KINDS));
  });

  it("gives every provider a non-empty display name", () => {
    for (const provider of ALL_PROVIDER_KINDS) {
      expect(PROVIDER_DISPLAY_NAMES[provider].trim().length).toBeGreaterThan(0);
    }
  });
});
