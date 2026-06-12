// FILE: _chat.settings.tsx
// Purpose: Render the dedicated settings experience with its own section sidebar and grouped panels.
// Layer: Route screen
// Exports: Settings route component for `/settings`

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProviderStatus,
  type ThreadId,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  type GatewayUpstreamProvider,
} from "@peakcode/contracts";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelOptions, normalizeModelSlug } from "@peakcode/shared/model";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  MAX_CHAT_FONT_SIZE_PX,
  getCustomModelsForProvider,
  getGitTextGenerationModelOptions,
  MAX_CUSTOM_MODEL_LENGTH,
  MIN_CHAT_FONT_SIZE_PX,
  MODEL_PROVIDER_SETTINGS,
  normalizeChatFontSizePx,
  patchCustomModels,
  SidebarProjectSortOrder,
  SidebarThreadSortOrder,
  type LanguageSetting,
  useAppSettings,
} from "../appSettings";
import { APP_VERSION } from "../branding";
import { SidebarHeaderNavigationControls } from "../components/SidebarHeaderNavigationControls";
import { useDesktopTopBarTrafficLightGutterClassName } from "../hooks/useDesktopTopBarGutter";
import {
  ClaudeAI,
  CursorIcon,
  DotGrid2x3Icon,
  Gemini,
  GrokIcon,
  KiloIcon,
  OpenAI,
  OpenCodeIcon,
  PiIcon,
} from "../components/Icons";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleContent } from "../components/ui/collapsible";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { toastManager } from "../components/ui/toast";
import { ThemePackEditor } from "../components/ThemePackEditor";
import { SidebarHeaderTrigger, SidebarInset } from "../components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isElectron } from "../env";
import { useTheme } from "../hooks/useTheme";
import { gitRemoveWorktreeMutationOptions } from "../lib/gitReactQuery";
import {
  ArchiveIcon,
  ChevronDownIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  Undo2Icon,
  XIcon,
} from "../lib/icons";
import {
  serverConfigQueryOptions,
  serverQueryKeys,
  serverSettingsQueryOptions,
  serverWorktreesQueryOptions,
} from "../lib/serverReactQuery";
import { cn, isMacPlatform } from "../lib/utils";
import { newCommandId } from "../lib/utils";
import { ensureNativeApi, readNativeApi } from "../nativeApi";
import {
  buildNotificationSettingsSupportText,
  readBrowserNotificationPermissionState,
  requestBrowserNotificationPermission,
} from "../notifications/taskCompletion";
import { normalizeSettingsSection, useSettingsNavItems } from "../settingsNavigation";
import { NATIVE_LANGUAGE_LABELS, SUPPORTED_LANGUAGES, useMessages } from "../i18n";
import { useStore } from "../store";
import ReleaseHistoryDialog from "../components/ReleaseHistoryDialog";
import { createAllThreadsSelector } from "../storeSelectors";
import { formatRelativeTime } from "../components/Sidebar";
import { formatWorktreePathForDisplay } from "../worktreeCleanup";
import { sameProviderOrder } from "../providerOrdering";

// ── Settings taxonomy ──────────────────────────────────────────────────────

// ── Model Channels (Service Gateways) ──────────────────────────────────────

type ModelChannelId = "deepseek" | "siliconflow" | "volcano" | "tongyi" | "kimi" | "minimax";

type ModelChannel = {
  readonly id: ModelChannelId;
  readonly name: string;
  readonly subtitle: string;
  readonly balance?: string;
  readonly iconColor: string;
};

const MODEL_CHANNELS: ReadonlyArray<ModelChannel> = [
  {
    id: "deepseek",
    name: "DeepSeek",
    subtitle: "深度求索 · DeepSeek",
    balance: "¥177.52",
    iconColor: "#4D6BFA",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    subtitle: "硅基流动 · SiliconFlow",
    balance: "¥110.87",
    iconColor: "#6366F1",
  },
  {
    id: "volcano",
    name: "火山方舟",
    subtitle: "字节跳动 · 火山方舟",
    iconColor: "#3B82F6",
  },
  {
    id: "tongyi",
    name: "通义千问",
    subtitle: "阿里云 · 百炼平台",
    iconColor: "#F97316",
  },
  {
    id: "kimi",
    name: "Kimi",
    subtitle: "月之暗面 · Kimi",
    balance: "¥13.96",
    iconColor: "#1F2937",
  },
  {
    id: "minimax",
    name: "MiniMax",
    subtitle: "MiniMax · 海螺 AI",
    iconColor: "#10B981",
  },
];

const DEEPSEEK_GATEWAY_MODEL_OPTIONS = [
  {
    slug: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "Fast default for Codex gateway usage.",
  },
  {
    slug: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "Higher capability route when you want stronger reasoning.",
  },
] as const;
const DEEPSEEK_GATEWAY_MODEL_ALIASES: Record<string, string> = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
};

const MODEL_CHANNELS_STORAGE_KEY = "peakcode:enabled-model-channels:v1";

function normalizeDeepSeekGatewayModel(model: string | undefined): string {
  if (!model) return DEEPSEEK_GATEWAY_MODEL_OPTIONS[0].slug;
  return DEEPSEEK_GATEWAY_MODEL_ALIASES[model] ?? model;
}

function readEnabledModelChannels(): ReadonlyArray<ModelChannelId> {
  try {
    const raw = localStorage.getItem(MODEL_CHANNELS_STORAGE_KEY);
    if (!raw) return MODEL_CHANNELS.map((c) => c.id);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = new Set(MODEL_CHANNELS.map((c) => c.id));
      return parsed.filter((id): id is ModelChannelId => valid.has(id));
    }
  } catch {
    // ignore
  }
  return MODEL_CHANNELS.map((c) => c.id);
}

