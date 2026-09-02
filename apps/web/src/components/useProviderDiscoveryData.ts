// FILE: useProviderDiscoveryData.ts
// Purpose: Shared React hook for provider plugin/skill discovery data, used by both the
//          PluginsView and SkillsView surfaces. Returns the queries, capabilities, and
//          search state in a single bundle so view components stay presentational.
// Layer: Logic hook
// Exports: useProviderDiscoveryData, type ProviderDiscoveryData

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ProviderPluginDescriptor,
  type ProviderSkillDescriptor,
} from "@peakcode/contracts";
import { useFocusedChatContext } from "~/focusedChatContext";
import { useStore } from "~/store";
import {
  buildPluginSearchBlob,
  buildSkillSearchBlob,
  isInstalledProviderPlugin,
  normalizeProviderDiscoveryText,
  resolveProviderDiscoveryCwd,
} from "~/lib/providerDiscovery";
import { createFirstProjectSelector } from "~/storeSelectors";
import {
  providerComposerCapabilitiesQueryOptions,
  providerPluginsQueryOptions,
  providerSkillsQueryOptions,
  supportsPluginDiscovery,
  supportsSkillDiscovery,
} from "~/lib/providerDiscoveryReactQuery";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";

export type DiscoveryTab = "plugins" | "skills";

type ProviderCapabilities = { plugins: boolean; skills: boolean };

export type PluginEntry = {
  marketplaceName: string;
  marketplacePath: string;
  plugin: ProviderPluginDescriptor;
  isFeatured: boolean;
};

export type PluginSection = {
  key: string;
  title: string;
  entries: PluginEntry[];
};

export const PROVIDER_DISCOVERY_ORDER: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
];

function sectionTitle(value: string): string {
  const n = value.trim();
  return n.length === 0 ? "Unknown" : n;
}