function writeEnabledModelChannels(ids: ReadonlyArray<ModelChannelId>): void {
  try {
    localStorage.setItem(MODEL_CHANNELS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

type InstallBinarySettingsKey =
  | "claudeBinaryPath"
  | "codexBinaryPath"
  | "cursorBinaryPath"
  | "geminiBinaryPath"
  | "grokBinaryPath"
  | "kiloBinaryPath"
  | "openCodeBinaryPath"
  | "piBinaryPath";
type InstallProviderSettings = {
  provider: ProviderKind;
  title: string;
  docs: ReadonlyArray<{
    label: string;
    href: string;
  }>;
  binaryPathKey: InstallBinarySettingsKey;
  binaryPlaceholder: string;
  binaryDescription: string;
  binaryCommand: string;
  homePathKey?: "codexHomePath";
  homePlaceholder?: string;
  homeDescription?: ReactNode;
  apiEndpointKey?: "cursorApiEndpoint";
  apiEndpointPlaceholder?: string;
  apiEndpointDescription?: ReactNode;
  serverUrlKey?: "kiloServerUrl" | "openCodeServerUrl";
  serverUrlPlaceholder?: string;
  serverUrlDescription?: ReactNode;
  serverPasswordKey?: "kiloServerPassword" | "openCodeServerPassword";
  serverPasswordPlaceholder?: string;
  serverPasswordDescription?: ReactNode;
  agentDirKey?: "piAgentDir";
  agentDirPlaceholder?: string;
  agentDirDescription?: ReactNode;
};

const PROVIDER_VISIBILITY_OPTIONS: ReadonlyArray<{ provider: ProviderKind; title: string }> = [
  { provider: "codex", title: PROVIDER_DISPLAY_NAMES.codex },
  { provider: "claudeAgent", title: PROVIDER_DISPLAY_NAMES.claudeAgent },
  { provider: "cursor", title: PROVIDER_DISPLAY_NAMES.cursor },
  { provider: "gemini", title: PROVIDER_DISPLAY_NAMES.gemini },
  { provider: "grok", title: PROVIDER_DISPLAY_NAMES.grok },
  { provider: "kilo", title: PROVIDER_DISPLAY_NAMES.kilo },
  { provider: "opencode", title: PROVIDER_DISPLAY_NAMES.opencode },
  { provider: "pi", title: PROVIDER_DISPLAY_NAMES.pi },
];

// Pure helper kept at module scope so the toggle handler stays trivial and the
// dedupe logic is shared between the toggle and the schema normalizer.
function setProviderHidden(
  current: ReadonlyArray<ProviderKind>,
  provider: ProviderKind,
  hidden: boolean,
): ProviderKind[] {
  const withoutTarget = current.filter((entry) => entry !== provider);
  return hidden ? [...withoutTarget, provider] : withoutTarget;
}

function SortableProviderVisibilityRow(props: {
  option: { provider: ProviderKind; title: string };
  isHidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.option.provider });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-[var(--color-background-elevated-secondary)]/40 px-3 py-2.5",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--color-background-elevated-secondary)] hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${props.option.title}`}
          {...attributes}
          {...listeners}
        >
          <DotGrid2x3Icon className="size-4" />
        </button>
        <span className="min-w-0 text-sm text-foreground">{props.option.title}</span>
      </div>
      <Switch
        checked={!props.isHidden}
        onCheckedChange={(checked) => props.onHiddenChange(!Boolean(checked))}
        aria-label={`Show ${props.option.title} in the provider picker`}
      />
    </div>
  );
}

const INSTALL_PROVIDER_DOCS: ReadonlyArray<{
  provider: ProviderKind;
  docs: ReadonlyArray<{ docKey: "install" | "update" | "config" | "headless"; href: string }>;
  command: string;
  title: string;
}> = [
  {
    provider: "codex",
    title: "Codex",
    command: "codex",
    docs: [
      { docKey: "install", href: "https://help.openai.com/en/articles/11096431" },
      { docKey: "update", href: "https://help.openai.com/en/articles/11096431" },
      { docKey: "config", href: "https://github.com/openai/codex/blob/main/docs/config.md" },
    ],
  },
  {
    provider: "claudeAgent",
    title: "Claude",
    command: "claude",
    docs: [
      { docKey: "install", href: "https://code.claude.com/docs/en/installation" },
      {
        docKey: "update",
        href: "https://code.claude.com/docs/en/installation#update-claude-code",
      },
      { docKey: "config", href: "https://code.claude.com/docs/en/settings" },
    ],
  },
  {
    provider: "cursor",
    title: "Cursor",
    command: "cursor-agent",
    docs: [
      { docKey: "install", href: "https://docs.cursor.com/en/cli/installation" },
      { docKey: "update", href: "https://docs.cursor.com/en/cli/installation#updates" },
      { docKey: "config", href: "https://docs.cursor.com/en/cli/overview" },
    ],
  },
  {
    provider: "gemini",
    title: "Gemini",
    command: "gemini",
    docs: [
      { docKey: "install", href: "https://google-gemini.github.io/gemini-cli/docs/get-started/" },
      { docKey: "update", href: "https://github.com/google-gemini/gemini-cli" },
      {
        docKey: "config",
        href: "https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html",
      },
    ],
  },
  {
    provider: "grok",
    title: "Grok",
    command: "grok",
    docs: [
      { docKey: "install", href: "https://docs.x.ai/build/overview" },
      { docKey: "headless", href: "https://docs.x.ai/build/cli/headless-scripting" },
      { docKey: "config", href: "https://docs.x.ai/build/overview" },
    ],
  },
  {
    provider: "kilo",
    title: "Kilo",
    command: "kilo",
    docs: [
      { docKey: "install", href: "https://kilo.ai/docs/cli" },
      { docKey: "update", href: "https://kilo.ai/docs/cli" },
      { docKey: "config", href: "https://kilo.ai/docs/cli#configuration" },
    ],
  },
  {
    provider: "opencode",
    title: "OpenCode",
    command: "opencode",
    docs: [
      { docKey: "install", href: "https://opencode.ai/docs/" },
      { docKey: "update", href: "https://opencode.ai/docs/cli/" },
      { docKey: "config", href: "https://opencode.ai/docs/config/" },
    ],
  },
  {
    provider: "pi",
    title: "Pi",
    command: "pi",
    docs: [
      { docKey: "install", href: "https://pi.dev/docs/latest" },
      { docKey: "update", href: "https://pi.dev/docs/latest/settings" },
      { docKey: "config", href: "https://pi.dev/docs/latest/settings" },
    ],
  },
];

function buildInstallProviderSettings(
  messages: ReturnType<typeof useMessages>,
): readonly InstallProviderSettings[] {
  const docsLabel = (key: "install" | "update" | "config" | "headless"): string => {
    if (key === "install") return messages.settings.providers.docs.install;
    if (key === "update") return messages.settings.providers.docs.update;
    if (key === "config") return messages.settings.providers.docs.config;
    return messages.settings.providers.docs.headless;
  };
  return INSTALL_PROVIDER_DOCS.map((entry) => ({
    provider: entry.provider,
    title: entry.title,
    docs: entry.docs.map((doc) => ({ label: docsLabel(doc.docKey), href: doc.href })),
    binaryPathKey:
      entry.provider === "claudeAgent"
        ? "claudeBinaryPath"
        : entry.provider === "cursor"
          ? "cursorBinaryPath"
          : entry.provider === "gemini"
            ? "geminiBinaryPath"
            : entry.provider === "grok"
              ? "grokBinaryPath"
              : entry.provider === "kilo"
                ? "kiloBinaryPath"
                : entry.provider === "opencode"
                  ? "openCodeBinaryPath"
                  : entry.provider === "pi"
                    ? "piBinaryPath"
                    : "codexBinaryPath",
    binaryPlaceholder: messages.settings.providers.tools.binaryPathPlaceholder(entry.title),
    binaryDescription: messages.settings.providers.tools.binaryPathDescription(entry.command),
    binaryCommand: entry.command,
    ...(entry.provider === "codex"
      ? {
          homePathKey: "codexHomePath" as const,
          homePlaceholder: messages.settings.providers.tools.homePathPlaceholder,
          homeDescription: messages.settings.providers.tools.homePathDescription,
        }
      : {}),
    ...(entry.provider === "pi"
      ? {
          agentDirKey: "piAgentDir" as const,
          agentDirPlaceholder: messages.settings.providers.tools.agentDirPlaceholder,
          agentDirDescription: messages.settings.providers.tools.agentDirDescription,
        }
      : {}),
    ...(entry.provider === "cursor"
      ? {
          apiEndpointKey: "cursorApiEndpoint" as const,
          apiEndpointPlaceholder: messages.settings.providers.tools.apiEndpointPlaceholder,
          apiEndpointDescription: messages.settings.providers.tools.apiEndpointDescription,
        }
      : {}),
    ...(entry.provider === "kilo" || entry.provider === "opencode"
      ? {
          serverUrlKey:
            entry.provider === "kilo" ? ("kiloServerUrl" as const) : ("openCodeServerUrl" as const),
          serverUrlPlaceholder: messages.settings.providers.tools.serverUrlPlaceholder,
          serverUrlDescription: messages.settings.providers.tools.serverUrlDescription(entry.title),
        }
      : {}),
    ...(entry.provider === "kilo" || entry.provider === "opencode"
      ? {
          serverPasswordKey:
            entry.provider === "kilo"
              ? ("kiloServerPassword" as const)
              : ("openCodeServerPassword" as const),
          serverPasswordPlaceholder: messages.settings.providers.tools.serverPasswordPlaceholder(
            entry.title,
          ),
          serverPasswordDescription: messages.settings.providers.tools.serverPasswordDescription(
            entry.title,
          ),
        }
      : {}),
  }));
}

// ── Settings UI primitives ────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground px-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
  onClick,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  resetAction?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-[color:var(--color-border-light)] bg-[var(--color-background-panel)] px-4 py-3.5 transition-colors hover:bg-[var(--sidebar-accent)]"
      data-slot="settings-row"
    >
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {resetAction}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {status ? <div className="pt-1 text-[11px] text-muted-foreground">{status}</div> : null}
        </div>
        {control ? (
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SettingResetButton({
  label,
  onClick,
  tooltip,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  tooltip?: string;
  ariaLabel?: string;
}) {
  const resolvedTooltip = tooltip ?? "Reset to default";
  const resolvedAriaLabel = ariaLabel ?? `Reset ${label} to default`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={resolvedAriaLabel}
            className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
          </Button>
        }
      />
      <TooltipPopup side="top">{resolvedTooltip}</TooltipPopup>
    </Tooltip>
  );
}

function ProviderDocsLinks({
  docs,
  label,
}: {
  docs: InstallProviderSettings["docs"];
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-[var(--color-background-elevated-secondary)]/35 px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className="flex flex-wrap gap-2">
          {docs.map((doc) => (
            <a
              key={`${doc.label}:${doc.href}`}
              href={doc.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-[var(--color-background-panel)] hover:text-foreground"
            >
              <span>{doc.label}</span>
              <ExternalLinkIcon className="size-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function normalizeManagedWorktreePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function formatProviderVersion(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function providerUpdateStatusLabel(provider: ServerProviderStatus): string | null {
  const state = provider.updateState?.status;
  if (state === "queued") {
    return "Update queued";
  }
  if (state === "running") {
    return "Updating";
  }
  if (state === "succeeded") {
    return "Updated";
  }
  if (state === "failed") {
    return "Update failed";
  }
  if (state === "unchanged") {
    return "Still outdated";
  }
  const advisory = provider.versionAdvisory;
  if (advisory?.status === "behind_latest" && advisory.latestVersion) {
    const currentVersion = formatProviderVersion(advisory.currentVersion);
    const latestVersion = formatProviderVersion(advisory.latestVersion);
    return currentVersion ? `${currentVersion} -> ${latestVersion}` : `Latest ${latestVersion}`;
  }
  const currentVersion = formatProviderVersion(provider.version);
  return currentVersion ? `Current ${currentVersion}` : null;
}

function providerUpdateFailureMessage(provider: ServerProviderStatus | undefined): string | null {
  const state = provider?.updateState;
  if (!state || (state.status !== "failed" && state.status !== "unchanged")) {
    return null;
  }
  return state.output?.trim() || state.message || "The provider update did not complete.";
}

// ── Route screen ───────────────────────────────────────────────────────────

function SettingsRouteView() {
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const activeSection = normalizeSettingsSection(routeSearch.section);
  const settingsTarget = typeof routeSearch.target === "string" ? routeSearch.target : null;
  const messages = useMessages();
  const localizedNavItems = useSettingsNavItems();
  const activeSectionItem =
    localizedNavItems.find((item) => item.id === activeSection) ?? localizedNavItems[0]!;

  const { isDefaultActiveTheme, resetAllThemes, resolvedTheme, theme, setTheme } = useTheme();
  const { settings, defaults, updateSettings, resetSettings } = useAppSettings();
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const queryClient = useQueryClient();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const serverSettingsQuery = useQuery(serverSettingsQueryOptions());
  const gatewaySecretStatusQuery = useQuery({
    queryKey: serverQueryKeys.gatewaySecretStatus(),
    queryFn: async () => ensureNativeApi().gateway.getSecretStatus(),
    staleTime: 15_000,
  });
  const serverWorktreesQuery = useQuery(serverWorktreesQueryOptions());
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const threads = useStore(useMemo(() => createAllThreadsSelector(), []));
  const projects = useStore((store) => store.projects);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const archivedThreads = threads.filter((thread) => thread.archivedAt != null);
  const shouldOfferRecoveryTools = useMemo(() => {
    if (!threadsHydrated || projects.length === 0) {
      return false;
    }
    return threads.length === 0 || threads.every((thread) => thread.messages.length === 0);
  }, [projects.length, threads, threadsHydrated]);

  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [isRepairingLocalState, setIsRepairingLocalState] = useState(false);
  const [showRecoveryTools, setShowRecoveryTools] = useState(false);
  const [releaseHistoryOpen, setReleaseHistoryOpen] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  const providerUpdatesRef = useRef<HTMLDivElement | null>(null);
  const providerInstallsRef = useRef<HTMLDivElement | null>(null);
  const [openInstallProviders, setOpenInstallProviders] = useState<Record<ProviderKind, boolean>>({
    codex: Boolean(settings.codexBinaryPath || settings.codexHomePath),
    claudeAgent: Boolean(settings.claudeBinaryPath),
    cursor: Boolean(settings.cursorBinaryPath || settings.cursorApiEndpoint),
    gemini: Boolean(settings.geminiBinaryPath),
    grok: Boolean(settings.grokBinaryPath),
    kilo: Boolean(settings.kiloBinaryPath || settings.kiloServerUrl || settings.kiloServerPassword),
    opencode: Boolean(
      settings.openCodeBinaryPath || settings.openCodeServerUrl || settings.openCodeServerPassword,
    ),
    pi: Boolean(settings.piBinaryPath || settings.piAgentDir),
  });
  const [updatingProviders, setUpdatingProviders] = useState<ReadonlySet<ProviderKind>>(
    () => new Set(),
  );
  const [selectedCustomModelProvider, setSelectedCustomModelProvider] =
    useState<ProviderKind>("codex");
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
    claudeAgent: "",
    cursor: "",
    gemini: "",
    grok: "",
    kilo: "",
    opencode: "",
    pi: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});
  const [showAllCustomModels, setShowAllCustomModels] = useState(false);
  const [enabledModelChannels, setEnabledModelChannels] =
    useState<ReadonlyArray<ModelChannelId>>(readEnabledModelChannels);
  const gatewayRunning = serverSettingsQuery.data?.gateway.enabled ?? false;
  const gatewayUpstreams = serverSettingsQuery.data?.gateway.upstreamProviders ?? [];
  const deepSeekGatewayUpstream = gatewayUpstreams.find(
    (upstream) => upstream.provider === "deepseek",
  );
  const selectedDeepSeekGatewayModel = normalizeDeepSeekGatewayModel(
    deepSeekGatewayUpstream?.defaultModel,
  );
  const gatewaySecretStatusByProvider = useMemo(
    () =>
      new Map(
        (gatewaySecretStatusQuery.data?.secrets ?? []).map((secret) => [
          secret.provider,
          secret.hasApiKey,
        ]),
      ),
    [gatewaySecretStatusQuery.data],
  );
  const [gatewayApiKeyInputByProvider, setGatewayApiKeyInputByProvider] = useState<
    Partial<Record<GatewayUpstreamProvider, string>>
  >({});
  const gatewayToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const api = ensureNativeApi();
      return api.gateway.updateConfig({ enabled });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
    },
    onError: (error) => {
      toastManager.add({
        title: "Could not update gateway",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });
  const gatewayDeepSeekModelMutation = useMutation({
    mutationFn: async (model: (typeof DEEPSEEK_GATEWAY_MODEL_OPTIONS)[number]["slug"]) => {
      const api = ensureNativeApi();
      return api.gateway.updateConfig({
        defaultUpstreamProvider: "deepseek",
        upstreamProviders: [
          {
            provider: "deepseek",
            enabled: true,
            defaultModel: model,
            customModels: DEEPSEEK_GATEWAY_MODEL_OPTIONS.map((option) => option.slug),
            modelAliases: {
              "deepseek-chat": "deepseek-v4-flash",
              "deepseek-reasoner": "deepseek-v4-pro",
            },
          },
        ],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
    },
    onError: (error) => {
      toastManager.add({
        title: "Could not update DeepSeek model",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });
  const gatewaySetApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: GatewayUpstreamProvider; apiKey: string }) => {
      const api = ensureNativeApi();
      return api.gateway.setApiKey(input);
    },
    onSuccess: (_result, variables) => {
      setGatewayApiKeyInputByProvider((current) => ({
        ...current,
        [variables.provider]: "",
      }));
      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.gatewaySecretStatus() });
    },
    onError: (error) => {
      toastManager.add({
        title: "Could not save gateway API key",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });
  const gatewayRemoveApiKeyMutation = useMutation({
    mutationFn: async (provider: GatewayUpstreamProvider) => {
      const api = ensureNativeApi();
      return api.gateway.removeApiKey({ provider });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.gatewaySecretStatus() });
    },
    onError: (error) => {
      toastManager.add({
        title: "Could not remove gateway API key",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(
    readBrowserNotificationPermissionState(),
  );
  const shouldShowFontSmoothing = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
  );

  const hiddenProviderSet = useMemo(
    () => new Set<ProviderKind>(settings.hiddenProviders),
    [settings.hiddenProviders],
  );
  const hiddenProviderCount = hiddenProviderSet.size;
  const providerVisibilityOptionsByProvider = useMemo(
    () => new Map(PROVIDER_VISIBILITY_OPTIONS.map((option) => [option.provider, option])),
    [],
  );
  const orderedProviderVisibilityOptions = useMemo(
    () =>
      settings.providerOrder.flatMap((provider) => {
        const option = providerVisibilityOptionsByProvider.get(provider);
        return option ? [option] : [];
      }),
    [providerVisibilityOptionsByProvider, settings.providerOrder],
  );
  const providerVisibilitySensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );
  const isProviderOrderDirty = !sameProviderOrder(settings.providerOrder, defaults.providerOrder);
  const codexBinaryPath = settings.codexBinaryPath;
  const codexHomePath = settings.codexHomePath;
  const claudeBinaryPath = settings.claudeBinaryPath;
  const cursorBinaryPath = settings.cursorBinaryPath;
  const cursorApiEndpoint = settings.cursorApiEndpoint;
  const geminiBinaryPath = settings.geminiBinaryPath;
  const grokBinaryPath = settings.grokBinaryPath;
  const kiloBinaryPath = settings.kiloBinaryPath;
  const kiloServerUrl = settings.kiloServerUrl;
  const kiloServerPassword = settings.kiloServerPassword;
  const openCodeBinaryPath = settings.openCodeBinaryPath;
  const openCodeServerUrl = settings.openCodeServerUrl;
  const openCodeServerPassword = settings.openCodeServerPassword;
  const piBinaryPath = settings.piBinaryPath;
  const piAgentDir = settings.piAgentDir;
  const keybindingsConfigPath = serverConfigQuery.data?.keybindingsConfigPath ?? null;
  const availableEditors = serverConfigQuery.data?.availableEditors;
  const providerStatusByProvider = useMemo(
    () =>
      new Map((serverConfigQuery.data?.providers ?? []).map((status) => [status.provider, status])),
    [serverConfigQuery.data?.providers],
  );
  const outdatedProviderCount = useMemo(
    () =>
      (serverConfigQuery.data?.providers ?? []).filter(
        (status) => status.versionAdvisory?.status === "behind_latest",
      ).length,
    [serverConfigQuery.data?.providers],
  );
  const outdatedProviderStatuses = useMemo(
    () =>
      (serverConfigQuery.data?.providers ?? []).filter(
        (status) => status.versionAdvisory?.status === "behind_latest",
      ),
    [serverConfigQuery.data?.providers],
  );
  const shouldFocusProviderUpdates =
    activeSection === "providers" && settingsTarget === "provider-updates";

  useEffect(() => {
    if (!shouldFocusProviderUpdates) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      providerUpdatesRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverConfigQuery.data?.providers, shouldFocusProviderUpdates]);
  const managedWorktrees = serverWorktreesQuery.data?.worktrees ?? [];
  const worktreesByWorkspaceRoot = managedWorktrees.reduce<
    Array<{
      workspaceRoot: string;
      worktrees: Array<{
        path: string;
        linkedThreads: typeof threads;
      }>;
    }>
  >((groups, worktree) => {
    const linkedThreads = threads.filter((thread) => {
      const candidatePaths = [
        normalizeManagedWorktreePath(thread.worktreePath),
        normalizeManagedWorktreePath(thread.associatedWorktreePath),
      ];
      return candidatePaths.includes(worktree.path);
    });
    const existingGroup = groups.find((group) => group.workspaceRoot === worktree.workspaceRoot);
    const nextWorktree = {
      path: worktree.path,
      linkedThreads,
    };
    if (existingGroup) {
      existingGroup.worktrees.push(nextWorktree);
    } else {
      groups.push({
        workspaceRoot: worktree.workspaceRoot,
        worktrees: [nextWorktree],
      });
    }
    return groups;
  }, []);

  const gitTextGenerationModelOptions = getGitTextGenerationModelOptions(settings);
  const currentGitTextGenerationProvider = settings.textGenerationProvider ?? "codex";
  const currentGitTextGenerationModel =
    settings.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
  const currentGitTextGenerationValue = `${currentGitTextGenerationProvider}:${currentGitTextGenerationModel}`;
  const defaultGitTextGenerationProvider = defaults.textGenerationProvider ?? "codex";
  const defaultGitTextGenerationModel =
    defaults.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
  const isGitTextGenerationModelDirty =
    currentGitTextGenerationProvider !== defaultGitTextGenerationProvider ||
    currentGitTextGenerationModel !== defaultGitTextGenerationModel;
  const selectedGitTextGenerationModelLabel =
    gitTextGenerationModelOptions.find(
      (option) =>
        option.provider === currentGitTextGenerationProvider &&
        option.slug === currentGitTextGenerationModel,
    )?.name ?? currentGitTextGenerationModel;
  const selectedCustomModelProviderSettings = MODEL_PROVIDER_SETTINGS.find(
    (providerSettings) => providerSettings.provider === selectedCustomModelProvider,
  )!;
  const selectedCustomModelInput = customModelInputByProvider[selectedCustomModelProvider];
  const selectedCustomModelError = customModelErrorByProvider[selectedCustomModelProvider] ?? null;
  const totalCustomModels =
    settings.customCodexModels.length +
    settings.customClaudeModels.length +
    settings.customCursorModels.length +
    settings.customGeminiModels.length +
    settings.customGrokModels.length +
    settings.customKiloModels.length +
    settings.customOpenCodeModels.length +
    settings.customPiModels.length;
  const savedCustomModelRows = MODEL_PROVIDER_SETTINGS.flatMap((providerSettings) =>
    getCustomModelsForProvider(settings, providerSettings.provider).map((slug) => ({
      key: `${providerSettings.provider}:${slug}`,
      provider: providerSettings.provider,
      providerTitle: providerSettings.title,
      slug,
    })),
  );
  const visibleCustomModelRows = showAllCustomModels
    ? savedCustomModelRows
    : savedCustomModelRows.slice(0, 5);
  const isInstallSettingsDirty =
    settings.claudeBinaryPath !== defaults.claudeBinaryPath ||
    settings.cursorBinaryPath !== defaults.cursorBinaryPath ||
    settings.cursorApiEndpoint !== defaults.cursorApiEndpoint ||
    settings.geminiBinaryPath !== defaults.geminiBinaryPath ||
    settings.grokBinaryPath !== defaults.grokBinaryPath ||
    settings.kiloBinaryPath !== defaults.kiloBinaryPath ||
    settings.kiloServerUrl !== defaults.kiloServerUrl ||
    settings.kiloServerPassword !== defaults.kiloServerPassword ||
    settings.codexBinaryPath !== defaults.codexBinaryPath ||
    settings.codexHomePath !== defaults.codexHomePath ||
    settings.openCodeBinaryPath !== defaults.openCodeBinaryPath ||
    settings.openCodeServerUrl !== defaults.openCodeServerUrl ||
    settings.openCodeServerPassword !== defaults.openCodeServerPassword ||
    settings.piBinaryPath !== defaults.piBinaryPath ||
    settings.piAgentDir !== defaults.piAgentDir;

  const changedSettingLabels = [
    ...(theme !== "system" ? [messages.settings.changedSettingLabel.theme] : []),
    ...(!isDefaultActiveTheme
      ? [
          resolvedTheme === "dark"
            ? messages.settings.changedSettingLabel.darkThemePack
            : messages.settings.changedSettingLabel.lightThemePack,
        ]
      : []),
    ...(settings.defaultProvider !== defaults.defaultProvider
      ? [messages.settings.changedSettingLabel.defaultProvider]
      : []),
    ...(settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode
      ? [messages.settings.changedSettingLabel.newThreadMode]
      : []),
    ...(settings.sidebarSide !== defaults.sidebarSide
      ? [messages.settings.changedSettingLabel.sidebarPosition]
      : []),
    ...(settings.sidebarProjectSortOrder !== defaults.sidebarProjectSortOrder
      ? [messages.settings.changedSettingLabel.projectSortOrder]
      : []),
    ...(settings.sidebarThreadSortOrder !== defaults.sidebarThreadSortOrder
      ? [messages.settings.changedSettingLabel.threadSortOrder]
      : []),
    ...(settings.uiFontFamily !== defaults.uiFontFamily
      ? [messages.settings.changedSettingLabel.uiFont]
      : []),
    ...(settings.chatCodeFontFamily !== defaults.chatCodeFontFamily
      ? [messages.settings.changedSettingLabel.codeFont]
      : []),
    ...(settings.chatFontSizePx !== defaults.chatFontSizePx
      ? [messages.settings.changedSettingLabel.baseFontSize]
      : []),
    ...(shouldShowFontSmoothing &&
    settings.enableNativeFontSmoothing !== defaults.enableNativeFontSmoothing
      ? [messages.settings.changedSettingLabel.fontSmoothing]
      : []),
    ...(settings.timestampFormat !== defaults.timestampFormat
      ? [messages.settings.changedSettingLabel.timeFormat]
      : []),
    ...(settings.enableTaskCompletionToasts !== defaults.enableTaskCompletionToasts
      ? [messages.settings.changedSettingLabel.activityToasts]
      : []),
    ...(settings.enableSystemTaskCompletionNotifications !==
    defaults.enableSystemTaskCompletionNotifications
      ? [messages.settings.changedSettingLabel.desktopNotifications]
      : []),
    ...(settings.enableAssistantStreaming !== defaults.enableAssistantStreaming
      ? [messages.settings.changedSettingLabel.assistantOutput]
      : []),
    ...(settings.diffWordWrap !== defaults.diffWordWrap
      ? [messages.settings.changedSettingLabel.diffLineWrapping]
      : []),
    ...(settings.confirmThreadDelete !== defaults.confirmThreadDelete
      ? [messages.settings.changedSettingLabel.deleteConfirmation]
      : []),
    ...(settings.confirmThreadArchive !== defaults.confirmThreadArchive
      ? [messages.settings.changedSettingLabel.archiveConfirmation]
      : []),
    ...(settings.confirmTerminalTabClose !== defaults.confirmTerminalTabClose
      ? [messages.settings.changedSettingLabel.terminalCloseConfirmation]
      : []),
    ...(isGitTextGenerationModelDirty
      ? [messages.settings.changedSettingLabel.gitWritingModel]
      : []),
    ...(settings.customCodexModels.length > 0 ||
    settings.customClaudeModels.length > 0 ||
    settings.customCursorModels.length > 0 ||
    settings.customGeminiModels.length > 0 ||
    settings.customGrokModels.length > 0 ||
    settings.customKiloModels.length > 0 ||
    settings.customOpenCodeModels.length > 0 ||
    settings.customPiModels.length > 0
      ? [messages.settings.changedSettingLabel.customModels]
      : []),
    ...(isInstallSettingsDirty ? [messages.settings.changedSettingLabel.providerInstalls] : []),
    ...(hiddenProviderCount > 0 ? [messages.settings.changedSettingLabel.providerVisibility] : []),
    ...(isProviderOrderDirty ? [messages.settings.changedSettingLabel.providerOrder] : []),
  ];

  const openKeybindingsFile = useCallback(() => {
    if (!keybindingsConfigPath) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    const api = ensureNativeApi();
    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenKeybindingsError("No available editors found.");
      setIsOpeningKeybindings(false);
      return;
    }
    void api.shell
      .openInEditor(keybindingsConfigPath, editor)
      .catch((error) => {
        setOpenKeybindingsError(
          error instanceof Error ? error.message : "Unable to open keybindings file.",
        );
      })
      .finally(() => {
        setIsOpeningKeybindings(false);
      });
  }, [availableEditors, keybindingsConfigPath]);

  useEffect(() => {
    setBrowserNotificationPermission(readBrowserNotificationPermissionState());
  }, []);

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const customModelInput = customModelInputByProvider[provider];
      const customModels = getCustomModelsForProvider(settings, provider);
      const normalized = normalizeModelSlug(customModelInput, provider);
      if (!normalized) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "Enter a model slug.",
        }));
        return;
      }
      if (getModelOptions(provider).some((option) => option.slug === normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That model is already built in.",
        }));
        return;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
        }));
        return;
      }
      if (customModels.includes(normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That custom model is already saved.",
        }));
        return;
      }

      updateSettings(patchCustomModels(provider, [...customModels, normalized]));
      setCustomModelInputByProvider((existing) => ({
        ...existing,
        [provider]: "",
      }));
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [customModelInputByProvider, settings, updateSettings],
  );

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      updateSettings(
        patchCustomModels(
          provider,
          customModels.filter((model) => model !== slug),
        ),
      );
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [settings, updateSettings],
  );

  const handleProviderOrderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const fromIndex = settings.providerOrder.indexOf(active.id as ProviderKind);
      const toIndex = settings.providerOrder.indexOf(over.id as ProviderKind);
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      updateSettings({
        providerOrder: arrayMove([...settings.providerOrder], fromIndex, toIndex),
      });
    },
    [settings.providerOrder, updateSettings],
  );

  const runProviderUpdate = useCallback(
    async (provider: ProviderKind) => {
      if (updatingProviders.has(provider)) {
        return;
      }
      setUpdatingProviders((current) => new Set(current).add(provider));
      try {
        const result = await ensureNativeApi().server.updateProvider({ provider });
        const refreshedProvider = result.providers.find((status) => status.provider === provider);
        const failureMessage = providerUpdateFailureMessage(refreshedProvider);
        if (failureMessage) {
          toastManager.add({
            type: "error",
            title: `Could not update ${PROVIDER_DISPLAY_NAMES[provider]}`,
            description: failureMessage,
          });
          return;
        }
        toastManager.add({
          type: "success",
          title: `${PROVIDER_DISPLAY_NAMES[provider]} update finished`,
          description: "New sessions will use the refreshed provider.",
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: `Could not update ${PROVIDER_DISPLAY_NAMES[provider]}`,
          description: error instanceof Error ? error.message : "The provider update failed.",
        });
      } finally {
        await queryClient
          .invalidateQueries({ queryKey: serverQueryKeys.config() })
          .catch(() => undefined);
        setUpdatingProviders((current) => {
          const next = new Set(current);
          next.delete(provider);
          return next;
        });
      }
    },
    [queryClient, updatingProviders],
  );

  async function restoreDefaults() {
    if (changedSettingLabels.length === 0) return;

    const api = readNativeApi();
    const confirmed = await (api ?? ensureNativeApi()).dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
    );
    if (!confirmed) return;

    setTheme("system");
    resetAllThemes();
    resetSettings();
    setOpenInstallProviders({
      codex: false,
      claudeAgent: false,
      cursor: false,
      gemini: false,
      grok: false,
      kilo: false,
      opencode: false,
      pi: false,
    });
    setSelectedCustomModelProvider("codex");
    setCustomModelInputByProvider({
      codex: "",
      claudeAgent: "",
      cursor: "",
      gemini: "",
      grok: "",
      kilo: "",
      opencode: "",
      pi: "",
    });
    setCustomModelErrorByProvider({});
    setShowAllCustomModels(false);
    setShowRecoveryTools(false);
    setOpenKeybindingsError(null);
  }

  async function setSystemNotificationsEnabled(nextEnabled: boolean) {
    if (!nextEnabled) {
      updateSettings({ enableSystemTaskCompletionNotifications: false });
      return;
    }

    if (isElectron) {
      updateSettings({ enableSystemTaskCompletionNotifications: true });
      return;
    }

    const permission = await requestBrowserNotificationPermission();
    setBrowserNotificationPermission(permission);

    if (permission === "granted") {
      updateSettings({ enableSystemTaskCompletionNotifications: true });
      return;
    }

    updateSettings({ enableSystemTaskCompletionNotifications: false });
    toastManager.add({
      type: permission === "denied" ? "warning" : "error",
      title: "Desktop notifications unavailable",
      description: buildNotificationSettingsSupportText(permission),
    });
  }

  async function sendTestNotification() {
    const title = "Activity notification";
    const body = "Notification test for chats and terminal agents.";

    if (window.desktopBridge) {
      const shown = await window.desktopBridge.notifications.show({ title, body, silent: false });
      toastManager.add({
        type: shown ? "success" : "warning",
        title: shown ? "Test notification sent" : "Notifications unavailable",
        description: shown
          ? "Your operating system should show the notification."
          : "Desktop notifications are not supported on this device.",
      });
      return;
    }

    const permission = await requestBrowserNotificationPermission();
    setBrowserNotificationPermission(permission);
    if (permission !== "granted") {
      toastManager.add({
        type: permission === "denied" ? "warning" : "error",
        title: "Desktop notifications unavailable",
        description: buildNotificationSettingsSupportText(permission),
      });
      return;
    }

    const notification = new Notification(title, { body, tag: "peakcode:test-notification" });
    notification.addEventListener("click", () => {
      window.focus();
    });
    toastManager.add({
      type: "success",
      title: "Test notification sent",
      description: "Your browser should show the notification.",
    });
  }

  // Rebuild the local project indexes after an older install leaves them out of sync.
  const repairLocalState = useCallback(async () => {
    if (isRepairingLocalState) {
      return;
    }

    const api = readNativeApi() ?? ensureNativeApi();
    const confirmed = await api.dialogs.confirm(
      [
        "Repair local state?",
        "This rebuilds local project indexes and refreshes project snapshots.",
        "It keeps existing chats in place, but it may take a moment.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsRepairingLocalState(true);
    try {
      const snapshot = await api.orchestration.repairState();
      syncServerReadModel(snapshot);
      toastManager.add({
        type: "success",
        title: "Local state repaired",
        description: "Project indexes were rebuilt without clearing existing chats.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Repair failed",
        description: error instanceof Error ? error.message : "Unable to repair local state.",
      });
    } finally {
      setIsRepairingLocalState(false);
    }
  }, [isRepairingLocalState, syncServerReadModel]);

  const deleteManagedWorktree = useCallback(
    async (input: { workspaceRoot: string; worktreePath: string }) => {
      const api = readNativeApi() ?? ensureNativeApi();
      const displayName = formatWorktreePathForDisplay(input.worktreePath);
      const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
      if (snapshot === null) {
        toastManager.add({
          type: "error",
          title: "Could not verify linked conversations",
          description: "Retry once the app reconnects to the server.",
        });
        return;
      }

      const linkedThreadsFromSnapshot = snapshot.threads.filter((thread) => {
        const candidatePaths = [
          normalizeManagedWorktreePath(thread.worktreePath),
          normalizeManagedWorktreePath(thread.associatedWorktreePath ?? null),
        ];
        return candidatePaths.includes(input.worktreePath);
      });
      const linkedArchivedThreadIds = linkedThreadsFromSnapshot
        .filter((thread) => (thread.archivedAt ?? null) !== null)
        .map((thread) => thread.id);
      const linkedActiveThreadCount = linkedThreadsFromSnapshot.filter(
        (thread) => (thread.archivedAt ?? null) === null,
      ).length;
      const linkedConversationCount = linkedActiveThreadCount + linkedArchivedThreadIds.length;
      const confirmed = await api.dialogs.confirm(
        linkedConversationCount > 0
          ? [
              `Delete worktree "${displayName}"?`,
              "",
              `${linkedActiveThreadCount} active and ${linkedArchivedThreadIds.length} archived conversation${linkedConversationCount === 1 ? " is" : "s are"} linked to this worktree.`,
              linkedArchivedThreadIds.length > 0
                ? "Archived conversations will be deleted first."
                : "Deleting it can break reopening those chats in the same workspace.",
              "",
              "Delete the worktree anyway?",
            ].join("\n")
          : [`Delete worktree "${displayName}"?`, "This removes the Git worktree from disk."].join(
              "\n",
            ),
      );
      if (!confirmed) {
        return;
      }

      try {
        for (const archivedThreadId of linkedArchivedThreadIds) {
          await api.orchestration.dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: archivedThreadId,
          });
        }

        await removeWorktreeMutation.mutateAsync({
          cwd: input.workspaceRoot,
          path: input.worktreePath,
          force: true,
        });
        await queryClient.invalidateQueries({
          queryKey: serverQueryKeys.worktrees(),
        });
        toastManager.add({
          type: "success",
          title: "Worktree deleted",
          description:
            linkedArchivedThreadIds.length > 0
              ? `${displayName} was removed and ${linkedArchivedThreadIds.length} archived conversation${linkedArchivedThreadIds.length === 1 ? "" : "s"} were deleted.`
              : `${displayName} was removed.`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not delete worktree",
          description: error instanceof Error ? error.message : "Unable to delete the worktree.",
        });
      }
    },
    [queryClient, removeWorktreeMutation],
  );

  const unarchiveThread = useCallback(async (threadId: ThreadId) => {
    const api = readNativeApi();
    if (!api) return;
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.unarchive",
        commandId: newCommandId(),
        threadId,
      });
      toastManager.add({
        type: "success",
        title: "Thread restored",
        description: "The thread has been moved back to the sidebar.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not restore thread",
        description: error instanceof Error ? error.message : "Unable to restore the thread.",
      });
    }
  }, []);

  const deleteArchivedThread = useCallback(async (threadId: ThreadId, threadTitle: string) => {
    const api = readNativeApi();
    if (!api) return;

    const confirmed = await api.dialogs.confirm(
      `Permanently delete "${threadTitle}"?\n\nThis will remove the thread and its conversation history forever.`,
    );
    if (!confirmed) return;

    try {
      await api.orchestration.dispatchCommand({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId,
      });
      toastManager.add({
        type: "success",
        title: "Thread deleted",
        description: "The archived thread has been permanently removed.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not delete thread",
        description: error instanceof Error ? error.message : "Unable to delete the thread.",
      });
    }
  }, []);

  const handleArchivedThreadContextMenu = useCallback(
    async (threadId: ThreadId, threadTitle: string, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;

      const clicked = await api.contextMenu.show(
        [
          { id: "restore", label: "Restore" },
          { id: "delete", label: "Delete", destructive: true },
        ],
        position,
      );

      if (clicked === "restore") {
        await unarchiveThread(threadId);
        return;
      }

      if (clicked === "delete") {
        await deleteArchivedThread(threadId, threadTitle);
      }
    },
    [deleteArchivedThread, unarchiveThread],
  );

  const renderGeneralPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.general.coreDefaults}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.general.language.title}
            description={messages.settings.general.language.description}
            resetAction={
              settings.language !== defaults.language ? (
                <SettingResetButton
                  label={messages.settings.general.language.title.toLowerCase()}
                  onClick={() => updateSettings({ language: defaults.language })}
                />
              ) : null
            }
            control={
              <Select
                value={settings.language}
                onValueChange={(value) => {
                  if (!SUPPORTED_LANGUAGES.includes(value as LanguageSetting)) {
                    return;
                  }
                  updateSettings({ language: value as LanguageSetting });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.language.title}
                >
                  <SelectValue>{NATIVE_LANGUAGE_LABELS[settings.language]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem key={language} hideIndicator value={language}>
                      {NATIVE_LANGUAGE_LABELS[language]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.defaultProvider.title}
            description={messages.settings.general.defaultProvider.description}
            resetAction={
              settings.defaultProvider !== defaults.defaultProvider ? (
                <SettingResetButton
                  label={messages.settings.general.defaultProvider.resetLabel}
                  onClick={() => updateSettings({ defaultProvider: defaults.defaultProvider })}
                />
              ) : null
            }
            control={
              <Select
                value={settings.defaultProvider}
                onValueChange={(value) => {
                  if (
                    value !== "codex" &&
                    value !== "claudeAgent" &&
                    value !== "cursor" &&
                    value !== "gemini" &&
                    value !== "grok" &&
                    value !== "kilo" &&
                    value !== "opencode" &&
                    value !== "pi"
                  ) {
                    return;
                  }
                  updateSettings({ defaultProvider: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.defaultProvider.title}
                >
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {settings.defaultProvider === "claudeAgent" ? (
                        <ClaudeAI className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "cursor" ? (
                        <CursorIcon className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "gemini" ? (
                        <Gemini className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "grok" ? (
                        <GrokIcon className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "kilo" ? (
                        <KiloIcon className="size-3.5 text-muted-foreground/70" />
                      ) : settings.defaultProvider === "opencode" ? (
                        <OpenCodeIcon className="size-3.5 text-muted-foreground/70" />
                      ) : settings.defaultProvider === "pi" ? (
                        <PiIcon className="size-3.5 text-foreground" />
                      ) : (
                        <OpenAI className="size-3.5" />
                      )}
                      {PROVIDER_DISPLAY_NAMES[settings.defaultProvider]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="codex">
                    <span className="flex items-center gap-2">
                      <OpenAI className="size-3.5" />
                      Codex
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="claudeAgent">
                    <span className="flex items-center gap-2">
                      <ClaudeAI className="size-3.5 text-foreground" />
                      Claude
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="cursor">
                    <span className="flex items-center gap-2">
                      <CursorIcon className="size-3.5 text-foreground" />
                      Cursor
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="gemini">
                    <span className="flex items-center gap-2">
                      <Gemini className="size-3.5 text-foreground" />
                      Gemini
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="grok">
                    <span className="flex items-center gap-2">
                      <GrokIcon className="size-3.5 text-foreground" />
                      Grok
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="opencode">
                    <span className="flex items-center gap-2">
                      <OpenCodeIcon className="size-3.5 text-muted-foreground/70" />
                      OpenCode
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="kilo">
                    <span className="flex items-center gap-2">
                      <KiloIcon className="size-3.5 text-muted-foreground/70" />
                      Kilo
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="pi">
                    <span className="flex items-center gap-2">
                      <PiIcon className="size-3.5 text-foreground" />
                      Pi
                    </span>
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.newThreads.title}
            description={messages.settings.general.newThreads.description}
            resetAction={
              settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode ? (
                <SettingResetButton
                  label={messages.settings.general.newThreads.resetLabel}
                  onClick={() =>
                    updateSettings({
                      defaultThreadEnvMode: defaults.defaultThreadEnvMode,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.defaultThreadEnvMode}
                onValueChange={(value) => {
                  if (value !== "local" && value !== "worktree") return;
                  updateSettings({
                    defaultThreadEnvMode: value,
                  });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.newThreads.title}
                >
                  <SelectValue>
                    {settings.defaultThreadEnvMode === "worktree"
                      ? messages.settings.general.newThreads.worktree
                      : messages.settings.general.newThreads.local}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="local">
                    {messages.settings.general.newThreads.local}
                  </SelectItem>
                  <SelectItem hideIndicator value="worktree">
                    {messages.settings.general.newThreads.worktree}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.general.sidebarOrganization}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.general.sidebarPosition.title}
            description={messages.settings.general.sidebarPosition.description}
            resetAction={
              settings.sidebarSide !== defaults.sidebarSide ? (
                <SettingResetButton
                  label={messages.settings.general.sidebarPosition.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarSide: defaults.sidebarSide,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarSide}
                onValueChange={(value) => {
                  if (value !== "left" && value !== "right") {
                    return;
                  }
                  updateSettings({ sidebarSide: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.sidebarPosition.title}
                >
                  <SelectValue>
                    {settings.sidebarSide === "left"
                      ? messages.settings.general.sidebarPosition.left
                      : messages.settings.general.sidebarPosition.right}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="left">
                    {messages.settings.general.sidebarPosition.left}
                  </SelectItem>
                  <SelectItem hideIndicator value="right">
                    {messages.settings.general.sidebarPosition.right}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.projectOrder.title}
            description={messages.settings.general.projectOrder.description}
            resetAction={
              settings.sidebarProjectSortOrder !== defaults.sidebarProjectSortOrder ? (
                <SettingResetButton
                  label={messages.settings.general.projectOrder.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarProjectSortOrder: defaults.sidebarProjectSortOrder,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarProjectSortOrder}
                onValueChange={(value) => {
                  if (value !== "updated_at" && value !== "created_at" && value !== "manual") {
                    return;
                  }
                  updateSettings({ sidebarProjectSortOrder: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.projectOrder.title}
                >
                  <SelectValue>
                    {settings.sidebarProjectSortOrder === "updated_at"
                      ? messages.settings.general.projectOrder.recentlyActive
                      : settings.sidebarProjectSortOrder === "created_at"
                        ? messages.settings.general.projectOrder.recentlyAdded
                        : messages.settings.general.projectOrder.manual}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="updated_at">
                    {messages.settings.general.projectOrder.recentlyActive}
                  </SelectItem>
                  <SelectItem hideIndicator value="created_at">
                    {messages.settings.general.projectOrder.recentlyAdded}
                  </SelectItem>
                  <SelectItem hideIndicator value="manual">
                    {messages.settings.general.projectOrder.manual}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.threadOrder.title}
            description={messages.settings.general.threadOrder.description}
            resetAction={
              settings.sidebarThreadSortOrder !== defaults.sidebarThreadSortOrder ? (
                <SettingResetButton
                  label={messages.settings.general.threadOrder.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarThreadSortOrder: defaults.sidebarThreadSortOrder,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarThreadSortOrder}
                onValueChange={(value) => {
                  if (value !== "updated_at" && value !== "created_at") {
                    return;
                  }
                  updateSettings({ sidebarThreadSortOrder: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.threadOrder.title}
                >
                  <SelectValue>
                    {settings.sidebarThreadSortOrder === "updated_at"
                      ? messages.settings.general.threadOrder.recentlyActive
                      : messages.settings.general.threadOrder.newestFirst}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="updated_at">
                    {messages.settings.general.threadOrder.recentlyActive}
                  </SelectItem>
                  <SelectItem hideIndicator value="created_at">
                    {messages.settings.general.threadOrder.newestFirst}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderAppearancePanel = () => {
    const themeOptionLabels = {
      system: messages.settings.appearance.theme.system,
      light: messages.settings.appearance.theme.light,
      dark: messages.settings.appearance.theme.dark,
    } as const;
    const themeOptionDescriptions = {
      system: messages.settings.appearance.theme.systemDescription,
      light: messages.settings.appearance.theme.lightDescription,
      dark: messages.settings.appearance.theme.darkDescription,
    } as const;
    const themeOptions = [
      {
        value: "system" as const,
        label: themeOptionLabels.system,
        description: themeOptionDescriptions.system,
      },
      {
        value: "light" as const,
        label: themeOptionLabels.light,
        description: themeOptionDescriptions.light,
      },
      {
        value: "dark" as const,
        label: themeOptionLabels.dark,
        description: themeOptionDescriptions.dark,
      },
    ];
    const timestampLabels = {
      locale: messages.settings.appearance.timestamp.systemDefault,
      "12-hour": messages.settings.appearance.timestamp.twelveHour,
      "24-hour": messages.settings.appearance.timestamp.twentyFourHour,
    } as const;
    return (
      <div className="space-y-6">
        <SettingsSection title={messages.settings.appearance.themeAndTypographySection}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.appearance.theme.title}
              description={messages.settings.appearance.theme.description}
              resetAction={
                theme !== "system" ? (
                  <SettingResetButton
                    label={messages.settings.general.defaultProvider.resetLabel}
                    onClick={() => setTheme("system")}
                  />
                ) : null
              }
              control={
                <Select
                  value={theme}
                  onValueChange={(value) => {
                    if (value !== "system" && value !== "light" && value !== "dark") return;
                    setTheme(value);
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.theme.title}
                  >
                    <SelectValue>
                      {theme === "light"
                        ? themeOptionLabels.light
                        : theme === "dark"
                          ? themeOptionLabels.dark
                          : themeOptionLabels.system}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {themeOptions.map((option) => (
                      <SelectItem hideIndicator key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />

            <div className="space-y-3 pt-1">
              {(resolvedTheme === "dark"
                ? (["dark", "light"] as const)
                : (["light", "dark"] as const)
              ).map((variant) => (
                <ThemePackEditor
                  key={variant}
                  variant={variant}
                  isActive={resolvedTheme === variant}
                  mode={theme}
                />
              ))}
            </div>

            <SettingsRow
              title={messages.settings.appearance.typography.uiFont}
              description={messages.settings.appearance.typography.uiFontDescription}
              resetAction={
                settings.uiFontFamily !== defaults.uiFontFamily ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.uiFont}
                    onClick={() => updateSettings({ uiFontFamily: defaults.uiFontFamily })}
                  />
                ) : null
              }
              control={
                <Input
                  className="w-full text-right sm:w-48"
                  value={settings.uiFontFamily}
                  onChange={(event) => updateSettings({ uiFontFamily: event.target.value })}
                  placeholder="-apple-system, BlinkM…"
                  spellCheck={false}
                  aria-label={messages.settings.appearance.typography.uiFontAria}
                />
              }
            />

            <SettingsRow
              title={messages.settings.appearance.typography.codeFont}
              description={messages.settings.appearance.typography.codeFontDescription}
              resetAction={
                settings.chatCodeFontFamily !== defaults.chatCodeFontFamily ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.codeFont}
                    onClick={() =>
                      updateSettings({ chatCodeFontFamily: defaults.chatCodeFontFamily })
                    }
                  />
                ) : null
              }
              control={
                <Input
                  className="w-full text-right sm:w-48"
                  value={settings.chatCodeFontFamily}
                  onChange={(event) => updateSettings({ chatCodeFontFamily: event.target.value })}
                  placeholder={'"JetBrains Mono"'}
                  spellCheck={false}
                  aria-label={messages.settings.appearance.typography.codeFontAria}
                />
              }
            />

            <SettingsRow
              title={messages.settings.appearance.typography.baseFontSize}
              description={messages.settings.appearance.typography.baseFontSizeDescription}
              resetAction={
                settings.chatFontSizePx !== defaults.chatFontSizePx ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.baseFontSize}
                    onClick={() =>
                      updateSettings({
                        chatFontSizePx: defaults.chatFontSizePx,
                      })
                    }
                  />
                ) : null
              }
              control={
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Input
                    type="number"
                    min={MIN_CHAT_FONT_SIZE_PX}
                    max={MAX_CHAT_FONT_SIZE_PX}
                    step={1}
                    inputMode="numeric"
                    className="w-full text-right sm:w-20"
                    value={String(settings.chatFontSizePx)}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (nextValue.length === 0) return;
                      updateSettings({
                        chatFontSizePx: normalizeChatFontSizePx(Number(nextValue)),
                      });
                    }}
                    aria-label={messages.settings.appearance.typography.baseFontSizeAria}
                  />
                  <span className="text-xs text-muted-foreground">
                    {messages.settings.appearance.typography.unitPx}
                  </span>
                </div>
              }
            />

            {shouldShowFontSmoothing ? (
              <SettingsRow
                title={messages.settings.appearance.typography.fontSmoothing}
                description={messages.settings.appearance.typography.fontSmoothingDescription}
                resetAction={
                  settings.enableNativeFontSmoothing !== defaults.enableNativeFontSmoothing ? (
                    <SettingResetButton
                      label={messages.settings.appearance.typography.fontSmoothing}
                      onClick={() =>
                        updateSettings({
                          enableNativeFontSmoothing: defaults.enableNativeFontSmoothing,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Switch
                    checked={settings.enableNativeFontSmoothing}
                    onCheckedChange={(checked) =>
                      updateSettings({ enableNativeFontSmoothing: checked })
                    }
                    aria-label={messages.settings.appearance.typography.fontSmoothingAria}
                  />
                }
              />
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title={messages.settings.appearance.timeAndReadingSection}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.appearance.timestamp.title}
              description={messages.settings.appearance.timestamp.description}
              resetAction={
                settings.timestampFormat !== defaults.timestampFormat ? (
                  <SettingResetButton
                    label={messages.settings.appearance.timestamp.title}
                    onClick={() =>
                      updateSettings({
                        timestampFormat: defaults.timestampFormat,
                      })
                    }
                  />
                ) : null
              }
              control={
                <Select
                  value={settings.timestampFormat}
                  onValueChange={(value) => {
                    if (value !== "locale" && value !== "12-hour" && value !== "24-hour") {
                      return;
                    }
                    updateSettings({
                      timestampFormat: value,
                    });
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.timestamp.ariaLabel}
                  >
                    <SelectValue>
                      {settings.timestampFormat === "12-hour"
                        ? timestampLabels["12-hour"]
                        : settings.timestampFormat === "24-hour"
                          ? timestampLabels["24-hour"]
                          : timestampLabels.locale}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem hideIndicator value="locale">
                      {timestampLabels.locale}
                    </SelectItem>
                    <SelectItem hideIndicator value="12-hour">
                      {timestampLabels["12-hour"]}
                    </SelectItem>
                    <SelectItem hideIndicator value="24-hour">
                      {timestampLabels["24-hour"]}
                    </SelectItem>
                  </SelectPopup>
                </Select>
              }
            />
          </div>
        </SettingsSection>
      </div>
    );
  };

  const renderNotificationsPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.notifications.activityAlertsSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.notifications.activityToasts.title}
            description={messages.settings.notifications.activityToasts.description}
            resetAction={
              settings.enableTaskCompletionToasts !== defaults.enableTaskCompletionToasts ? (
                <SettingResetButton
                  label={messages.settings.notifications.activityToasts.title.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableTaskCompletionToasts: defaults.enableTaskCompletionToasts,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.enableTaskCompletionToasts}
                onCheckedChange={(checked) =>
                  updateSettings({ enableTaskCompletionToasts: Boolean(checked) })
                }
                aria-label={messages.settings.notifications.activityToasts.ariaLabel}
              />
            }
          />

          <SettingsRow
            title={messages.settings.notifications.desktopNotifications.title}
            description={messages.settings.notifications.desktopNotifications.description}
            status={buildNotificationSettingsSupportText(browserNotificationPermission)}
            resetAction={
              settings.enableSystemTaskCompletionNotifications !==
              defaults.enableSystemTaskCompletionNotifications ? (
                <SettingResetButton
                  label={messages.settings.notifications.desktopNotifications.title.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableSystemTaskCompletionNotifications:
                        defaults.enableSystemTaskCompletionNotifications,
                    })
                  }
                />
              ) : null
            }
            control={
              <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                <Button size="xs" variant="outline" onClick={() => void sendTestNotification()}>
                  {messages.settings.notifications.testButton}
                </Button>
                <Switch
                  checked={settings.enableSystemTaskCompletionNotifications}
                  onCheckedChange={(checked) => {
                    void setSystemNotificationsEnabled(Boolean(checked));
                  }}
                  aria-label={messages.settings.notifications.desktopNotifications.ariaLabel}
                />
              </div>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderBehaviorPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.behavior.runtimeSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.behavior.assistantOutput}
            description={messages.settings.behavior.assistantOutputDescription}
            resetAction={
              settings.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
                <SettingResetButton
                  label={messages.settings.behavior.assistantOutput.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableAssistantStreaming: defaults.enableAssistantStreaming,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.enableAssistantStreaming}
                onCheckedChange={(checked) =>
                  updateSettings({
                    enableAssistantStreaming: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.assistantOutputAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.diffLineWrapping}
            description={messages.settings.behavior.diffLineWrappingDescription}
            resetAction={
              settings.diffWordWrap !== defaults.diffWordWrap ? (
                <SettingResetButton
                  label={messages.settings.behavior.diffLineWrapping.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      diffWordWrap: defaults.diffWordWrap,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.diffWordWrap}
                onCheckedChange={(checked) =>
                  updateSettings({
                    diffWordWrap: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.diffLineWrappingAria}
              />
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.behavior.safetySection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.behavior.deleteConfirmation}
            description={messages.settings.behavior.deleteConfirmationDescription}
            resetAction={
              settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
                <SettingResetButton
                  label={messages.settings.behavior.deleteConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmThreadDelete: defaults.confirmThreadDelete,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmThreadDelete}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmThreadDelete: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.deleteConfirmationAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.archiveConfirmation}
            description={messages.settings.behavior.archiveConfirmationDescription}
            resetAction={
              settings.confirmThreadArchive !== defaults.confirmThreadArchive ? (
                <SettingResetButton
                  label={messages.settings.behavior.archiveConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmThreadArchive: defaults.confirmThreadArchive,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmThreadArchive}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmThreadArchive: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.archiveConfirmationAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.terminalCloseConfirmation}
            description={messages.settings.behavior.terminalCloseConfirmationDescription}
            resetAction={
              settings.confirmTerminalTabClose !== defaults.confirmTerminalTabClose ? (
                <SettingResetButton
                  label={messages.settings.behavior.terminalCloseConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmTerminalTabClose: defaults.confirmTerminalTabClose,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmTerminalTabClose}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmTerminalTabClose: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.terminalCloseConfirmationAria}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderWorktreesPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.worktrees.managedSection}>
        <div className="space-y-4">
          {serverWorktreesQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              {messages.settings.worktrees.loading}
            </div>
          ) : serverWorktreesQuery.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
              {serverWorktreesQuery.error instanceof Error
                ? serverWorktreesQuery.error.message
                : messages.settings.worktrees.loadFailedFallback}
            </div>
          ) : worktreesByWorkspaceRoot.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              {messages.settings.worktrees.emptyState}
            </div>
          ) : (
            worktreesByWorkspaceRoot.map((group) => (
              <section key={group.workspaceRoot} className="space-y-2">
                <h3 className="px-1 font-mono text-[11px] text-muted-foreground">
                  {group.workspaceRoot}
                </h3>

                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
                  {group.worktrees.map((worktree, index) => {
                    const deleteDisabled = removeWorktreeMutation.isPending;
                    return (
                      <div
                        key={worktree.path}
                        className={cn(
                          "flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between",
                          index > 0 && "border-t border-border/60",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium text-foreground">
                              {messages.settings.worktrees.worktreeLabel}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {worktree.path}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              {messages.settings.worktrees.conversationsLabel}
                            </div>
                            {worktree.linkedThreads.length > 0 ? (
                              <div className="space-y-1">
                                {worktree.linkedThreads.map((thread) => (
                                  <div key={thread.id} className="text-sm text-foreground">
                                    {thread.title}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                {messages.settings.worktrees.noConversations}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Button
                            size="xs"
                            variant="destructive"
                            disabled={deleteDisabled}
                            onClick={() =>
                              void deleteManagedWorktree({
                                workspaceRoot: group.workspaceRoot,
                                worktreePath: worktree.path,
                              })
                            }
                          >
                            {messages.settings.worktrees.deleteButton}
                          </Button>
                          {worktree.linkedThreads.length > 0 ? (
                            <p className="max-w-40 text-right text-[11px] text-muted-foreground">
                              {messages.settings.worktrees.deleteWarning}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </SettingsSection>
    </div>
  );

  const renderArchivedPanel = () => {
    const archivedGroups = [
      ...projects.map((project) => ({
        project,
        threads: archivedThreads
          .filter((thread) => thread.projectId === project.id)
          .toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.updatedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.updatedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          }),
      })),
      ...(() => {
        const knownProjectIds = new Set(projects.map((project) => project.id));
        const orphanedThreads = archivedThreads
          .filter((thread) => !knownProjectIds.has(thread.projectId))
          .toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.updatedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.updatedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          });
        return orphanedThreads.length > 0
          ? [
              {
                project: null,
                threads: orphanedThreads,
              },
            ]
          : [];
      })(),
    ].filter((group) => group.threads.length > 0);

    return (
      <div className="space-y-6">
        {archivedGroups.length === 0 ? (
          <SettingsSection title={messages.settings.archived.emptySection}>
            <div className="rounded-2xl border border-dashed border-border/70 bg-card/35 px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground">
                <ArchiveIcon className="size-5" />
              </div>
              <div className="text-sm font-medium text-foreground">
                {messages.settings.archived.emptyTitle}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {messages.settings.archived.emptyDescription}
              </div>
            </div>
          </SettingsSection>
        ) : (
          archivedGroups.map(({ project, threads: projectThreads }) => (
            <SettingsSection
              key={project?.id ?? "unknown-project"}
              title={project?.name ?? messages.settings.archived.unknownProject}
            >
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
                {projectThreads.map((thread, index) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
                      index > 0 && "border-t border-border/60",
                    )}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void handleArchivedThreadContextMenu(thread.id, thread.title, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {thread.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {messages.settings.archived.archivedAt(
                          formatRelativeTime(thread.archivedAt ?? thread.createdAt),
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void unarchiveThread(thread.id)}
                      >
                        {messages.settings.archived.restoreButton}
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => void deleteArchivedThread(thread.id, thread.title)}
                      >
                        {messages.settings.archived.deleteButton}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>
          ))
        )}
      </div>
    );
  };

  const renderModelsPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.models.generationSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.models.gitWritingModel}
            description={messages.settings.models.gitWritingModelDescription}
            resetAction={
              isGitTextGenerationModelDirty ? (
                <SettingResetButton
                  label={messages.settings.models.gitWritingModel.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      textGenerationProvider: defaults.textGenerationProvider,
                      textGenerationModel: defaults.textGenerationModel,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={currentGitTextGenerationValue}
                onValueChange={(value) => {
                  if (!value) return;
                  const separatorIndex = value.indexOf(":");
                  const provider = value.slice(0, separatorIndex) as ProviderKind;
                  const model = value.slice(separatorIndex + 1);
                  if (!provider || !model) return;
                  updateSettings({
                    textGenerationProvider: provider,
                    textGenerationModel: model,
                  });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-52"
                  aria-label={messages.settings.models.gitWritingModelAria}
                >
                  <SelectValue>{selectedGitTextGenerationModelLabel}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {gitTextGenerationModelOptions.map((option) => (
                    <SelectItem
                      hideIndicator
                      key={`${option.provider}:${option.slug}`}
                      value={`${option.provider}:${option.slug}`}
                    >
                      {PROVIDER_DISPLAY_NAMES[option.provider]} / {option.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="网关代理">
        <div className="space-y-2">
          <SettingsRow
            title="本地 API 网关"
            description="启动后可通过统一本地端点访问所有已启用的模型渠道。"
            control={
              <Switch
                checked={gatewayRunning}
                disabled={gatewayToggleMutation.isPending}
                onCheckedChange={(checked) => gatewayToggleMutation.mutate(Boolean(checked))}
              />
            }
          />
          {gatewayRunning ? (
            <div className="mt-4 space-y-5 border-t border-border pt-4">
              {/* ── Local API ── */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-foreground">Local API</h4>
                <p className="mb-2 text-xs text-muted-foreground">
                  Listening on /gateway/openai/v1
                </p>
                <div className="space-y-1">
                  {[
                    { label: "Root", url: "/gateway/openai/v1" },
                    { label: "Chat", url: "/gateway/openai/v1/chat/completions" },
                    { label: "Models", url: "/gateway/openai/v1/models" },
                  ].map((ep) => (
                    <div
                      key={ep.label}
                      className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-[var(--sidebar-accent)]"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-xs text-muted-foreground">{ep.label}</span>
                        <span className="font-mono text-xs text-foreground">{ep.url}</span>
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[var(--color-background-elevated-secondary)] hover:text-foreground"
                        onClick={() => {
                          void navigator.clipboard.writeText(ep.url);
                          toastManager.add({ title: "Copied to clipboard", type: "success" });
                        }}
                        aria-label={`Copy ${ep.label} URL`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">
                  DeepSeek default model
                </h4>
                <div className="rounded-lg border border-border/40 bg-[var(--color-background-panel)] p-3">
                  <div className="mb-3 flex flex-col gap-1">
                    <div className="text-sm font-medium text-foreground">
                      Used when Codex sends model{" "}
                      <span className="font-mono text-xs">deepseek</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Configure Codex once against the local gateway, then switch Flash/Pro here.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {DEEPSEEK_GATEWAY_MODEL_OPTIONS.map((option) => {
                      const selected = selectedDeepSeekGatewayModel === option.slug;
                      return (
                        <button
                          key={option.slug}
                          type="button"
                          disabled={gatewayDeepSeekModelMutation.isPending}
                          onClick={() => {
                            if (!selected) gatewayDeepSeekModelMutation.mutate(option.slug);
                          }}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left transition-colors",
                            selected
                              ? "border-blue-500/70 bg-blue-500/10 text-foreground"
                              : "border-border/50 bg-[var(--color-background-elevated-secondary)] text-muted-foreground hover:border-border hover:text-foreground",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{option.label}</span>
                            {selected ? (
                              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] text-blue-500">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 font-mono text-xs">{option.slug}</div>
                          <div className="mt-1 text-xs">{option.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">Upstream API Keys</h4>
                <div className="space-y-3">
                  {gatewayUpstreams.map((upstream) => {
                    const hasApiKey = gatewaySecretStatusByProvider.get(upstream.provider) ?? false;
                    const apiKeyInput = gatewayApiKeyInputByProvider[upstream.provider] ?? "";
                    const isSaving =
                      gatewaySetApiKeyMutation.isPending &&
                      gatewaySetApiKeyMutation.variables?.provider === upstream.provider;
                    const isRemoving =
                      gatewayRemoveApiKeyMutation.isPending &&
                      gatewayRemoveApiKeyMutation.variables === upstream.provider;
                    return (
                      <div
                        key={upstream.provider}
                        className="rounded-lg border border-border/40 bg-[var(--color-background-panel)] p-3"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {upstream.displayName}
                            </div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">
                              {upstream.baseUrl || "No base URL configured"}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs",
                              hasApiKey
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-amber-500/10 text-amber-500",
                            )}
                          >
                            {hasApiKey ? "API key saved" : "API key required"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="password"
                            value={apiKeyInput}
                            placeholder={`Paste ${upstream.displayName} API key`}
                            onChange={(event) =>
                              setGatewayApiKeyInputByProvider((current) => ({
                                ...current,
                                [upstream.provider]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            disabled={apiKeyInput.trim().length === 0 || isSaving}
                            onClick={() =>
                              gatewaySetApiKeyMutation.mutate({
                                provider: upstream.provider,
                                apiKey: apiKeyInput.trim(),
                              })
                            }
                          >
                            {isSaving ? "Saving" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!hasApiKey || isRemoving}
                            onClick={() => gatewayRemoveApiKeyMutation.mutate(upstream.provider)}
                          >
                            {isRemoving ? "Removing" : "Remove"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Agent Setup ── */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">Agent Setup</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    {
                      name: "OpenCode",
                      status: "Composer models installed",
                      statusType: "ok" as const,
                      action: "Open" as const,
                    },
                    {
                      name: "VS Code",
                      status: "Provider needs update",
                      statusType: "warn" as const,
                      action: "Update" as const,
                    },
                    {
                      name: "Kilo Code",
                      status: "Provider needs update",
                      statusType: "warn" as const,
                      action: "Update" as const,
                    },
                    {
                      name: "Claude Code",
                      status: "Claude Code configured",
                      statusType: "ok" as const,
                      action: "Open" as const,
                    },
                    {
                      name: "Codex",
                      status: "Custom provider installed",
                      statusType: "ok" as const,
                      action: "Open" as const,
                    },
                    {
                      name: "Cline",
                      status: "Provider profile installed",
                      statusType: "ok" as const,
                      action: "Open" as const,
                    },
                    {
                      name: "pi",
                      status: "Custom models installed",
                      statusType: "ok" as const,
                      action: "Open" as const,
                    },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-[var(--color-background-panel)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white",
                            agent.name === "OpenCode" && "bg-slate-700",
                            agent.name === "VS Code" && "bg-blue-500",
                            agent.name === "Kilo Code" && "bg-neutral-900",
                            agent.name === "Claude Code" && "bg-orange-500",
                            agent.name === "Codex" && "bg-emerald-600",
                            agent.name === "Cline" && "bg-violet-600",
                            agent.name === "pi" && "bg-rose-500",
                          )}
                        >
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{agent.name}</div>
                          <div
                            className={cn(
                              "flex items-center gap-1 text-xs",
                              agent.statusType === "ok" && "text-emerald-500",
                              agent.statusType === "warn" && "text-amber-500",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block size-1.5 rounded-full",
                                agent.statusType === "ok" && "bg-emerald-500",
                                agent.statusType === "warn" && "bg-amber-500",
                              )}
                            />
                            {agent.status}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="xs"
                        variant={agent.action === "Update" ? "secondary" : "outline"}
                        onClick={() => {
                          toastManager.add({
                            title: `${agent.name} ${agent.action.toLowerCase()}ing...`,
                            type: "info",
                          });
                        }}
                      >
                        {agent.action}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.models.customSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.models.savedModelSlugs}
            description={messages.settings.models.savedModelSlugsDescription}
            resetAction={
              totalCustomModels > 0 ? (
                <SettingResetButton
                  label={messages.settings.models.customModelResetLabel}
                  onClick={() => {
                    updateSettings({
                      customCodexModels: defaults.customCodexModels,
                      customClaudeModels: defaults.customClaudeModels,
                      customCursorModels: defaults.customCursorModels,
                      customGeminiModels: defaults.customGeminiModels,
                      customGrokModels: defaults.customGrokModels,
                      customKiloModels: defaults.customKiloModels,
                      customOpenCodeModels: defaults.customOpenCodeModels,
                      customPiModels: defaults.customPiModels,
                    });
                    setCustomModelErrorByProvider({});
                    setShowAllCustomModels(false);
                  }}
                />
              ) : null
            }
          >
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={selectedCustomModelProvider}
                  onValueChange={(value) => {
                    if (
                      value !== "codex" &&
                      value !== "claudeAgent" &&
                      value !== "cursor" &&
                      value !== "gemini" &&
                      value !== "grok" &&
                      value !== "kilo" &&
                      value !== "opencode" &&
                      value !== "pi"
                    ) {
                      return;
                    }
                    setSelectedCustomModelProvider(value);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full sm:w-40"
                    aria-label={messages.settings.models.customProviderAria}
                  >
                    <SelectValue>{selectedCustomModelProviderSettings.title}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="start" alignItemWithTrigger={false}>
                    {MODEL_PROVIDER_SETTINGS.map((providerSettings) => (
                      <SelectItem
                        hideIndicator
                        className="min-h-7 text-sm"
                        key={providerSettings.provider}
                        value={providerSettings.provider}
                      >
                        {providerSettings.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <Input
                  id="custom-model-slug"
                  value={selectedCustomModelInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomModelInputByProvider((existing) => ({
                      ...existing,
                      [selectedCustomModelProvider]: value,
                    }));
                    if (selectedCustomModelError) {
                      setCustomModelErrorByProvider((existing) => ({
                        ...existing,
                        [selectedCustomModelProvider]: null,
                      }));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addCustomModel(selectedCustomModelProvider);
                  }}
                  placeholder={selectedCustomModelProviderSettings.example}
                  spellCheck={false}
                />
                <Button
                  className="shrink-0"
                  variant="outline"
                  onClick={() => addCustomModel(selectedCustomModelProvider)}
                >
                  <PlusIcon className="size-3.5" />
                  {messages.settings.models.customAddButton}
                </Button>
              </div>

              {selectedCustomModelError ? (
                <p className="mt-2 text-xs text-destructive">{selectedCustomModelError}</p>
              ) : null}

              {totalCustomModels > 0 ? (
                <div className="mt-3">
                  <div>
                    {visibleCustomModelRows.map((row) => (
                      <div
                        key={row.key}
                        className="group grid grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 px-4 py-2 first:border-t-0"
                      >
                        <span className="truncate text-xs text-muted-foreground">
                          {row.providerTitle}
                        </span>
                        <code className="min-w-0 truncate text-sm text-foreground">{row.slug}</code>
                        <button
                          type="button"
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                          aria-label={messages.settings.models.customRemoveAria(row.slug)}
                          onClick={() => removeCustomModel(row.provider, row.slug)}
                        >
                          <XIcon className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {savedCustomModelRows.length > 5 ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setShowAllCustomModels((value) => !value)}
                    >
                      {showAllCustomModels
                        ? messages.settings.models.customShowLess
                        : messages.settings.models.customShowMore(savedCustomModelRows.length - 5)}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="模型渠道接入">
        <div className="space-y-2">
          <SettingsRow
            title="服务渠道"
            description="管理第三方模型 API 渠道接入，启用后可在对应提供商中使用这些渠道。"
            status={
              <span className="text-[11px] text-muted-foreground">
                ({enabledModelChannels.length}/{MODEL_CHANNELS.length} 已启用)
              </span>
            }
          >
            <div className="mt-4 border-t border-border pt-4">
              <div className="space-y-1">
                {MODEL_CHANNELS.map((channel) => {
                  const isEnabled = enabledModelChannels.includes(channel.id);
                  return (
                    <div
                      key={channel.id}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 transition-colors hover:bg-[var(--sidebar-accent)]"
                    >
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: channel.iconColor }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span>{channel.name}</span>
                          {channel.balance ? (
                            <span className="text-xs font-normal text-emerald-500">
                              余额 {channel.balance}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{channel.subtitle}</div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...enabledModelChannels, channel.id]
                            : enabledModelChannels.filter((id) => id !== channel.id);
                          setEnabledModelChannels(next);
                          writeEnabledModelChannels(next);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );

  const renderProvidersPanel = () => (
    <div className="space-y-6">
      {renderProviderUpdatesSection()}
      <SettingsSection title={messages.settings.providers.pickerSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.providers.visibility.title}
            description={messages.settings.providers.visibility.description}
            status={
              hiddenProviderCount > 0
                ? hiddenProviderCount === 1
                  ? messages.settings.providers.visibility.statusHiddenOne
                  : messages.settings.providers.visibility.statusHidden(hiddenProviderCount)
                : isProviderOrderDirty
                  ? messages.settings.providers.visibility.statusCustomOrder
                  : messages.settings.providers.visibility.statusAllVisible
            }
            resetAction={
              hiddenProviderCount > 0 || isProviderOrderDirty ? (
                <SettingResetButton
                  label={messages.settings.providers.visibility.resetLabel}
                  onClick={() =>
                    updateSettings({
                      hiddenProviders: defaults.hiddenProviders,
                      providerOrder: defaults.providerOrder,
                    })
                  }
                />
              ) : null
            }
          >
            <DndContext
              sensors={providerVisibilitySensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleProviderOrderDragEnd}
            >
              <SortableContext
                items={orderedProviderVisibilityOptions.map((option) => option.provider)}
                strategy={verticalListSortingStrategy}
              >
                <div className="mt-4 space-y-2">
                  {orderedProviderVisibilityOptions.map((option) => (
                    <SortableProviderVisibilityRow
                      key={option.provider}
                      option={option}
                      isHidden={hiddenProviderSet.has(option.provider)}
                      onHiddenChange={(hidden) =>
                        updateSettings({
                          hiddenProviders: setProviderHidden(
                            settings.hiddenProviders,
                            option.provider,
                            hidden,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </SettingsRow>
        </div>
      </SettingsSection>
      {renderProviderInstallsSection()}
    </div>
  );

  const renderProviderUpdatesSection = () => (
    <div ref={providerUpdatesRef} id="provider-updates">
      <SettingsSection title={messages.settings.providers.updatesSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.providers.updates.title}
            description={messages.settings.providers.updates.description}
            status={
              outdatedProviderCount > 0
                ? outdatedProviderCount === 1
                  ? messages.settings.providers.updates.statusAvailableOne
                  : messages.settings.providers.updates.statusAvailablePlural(outdatedProviderCount)
                : messages.settings.providers.updates.statusNoUpdates
            }
          >
            {outdatedProviderStatuses.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
                {outdatedProviderStatuses.map((providerStatus) => {
                  const updateAdvisory = providerStatus.versionAdvisory;
                  const updateState = providerStatus.updateState?.status;
                  const isProviderUpdateActive =
                    updateState === "queued" ||
                    updateState === "running" ||
                    updatingProviders.has(providerStatus.provider);
                  const canUpdateProvider =
                    updateAdvisory?.canUpdate === true && !isProviderUpdateActive;
                  const updateLabel = providerUpdateStatusLabel(providerStatus);

                  return (
                    <div
                      key={providerStatus.provider}
                      className="flex min-h-11 items-center gap-3 border-t border-border/70 px-3 py-2 first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {PROVIDER_DISPLAY_NAMES[providerStatus.provider]}
                        </div>
                        {updateLabel ? (
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {updateLabel}
                          </div>
                        ) : null}
                      </div>
                      {updateAdvisory?.canUpdate ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={!canUpdateProvider}
                          title={
                            updateAdvisory.updateCommand
                              ? messages.settings.providers.updates.runCommandTitle(
                                  updateAdvisory.updateCommand,
                                )
                              : messages.settings.providers.updates.versionAdvisoryNoCommand
                          }
                          onClick={() => void runProviderUpdate(providerStatus.provider)}
                        >
                          {isProviderUpdateActive ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <DownloadIcon className="size-3.5" />
                          )}
                          {isProviderUpdateActive
                            ? messages.settings.providers.updates.updatingButton
                            : messages.settings.providers.updates.updateButton}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {messages.settings.providers.updates.manualUpdate}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );

  const renderProviderInstallsSection = () => (
    <div ref={providerInstallsRef} id="provider-installs">
      <SettingsSection title={messages.settings.providers.toolsSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.providers.tools.title}
            description={messages.settings.providers.tools.description}
            status={
              outdatedProviderCount > 0
                ? outdatedProviderCount === 1
                  ? messages.settings.providers.tools.statusAvailableOne
                  : messages.settings.providers.tools.statusAvailablePlural(outdatedProviderCount)
                : messages.settings.providers.tools.statusNoUpdates
            }
            resetAction={
              isInstallSettingsDirty ? (
                <SettingResetButton
                  label={messages.settings.providers.tools.resetLabel}
                  onClick={() => {
                    updateSettings({
                      claudeBinaryPath: defaults.claudeBinaryPath,
                      codexBinaryPath: defaults.codexBinaryPath,
                      codexHomePath: defaults.codexHomePath,
                      cursorBinaryPath: defaults.cursorBinaryPath,
                      cursorApiEndpoint: defaults.cursorApiEndpoint,
                      geminiBinaryPath: defaults.geminiBinaryPath,
                      grokBinaryPath: defaults.grokBinaryPath,
                      kiloBinaryPath: defaults.kiloBinaryPath,
                      kiloServerUrl: defaults.kiloServerUrl,
                      kiloServerPassword: defaults.kiloServerPassword,
                      openCodeBinaryPath: defaults.openCodeBinaryPath,
                      openCodeServerUrl: defaults.openCodeServerUrl,
                      openCodeServerPassword: defaults.openCodeServerPassword,
                      piAgentDir: defaults.piAgentDir,
                      piBinaryPath: defaults.piBinaryPath,
                    });
                    setOpenInstallProviders({
                      codex: false,
                      claudeAgent: false,
                      cursor: false,
                      gemini: false,
                      grok: false,
                      kilo: false,
                      opencode: false,
                      pi: false,
                    });
                  }}
                />
              ) : null
            }
          >
            <div className="mt-4">
              <div className="overflow-hidden rounded-lg border border-border/70">
                {buildInstallProviderSettings(messages).map((providerSettings) => {
                  const isOpen = openInstallProviders[providerSettings.provider];
                  const isDirty =
                    providerSettings.provider === "codex"
                      ? settings.codexBinaryPath !== defaults.codexBinaryPath ||
                        settings.codexHomePath !== defaults.codexHomePath
                      : providerSettings.provider === "claudeAgent"
                        ? settings.claudeBinaryPath !== defaults.claudeBinaryPath
                        : providerSettings.provider === "cursor"
                          ? settings.cursorBinaryPath !== defaults.cursorBinaryPath ||
                            settings.cursorApiEndpoint !== defaults.cursorApiEndpoint
                          : providerSettings.provider === "gemini"
                            ? settings.geminiBinaryPath !== defaults.geminiBinaryPath
                            : providerSettings.provider === "grok"
                              ? settings.grokBinaryPath !== defaults.grokBinaryPath
                              : providerSettings.provider === "kilo"
                                ? settings.kiloBinaryPath !== defaults.kiloBinaryPath ||
                                  settings.kiloServerUrl !== defaults.kiloServerUrl ||
                                  settings.kiloServerPassword !== defaults.kiloServerPassword
                                : providerSettings.provider === "pi"
                                  ? settings.piBinaryPath !== defaults.piBinaryPath ||
                                    settings.piAgentDir !== defaults.piAgentDir
                                  : settings.openCodeBinaryPath !== defaults.openCodeBinaryPath ||
                                    settings.openCodeServerUrl !== defaults.openCodeServerUrl ||
                                    settings.openCodeServerPassword !==
                                      defaults.openCodeServerPassword;
                  const binaryPathValue =
                    providerSettings.binaryPathKey === "claudeBinaryPath"
                      ? claudeBinaryPath
                      : providerSettings.binaryPathKey === "cursorBinaryPath"
                        ? cursorBinaryPath
                        : providerSettings.binaryPathKey === "geminiBinaryPath"
                          ? geminiBinaryPath
                          : providerSettings.binaryPathKey === "grokBinaryPath"
                            ? grokBinaryPath
                            : providerSettings.binaryPathKey === "kiloBinaryPath"
                              ? kiloBinaryPath
                              : providerSettings.binaryPathKey === "openCodeBinaryPath"
                                ? openCodeBinaryPath
                                : providerSettings.binaryPathKey === "piBinaryPath"
                                  ? piBinaryPath
                                  : codexBinaryPath;
                  const providerStatus = providerStatusByProvider.get(providerSettings.provider);
                  const providerUpdateLabel = providerStatus
                    ? providerUpdateStatusLabel(providerStatus)
                    : null;
                  const updateAdvisory = providerStatus?.versionAdvisory;
                  const providerUpdateState = providerStatus?.updateState?.status;
                  const isProviderUpdateActive =
                    providerUpdateState === "queued" ||
                    providerUpdateState === "running" ||
                    updatingProviders.has(providerSettings.provider);
                  const canUpdateProvider =
                    updateAdvisory?.status === "behind_latest" &&
                    updateAdvisory.canUpdate &&
                    !isProviderUpdateActive;

                  return (
                    <Collapsible
                      key={providerSettings.provider}
                      open={isOpen}
                      onOpenChange={(open) =>
                        setOpenInstallProviders((existing) => ({
                          ...existing,
                          [providerSettings.provider]: open,
                        }))
                      }
                    >
                      <div className="border-t border-border/70 first:border-t-0">
                        <div className="flex min-h-11 items-center gap-2 px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() =>
                              setOpenInstallProviders((existing) => ({
                                ...existing,
                                [providerSettings.provider]: !existing[providerSettings.provider],
                              }))
                            }
                          >
                            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                              {providerSettings.title}
                            </span>
                            {isDirty ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {messages.settings.providers.tools.customBadge}
                              </span>
                            ) : null}
                            {providerUpdateLabel ? (
                              <span
                                className={cn(
                                  "shrink-0 text-[11px]",
                                  updateAdvisory?.status === "behind_latest"
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {providerUpdateLabel}
                              </span>
                            ) : null}
                            <ChevronDownIcon
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          </button>
                          {updateAdvisory?.status === "behind_latest" &&
                          updateAdvisory.canUpdate ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={!canUpdateProvider}
                              title={
                                updateAdvisory.updateCommand
                                  ? messages.settings.providers.updates.runCommandTitle(
                                      updateAdvisory.updateCommand,
                                    )
                                  : messages.settings.providers.updates.versionAdvisoryNoCommand
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void runProviderUpdate(providerSettings.provider);
                              }}
                            >
                              {isProviderUpdateActive ? (
                                <Loader2Icon className="size-3.5 animate-spin" />
                              ) : (
                                <DownloadIcon className="size-3.5" />
                              )}
                              {isProviderUpdateActive
                                ? messages.settings.providers.updates.updatingButton
                                : messages.settings.providers.updates.updateButton}
                            </Button>
                          ) : null}
                        </div>

                        <CollapsibleContent>
                          <div className="border-t border-border/70 bg-muted/20 px-3 py-3">
                            <div className="space-y-3">
                              <ProviderDocsLinks
                                docs={providerSettings.docs}
                                label={messages.settings.providers.docs.label}
                              />
                              {updateAdvisory?.status === "behind_latest" ? (
                                <div className="text-xs text-muted-foreground">
                                  {updateAdvisory.canUpdate && updateAdvisory.updateCommand ? (
                                    <>
                                      <span>
                                        {messages.settings.providers.updates.commandLabel}
                                      </span>
                                      <code className="font-mono">
                                        {updateAdvisory.updateCommand}
                                      </code>
                                    </>
                                  ) : (
                                    messages.settings.providers.updates.versionAdvisoryNoCommand
                                  )}
                                </div>
                              ) : null}

                              <label
                                htmlFor={`provider-install-${providerSettings.binaryPathKey}`}
                                className="block"
                              >
                                <span className="block text-xs font-medium text-foreground">
                                  {messages.settings.providers.tools.binaryPathLabel(
                                    providerSettings.title,
                                  )}
                                </span>
                                <Input
                                  id={`provider-install-${providerSettings.binaryPathKey}`}
                                  className="mt-1"
                                  value={binaryPathValue}
                                  onChange={(event) =>
                                    updateSettings(
                                      providerSettings.binaryPathKey === "claudeBinaryPath"
                                        ? { claudeBinaryPath: event.target.value }
                                        : providerSettings.binaryPathKey === "cursorBinaryPath"
                                          ? { cursorBinaryPath: event.target.value }
                                          : providerSettings.binaryPathKey === "geminiBinaryPath"
                                            ? { geminiBinaryPath: event.target.value }
                                            : providerSettings.binaryPathKey === "grokBinaryPath"
                                              ? { grokBinaryPath: event.target.value }
                                              : providerSettings.binaryPathKey === "kiloBinaryPath"
                                                ? { kiloBinaryPath: event.target.value }
                                                : providerSettings.binaryPathKey ===
                                                    "openCodeBinaryPath"
                                                  ? { openCodeBinaryPath: event.target.value }
                                                  : providerSettings.binaryPathKey ===
                                                      "piBinaryPath"
                                                    ? { piBinaryPath: event.target.value }
                                                    : { codexBinaryPath: event.target.value },
                                    )
                                  }
                                  placeholder={providerSettings.binaryPlaceholder}
                                  spellCheck={false}
                                />
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {providerSettings.binaryDescription
                                    .split("`")
                                    .map((segment, index, segments) =>
                                      index === segments.length - 1 ? (
                                        <span key={index}>{segment}</span>
                                      ) : (
                                        <span key={index}>
                                          {segment}
                                          <code>{providerSettings.binaryCommand}</code>
                                        </span>
                                      ),
                                    )}
                                </span>
                              </label>

                              {providerSettings.homePathKey ? (
                                <label
                                  htmlFor={`provider-install-${providerSettings.homePathKey}`}
                                  className="block"
                                >
                                  <span className="block text-xs font-medium text-foreground">
                                    {messages.settings.providers.tools.homePathLabel}
                                  </span>
                                  <Input
                                    id={`provider-install-${providerSettings.homePathKey}`}
                                    className="mt-1"
                                    value={codexHomePath}
                                    onChange={(event) =>
                                      updateSettings({
                                        codexHomePath: event.target.value,
                                      })
                                    }
                                    placeholder={providerSettings.homePlaceholder}
                                    spellCheck={false}
                                  />
                                  {providerSettings.homeDescription ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {providerSettings.homeDescription}
                                    </span>
                                  ) : null}
                                </label>
                              ) : null}

                              {providerSettings.agentDirKey ? (
                                <label
                                  htmlFor={`provider-install-${providerSettings.agentDirKey}`}
                                  className="block"
                                >
                                  <span className="block text-xs font-medium text-foreground">
                                    {messages.settings.providers.tools.agentDirLabel}
                                  </span>
                                  <Input
                                    id={`provider-install-${providerSettings.agentDirKey}`}
                                    className="mt-1"
                                    value={piAgentDir}
                                    onChange={(event) =>
                                      updateSettings({
                                        piAgentDir: event.target.value,
                                      })
                                    }
                                    placeholder={providerSettings.agentDirPlaceholder}
                                    spellCheck={false}
                                  />
                                  {providerSettings.agentDirDescription ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {providerSettings.agentDirDescription}
                                    </span>
                                  ) : null}
                                </label>
                              ) : null}

                              {providerSettings.apiEndpointKey ? (
                                <label
                                  htmlFor={`provider-install-${providerSettings.apiEndpointKey}`}
                                  className="block"
                                >
                                  <span className="block text-xs font-medium text-foreground">
                                    {messages.settings.providers.tools.apiEndpointLabel}
                                  </span>
                                  <Input
                                    id={`provider-install-${providerSettings.apiEndpointKey}`}
                                    className="mt-1"
                                    value={cursorApiEndpoint}
                                    onChange={(event) =>
                                      updateSettings({
                                        cursorApiEndpoint: event.target.value,
                                      })
                                    }
                                    placeholder={providerSettings.apiEndpointPlaceholder}
                                    spellCheck={false}
                                  />
                                  {providerSettings.apiEndpointDescription ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {providerSettings.apiEndpointDescription}
                                    </span>
                                  ) : null}
                                </label>
                              ) : null}

                              {providerSettings.serverUrlKey ? (
                                <label
                                  htmlFor={`provider-install-${providerSettings.serverUrlKey}`}
                                  className="block"
                                >
                                  <span className="block text-xs font-medium text-foreground">
                                    {messages.settings.providers.tools.serverUrlLabel(
                                      providerSettings.title,
                                    )}
                                  </span>
                                  <Input
                                    id={`provider-install-${providerSettings.serverUrlKey}`}
                                    className="mt-1"
                                    value={
                                      providerSettings.serverUrlKey === "kiloServerUrl"
                                        ? kiloServerUrl
                                        : openCodeServerUrl
                                    }
                                    onChange={(event) =>
                                      updateSettings(
                                        providerSettings.serverUrlKey === "kiloServerUrl"
                                          ? { kiloServerUrl: event.target.value }
                                          : { openCodeServerUrl: event.target.value },
                                      )
                                    }
                                    placeholder={providerSettings.serverUrlPlaceholder}
                                    spellCheck={false}
                                  />
                                  {providerSettings.serverUrlDescription ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {providerSettings.serverUrlDescription}
                                    </span>
                                  ) : null}
                                </label>
                              ) : null}

                              {providerSettings.serverPasswordKey ? (
                                <label
                                  htmlFor={`provider-install-${providerSettings.serverPasswordKey}`}
                                  className="block"
                                >
                                  <span className="block text-xs font-medium text-foreground">
                                    {messages.settings.providers.tools.serverPasswordLabel(
                                      providerSettings.title,
                                    )}
                                  </span>
                                  <Input
                                    id={`provider-install-${providerSettings.serverPasswordKey}`}
                                    className="mt-1"
                                    value={
                                      providerSettings.serverPasswordKey === "kiloServerPassword"
                                        ? kiloServerPassword
                                        : openCodeServerPassword
                                    }
                                    onChange={(event) =>
                                      updateSettings(
                                        providerSettings.serverPasswordKey === "kiloServerPassword"
                                          ? { kiloServerPassword: event.target.value }
                                          : { openCodeServerPassword: event.target.value },
                                      )
                                    }
                                    placeholder={providerSettings.serverPasswordPlaceholder}
                                    spellCheck={false}
                                  />
                                  {providerSettings.serverPasswordDescription ? (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {providerSettings.serverPasswordDescription}
                                    </span>
                                  ) : null}
                                </label>
                              ) : null}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );

  const renderAdvancedPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.advanced.developerSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.advanced.keybindings.title}
            description={messages.settings.advanced.keybindings.description}
            status={
              <>
                <span className="block break-all font-mono text-[11px] text-foreground">
                  {keybindingsConfigPath ?? messages.settings.advanced.keybindings.pathPlaceholder}
                </span>
                {openKeybindingsError ? (
                  <span className="mt-1 block text-destructive">{openKeybindingsError}</span>
                ) : (
                  <span className="mt-1 block">
                    {messages.settings.advanced.keybindings.openEditorHint}
                  </span>
                )}
              </>
            }
            control={
              <Button
                size="xs"
                variant="outline"
                disabled={!keybindingsConfigPath || isOpeningKeybindings}
                onClick={openKeybindingsFile}
              >
                {isOpeningKeybindings
                  ? messages.settings.advanced.keybindings.openingButton
                  : messages.settings.advanced.keybindings.openButton}
              </Button>
            }
          />

          <SettingsRow
            title={messages.settings.advanced.recovery.title}
            description={messages.settings.advanced.recovery.description}
            status={
              shouldOfferRecoveryTools
                ? messages.settings.advanced.recovery.offerReason
                : messages.settings.advanced.recovery.hiddenReason
            }
            control={
              <Button
                size="xs"
                variant="outline"
                disabled={!shouldOfferRecoveryTools || isRepairingLocalState}
                onClick={() => void repairLocalState()}
              >
                {isRepairingLocalState
                  ? messages.settings.advanced.recovery.repairingButton
                  : messages.settings.advanced.recovery.repairButton}
              </Button>
            }
          >
            {shouldOfferRecoveryTools ? (
              <div className="mt-3 border-t border-border/70 pt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setShowRecoveryTools((current) => !current)}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {messages.settings.advanced.recovery.whatThisDoesLabel}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      showRecoveryTools && "rotate-180",
                    )}
                  />
                </button>
                {showRecoveryTools ? (
                  <div className="mt-3 rounded-xl border border-border/70 px-3 py-3 text-xs text-muted-foreground">
                    {messages.settings.advanced.recovery.whatThisDoesBody}
                  </div>
                ) : null}
              </div>
            ) : null}
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.advanced.aboutSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.advanced.version.title}
            description={messages.settings.advanced.version.description}
            control={
              <code className="text-xs font-medium text-muted-foreground">{APP_VERSION}</code>
            }
          />
          <SettingsRow
            title={messages.settings.advanced.version.releaseHistory}
            description={messages.settings.advanced.version.releaseHistoryDescription}
            control={
              <Button size="sm" variant="outline" onClick={() => setReleaseHistoryOpen(true)}>
                {messages.settings.advanced.version.viewReleaseHistory}
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderActivePanel = () => {
    switch (activeSection) {
      case "general":
        return renderGeneralPanel();
      case "appearance":
        return renderAppearancePanel();
      case "notifications":
        return renderNotificationsPanel();
      case "behavior":
        return renderBehaviorPanel();
      case "worktrees":
        return renderWorktreesPanel();
      case "archived":
        return renderArchivedPanel();
      case "models":
        return renderModelsPanel();
      case "providers":
        return renderProvidersPanel();
      case "advanced":
        return renderAdvancedPanel();
      default:
        return null;
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        {isElectron ? (
          <div
            className={cn(
              "drag-region flex h-[52px] shrink-0 items-center border-b border-border/70 px-5",
              desktopTopBarTrafficLightGutterClassName,
            )}
          >
            <SidebarHeaderNavigationControls />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              {messages.settings.title}
            </span>
            <div className="ms-auto flex items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={changedSettingLabels.length === 0}
                onClick={() => void restoreDefaults()}
              >
                <RotateCcwIcon className="size-3.5" />
                {messages.settings.restoreDefaults}
              </Button>
            </div>
          </div>
        ) : (
          <header className="border-b border-border/70 px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarHeaderTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-foreground">{messages.settings.title}</span>
              <div className="ms-auto flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={changedSettingLabels.length === 0}
                  onClick={() => void restoreDefaults()}
                >
                  <RotateCcwIcon className="size-3.5" />
                  {messages.settings.restoreDefaults}
                </Button>
              </div>
            </div>
          </header>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-6">
            {/* Section header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">{activeSectionItem.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{activeSectionItem.description}</p>
            </div>

            {renderActivePanel()}
          </div>
        </div>
      </div>
      {/* Mounted at the route level (outside the scrollable panel) so the
          dialog portal can overlay the entire settings view without being
          clipped by the content wrapper's overflow. */}
      <ReleaseHistoryDialog
        open={releaseHistoryOpen}
        onOpenChange={setReleaseHistoryOpen}
        defaultExpandedVersion={APP_VERSION}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/settings")({
  component: SettingsRouteView,
});