export function useProviderDiscoveryData(selectedTab: DiscoveryTab) {
  const firstProject = useStore(useMemo(() => createFirstProjectSelector(), []));
  const { activeProject: focusedProject, activeThread, focusedThreadId } = useFocusedChatContext();
  const activeProject = focusedProject ?? firstProject ?? null;

  const preferredProvider =
    activeThread?.modelSelection.provider ??
    activeProject?.defaultModelSelection?.provider ??
    "codex";

  const [selectedProvider, setSelectedProvider] = useState<ProviderKind>(preferredProvider);
  const [pluginSearch, setPluginSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const providerThreadId = focusedThreadId;

  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const codexCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("codex"));
  const claudeCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("claudeAgent"));
  const cursorCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("cursor"));
  const geminiCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("gemini"));
  const grokCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("grok"));
  const kiloCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("kilo"));
  const kimiCodeCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("kimiCode"));
  const openCodeCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("opencode"));
  const piCapabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions("pi"));

  const providerCapabilities = useMemo<Record<ProviderKind, ProviderCapabilities>>(
    () => ({
      codex: {
        plugins: supportsPluginDiscovery(codexCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(codexCapabilitiesQuery.data),
      },
      claudeAgent: {
        plugins: supportsPluginDiscovery(claudeCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(claudeCapabilitiesQuery.data),
      },
      cursor: {
        plugins: supportsPluginDiscovery(cursorCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(cursorCapabilitiesQuery.data),
      },
      gemini: {
        plugins: supportsPluginDiscovery(geminiCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(geminiCapabilitiesQuery.data),
      },
      grok: {
        plugins: supportsPluginDiscovery(grokCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(grokCapabilitiesQuery.data),
      },
      kilo: {
        plugins: supportsPluginDiscovery(kiloCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(kiloCapabilitiesQuery.data),
      },
      kimiCode: {
        plugins: supportsPluginDiscovery(kimiCodeCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(kimiCodeCapabilitiesQuery.data),
      },
      opencode: {
        plugins: supportsPluginDiscovery(openCodeCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(openCodeCapabilitiesQuery.data),
      },
      pi: {
        plugins: supportsPluginDiscovery(piCapabilitiesQuery.data),
        skills: supportsSkillDiscovery(piCapabilitiesQuery.data),
      },
    }),
    [
      claudeCapabilitiesQuery.data,
      codexCapabilitiesQuery.data,
      cursorCapabilitiesQuery.data,
      geminiCapabilitiesQuery.data,
      grokCapabilitiesQuery.data,
      kiloCapabilitiesQuery.data,
      kimiCodeCapabilitiesQuery.data,
      openCodeCapabilitiesQuery.data,
      piCapabilitiesQuery.data,
    ],
  );

  useEffect(() => {
    const supportsTab =
      selectedTab === "plugins"
        ? providerCapabilities[selectedProvider].plugins
        : providerCapabilities[selectedProvider].skills;
    if (supportsTab) return;
    const fallbackOrder =
      selectedTab === "plugins"
        ? PROVIDER_DISCOVERY_ORDER
        : [preferredProvider, ...PROVIDER_DISCOVERY_ORDER.filter((p) => p !== preferredProvider)];
    const fallback =
      fallbackOrder.find((provider) =>
        selectedTab === "plugins"
          ? providerCapabilities[provider].plugins
          : providerCapabilities[provider].skills,
      ) ?? null;
    if (fallback) setSelectedProvider(fallback);
  }, [preferredProvider, providerCapabilities, selectedProvider, selectedTab]);

  const discoveryCwd = resolveProviderDiscoveryCwd({
    activeThreadWorktreePath: activeThread?.worktreePath ?? null,
    activeProjectCwd: activeProject?.cwd ?? null,
    serverCwd: serverConfigQuery.data?.cwd ?? null,
  });

  const providerLabel = PROVIDER_DISPLAY_NAMES[selectedProvider];
  const canListPlugins = providerCapabilities[selectedProvider].plugins;
  const canListSkills = providerCapabilities[selectedProvider].skills;

  const pluginsQuery = useQuery(
    providerPluginsQueryOptions({
      provider: selectedProvider,
      cwd: discoveryCwd,
      threadId: providerThreadId,
      enabled: selectedTab === "plugins" && canListPlugins,
    }),
  );

  const skillsQuery = useQuery(
    providerSkillsQueryOptions({
      provider: selectedProvider,
      cwd: discoveryCwd,
      threadId: providerThreadId,
      query: selectedTab === "skills" ? skillSearch : "",
      enabled: selectedTab === "skills" && canListSkills && discoveryCwd !== null,
    }),
  );

  const discoveredSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  );

  const pluginEntries = useMemo<PluginEntry[]>(() => {
    const featuredIds = new Set(pluginsQuery.data?.featuredPluginIds ?? []);
    return (pluginsQuery.data?.marketplaces ?? []).flatMap((m) =>
      m.plugins.map((plugin) => ({
        marketplaceName: m.name,
        marketplacePath: m.path,
        plugin,
        isFeatured: featuredIds.has(plugin.id),
      })),
    );
  }, [pluginsQuery.data]);

  const installedPluginEntries = useMemo(
    () => pluginEntries.filter((entry) => isInstalledProviderPlugin(entry.plugin)),
    [pluginEntries],
  );

  const filteredPluginEntries = useMemo(() => {
    const q = normalizeProviderDiscoveryText(pluginSearch);
    if (!q) return installedPluginEntries;
    return installedPluginEntries.filter((e) => buildPluginSearchBlob(e.plugin).includes(q));
  }, [pluginSearch, installedPluginEntries]);

  const marketplaceSections = useMemo<PluginSection[]>(() => {
    const map = new Map<string, { title: string; entries: PluginEntry[] }>();
    for (const entry of filteredPluginEntries) {
      const existing = map.get(entry.marketplacePath);
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(entry.marketplacePath, {
          title: sectionTitle(entry.marketplaceName),
          entries: [entry],
        });
      }
    }
    return Array.from(map.entries()).map(([key, v]) => ({
      key,
      title: v.title,
      entries: v.entries,
    }));
  }, [filteredPluginEntries]);

  const filteredSkills = useMemo<ReadonlyArray<ProviderSkillDescriptor>>(() => {
    const q = normalizeProviderDiscoveryText(skillSearch);
    if (!q) return discoveredSkills;
    return discoveredSkills.filter((s) => buildSkillSearchBlob(s).includes(q));
  }, [skillSearch, discoveredSkills]);

  return {
    selectedProvider,
    setSelectedProvider,
    pluginSearch,
    setPluginSearch,
    skillSearch,
    setSkillSearch,
    providerCapabilities,
    providerLabel,
    canListPlugins,
    canListSkills,
    discoveryCwd,
    pluginsQuery,
    skillsQuery,
    pluginEntries,
    installedPluginEntries,
    filteredPluginEntries,
    marketplaceSections,
    discoveredSkills,
    filteredSkills,
  };
}
