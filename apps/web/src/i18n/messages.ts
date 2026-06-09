// FILE: messages.ts
// Purpose: Centralize user-facing UI strings so the React tree can swap them by
//          language without touching call sites. Keys are grouped by surface so a
//          future move to a translation tool can re-export them as flat
//          namespaced ids. Templates use ${...} for interpolation.
// Layer: Shared runtime utility (web)
// Exports: Messages type, MESSAGES dictionary, NATIVE_LANGUAGE_LABELS

import type { Language } from "./language";

export type Messages = {
  common: {
    cancel: string;
    save: string;
    delete: string;
    confirm: string;
    retry: string;
    close: string;
    open: string;
    ok: string;
    done: string;
    loading: string;
    yes: string;
    no: string;
    errorOccurred: string;
    unexpectedError: string;
  };
  appShell: {
    connecting: string;
  };
  appNavigation: {
    back: string;
    backMac: string;
    backWin: string;
    forward: string;
    forwardMac: string;
    forwardWin: string;
  };
  errorFallback: {
    title: string;
    retry: string;
    reload: string;
    showDetails: string;
    hideDetails: string;
    unexpected: string;
    noDetails: string;
  };
  splash: {
    retry: string;
  };
  sidebar: {
    brandLabel: string;
    newChat: string;
    newChatTooltip: string;
    newDisposableTooltip: string;
    search: string;
    threads: string;
    chats: string;
    workspace: string;
    recent: string;
    settings: string;
    addProject: string;
    noProjectsYet: string;
    noProjectsYetDescription: string;
    chooseProjectFolder: string;
    openingFolderPicker: string;
    addingProject: string;
    loadingProjects: string;
    toggleSidebar: string;
    codeLabel: string;
    disposableChat: string;
    pendingApproval: string;
    commandsHeading: string;
    skillsLabel: string;
    pluginsLabel: string;
    automationsLabel: string;
    automationsComingSoon: string;
    confirm: string;
    confirmArchive: string;
    archive: string;
    openNewChatHome: string;
    settingsAria: string;
    showMore: string;
    showLess: string;
    projectActionAdd: string;
    projectActionRename: string;
    projectActionRemove: string;
    projectActionCopyPath: string;
    projectActionArchive: string;
    projectActionDeleteThreads: string;
    intelOnArmTitle: string;
    sortProjects: string;
    sortThreads: string;
    sortChats: string;
    sortRecentlyActive: string;
    sortRecentlyAdded: string;
    sortCreatedAt: string;
    sortManual: string;
    sortNewestFirst: string;
    projectSortMenuHeader: string;
    threadSortMenuHeader: string;
    pinThread: string;
    unpinThread: string;
    addProjectError: string;
    openFolderError: string;
    linkUnavailable: string;
    openPRError: string;
    openFinderError: string;
    openTerminalError: string;
    removeProjectError: (name: string) => string;
    removeProjectSuccess: (name: string) => string;
    thread: {
      pinError: (action: "pin" | "unpin") => string;
      renameError: string;
      renameEmpty: string;
      handoffError: string;
      archiveRunningTitle: string;
      archiveRunningDescription: string;
      archiveEmpty: (projectName: string) => string;
      archiveFailedTitle: string;
      archiveSuccessOne: string;
      archiveSuccessMany: (count: number) => string;
      archiveError: string;
      deleteEmpty: string;
      deleteWorktreeWarning: string;
      deleteSuccessOne: string;
      deleteSuccessMany: (count: number) => string;
      deleteError: string;
      pathUnavailable: string;
      pathCopyUnavailable: string;
      pathOpenUnavailable: string;
      copyThreadId: string;
      copyThreadIdFailed: string;
      copyPath: string;
      copyPathFailed: string;
    };
    update: {
      availableTitle: string;
      availableDescription: (version: string) => string;
      upToDateTitle: string;
      upToDateDescription: (version: string) => string;
      checkFailedTitle: string;
      checkFailedDescription: string;
      downloadedTitle: string;
      downloadedDescription: string;
      downloadFailedTitle: string;
      downloadFailedDescription: string;
      startFailedTitle: string;
      startFailedDescription: string;
      installFailedTitle: string;
      installFailedDescription: string;
      unexpectedError: string;
    };
    command: {
      openHome: {
        title: string;
        description: string;
      };
      newChat: {
        title: string;
        description: string;
      };
      addProject: {
        title: string;
        description: string;
      };
      attachSession: {
        title: string;
        description: string;
      };
      openSettings: {
        title: string;
        description: string;
      };
    };
    deleteWorkspace: string;
  };
  searchPalette: {
    importHeading: string;
    suggestedGroup: string;
    projectsGroup: string;
    configureGroup: string;
    inputHint: string;
    enterHint: string;
  };
  chat: {
    loadingModels: string;
    newChat: string;
    handOff: string;
    run: string;
    stop: string;
    share: string;
    compact: string;
    plan: string;
    planModeHint: string;
    noActiveThread: string;
    selectOrCreate: string;
    clearUnavailable: string;
    clearUnavailableDescription: string;
    implementationFailed: string;
    handoffError: string;
    refreshProviderStatus: string;
    deletedAction: (name: string) => string;
    deleteActionFailed: string;
    updateAccessModeFailed: string;
    tooManyAttachments: (max: number) => string;
    browserAttachFailed: string;
    imagePreview: string;
    imagePreviewClose: string;
    imagePreviewPrev: string;
    imagePreviewNext: string;
    attachImagesAfterPlan: string;
    voice: {
      authRequiredTitle: string;
      authRequiredDescription: string;
      authSessionTitle: string;
      authSessionDescription: string;
      planUnansweredTitle: string;
      planUnansweredDescription: string;
      startFailedTitle: string;
      startFailedDescription: string;
      transcriptionUnavailableTitle: string;
      transcriptionUnavailableDescription: string;
      noAudioTitle: string;
      noAudioDescription: string;
      transcribeFailedTitle: string;
      transcribeFailedDescription: string;
    };
    continueInNewWorktree: string;
    reviewLocalChanges: string;
    reviewBranchDiff: string;
    composerPlaceholder: (providerName: string) => string;
    stopGenerationAria: string;
    stopGenerationTitle: string;
    implementationActionsAria: string;
    imagePlaceholder: (count: number) => string;
    renameError: string;
    renameEmpty: string;
    timeline: {
      editMessage: string;
      editAndResend: string;
      revertLabel: string;
      revertTooltip: string;
      undoUnavailable: string;
      emptyResponse: string;
      response: string;
      responseWithSummary: (summary: string) => string;
      showLess: string;
      showMore: string;
      showMoreCount: (count: number) => string;
      moreToolCalls: (count: number) => string;
      edited: string;
      oneFileChanged: string;
      filesChanged: (count: number) => string;
      collapseFiles: string;
      expandFiles: string;
      undo: string;
      workingFor: (duration: string) => string;
      workingForPrefix: string;
      working: string;
      emptyChat: string;
    };
    copy: {
      buttonAria: string;
      success: string;
      failed: string;
    };
  };
  chatEmptyState: {
    title: string;
    subtitle: string;
    whatShouldWeWorkOn: string;
    whatShouldWeDoIn: string;
    thisFolder: string;
  };
  chatHeader: {
    closeSidechat: string;
  };
  chatRoute: {
    loadingDiff: string;
    splitPaneEmptyTitle: string;
    splitPaneEmptyProject: string;
  };
  composer: {
    placeholder: string;
    placeholderApproval: string;
    placeholderProgress: string;
    placeholderPlan: string;
    placeholderFollowUp: string;
    placeholderDisconnected: string;
    moreAria: string;
    extrasAria: string;
    modeLabel: string;
    buildLabel: string;
    planLabel: string;
    localLabel: string;
    codexLabel: string;
    removeImage: string;
    pendingApproval: string;
    pendingUserInput: string;
    cancelTurn: string;
    decline: string;
    alwaysAllow: string;
    approveOnce: string;
    terminalContextExpired: string;
    voiceTranscribing: string;
    voiceStop: string;
    voiceRecord: string;
    voiceHoldToRecord: string;
    statusDialog: {
      local: string;
      worktree: string;
      newWorktreePending: string;
    };
    slashCommands: {
      local: string;
      worktree: string;
      plan: string;
      newChat: string;
    };
    contextWindowLabel: string;
    contextWindowPercent: (percent: number) => string;
    sendMessage: string;
    sendingBusy: string;
    sendingConnecting: string;
    sendingTranscribing: string;
    sendingPreparingWorktree: string;
    steer: string;
    deleteQueuedFollowUp: string;
    queuedFollowUpActions: string;
    queuedFollowUp: string;
  };
  skills: {
    title: string;
    subtitle: string;
    newSkill: string;
    browseSkillSh: string;
    searchPlaceholder: string;
    localHeading: string;
    localCount: string;
    localEmptyTitle: string;
    localEmptyDescription: string;
    localEmptySearchTitle: string;
    localEmptySearchDescription: string;
    providerHeading: string;
    providerHint: string;
    installedHeading: string;
    emptyTitle: string;
    emptyDescription: string;
    emptySearchTitle: string;
    emptySearchDescription: string;
    unavailableTitle: string;
    unavailableDescription: string;
    needsWorkspace: string;
  };
  automations: {
    subtitle: string;
    viewTemplates: string;
    createFromChat: string;
    emptyTitle: string;
    emptyDescription: string;
    templatesHeading: string;
    templatesHint: string;
  };
  settings: {
    title: string;
    restoreDefaults: string;
    backToApp: string;
    nav: {
      general: { label: string; description: string };
      appearance: { label: string; description: string };
      notifications: { label: string; description: string };
      behavior: { label: string; description: string };
      worktrees: { label: string; description: string };
      archived: { label: string; description: string };
      models: { label: string; description: string };
      providers: { label: string; description: string };
      advanced: { label: string; description: string };
    };
    groups: {
      app: string;
      peakcode: string;
    };
    general: {
      heading: string;
      description: string;
      coreDefaults: string;
      sidebarOrganization: string;
      language: {
        title: string;
        description: string;
        english: string;
        chinese: string;
      };
      defaultProvider: {
        title: string;
        description: string;
        resetLabel: string;
      };
      newThreads: {
        title: string;
        description: string;
        resetLabel: string;
        local: string;
        worktree: string;
      };
      sidebarPosition: {
        title: string;
        description: string;
        left: string;
        right: string;
        resetLabel: string;
      };
      projectOrder: {
        title: string;
        description: string;
        recentlyActive: string;
        recentlyAdded: string;
        manual: string;
        resetLabel: string;
      };
      threadOrder: {
        title: string;
        description: string;
        recentlyActive: string;
        newestFirst: string;
        resetLabel: string;
      };
    };
    appearance: {
      heading: string;
      description: string;
      themeAndTypographySection: string;
      timeAndReadingSection: string;
      theme: {
        title: string;
        description: string;
        system: string;
        light: string;
        dark: string;
        systemDescription: string;
        lightDescription: string;
        darkDescription: string;
      };
      lightThemeCard: {
        title: string;
        contextActive: string;
        contextInactive: string;
        contextSystemActive: string;
        contextSystemInactive: string;
      };
      darkThemeCard: {
        title: string;
        contextActive: string;
        contextInactive: string;
        contextSystemActive: string;
        contextSystemInactive: string;
      };
      themePackReset: string;
      themePackCopy: string;
      themePackImport: string;
      themePackShareStringAria: string;
      themePackCodeThemeAria: (label: string) => string;
      themePackTranslucentAria: (label: string) => string;
      themePackResetAria: (label: string) => string;
      themePackHexAria: (label: string) => string;
      accent: string;
      background: string;
      foreground: string;
      uiFontLabel: string;
      codeFontLabel: string;
      translucentSidebar: string;
      contrast: string;
      timestamp: {
        title: string;
        description: string;
        systemDefault: string;
        twelveHour: string;
        twentyFourHour: string;
        ariaLabel: string;
      };
      typography: {
        title: string;
        description: string;
        uiFont: string;
        codeFont: string;
        baseFontSize: string;
        fontSmoothing: string;
        uiFontDescription: string;
        codeFontDescription: string;
        baseFontSizeDescription: string;
        fontSmoothingDescription: string;
        uiFontAria: string;
        codeFontAria: string;
        baseFontSizeAria: string;
        fontSmoothingAria: string;
        unitPx: string;
      };
    };
    notifications: {
      heading: string;
      description: string;
      activityAlertsSection: string;
      unavailableTitle: string;
      supportBrowserBlocked: string;
      supportBrowserPrompt: string;
      supportBrowserGranted: string;
      supportDesktopUnsupported: string;
      supportDesktopGranted: string;
      supportDesktopDenied: string;
      testTitle: string;
      testBody: string;
      testSuccessTitle: string;
      testUnavailableTitle: string;
      testSuccessDescriptionDesktop: string;
      testUnavailableDescriptionDesktop: string;
      testSuccessDescriptionBrowser: string;
      testButton: string;
      activityToasts: {
        title: string;
        description: string;
        ariaLabel: string;
      };
      desktopNotifications: {
        title: string;
        description: string;
        ariaLabel: string;
      };
    };
    behavior: {
      heading: string;
      description: string;
      runtimeSection: string;
      safetySection: string;
      assistantOutput: string;
      assistantOutputDescription: string;
      assistantOutputAria: string;
      diffLineWrapping: string;
      diffLineWrappingDescription: string;
      diffLineWrappingAria: string;
      deleteConfirmation: string;
      deleteConfirmationDescription: string;
      deleteConfirmationAria: string;
      archiveConfirmation: string;
      archiveConfirmationDescription: string;
      archiveConfirmationAria: string;
      terminalCloseConfirmation: string;
      terminalCloseConfirmationDescription: string;
      terminalCloseConfirmationAria: string;
    };
    worktrees: {
      heading: string;
      description: string;
      managedSection: string;
      loading: string;
      loadFailedFallback: string;
      emptyState: string;
      worktreeLabel: string;
      conversationsLabel: string;
      noConversations: string;
      deleteButton: string;
      deleteWarning: string;
      verifyTitle: string;
      verifyDescription: string;
      deleteConfirmWithLinks: (name: string, count: number) => string;
      deleteConfirm: (name: string) => string;
      deleteAnyway: string;
      deleteLinkedActive: (active: number) => string;
      deleteLinkedArchived: (archived: number) => string;
      deleteArchivedWillDeleteFirst: string;
      deleteLinkedWarning: string;
      deleteRemovesFromDisk: string;
      deletedTitle: string;
      deletedDescriptionWithArchived: (name: string, count: number) => string;
      deletedDescription: (name: string) => string;
      deleteErrorTitle: string;
      deleteErrorFallback: string;
    };
    archived: {
      heading: string;
      description: string;
      emptySection: string;
      emptyTitle: string;
      emptyDescription: string;
      unknownProject: string;
      archivedAt: (when: string) => string;
      restoreButton: string;
      deleteButton: string;
      restoreTitle: string;
      restoreDescription: string;
      restoreErrorTitle: string;
      restoreErrorFallback: string;
      deleteConfirm: (title: string) => string;
      deleteTitle: string;
      deleteDescription: string;
      deleteErrorTitle: string;
      deleteErrorFallback: string;
      contextMenuRestore: string;
      contextMenuDelete: string;
    };
    models: {
      heading: string;
      description: string;
      generationSection: string;
      customSection: string;
      gitWritingModel: string;
      gitWritingModelDescription: string;
      gitWritingModelAria: string;
      customModelEmpty: string;
      customModelBuiltIn: string;
      customModelTooLong: (max: number) => string;
      customModelDuplicate: string;
      customModelResetLabel: string;
      customAddPlaceholder: string;
      customAddButton: string;
      customAddAria: string;
      customProviderAria: string;
      customRemoveAria: (slug: string) => string;
      customShowLess: string;
      customShowMore: (count: number) => string;
      savedModelSlugs: string;
      savedModelSlugsDescription: string;
    };
    providers: {
      heading: string;
      description: string;
      updatesSection: string;
      pickerSection: string;
      toolsSection: string;
      installTitle: (providerName: string) => string;
      visibility: {
        title: string;
        description: string;
        statusAllVisible: string;
        statusCustomOrder: string;
        statusHidden: (count: number) => string;
        statusHiddenOne: string;
        showAria: (name: string) => string;
        reorderAria: (name: string) => string;
        resetLabel: string;
      };
      updates: {
        title: string;
        description: string;
        statusNoUpdates: string;
        statusAvailableOne: string;
        statusAvailableMany: (count: number) => string;
        statusAvailablePlural: (count: number) => string;
        manualUpdate: string;
        updateButton: string;
        updatingButton: string;
        commandLabel: string;
        runCommandTitle: (command: string) => string;
        versionAdvisoryNoCommand: string;
      };
      tools: {
        title: string;
        description: string;
        statusNoUpdates: string;
        statusAvailableOne: string;
        statusAvailableMany: (count: number) => string;
        statusAvailablePlural: (count: number) => string;
        customBadge: string;
        resetLabel: string;
        binaryPathLabel: (providerName: string) => string;
        homePathLabel: string;
        homePathDescription: string;
        agentDirLabel: string;
        agentDirDescription: string;
        apiEndpointLabel: string;
        apiEndpointDescription: string;
        serverUrlLabel: (providerName: string) => string;
        serverUrlDescription: (providerName: string) => string;
        serverPasswordLabel: (providerName: string) => string;
        serverPasswordDescription: (providerName: string) => string;
        binaryPathDescription: (command: string) => string;
        binaryPathPlaceholder: (providerName: string) => string;
        homePathPlaceholder: string;
        agentDirPlaceholder: string;
        apiEndpointPlaceholder: string;
        serverUrlPlaceholder: string;
        serverPasswordPlaceholder: (providerName: string) => string;
      };
      docs: {
        install: string;
        update: string;
        config: string;
        headless: string;
        label: string;
      };
      update: {
        queued: string;
        updating: string;
        updated: string;
        failed: string;
        stillOutdated: string;
        versionDelta: (current: string, latest: string) => string;
        latest: (version: string) => string;
        current: (version: string) => string;
        errorFallback: string;
      };
      cliDocs: string;
    };
    advanced: {
      heading: string;
      description: string;
      developerSection: string;
      aboutSection: string;
      keybindings: {
        title: string;
        description: string;
        pathPlaceholder: string;
        openEditorHint: string;
        openButton: string;
        openingButton: string;
        noEditor: string;
        openError: string;
        noEditorToast: string;
        openErrorFallback: string;
        openErrorUnknown: string;
      };
      recovery: {
        title: string;
        description: string;
        offerReason: string;
        hiddenReason: string;
        whatThisDoesLabel: string;
        whatThisDoesBody: string;
        repairButton: string;
        repairingButton: string;
        confirmTitle: string;
        confirmDescription: string;
        confirmSpacer: string;
        successTitle: string;
        successDescription: string;
        errorTitle: string;
        errorFallback: string;
      };
      version: {
        title: string;
        description: string;
        releaseHistory: string;
        releaseHistoryDescription: string;
        viewReleaseHistory: string;
      };
    };
    themePack: {
      importTitle: string;
      importDescription: string;
      apply: string;
      reset: string;
    };
    changedSettingLabel: {
      theme: string;
      darkThemePack: string;
      lightThemePack: string;
      defaultProvider: string;
      newThreadMode: string;
      sidebarPosition: string;
      projectSortOrder: string;
      threadSortOrder: string;
      uiFont: string;
      codeFont: string;
      baseFontSize: string;
      fontSmoothing: string;
      timeFormat: string;
      activityToasts: string;
      desktopNotifications: string;
      assistantOutput: string;
      diffLineWrapping: string;
      deleteConfirmation: string;
      archiveConfirmation: string;
      terminalCloseConfirmation: string;
      gitWritingModel: string;
      customModels: string;
      providerInstalls: string;
      providerVisibility: string;
      providerOrder: string;
      language: string;
    };
    resetAria: (label: string) => string;
    resetTooltip: string;
    restoreDefaultsConfirm: (labels: string) => string;
  };
  dialog: {
    confirm: {
      deleteThread: (title: string) => string;
      deleteThreadPermanent: string;
      archiveThread: string;
      removeProject: (name: string) => string;
      removeProjectAndThreads: (name: string, count: number) => string;
      cancel: string;
      continue: string;
      discardDraft: string;
    };
    rename: {
      title: string;
      description: string;
      submit: string;
      cancel: string;
    };
    pullRequest: {
      title: string;
      description: string;
      placeholder: string;
      open: string;
      cancel: string;
    };
    worktreeHandoff: {
      title: string;
      description: string;
      submit: string;
      cancel: string;
    };
  };
  whatsNew: {
    title: string;
    popoutTitle: string;
    open: string;
    dismiss: string;
    gotIt: string;
    releaseNotes: string;
    readMore: string;
    showLess: string;
    highlights: string;
    allReleases: string;
    versionLabel: (version: string) => string;
  };
  taskCompletion: {
    markAllRead: string;
    viewChat: string;
  };
  workspace: {
    fallbackTitle: string;
    renameHint: string;
    terminalTab: string;
    settingsAria: string;
    loading: string;
    emptyTitle: string;
    openInEditor: string;
  };
  terminal: {
    findPlaceholder: string;
    matchCase: string;
    tabTerminal: string;
    tabChat: string;
  };
  gitActions: {
    groupAria: string;
    optionsAria: string;
    prTitlePlaceholder: string;
    linkUnavailable: string;
    noOpenPR: string;
    openPRErrorTitle: string;
    syncingTitle: string;
    syncSuccess: string;
    alreadyUpToDate: string;
    syncFailed: string;
    createPRUnavailable: string;
    noChanges: string;
    running: string;
    waiting: string;
    keeping: (name: string) => string;
    branchConfirmed: string;
    creatingBranch: string;
    switchedTo: (name: string) => string;
    createdCheckedOut: string;
    createFailed: string;
    editorUnavailable: string;
    openFileFailed: string;
  };
  browser: {
    screenshotCopied: string;
    urlPlaceholder: string;
    actionsAria: string;
  };
  branchToolbar: {
    newWorktree: string;
    handoffNewWorktree: string;
    handoffLocal: string;
    rateLimitsRemaining: string;
    checkoutPR: string;
    searchPlaceholder: string;
    createTitle: string;
    discardStash: string;
    loadingStash: string;
    fieldBranch: string;
    fieldWorktree: string;
    fieldStash: string;
    fieldName: string;
  };
  projectScripts: {
    groupAria: string;
    actionAria: string;
    editAria: (name: string) => string;
    nameLabel: string;
    chooseIcon: string;
    testPlaceholder: string;
    keybindingLabel: string;
    pressShortcut: string;
    pressShortcutHint: string;
    commandLabel: string;
    autoRunLabel: string;
    deleteConfirmDescription: string;
    addScript: string;
    delete: string;
  };
  themeEditor: {
    copiedTitle: string;
    copiedDescription: (variant: string) => string;
    copyFailedTitle: string;
    copyFailedDescription: string;
    codeAria: (label: string) => string;
    systemDefault: string;
    translucentSidebar: string;
    translucentSidebarAria: (label: string) => string;
    resetAria: (label: string) => string;
    resetTitle: string;
    hexValueAria: (label: string) => string;
    importedTitle: string;
    importedDescription: (variant: string) => string;
    shareStringAria: string;
    background: string;
    text: string;
    accent: string;
    border: string;
    status: string;
    code: string;
    light: string;
    dark: string;
    reset: string;
    shareString: string;
    apply: string;
    import: string;
    foreground: string;
    uiFont: string;
    codeFont: string;
    codeFontPlaceholder: string;
    contrast: string;
    contextActiveSystem: (variant: string) => string;
    contextActiveLocked: string;
    contextInactiveSystem: (variant: string) => string;
    contextInactiveLocked: (mode: string) => string;
    importDialogTitle: (variant: string) => string;
    importDialogDescription: (variant: string) => string;
    importDialogCancel: string;
    importDialogSubmit: string;
    importError: string;
    importPlaceholder: string;
    copy: string;
  };
  themePack: {
    importTitle: string;
    importDescription: string;
    apply: string;
    reset: string;
  };
  restoreDefaults: {
    title: string;
    description: (labels: string) => string;
    button: string;
  };
  keybindings: {
    searchPlaceholder: string;
    title: string;
  };
  releaseHistory: {
    title: string;
    open: string;
  };
  rateLimits: {
    reachedTitle: string;
    approachingTitle: string;
    planLimitTitle: string;
    noData: string;
  };
  providerUsage: {
    title: (providerName: string) => string;
    fallbackTitle: string;
    window: string;
    resetsAt: string;
    noData: string;
  };
  debug: {
    actionFailed: string;
    fallback: string;
  };
  notification: {
    retention: {
      title: string;
      preparing: string;
      progress: (purged: number, total: number) => string;
      progressSimple: (purged: number) => string;
      compactingTitle: string;
      compactingReclaim: string;
      compactingFinishing: string;
      pausedTitle: string;
      pausedDescription: string;
      successTitle: string;
      successDescription: (purged: number) => string;
      successDescriptionEmpty: string;
    };
    providerUpdate: {
      title: (providerName: string) => string;
      titleMany: (count: number) => string;
      description: (providerName: string) => string;
      descriptionMany: (count: number) => string;
      errorFallback: string;
      stillOutdated: string;
      requestFailed: string;
      failedTitleAll: string;
      failedTitleSome: string;
      successTitleOne: (providerName: string) => string;
      successTitleMany: (count: number) => string;
      successDescription: string;
      availableTitleOne: (providerName: string) => string;
      availableTitleMany: (count: number) => string;
      availableDescriptionOne: (providerName: string) => string;
      availableDescriptionMany: (providerName: string, count: number) => string;
      actionReview: string;
      actionUpdateAll: string;
    };
    keybindings: {
      invalidTitle: string;
      openConfigAction: string;
      noEditor: string;
      openFileErrorTitle: string;
      openFileErrorFallback: string;
    };
  };
};

const en: Messages = {
  common: {
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    confirm: "Confirm",
    retry: "Retry",
    close: "Close",
    open: "Open",
    ok: "OK",
    done: "Done",
    loading: "Loading...",
    yes: "Yes",
    no: "No",
    errorOccurred: "An error occurred.",
    unexpectedError: "An unexpected error occurred.",
  },
  appShell: {
    connecting: "Connecting to {name} server...",
  },
  appNavigation: {
    back: "Back",
    backMac: "Back (⌘[)",
    backWin: "Back (Alt+←)",
    forward: "Forward",
    forwardMac: "Forward (⌘])",
    forwardWin: "Forward (Alt+→)",
  },
  errorFallback: {
    title: "Something went wrong.",
    retry: "Try again",
    reload: "Reload app",
    showDetails: "Show error details",
    hideDetails: "Hide error details",
    unexpected: "An unexpected router error occurred.",
    noDetails: "No additional error details are available.",
  },
  splash: {
    retry: "Retry",
  },
  sidebar: {
    brandLabel: "Peak",
    newChat: "New chat",
    newChatTooltip: "New chat",
    newDisposableTooltip: "New disposable chat",
    search: "Search",
    threads: "Threads",
    chats: "Chats",
    workspace: "Workspace",
    recent: "Recent",
    settings: "Settings",
    addProject: "Add project",
    noProjectsYet: "No projects yet",
    noProjectsYetDescription: "Choose a local project folder to start your first thread.",
    chooseProjectFolder: "Choose project folder",
    openingFolderPicker: "Opening...",
    addingProject: "Adding...",
    loadingProjects: "Loading projects",
    toggleSidebar: "Toggle thread sidebar",
    codeLabel: "Code",
    disposableChat: "Disposable chat",
    pendingApproval: "Pending approval",
    commandsHeading: "Commands",
    skillsLabel: "Skills",
    pluginsLabel: "Plugins",
    automationsLabel: "Automations",
    automationsComingSoon: "Coming soon",
    confirm: "Confirm",
    confirmArchive: "Confirm archive",
    archive: "Archive",
    openNewChatHome: "Open new chat home",
    settingsAria: "Settings",
    showMore: "Show more",
    showLess: "Show less",
    projectActionAdd: "Add project",
    projectActionRename: "Rename project",
    projectActionRemove: "Remove project",
    projectActionCopyPath: "Copy path",
    projectActionArchive: "Archive project",
    projectActionDeleteThreads: "Delete all threads",
    intelOnArmTitle: "Intel build on Apple Silicon",
    sortProjects: "Sort projects",
    sortThreads: "Sort threads",
    sortChats: "Sort chats",
    sortRecentlyActive: "Recently active",
    sortRecentlyAdded: "Recently added",
    sortCreatedAt: "Created at",
    sortManual: "Manual",
    sortNewestFirst: "Newest first",
    projectSortMenuHeader: "Sort projects",
    threadSortMenuHeader: "Sort threads",
    pinThread: "Pin thread",
    unpinThread: "Unpin thread",
    addProjectError: "Unable to add project",
    openFolderError: "Unable to open folder picker",
    linkUnavailable: "Link opening is unavailable.",
    openPRError: "Unable to open PR link",
    openFinderError: "Unable to open in Finder",
    openTerminalError: "Unable to open terminal",
    removeProjectError: (name) => `Failed to remove "${name}"`,
    removeProjectSuccess: (name) => `Removed "${name}"`,
    thread: {
      pinError: (action) => (action === "pin" ? "Unable to pin thread" : "Unable to unpin thread"),
      renameError: "Failed to rename thread",
      renameEmpty: "Thread title cannot be empty",
      handoffError: "Could not create handoff thread",
      archiveRunningTitle: "Cannot archive",
      archiveRunningDescription: "Stop the running session before archiving this thread.",
      archiveEmpty: (projectName) => `"${projectName}" has no threads to archive.`,
      archiveFailedTitle: "Cannot archive threads",
      archiveSuccessOne: "Thread archived",
      archiveSuccessMany: (count) => `Archived ${count} threads`,
      archiveError: "Failed to archive threads",
      deleteEmpty: "Nothing to delete",
      deleteWorktreeWarning: "Thread deleted, but worktree removal failed",
      deleteSuccessOne: "Thread deleted",
      deleteSuccessMany: (count) => `Deleted ${count} threads`,
      deleteError: "Failed to delete threads",
      pathUnavailable: "Path unavailable",
      pathCopyUnavailable: "This thread does not have a workspace path to copy.",
      pathOpenUnavailable: "This thread does not have a workspace path to open.",
      copyThreadId: "Thread ID copied",
      copyThreadIdFailed: "Failed to copy thread ID",
      copyPath: "Path copied",
      copyPathFailed: "Failed to copy path",
    },
    update: {
      availableTitle: "Update available",
      availableDescription: (version) => `Peak Code ${version} is available.`,
      upToDateTitle: "You're up to date",
      upToDateDescription: (version) => `Peak Code ${version} is already the newest version.`,
      checkFailedTitle: "Could not check for updates",
      checkFailedDescription: "An unexpected error occurred.",
      downloadedTitle: "Update downloaded",
      downloadedDescription: "Restart the app to install the update.",
      downloadFailedTitle: "Could not download update",
      downloadFailedDescription: "Try again from the menu.",
      startFailedTitle: "Could not start update download",
      startFailedDescription: "The updater could not be started.",
      installFailedTitle: "Could not install update",
      installFailedDescription: "Restart the app manually to finish installing.",
      unexpectedError: "An unexpected error occurred.",
    },
    command: {
      openHome: {
        title: "Open new chat home",
        description: "Open the new chat landing screen.",
      },
      newChat: {
        title: "New chat",
        description: "Start a fresh thread in the current project.",
      },
      addProject: {
        title: "Add project",
        description: "Open a repository or folder in the sidebar.",
      },
      attachSession: {
        title: "Attach session",
        description: "Attach a local thread to an existing provider session.",
      },
      openSettings: {
        title: "Open settings",
        description: "Open app settings.",
      },
    },
    deleteWorkspace: "Delete workspace",
  },
  searchPalette: {
    importHeading: "Import thread from provider",
    suggestedGroup: "Suggested",
    projectsGroup: "Projects",
    configureGroup: "Configure",
    inputHint: "Jump to threads, projects, actions, or appearance.",
    enterHint: "Enter to open",
  },
  chat: {
    loadingModels: "Loading models",
    newChat: "New chat",
    handOff: "Hand off",
    run: "Run",
    stop: "Stop",
    share: "Share",
    compact: "Compact",
    plan: "Plan",
    planModeHint: "Plan mode — click to return to normal build mode",
    noActiveThread: "No active thread",
    selectOrCreate: "Select a thread or create a new one to get started.",
    clearUnavailable: "Clear is unavailable",
    clearUnavailableDescription: "Open a project before starting a fresh thread.",
    implementationFailed: "Could not start implementation thread",
    handoffError: "Could not create handoff thread",
    refreshProviderStatus: "Unable to refresh provider status",
    deletedAction: (name) => `Deleted action "${name ?? "Unknown"}"`,
    deleteActionFailed: "Could not delete action",
    updateAccessModeFailed: "Could not update access mode",
    tooManyAttachments: (max) => `You can attach up to ${max} references per message.`,
    browserAttachFailed: "Couldn't attach the in-app browser context",
    imagePreview: "Expanded image preview",
    imagePreviewClose: "Close image preview",
    imagePreviewPrev: "Previous image",
    imagePreviewNext: "Next image",
    attachImagesAfterPlan: "Attach images after answering plan questions.",
    voice: {
      authRequiredTitle: "Sign in to ChatGPT in Codex before using voice notes.",
      authRequiredDescription: "Voice notes require a ChatGPT-authenticated Codex session.",
      authSessionTitle: "Voice notes require a ChatGPT-authenticated Codex session.",
      authSessionDescription: "Sign in to ChatGPT again to record a voice note.",
      planUnansweredTitle: "Answer plan questions before recording a voice note.",
      planUnansweredDescription: "Plan questions must be answered before recording.",
      startFailedTitle: "Could not start recording",
      startFailedDescription: "Try again in a moment.",
      transcriptionUnavailableTitle: "Voice transcription is unavailable right now.",
      transcriptionUnavailableDescription: "Voice transcription is unavailable right now.",
      noAudioTitle: "No audio was captured.",
      noAudioDescription: "Try recording again.",
      transcribeFailedTitle: "Sign in to ChatGPT again",
      transcribeFailedDescription: "Couldn't transcribe voice note",
    },
    continueInNewWorktree: "Continue in a new worktree",
    reviewLocalChanges: "Review local uncommitted changes",
    reviewBranchDiff: "Review the current branch diff against its base",
    composerPlaceholder: (providerName) => `Message ${providerName}...`,
    stopGenerationAria: "Stop generation",
    stopGenerationTitle: "Stop the current response. On Mac, press Ctrl+C to interrupt.",
    implementationActionsAria: "Implementation actions",
    imagePlaceholder: (count) => `${count} image`,
    renameError: "Failed to rename thread",
    renameEmpty: "Thread title cannot be empty",
    timeline: {
      editMessage: "Edit message",
      editAndResend: "Edit and resend",
      revertLabel: "Revert to this message",
      revertTooltip: "Revert to this message",
      undoUnavailable: "Undo becomes available after a reply is checkpointed",
      emptyResponse: "(empty response)",
      response: "Response",
      responseWithSummary: (summary) => `Response • ${summary}`,
      showLess: "Show less",
      showMore: "Show more",
      showMoreCount: (count) => `Show ${count} more`,
      moreToolCalls: (count) => `+${count} more tool calls`,
      edited: "Edited",
      oneFileChanged: "1 File changed",
      filesChanged: (count) => `${count} Files changed`,
      collapseFiles: "Collapse changed files list",
      expandFiles: "Expand changed files list",
      undo: "Undo",
      workingFor: (duration) => `Working for ${duration}`,
      workingForPrefix: "Working for ",
      working: "Working...",
      emptyChat: "Send a message to start the conversation.",
    },
    copy: {
      buttonAria: "Copy to clipboard",
      success: "Copied!",
      failed: "Failed to copy",
    },
  },
  chatEmptyState: {
    title: "Let's build",
    subtitle: "Start a new thread to begin.",
    whatShouldWeWorkOn: "What should we work on?",
    whatShouldWeDoIn: "What should we do in",
    thisFolder: "this folder",
  },
  chatHeader: {
    closeSidechat: "Close selected sidechat",
  },
  chatRoute: {
    loadingDiff: "Loading diff viewer...",
    splitPaneEmptyTitle: "Select a chat",
    splitPaneEmptyProject: "Project",
  },
  composer: {
    placeholder: "Ask anything, @tag files/folders, or use / to show available commands",
    placeholderApproval: "Resolve this approval request to continue",
    placeholderProgress: "Type your own answer, or leave this blank to use the selected option",
    placeholderPlan: "Add feedback to refine the plan, or leave this blank to implement it",
    placeholderFollowUp: "Ask for follow-up changes",
    placeholderDisconnected: "Ask for follow-up changes or attach images",
    moreAria: "More composer controls",
    extrasAria: "Composer extras",
    modeLabel: "Mode",
    buildLabel: "Build",
    planLabel: "Plan",
    localLabel: "Local",
    codexLabel: "Codex",
    removeImage: "Remove image",
    pendingApproval: "Pending approval",
    pendingUserInput: "Awaiting your input",
    cancelTurn: "Cancel turn",
    decline: "Decline",
    alwaysAllow: "Always allow this session",
    approveOnce: "Approve once",
    terminalContextExpired:
      "Terminal context expired. Remove and re-add the context to send this message.",
    voiceTranscribing: "Transcribing voice note",
    voiceStop: "Stop voice note",
    voiceRecord: "Record voice note",
    voiceHoldToRecord: "Hold to record",
    statusDialog: {
      local: "Local",
      worktree: "Worktree",
      newWorktreePending: "New worktree (pending)",
    },
    slashCommands: {
      local: "Local",
      worktree: "Worktree",
      plan: "Plan",
      newChat: "New chat",
    },
    contextWindowLabel: "Context window",
    contextWindowPercent: (percent) => `${percent}% used`,
    sendMessage: "Send message",
    sendingBusy: "Sending",
    sendingConnecting: "Connecting",
    sendingTranscribing: "Transcribing voice note",
    sendingPreparingWorktree: "Preparing worktree",
    steer: "Steer",
    deleteQueuedFollowUp: "Delete queued follow-up",
    queuedFollowUpActions: "Queued follow-up actions",
    queuedFollowUp: "Queued follow-up",
  },
  skills: {
    title: "Skills",
    subtitle: "Give Peak Code new superpowers.",
    newSkill: "New skill",
    browseSkillSh: "Browse skill.sh",
    searchPlaceholder: "Search skills",
    localHeading: "Installed on this machine",
    localCount: "{count} installed",
    localEmptyTitle: "No local skills found",
    localEmptyDescription:
      "Peak Code scanned ~/.claude/skills, ~/.codex/skills, and ~/.agents/skills. Drop a skill folder containing a SKILL.md into one of those directories, then refresh.",
    localEmptySearchTitle: "No local skills match this search",
    localEmptySearchDescription: "Try a different keyword or clear the search.",
    providerHeading: "Provided by model",
    providerHint: "Skills the active provider surfaces for this workspace.",
    installedHeading: "Skills",
    emptyTitle: "No skills found",
    emptyDescription: "This provider has no skills available in your workspace yet.",
    emptySearchTitle: "No skills match this search",
    emptySearchDescription: "Try a different keyword or clear the search to see all skills.",
    unavailableTitle: "Skills unavailable for {provider}",
    unavailableDescription: "This provider does not expose skill discovery.",
    needsWorkspace: "Skills need a workspace path. Open a project or thread first.",
  },
  automations: {
    subtitle: "Run chats on a schedule or on demand.",
    viewTemplates: "View templates",
    createFromChat: "Create from chat",
    emptyTitle: "Create your first automation",
    emptyDescription:
      "Automations are a fast, flexible way to do recurring work with your chats. Build one in seconds by describing what you need.",
    templatesHeading: "Templates",
    templatesHint: "Pick a starter to seed a new automation. Coming soon.",
  },
  settings: {
    title: "Settings",
    restoreDefaults: "Restore defaults",
    backToApp: "Back to app",
    nav: {
      general: {
        label: "General",
        description: "Default provider, thread mode, and sidebar organization.",
      },
      appearance: {
        label: "Appearance",
        description: "Theme, typography, and timestamp formatting.",
      },
      notifications: {
        label: "Notifications",
        description: "In-app toasts and desktop alerts.",
      },
      behavior: {
        label: "Behavior",
        description: "Streaming, diff handling, and destructive confirmations.",
      },
      worktrees: {
        label: "Worktrees",
        description: "Review and clean up the worktrees created by Peak Code.",
      },
      archived: {
        label: "Archived",
        description: "View and restore archived threads.",
      },
      models: {
        label: "Models",
        description: "Git writing defaults and custom model slugs.",
      },
      providers: {
        label: "Providers",
        description: "Choose visible providers, review CLI installs, and update provider tools.",
      },
      advanced: {
        label: "Advanced",
        description: "Keybindings, recovery, and version info.",
      },
    },
    groups: {
      app: "App",
      peakcode: "Peak Code",
    },
    general: {
      heading: "General",
      description: "Default provider, thread mode, and sidebar organization.",
      coreDefaults: "Core defaults",
      sidebarOrganization: "Sidebar organization",
      language: {
        title: "Language",
        description: "Choose the language used in the Peak Code interface.",
        english: "English",
        chinese: "中文",
      },
      defaultProvider: {
        title: "Default provider",
        description: "Choose the provider used for new chats.",
        resetLabel: "default provider",
      },
      newThreads: {
        title: "New threads",
        description: "Pick the default workspace mode for newly created draft threads.",
        resetLabel: "new threads",
        local: "Local",
        worktree: "New worktree",
      },
      sidebarPosition: {
        title: "Position",
        description: "Choose which side of the screen the sidebar appears on.",
        left: "Left",
        right: "Right",
        resetLabel: "sidebar position",
      },
      projectOrder: {
        title: "Project order",
        description: "Controls how projects are arranged in the main sidebar.",
        recentlyActive: "Recently active",
        recentlyAdded: "Recently added",
        manual: "Manual order",
        resetLabel: "project order",
      },
      threadOrder: {
        title: "Thread order",
        description: "Controls how threads are arranged inside each project in the main sidebar.",
        recentlyActive: "Recently active",
        newestFirst: "Newest first",
        resetLabel: "thread order",
      },
    },
    appearance: {
      heading: "Appearance",
      description: "Theme, typography, and timestamp formatting.",
      themeAndTypographySection: "Theme and typography",
      timeAndReadingSection: "Time and reading",
      theme: {
        title: "Theme",
        description: "Choose how Peak Code looks across the app.",
        system: "System",
        light: "Light",
        dark: "Dark",
        systemDescription: "Match your OS appearance setting.",
        lightDescription: "Always use the light theme.",
        darkDescription: "Always use the dark theme.",
      },
      lightThemeCard: {
        title: "Light theme",
        contextActive: "This is the active theme right now.",
        contextInactive: "Inactive while the app is locked to {mode}.",
        contextSystemActive: "System is currently using this light slot.",
        contextSystemInactive: "Used when your system switches to light.",
      },
      darkThemeCard: {
        title: "Dark theme",
        contextActive: "This is the active theme right now.",
        contextInactive: "Inactive while the app is locked to {mode}.",
        contextSystemActive: "System is currently using this dark slot.",
        contextSystemInactive: "Used when your system switches to dark.",
      },
      themePackReset: "Reset",
      themePackCopy: "Copy",
      themePackImport: "Import",
      themePackShareStringAria: "Theme share string",
      themePackCodeThemeAria: (label) => `${label} code theme`,
      themePackTranslucentAria: (label) => `${label} translucent sidebar`,
      themePackResetAria: (label) => `Reset ${label}`,
      themePackHexAria: (label) => `${label} hex value`,
      accent: "Accent",
      background: "Background",
      foreground: "Foreground",
      uiFontLabel: "UI font",
      codeFontLabel: "Code font",
      translucentSidebar: "Translucent sidebar",
      contrast: "Contrast",
      timestamp: {
        title: "Time format",
        description: "System default follows your browser or OS clock preference.",
        systemDefault: "System default",
        twelveHour: "12-hour",
        twentyFourHour: "24-hour",
        ariaLabel: "Timestamp format",
      },
      typography: {
        title: "Typography",
        description: "UI font, code font, and base size for the chat surface.",
        uiFont: "UI font",
        codeFont: "Code font",
        baseFontSize: "Base font size",
        fontSmoothing: "Font smoothing",
        uiFontDescription:
          "Set a custom font for the interface. Leave empty to use the active theme's UI font.",
        codeFontDescription:
          "Set a custom font for code blocks and inline code in chat. Leave empty to use the active theme's code font.",
        baseFontSizeDescription:
          "Adjust the app text base in pixels. Chat and UI typography scale proportionally from this value.",
        fontSmoothingDescription:
          "Use macOS-style antialiasing for lighter, crisper text rendering.",
        uiFontAria: "Custom UI font family",
        codeFontAria: "Custom chat code font family",
        baseFontSizeAria: "Base font size in pixels",
        fontSmoothingAria: "Enable font smoothing",
        unitPx: "px",
      },
    },
    notifications: {
      heading: "Notifications",
      description: "In-app toasts and desktop alerts.",
      activityAlertsSection: "Activity alerts",
      unavailableTitle: "Desktop notifications unavailable",
      supportBrowserBlocked:
        "Browser notifications are blocked. Open the site settings to enable them.",
      supportBrowserPrompt: "Browser will prompt for notification permission.",
      supportBrowserGranted: "Browser notifications are enabled.",
      supportDesktopUnsupported: "Desktop notifications are not supported on this device.",
      supportDesktopGranted: "Desktop notifications are enabled.",
      supportDesktopDenied: "Desktop notifications are blocked in your OS settings.",
      testTitle: "Activity notification",
      testBody: "Notification test for chats and terminal agents.",
      testSuccessTitle: "Test notification sent",
      testUnavailableTitle: "Notifications unavailable",
      testSuccessDescriptionDesktop: "Your operating system should show the notification.",
      testUnavailableDescriptionDesktop: "Desktop notifications are not supported on this device.",
      testSuccessDescriptionBrowser: "Your browser should show the notification.",
      testButton: "Test",
      activityToasts: {
        title: "Activity toasts",
        description:
          "Show an in-app toast when a chat or managed terminal agent finishes or needs input.",
        ariaLabel: "Activity toast notifications",
      },
      desktopNotifications: {
        title: "Desktop notifications",
        description:
          "Show an OS notification when a chat or managed terminal agent finishes or needs input while the app is in the background.",
        ariaLabel: "Desktop activity notifications",
      },
    },
    behavior: {
      heading: "Behavior",
      description: "Streaming, diff handling, and destructive confirmations.",
      runtimeSection: "Runtime behavior",
      safetySection: "Safety confirmations",
      assistantOutput: "Assistant output",
      assistantOutputDescription: "Show token-by-token output while a response is in progress.",
      assistantOutputAria: "Stream assistant messages",
      diffLineWrapping: "Diff line wrapping",
      diffLineWrappingDescription:
        "Set the default wrap state when the diff panel opens. The in-panel wrap toggle only affects the current diff session.",
      diffLineWrappingAria: "Wrap diff lines by default",
      deleteConfirmation: "Delete confirmation",
      deleteConfirmationDescription: "Ask before deleting a thread and its chat history.",
      deleteConfirmationAria: "Confirm thread deletion",
      archiveConfirmation: "Archive confirmation",
      archiveConfirmationDescription: "Ask before archiving a thread.",
      archiveConfirmationAria: "Confirm thread archive",
      terminalCloseConfirmation: "Terminal close confirmation",
      terminalCloseConfirmationDescription:
        "Ask before closing a terminal tab and clearing its history.",
      terminalCloseConfirmationAria: "Confirm terminal tab close",
    },
    worktrees: {
      heading: "Worktrees",
      description: "Review and clean up the worktrees created by Peak Code.",
      managedSection: "Managed worktrees",
      loading: "Loading managed worktrees...",
      loadFailedFallback: "Unable to load worktrees.",
      emptyState: "No app-managed worktrees found yet.",
      worktreeLabel: "Worktree",
      conversationsLabel: "Conversations",
      noConversations: "No conversations linked to this worktree.",
      deleteButton: "Delete",
      deleteWarning: "Linked conversations exist. Deleting will ask for confirmation.",
      verifyTitle: "Could not verify linked conversations",
      verifyDescription: "Retry once the app reconnects to the server.",
      deleteConfirmWithLinks: (name, count) =>
        `Permanently remove the worktree "${name}" and ${count} linked archived conversation${count === 1 ? "" : "s"}?`,
      deleteConfirm: (name) => `Permanently remove the worktree "${name}"?`,
      deleteAnyway: "Remove worktree",
      deleteLinkedActive: (active) => `${active} active`,
      deleteLinkedArchived: (archived) => `${archived} archived`,
      deleteArchivedWillDeleteFirst: "Archived conversations will be deleted first.",
      deleteLinkedWarning: "Deleting it can break reopening those chats in the same workspace.",
      deleteRemovesFromDisk: "This removes the Git worktree from disk.",
      deletedTitle: "Worktree deleted",
      deletedDescriptionWithArchived: (name, count) =>
        `${name} was removed and ${count} archived conversation${count === 1 ? "" : "s"} were deleted.`,
      deletedDescription: (name) => `${name} was removed.`,
      deleteErrorTitle: "Could not delete worktree",
      deleteErrorFallback: "Unable to delete the worktree.",
    },
    archived: {
      heading: "Archived",
      description: "View and restore archived threads.",
      emptySection: "Archived threads",
      emptyTitle: "No archived threads",
      emptyDescription: "Archived threads will appear here and can be restored to the sidebar.",
      unknownProject: "Unknown project",
      archivedAt: (when) => `Archived ${when}`,
      restoreButton: "Restore",
      deleteButton: "Delete",
      restoreTitle: "Thread restored",
      restoreDescription: "The thread has been moved back to the sidebar.",
      restoreErrorTitle: "Could not restore thread",
      restoreErrorFallback: "Unable to restore the thread.",
      deleteConfirm: (title) =>
        `Permanently delete "${title}"?\n\nThis will remove the thread and its conversation history forever.`,
      deleteTitle: "Thread deleted",
      deleteDescription: "The archived thread has been permanently removed.",
      deleteErrorTitle: "Could not delete thread",
      deleteErrorFallback: "Unable to delete the thread.",
      contextMenuRestore: "Restore",
      contextMenuDelete: "Delete",
    },
    models: {
      heading: "Models",
      description: "Git writing defaults and custom model slugs.",
      generationSection: "Generation defaults",
      customSection: "Custom models",
      gitWritingModel: "Git writing model",
      gitWritingModelDescription:
        "Used for generated commit messages, PR titles, and branch names.",
      gitWritingModelAria: "Git text generation model",
      customModelEmpty: "Enter a model slug.",
      customModelBuiltIn: "That model is already built in.",
      customModelTooLong: (max) => `Model slugs must be ${max} characters or less.`,
      customModelDuplicate: "That custom model is already saved.",
      customModelResetLabel: "custom models",
      customAddPlaceholder: "Add a custom model slug",
      customAddButton: "Add",
      customAddAria: "Add custom model",
      customProviderAria: "Custom model provider",
      customRemoveAria: (slug) => `Remove ${slug}`,
      customShowLess: "Show less",
      customShowMore: (count) => `Show more (${count})`,
      savedModelSlugs: "Saved model slugs",
      savedModelSlugsDescription: "Add custom model slugs for supported providers.",
    },
    providers: {
      heading: "Providers",
      description: "Choose visible providers, review CLI installs, and update provider tools.",
      updatesSection: "Updates",
      pickerSection: "Provider picker",
      toolsSection: "Provider tools",
      installTitle: (providerName) => `${providerName} installation`,
      visibility: {
        title: "Visible providers",
        description:
          "Drag providers into your preferred picker order and hide the ones you don't use. The provider you're currently using on a thread always stays visible.",
        statusAllVisible: "All providers visible",
        statusCustomOrder: "Custom order",
        statusHidden: (count) => `${count} providers hidden`,
        statusHiddenOne: "1 provider hidden",
        showAria: (name) => `Show ${name} in the provider picker`,
        reorderAria: (name) => `Reorder ${name}`,
        resetLabel: "provider picker",
      },
      updates: {
        title: "Provider updates",
        description: "Update installed provider tools that Peak Code can safely update.",
        statusNoUpdates: "No provider updates detected",
        statusAvailableOne: "1 update available",
        statusAvailableMany: (count) => `${count} updates available`,
        statusAvailablePlural: (count) => `${count} updates available`,
        manualUpdate: "Manual update",
        updateButton: "Update",
        updatingButton: "Updating",
        commandLabel: "Command: ",
        runCommandTitle: (command) => `Run ${command}`,
        versionAdvisoryNoCommand:
          "A newer version is available, but Peak Code could not identify a safe one-click update command for this installation.",
      },
      tools: {
        title: "Installed CLIs",
        description:
          "Review provider versions and update tools. Open a row only when you need binary overrides.",
        statusNoUpdates: "No provider updates detected",
        statusAvailableOne: "1 update available",
        statusAvailableMany: (count) => `${count} updates available`,
        statusAvailablePlural: (count) => `${count} updates available`,
        customBadge: "Custom",
        resetLabel: "provider tools",
        binaryPathLabel: (providerName) => `${providerName} binary path`,
        homePathLabel: "CODEX_HOME path",
        homePathDescription: "Optional custom Codex home and config directory.",
        agentDirLabel: "Pi agent directory",
        agentDirDescription:
          "Optional custom Pi agent directory for auth, models, skills, and commands.",
        apiEndpointLabel: "Cursor API endpoint",
        apiEndpointDescription:
          "Optional Cursor API endpoint override passed to `cursor-agent -e`.",
        serverUrlLabel: (providerName) => `${providerName} server URL`,
        serverUrlDescription: (providerName) =>
          `Optional existing ${providerName} server URL. Leave blank to spawn a local server.`,
        serverPasswordLabel: (providerName) => `${providerName} server password`,
        serverPasswordDescription: (providerName) =>
          `Optional password for an externally managed ${providerName} server.`,
        binaryPathDescription: (command) => `Leave blank to use \`${command}\` from your PATH.`,
        binaryPathPlaceholder: (providerName) => `${providerName} binary path`,
        homePathPlaceholder: "CODEX_HOME",
        agentDirPlaceholder: "Pi agent directory",
        apiEndpointPlaceholder: "https://api2.cursor.sh",
        serverUrlPlaceholder: "http://127.0.0.1:4096",
        serverPasswordPlaceholder: (providerName) => `${providerName} server password`,
      },
      docs: {
        install: "Install",
        update: "Update",
        config: "Config",
        headless: "Headless",
        label: "CLI docs",
      },
      update: {
        queued: "Update queued",
        updating: "Updating",
        updated: "Updated",
        failed: "Update failed",
        stillOutdated: "Still outdated",
        versionDelta: (current, latest) => `${current} -> ${latest}`,
        latest: (version) => `Latest ${version}`,
        current: (version) => `Current ${version}`,
        errorFallback: "The provider update did not complete.",
      },
      cliDocs: "CLI docs",
    },
    advanced: {
      heading: "Advanced",
      description: "Keybindings, recovery, and version info.",
      developerSection: "Developer tools",
      aboutSection: "About",
      keybindings: {
        title: "Keybindings",
        description:
          "Open the persisted `keybindings.json` file to edit advanced bindings directly.",
        pathPlaceholder: "Resolving keybindings path...",
        openEditorHint: "Opens in your preferred editor.",
        openButton: "Open file",
        openingButton: "Opening...",
        noEditor: "No available editors found.",
        openError: "Unable to open keybindings file.",
        noEditorToast: "No available editors found.",
        openErrorFallback: "Unable to open keybindings file.",
        openErrorUnknown: "Unable to open keybindings file.",
      },
      recovery: {
        title: "Recovery tools",
        description:
          "Rebuild local project indexes without clearing existing chats when the local state gets out of sync.",
        offerReason: "Visible because projects exist but no chat history is currently available.",
        hiddenReason: "Shown automatically only when recovery actions are relevant.",
        whatThisDoesLabel: "What this does",
        whatThisDoesBody:
          "Rebuilds local project indexes and refreshes project snapshots. Existing chats stay in place.",
        repairButton: "Repair state",
        repairingButton: "Repairing...",
        confirmTitle: "Repair local state?",
        confirmDescription: "This rebuilds local project indexes and refreshes project snapshots.",
        confirmSpacer: "It keeps existing chats in place, but it may take a moment.",
        successTitle: "Local state repaired",
        successDescription: "Project indexes were rebuilt without clearing existing chats.",
        errorTitle: "Repair failed",
        errorFallback: "Unable to repair local state.",
      },
      version: {
        title: "Version",
        description: "Current application version.",
        releaseHistory: "Release history",
        releaseHistoryDescription:
          "A running log of every update, newest first. Same notes the post-update dialog shows, kept here so you can revisit them any time.",
        viewReleaseHistory: "View release history",
      },
    },
    changedSettingLabel: {
      theme: "Theme",
      darkThemePack: "Dark theme pack",
      lightThemePack: "Light theme pack",
      defaultProvider: "Default provider",
      newThreadMode: "New thread mode",
      sidebarPosition: "Sidebar position",
      projectSortOrder: "Project sort order",
      threadSortOrder: "Thread sort order",
      uiFont: "UI font",
      codeFont: "Code font",
      baseFontSize: "Base font size",
      fontSmoothing: "Font smoothing",
      timeFormat: "Time format",
      activityToasts: "Activity toasts",
      desktopNotifications: "Desktop notifications",
      assistantOutput: "Assistant output",
      diffLineWrapping: "Diff line wrapping",
      deleteConfirmation: "Delete confirmation",
      archiveConfirmation: "Archive confirmation",
      terminalCloseConfirmation: "Terminal close confirmation",
      gitWritingModel: "Git writing model",
      customModels: "Custom models",
      providerInstalls: "Provider installs",
      providerVisibility: "Provider visibility",
      providerOrder: "Provider order",
      language: "Language",
    },
    resetAria: (label) => `Reset ${label} to default`,
    resetTooltip: "Reset to default",
    restoreDefaultsConfirm: (labels) => `Restore default settings?\nThis will reset: ${labels}.`,
    themePack: {
      importTitle: "Import theme pack",
      importDescription: "Paste a shared theme pack string to apply it instantly.",
      apply: "Apply",
      reset: "Reset",
    },
  },
  dialog: {
    confirm: {
      deleteThread: (title) =>
        `"${title}"\n\nThis will permanently delete the thread and its history.`,
      deleteThreadPermanent: "Delete thread",
      archiveThread: "Archive thread",
      removeProject: (name) => `Remove "${name}" from the sidebar?`,
      removeProjectAndThreads: (name, count) =>
        `Remove "${name}" from the sidebar and delete ${count} thread${count === 1 ? "" : "s"}?`,
      cancel: "Cancel",
      continue: "Delete",
      discardDraft: "Discard the new thread draft?",
    },
    rename: {
      title: "Rename chat",
      description: "Keep it short and recognizable.",
      submit: "Rename",
      cancel: "Cancel",
    },
    pullRequest: {
      title: "Link pull request",
      description: "Paste a GitHub pull request URL or number to attach to this thread.",
      placeholder: "https://github.com/owner/repo/pull/42 or #42",
      open: "Open",
      cancel: "Cancel",
    },
    worktreeHandoff: {
      title: "Hand off to worktree",
      description:
        "Move the running session into a new worktree so you can keep working without losing context.",
      submit: "Hand off",
      cancel: "Cancel",
    },
  },
  whatsNew: {
    title: "What's new",
    popoutTitle: "What's new in Peak Code",
    open: "Open",
    dismiss: "Dismiss",
    gotIt: "Got it",
    releaseNotes: "Release notes",
    readMore: "Read more",
    showLess: "Show less",
    highlights: "Highlights",
    allReleases: "All releases",
    versionLabel: (version) => `v${version}`,
  },
  taskCompletion: {
    markAllRead: "Mark all as read",
    viewChat: "View chat",
  },
  workspace: {
    fallbackTitle: "Workspace",
    renameHint: "Double-click to rename",
    terminalTab: "Terminal",
    settingsAria: "Workspace settings",
    loading: "Loading workspace",
    emptyTitle: "No workspace open",
    openInEditor: "Open in editor",
  },
  terminal: {
    findPlaceholder: "Find",
    matchCase: "Match case",
    tabTerminal: "Terminal",
    tabChat: "Chat",
  },
  gitActions: {
    groupAria: "Git actions",
    optionsAria: "Git action options",
    prTitlePlaceholder: "Leave empty to auto-generate",
    linkUnavailable: "Link opening is unavailable.",
    noOpenPR: "No open PR found.",
    openPRErrorTitle: "Unable to open PR link",
    syncingTitle: "Syncing with remote...",
    syncSuccess: "Remote synced",
    alreadyUpToDate: "Already up to date",
    syncFailed: "Sync failed",
    createPRUnavailable: "Create PR unavailable",
    noChanges: "No branch changes to include in a PR.",
    running: "Running git action...",
    waiting: "Waiting for Git...",
    keeping: (name) => `Keeping ${name}`,
    branchConfirmed: "Branch name confirmed.",
    creatingBranch: "Creating branch...",
    switchedTo: (name) => `Switched to ${name}`,
    createdCheckedOut: "Branch created and checked out.",
    createFailed: "Failed to create branch",
    editorUnavailable: "Editor opening is unavailable.",
    openFileFailed: "Unable to open file",
  },
  browser: {
    screenshotCopied: "Browser screenshot copied",
    urlPlaceholder: "Search or enter a URL",
    actionsAria: "Browser actions",
  },
  branchToolbar: {
    newWorktree: "New worktree",
    handoffNewWorktree: "Hand off to new worktree",
    handoffLocal: "Hand off to local",
    rateLimitsRemaining: "Rate limits remaining",
    checkoutPR: "Checkout Pull Request",
    searchPlaceholder: "Search branches...",
    createTitle: "Create Branch",
    discardStash: "Discard saved stash?",
    loadingStash: "Loading stash details...",
    fieldBranch: "Branch",
    fieldWorktree: "Worktree",
    fieldStash: "Stash",
    fieldName: "Name",
  },
  projectScripts: {
    groupAria: "Project scripts",
    actionAria: "Script actions",
    editAria: (name) => `Edit ${name}`,
    nameLabel: "Name",
    chooseIcon: "Choose icon",
    testPlaceholder: "Test",
    keybindingLabel: "Keybinding",
    pressShortcut: "Press shortcut",
    pressShortcutHint: "Press a shortcut. Use Backspace to clear.",
    commandLabel: "Command",
    autoRunLabel: "Run automatically on worktree creation",
    deleteConfirmDescription: "This action cannot be undone.",
    addScript: "Add script",
    delete: "Delete",
  },
  themeEditor: {
    copiedTitle: "Theme copied",
    copiedDescription: (variant) => `Copied the ${variant} theme share string.`,
    copyFailedTitle: "Copy failed",
    copyFailedDescription: "Unable to copy the theme share string.",
    codeAria: (label) => `${label} code theme`,
    systemDefault: "System default",
    translucentSidebar: "Translucent sidebar",
    translucentSidebarAria: (label) => `${label} translucent sidebar`,
    resetAria: (label) => `Reset ${label}`,
    resetTitle: "Reset to default",
    hexValueAria: (label) => `${label} hex value`,
    importedTitle: "Theme imported",
    importedDescription: (variant) => `Updated the ${variant} theme pack.`,
    shareStringAria: "Theme share string",
    background: "Background",
    text: "Text",
    accent: "Accent",
    border: "Border",
    status: "Status",
    code: "Code",
    light: "Light",
    dark: "Dark",
    reset: "Reset",
    shareString: "Share string",
    apply: "Apply",
    import: "Import",
    foreground: "Foreground",
    uiFont: "UI font",
    codeFont: "Code font",
    codeFontPlaceholder: '"JetBrains Mono"',
    contrast: "Contrast",
    contextActiveSystem: (variant) => `System is currently using this ${variant} slot.`,
    contextActiveLocked: "This is the active theme right now.",
    contextInactiveSystem: (variant) => `Used when your system switches to ${variant}.`,
    contextInactiveLocked: (mode) => `Inactive while the app is locked to ${mode}.`,
    importDialogTitle: (variant) => `Import ${variant} theme`,
    importDialogDescription: (variant) =>
      `Paste a codex-theme-v1: share string. The embedded variant must match ${variant}, and the selected code theme must exist for that variant.`,
    importDialogCancel: "Cancel",
    importDialogSubmit: "Import",
    importError: "Unable to import that theme string.",
    importPlaceholder: 'codex-theme-v1:{"codeThemeId":"linear",...}',
    copy: "Copy",
  },
  themePack: {
    importTitle: "Import theme pack",
    importDescription: "Paste a shared theme pack string to apply it instantly.",
    apply: "Apply",
    reset: "Reset",
  },
  restoreDefaults: {
    title: "Restore defaults",
    description: (labels) => `Restore default settings?\nThis will reset: ${labels}.`,
    button: "Restore",
  },
  keybindings: {
    searchPlaceholder: "Search shortcuts...",
    title: "Keyboard shortcuts",
  },
  releaseHistory: {
    title: "Release notes",
    open: "Open",
  },
  rateLimits: {
    reachedTitle: "Rate limit reached.",
    approachingTitle: "Approaching rate limit",
    planLimitTitle: "Plan limit reached",
    noData: "No rate limit data yet.",
  },
  providerUsage: {
    title: (providerName) => `${providerName} usage`,
    fallbackTitle: "Usage",
    window: "Window",
    resetsAt: "Resets at",
    noData: "No usage data yet.",
  },
  debug: {
    actionFailed: "Action failed",
    fallback: "An error occurred.",
  },
  notification: {
    retention: {
      title: "Cleaning old chats...",
      preparing: "Preparing background cleanup.",
      progress: (purged, total) => `${purged} of ${total} chats removed.`,
      progressSimple: (purged) => `${purged} chats removed.`,
      compactingTitle: "Compacting chat database...",
      compactingReclaim: "Reclaiming unused database space.",
      compactingFinishing: "Finishing cleanup.",
      pausedTitle: "Cleanup paused",
      pausedDescription: "Old chats will be retried later.",
      successTitle: "Old chats cleaned",
      successDescription: (purged) => `${purged} chats removed from the database.`,
      successDescriptionEmpty: "No old chats needed cleanup.",
    },
    providerUpdate: {
      title: (providerName) => `Updating ${providerName}.`,
      titleMany: (count) => `Updating ${count} providers.`,
      description: (providerName) => `Updating ${providerName}.`,
      descriptionMany: (count) => `Updating ${count} providers.`,
      errorFallback: "The update command did not complete successfully.",
      stillOutdated: "The provider still appears outdated after updating.",
      requestFailed: "The update request failed.",
      failedTitleAll: "Provider updates failed",
      failedTitleSome: "Some provider updates failed",
      successTitleOne: (providerName) => `${providerName} updated`,
      successTitleMany: (count) => `${count} providers updated`,
      successDescription: "New sessions will use the refreshed provider tools.",
      availableTitleOne: (providerName) => `${providerName} update available`,
      availableTitleMany: (count) => `${count} provider updates available`,
      availableDescriptionOne: (providerName) => `${providerName} has a newer version available.`,
      availableDescriptionMany: (providerName, count) =>
        `${providerName} and ${count} more provider${count === 1 ? "" : "s"} have newer versions available.`,
      actionReview: "Review updates",
      actionUpdateAll: "Update all",
    },
    keybindings: {
      invalidTitle: "Invalid keybindings configuration",
      openConfigAction: "Open keybindings.json",
      noEditor: "No available editors found.",
      openFileErrorTitle: "Unable to open keybindings file",
      openFileErrorFallback: "Unknown error opening file.",
    },
  },
};

const zh: Messages = {
  common: {
    cancel: "取消",
    save: "保存",
    delete: "删除",
    confirm: "确认",
    retry: "重试",
    close: "关闭",
    open: "打开",
    ok: "好的",
    done: "完成",
    loading: "加载中…",
    yes: "是",
    no: "否",
    errorOccurred: "发生错误。",
    unexpectedError: "发生意外错误。",
  },
  appShell: {
    connecting: "正在连接 {name} 服务器…",
  },
  appNavigation: {
    back: "后退",
    backMac: "后退（⌘[）",
    backWin: "后退（Alt+←）",
    forward: "前进",
    forwardMac: "前进（⌘]）",
    forwardWin: "前进（Alt+→）",
  },
  errorFallback: {
    title: "出错了。",
    retry: "重试",
    reload: "重新加载应用",
    showDetails: "显示错误详情",
    hideDetails: "隐藏错误详情",
    unexpected: "发生意外路由错误。",
    noDetails: "没有更多可用的错误信息。",
  },
  splash: {
    retry: "重试",
  },
  sidebar: {
    brandLabel: "Peak",
    newChat: "新建会话",
    newChatTooltip: "新建会话",
    newDisposableTooltip: "新建一次性会话",
    search: "搜索",
    threads: "线程",
    chats: "聊天",
    workspace: "工作区",
    recent: "最近",
    settings: "设置",
    addProject: "添加项目",
    noProjectsYet: "暂无项目",
    noProjectsYetDescription: "选择一个本地项目文件夹来开始第一个线程。",
    chooseProjectFolder: "选择项目文件夹",
    openingFolderPicker: "正在打开...",
    addingProject: "正在添加...",
    loadingProjects: "正在加载项目",
    toggleSidebar: "切换线程侧边栏",
    codeLabel: "代码",
    disposableChat: "一次性聊天",
    pendingApproval: "待审批",
    commandsHeading: "命令",
    skillsLabel: "技能",
    pluginsLabel: "插件",
    automationsLabel: "自动化",
    automationsComingSoon: "即将推出",
    confirm: "确认",
    confirmArchive: "确认归档",
    archive: "归档",
    openNewChatHome: "打开新聊天首页",
    settingsAria: "设置",
    showMore: "展开更多",
    showLess: "收起",
    projectActionAdd: "添加项目",
    projectActionRename: "重命名项目",
    projectActionRemove: "移除项目",
    projectActionCopyPath: "复制路径",
    projectActionArchive: "归档项目",
    projectActionDeleteThreads: "删除所有线程",
    intelOnArmTitle: "Apple Silicon 上的 Intel 构建",
    sortProjects: "项目排序",
    sortThreads: "线程排序",
    sortChats: "聊天排序",
    sortRecentlyActive: "最近活跃",
    sortRecentlyAdded: "最近添加",
    sortCreatedAt: "创建时间",
    sortManual: "手动",
    sortNewestFirst: "最新优先",
    projectSortMenuHeader: "项目排序",
    threadSortMenuHeader: "线程排序",
    pinThread: "置顶线程",
    unpinThread: "取消置顶",
    addProjectError: "无法添加项目",
    openFolderError: "无法打开文件夹选择器",
    linkUnavailable: "链接打开不可用。",
    openPRError: "无法打开 PR 链接",
    openFinderError: "无法在访达中打开",
    openTerminalError: "无法打开终端",
    removeProjectError: (name) => `移除「${name}」失败`,
    removeProjectSuccess: (name) => `已移除「${name}」`,
    thread: {
      pinError: (action) => (action === "pin" ? "无法置顶线程" : "无法取消置顶"),
      renameError: "重命名线程失败",
      renameEmpty: "线程标题不能为空",
      handoffError: "无法创建交接线程",
      archiveRunningTitle: "无法归档",
      archiveRunningDescription: "请先停止正在运行的会话，再归档此线程。",
      archiveEmpty: (projectName) => `「${projectName}」没有可归档的线程。`,
      archiveFailedTitle: "无法归档线程",
      archiveSuccessOne: "线程已归档",
      archiveSuccessMany: (count) => `已归档 ${count} 个线程`,
      archiveError: "归档线程失败",
      deleteEmpty: "没有可删除的内容",
      deleteWorktreeWarning: "线程已删除，但工作树清理失败",
      deleteSuccessOne: "线程已删除",
      deleteSuccessMany: (count) => `已删除 ${count} 个线程`,
      deleteError: "删除线程失败",
      pathUnavailable: "路径不可用",
      pathCopyUnavailable: "此线程没有可复制的工作区路径。",
      pathOpenUnavailable: "此线程没有可打开的工作区路径。",
      copyThreadId: "线程 ID 已复制",
      copyThreadIdFailed: "复制线程 ID 失败",
      copyPath: "路径已复制",
      copyPathFailed: "复制路径失败",
    },
    update: {
      availableTitle: "有新版本可用",
      availableDescription: (version) => `Peak Code ${version} 已可更新。`,
      upToDateTitle: "已是最新版本",
      upToDateDescription: (version) => `Peak Code ${version} 已是最新版本。`,
      checkFailedTitle: "无法检查更新",
      checkFailedDescription: "发生意外错误。",
      downloadedTitle: "更新已下载",
      downloadedDescription: "重启应用以安装更新。",
      downloadFailedTitle: "无法下载更新",
      downloadFailedDescription: "请在菜单中重试。",
      startFailedTitle: "无法启动更新下载",
      startFailedDescription: "更新器无法启动。",
      installFailedTitle: "无法安装更新",
      installFailedDescription: "请手动重启应用以完成安装。",
      unexpectedError: "发生意外错误。",
    },
    command: {
      openHome: {
        title: "打开新聊天首页",
        description: "打开新聊天着陆页。",
      },
      newChat: {
        title: "新建聊天",
        description: "在当前项目中开启一个全新线程。",
      },
      addProject: {
        title: "添加项目",
        description: "在侧边栏打开一个仓库或文件夹。",
      },
      attachSession: {
        title: "挂接会话",
        description: "将本地线程挂接到现有的提供方会话。",
      },
      openSettings: {
        title: "打开设置",
        description: "打开应用设置。",
      },
    },
    deleteWorkspace: "删除工作区",
  },
  searchPalette: {
    importHeading: "从提供方导入线程",
    suggestedGroup: "推荐",
    projectsGroup: "项目",
    configureGroup: "配置",
    inputHint: "跳转到线程、项目、操作或外观设置。",
    enterHint: "回车打开",
  },
  chat: {
    loadingModels: "正在加载模型",
    newChat: "新建聊天",
    handOff: "交接",
    run: "运行",
    stop: "停止",
    share: "分享",
    compact: "压缩",
    plan: "计划",
    planModeHint: "计划模式 — 点击切回常规构建模式",
    noActiveThread: "暂无活跃线程",
    selectOrCreate: "请选择一个线程或新建一个以开始。",
    clearUnavailable: "无法清空",
    clearUnavailableDescription: "请先打开一个项目，再开始新线程。",
    implementationFailed: "无法启动实施线程",
    handoffError: "无法创建交接线程",
    refreshProviderStatus: "无法刷新提供方状态",
    deletedAction: (name) => `已删除操作「${name ?? "未知"}」`,
    deleteActionFailed: "无法删除操作",
    updateAccessModeFailed: "无法更新访问模式",
    tooManyAttachments: (max) => `每条消息最多附加 ${max} 个引用。`,
    browserAttachFailed: "无法附加应用内浏览器上下文",
    imagePreview: "展开的图片预览",
    imagePreviewClose: "关闭图片预览",
    imagePreviewPrev: "上一张",
    imagePreviewNext: "下一张",
    attachImagesAfterPlan: "请在回答完计划问题后再附加图片。",
    voice: {
      authRequiredTitle: "请先在 Codex 中登录 ChatGPT 再使用语音。",
      authRequiredDescription: "语音功能需要已登录 ChatGPT 的 Codex 会话。",
      authSessionTitle: "语音功能需要已登录 ChatGPT 的 Codex 会话。",
      authSessionDescription: "请重新登录 ChatGPT 后再录制语音。",
      planUnansweredTitle: "请先回答计划问题再录制语音。",
      planUnansweredDescription: "必须在回答计划问题后才能录制。",
      startFailedTitle: "无法开始录制",
      startFailedDescription: "请稍后再试。",
      transcriptionUnavailableTitle: "当前语音转写不可用。",
      transcriptionUnavailableDescription: "当前语音转写不可用。",
      noAudioTitle: "未捕获到音频。",
      noAudioDescription: "请重新录制。",
      transcribeFailedTitle: "请重新登录 ChatGPT",
      transcribeFailedDescription: "无法转写语音备注",
    },
    continueInNewWorktree: "在新工作树中继续",
    reviewLocalChanges: "查看本地未提交的变更",
    reviewBranchDiff: "查看当前分支相对基线的 diff",
    composerPlaceholder: (providerName) => `向 ${providerName} 发送消息…`,
    stopGenerationAria: "停止生成",
    stopGenerationTitle: "停止当前回复。在 Mac 上，按 Ctrl+C 中断。",
    implementationActionsAria: "实施操作",
    imagePlaceholder: (count) => `${count} 张图片`,
    renameError: "重命名线程失败",
    renameEmpty: "线程标题不能为空",
    timeline: {
      editMessage: "编辑消息",
      editAndResend: "编辑并重新发送",
      revertLabel: "回滚到此消息",
      revertTooltip: "回滚到此消息",
      undoUnavailable: "回复被确认后才能撤销",
      emptyResponse: "（空回复）",
      response: "回复",
      responseWithSummary: (summary) => `回复 • ${summary}`,
      showLess: "收起",
      showMore: "展开更多",
      showMoreCount: (count) => `展开剩余 ${count} 个`,
      moreToolCalls: (count) => `+${count} 个更多工具调用`,
      edited: "已编辑",
      oneFileChanged: "1 个文件已更改",
      filesChanged: (count) => `${count} 个文件已更改`,
      collapseFiles: "折叠变更文件列表",
      expandFiles: "展开变更文件列表",
      undo: "撤销",
      workingFor: (duration) => `已工作 ${duration}`,
      workingForPrefix: "已工作 ",
      working: "处理中…",
      emptyChat: "发送一条消息以开始对话。",
    },
    copy: {
      buttonAria: "复制到剪贴板",
      success: "已复制！",
      failed: "复制失败",
    },
  },
  chatEmptyState: {
    title: "开始构建",
    subtitle: "新建一个线程以开始。",
    whatShouldWeWorkOn: "我们一起做点什么？",
    whatShouldWeDoIn: "在",
    thisFolder: "此文件夹",
  },
  chatHeader: {
    closeSidechat: "关闭所选旁聊",
  },
  chatRoute: {
    loadingDiff: "正在加载 diff 视图…",
    splitPaneEmptyTitle: "选择一个聊天",
    splitPaneEmptyProject: "项目",
  },
  composer: {
    placeholder: "输入任何内容，使用 @ 引用文件/文件夹，或使用 / 查看可用命令",
    placeholderApproval: "请先处理此授权请求再继续",
    placeholderProgress: "输入你自己的答案，或留空使用所选选项",
    placeholderPlan: "添加反馈以优化计划，或留空以执行",
    placeholderFollowUp: "请求后续修改",
    placeholderDisconnected: "请求后续修改或附加图片",
    moreAria: "更多输入控制",
    extrasAria: "输入扩展",
    modeLabel: "模式",
    buildLabel: "构建",
    planLabel: "计划",
    localLabel: "本地",
    codexLabel: "Codex",
    removeImage: "移除图片",
    pendingApproval: "待审批",
    pendingUserInput: "等待你的输入",
    cancelTurn: "取消回合",
    decline: "拒绝",
    alwaysAllow: "本会话始终允许",
    approveOnce: "本次允许",
    terminalContextExpired: "终端上下文已过期。请移除并重新添加该上下文后再发送。",
    voiceTranscribing: "正在转写语音",
    voiceStop: "停止语音",
    voiceRecord: "录制语音",
    voiceHoldToRecord: "按住录制",
    statusDialog: {
      local: "本地",
      worktree: "工作树",
      newWorktreePending: "新建工作树（待处理）",
    },
    slashCommands: {
      local: "本地",
      worktree: "工作树",
      plan: "计划",
      newChat: "新建聊天",
    },
    contextWindowLabel: "上下文窗口",
    contextWindowPercent: (percent) => `已使用 ${percent}%`,
    sendMessage: "发送消息",
    sendingBusy: "发送中",
    sendingConnecting: "连接中",
    sendingTranscribing: "正在转写语音",
    sendingPreparingWorktree: "正在准备工作树",
    steer: "引导",
    deleteQueuedFollowUp: "删除排队的追问",
    queuedFollowUpActions: "排队追问操作",
    queuedFollowUp: "排队的追问",
  },
  skills: {
    title: "技能",
    subtitle: "赋予 Peak Code 更强大的能力。",
    newSkill: "新技能",
    browseSkillSh: "浏览 skill.sh",
    searchPlaceholder: "搜索技能",
    localHeading: "本机已安装",
    localCount: "{count} 个已安装",
    localEmptyTitle: "未发现本机技能",
    localEmptyDescription:
      "Peak Code 已扫描 ~/.claude/skills、~/.codex/skills 与 ~/.agents/skills。把一个含 SKILL.md 的技能目录放进任一目录后刷新即可。",
    localEmptySearchTitle: "没有匹配的本机技能",
    localEmptySearchDescription: "尝试其他关键词，或清空搜索。",
    providerHeading: "由模型提供",
    providerHint: "当前工作区下，当前模型暴露的技能。",
    installedHeading: "技能",
    emptyTitle: "未找到技能",
    emptyDescription: "当前工作区还没有可用的技能。",
    emptySearchTitle: "没有匹配此搜索的技能",
    emptySearchDescription: "尝试其他关键词，或清空搜索查看全部技能。",
    unavailableTitle: "{provider} 暂不支持技能",
    unavailableDescription: "该模型未开放技能发现能力。",
    needsWorkspace: "技能需要工作区路径。请先打开项目或会话。",
  },
  automations: {
    subtitle: "按计划或按需运行聊天。",
    viewTemplates: "查看模板",
    createFromChat: "通过聊天创建",
    emptyTitle: "创建首个自动化",
    emptyDescription:
      "自动化是让你以聊天为载体快速处理重复性工作的方式。只需描述需求，秒级创建一个。",
    templatesHeading: "模板",
    templatesHint: "选一个模板来快速创建一个自动化。即将推出。",
  },
  settings: {
    title: "设置",
    restoreDefaults: "恢复默认",
    backToApp: "返回应用",
    nav: {
      general: {
        label: "通用",
        description: "默认提供方、线程模式以及侧边栏的组织方式。",
      },
      appearance: {
        label: "外观",
        description: "主题、字体与时间格式。",
      },
      notifications: {
        label: "通知",
        description: "应用内提示与桌面通知。",
      },
      behavior: {
        label: "行为",
        description: "流式输出、差异处理与危险操作的二次确认。",
      },
      worktrees: {
        label: "工作树",
        description: "查看并清理由 Peak Code 创建的工作树。",
      },
      archived: {
        label: "已归档",
        description: "查看和恢复已归档的线程。",
      },
      models: {
        label: "模型",
        description: "写入 Git 的默认模型与自定义模型。",
      },
      providers: {
        label: "提供方",
        description: "选择可见的提供方、查看 CLI 安装状态并更新提供方工具。",
      },
      advanced: {
        label: "高级",
        description: "快捷键、恢复与版本信息。",
      },
    },
    groups: {
      app: "应用",
      peakcode: "Peak Code",
    },
    general: {
      heading: "通用",
      description: "默认提供方、线程模式以及侧边栏的组织方式。",
      coreDefaults: "核心默认",
      sidebarOrganization: "侧边栏组织",
      language: {
        title: "语言",
        description: "选择 Peak Code 界面所使用的语言。",
        english: "English",
        chinese: "中文",
      },
      defaultProvider: {
        title: "默认提供方",
        description: "为新聊天选择使用的提供方。",
        resetLabel: "默认提供方",
      },
      newThreads: {
        title: "新线程",
        description: "选择新创建的草稿线程的默认工作区模式。",
        resetLabel: "新线程",
        local: "本地",
        worktree: "新建工作树",
      },
      sidebarPosition: {
        title: "位置",
        description: "选择侧边栏在屏幕的哪一侧显示。",
        left: "左侧",
        right: "右侧",
        resetLabel: "侧边栏位置",
      },
      projectOrder: {
        title: "项目排序",
        description: "控制主侧边栏中项目的排列方式。",
        recentlyActive: "最近活跃",
        recentlyAdded: "最近添加",
        manual: "手动排序",
        resetLabel: "项目排序",
      },
      threadOrder: {
        title: "线程排序",
        description: "控制主侧边栏中每个项目下线程的排列方式。",
        recentlyActive: "最近活跃",
        newestFirst: "最新优先",
        resetLabel: "线程排序",
      },
    },
    appearance: {
      heading: "外观",
      description: "主题、字体与时间格式。",
      themeAndTypographySection: "主题与排版",
      timeAndReadingSection: "时间与阅读",
      theme: {
        title: "主题",
        description: "选择 Peak Code 在整个应用中的外观。",
        system: "跟随系统",
        light: "浅色",
        dark: "深色",
        systemDescription: "跟随操作系统的外观设置。",
        lightDescription: "始终使用浅色主题。",
        darkDescription: "始终使用深色主题。",
      },
      lightThemeCard: {
        title: "浅色主题",
        contextActive: "当前正在使用的主题。",
        contextInactive: "应用已锁定为 {mode}，此主题暂不生效。",
        contextSystemActive: "系统当前正在使用该浅色主题。",
        contextSystemInactive: "当系统切换到浅色时使用。",
      },
      darkThemeCard: {
        title: "深色主题",
        contextActive: "当前正在使用的主题。",
        contextInactive: "应用已锁定为 {mode}，此主题暂不生效。",
        contextSystemActive: "系统当前正在使用该深色主题。",
        contextSystemInactive: "当系统切换到深色时使用。",
      },
      themePackReset: "重置",
      themePackCopy: "复制",
      themePackImport: "导入",
      themePackShareStringAria: "主题分享串",
      themePackCodeThemeAria: (label) => `${label} 代码主题`,
      themePackTranslucentAria: (label) => `${label} 半透明侧边栏`,
      themePackResetAria: (label) => `重置 ${label}`,
      themePackHexAria: (label) => `${label} 十六进制色值`,
      accent: "主色",
      background: "背景",
      foreground: "前景",
      uiFontLabel: "界面字体",
      codeFontLabel: "代码字体",
      translucentSidebar: "半透明侧边栏",
      contrast: "对比度",
      timestamp: {
        title: "时间格式",
        description: "默认跟随浏览器或系统的时钟偏好。",
        systemDefault: "系统默认",
        twelveHour: "12 小时制",
        twentyFourHour: "24 小时制",
        ariaLabel: "时间戳格式",
      },
      typography: {
        title: "排版",
        description: "界面字体、代码字体与聊天界面的基础字号。",
        uiFont: "界面字体",
        codeFont: "代码字体",
        baseFontSize: "基础字号",
        fontSmoothing: "字体平滑",
        uiFontDescription: "为界面设置自定义字体，留空则使用当前主题的界面字体。",
        codeFontDescription:
          "为聊天中的代码块与行内代码设置自定义字体，留空则使用当前主题的代码字体。",
        baseFontSizeDescription: "调整应用文本的基础像素值，聊天与界面排版会按此比例缩放。",
        fontSmoothingDescription: "启用 macOS 风格的反锯齿，使文字更轻盈清晰。",
        uiFontAria: "自定义界面字体族",
        codeFontAria: "自定义聊天代码字体族",
        baseFontSizeAria: "基础字号（像素）",
        fontSmoothingAria: "启用字体平滑",
        unitPx: "px",
      },
    },
    notifications: {
      heading: "通知",
      description: "应用内提示与桌面通知。",
      activityAlertsSection: "活动提醒",
      unavailableTitle: "桌面通知不可用",
      supportBrowserBlocked: "浏览器通知被禁用，请在站点设置中开启。",
      supportBrowserPrompt: "浏览器将提示授予通知权限。",
      supportBrowserGranted: "浏览器通知已开启。",
      supportDesktopUnsupported: "当前设备不支持桌面通知。",
      supportDesktopGranted: "桌面通知已开启。",
      supportDesktopDenied: "系统设置中桌面通知被禁用。",
      testTitle: "活动通知",
      testBody: "用于聊天和终端代理的通知测试。",
      testSuccessTitle: "测试通知已发送",
      testUnavailableTitle: "通知不可用",
      testSuccessDescriptionDesktop: "操作系统应显示该通知。",
      testUnavailableDescriptionDesktop: "当前设备不支持桌面通知。",
      testSuccessDescriptionBrowser: "浏览器应显示该通知。",
      testButton: "测试",
      activityToasts: {
        title: "活动提示",
        description: "当聊天或托管的终端代理结束或需要输入时，显示应用内提示。",
        ariaLabel: "活动提示通知",
      },
      desktopNotifications: {
        title: "桌面通知",
        description: "当应用处于后台时，聊天或托管的终端代理结束或需要输入时显示系统通知。",
        ariaLabel: "桌面活动通知",
      },
    },
    behavior: {
      heading: "行为",
      description: "流式输出、差异处理与危险操作的二次确认。",
      runtimeSection: "运行时行为",
      safetySection: "安全确认",
      assistantOutput: "助手输出",
      assistantOutputDescription: "响应进行中时，按 token 实时显示助手输出。",
      assistantOutputAria: "流式输出助手消息",
      diffLineWrapping: "差异换行",
      diffLineWrappingDescription:
        "设置差异面板打开时的默认换行状态。面板内的换行开关仅影响当前差异会话。",
      diffLineWrappingAria: "默认对差异行进行换行",
      deleteConfirmation: "删除确认",
      deleteConfirmationDescription: "在删除线程及其聊天历史之前要求确认。",
      deleteConfirmationAria: "确认删除线程",
      archiveConfirmation: "归档确认",
      archiveConfirmationDescription: "在归档线程之前要求确认。",
      archiveConfirmationAria: "确认归档线程",
      terminalCloseConfirmation: "关闭终端确认",
      terminalCloseConfirmationDescription: "在关闭终端标签页并清除其历史记录之前要求确认。",
      terminalCloseConfirmationAria: "确认关闭终端标签页",
    },
    worktrees: {
      heading: "工作树",
      description: "查看并清理由 Peak Code 创建的工作树。",
      managedSection: "托管的工作树",
      loading: "正在加载托管的工作树…",
      loadFailedFallback: "无法加载工作树。",
      emptyState: "尚未发现由应用托管的工作树。",
      worktreeLabel: "工作树",
      conversationsLabel: "会话",
      noConversations: "此工作树未关联任何会话。",
      deleteButton: "删除",
      deleteWarning: "存在关联的会话，删除时将要求二次确认。",
      verifyTitle: "无法验证关联的会话",
      verifyDescription: "请在应用重新连接服务器后再试。",
      deleteConfirmWithLinks: (name, count) =>
        `永久移除工作树「${name}」及 ${count} 个关联的已归档会话？`,
      deleteConfirm: (name) => `永久移除工作树「${name}」？`,
      deleteAnyway: "移除工作树",
      deleteLinkedActive: (active) => `${active} 个进行中`,
      deleteLinkedArchived: (archived) => `${archived} 个已归档`,
      deleteArchivedWillDeleteFirst: "已归档的会话会先被删除。",
      deleteLinkedWarning: "删除后可能无法在同一个工作区中重新打开这些聊天。",
      deleteRemovesFromDisk: "这将从磁盘上移除该 Git 工作树。",
      deletedTitle: "工作树已删除",
      deletedDescriptionWithArchived: (name, count) =>
        `「${name}」已移除，${count} 个已归档会话已删除。`,
      deletedDescription: (name) => `「${name}」已移除。`,
      deleteErrorTitle: "无法删除工作树",
      deleteErrorFallback: "无法删除该工作树。",
    },
    archived: {
      heading: "已归档",
      description: "查看和恢复已归档的线程。",
      emptySection: "已归档线程",
      emptyTitle: "暂无已归档线程",
      emptyDescription: "已归档的线程会出现在这里，可以恢复到侧边栏。",
      unknownProject: "未知项目",
      archivedAt: (when) => `${when} 归档`,
      restoreButton: "恢复",
      deleteButton: "删除",
      restoreTitle: "线程已恢复",
      restoreDescription: "该线程已移回侧边栏。",
      restoreErrorTitle: "无法恢复线程",
      restoreErrorFallback: "无法恢复该线程。",
      deleteConfirm: (title) => `永久删除「${title}」？\n\n这将移除该线程及其对话历史。`,
      deleteTitle: "线程已删除",
      deleteDescription: "该已归档线程已被永久移除。",
      deleteErrorTitle: "无法删除线程",
      deleteErrorFallback: "无法删除该线程。",
      contextMenuRestore: "恢复",
      contextMenuDelete: "删除",
    },
    models: {
      heading: "模型",
      description: "写入 Git 的默认模型与自定义模型。",
      generationSection: "生成默认值",
      customSection: "自定义模型",
      gitWritingModel: "Git 写入模型",
      gitWritingModelDescription: "用于生成提交信息、PR 标题与分支名。",
      gitWritingModelAria: "Git 文本生成模型",
      customModelEmpty: "请输入模型标识。",
      customModelBuiltIn: "该模型已是内置。",
      customModelTooLong: (max) => `模型标识不得超过 ${max} 个字符。`,
      customModelDuplicate: "该自定义模型已存在。",
      customModelResetLabel: "自定义模型",
      customAddPlaceholder: "添加自定义模型标识",
      customAddButton: "添加",
      customAddAria: "添加自定义模型",
      customProviderAria: "自定义模型提供方",
      customRemoveAria: (slug) => `移除 ${slug}`,
      customShowLess: "收起",
      customShowMore: (count) => `展开更多 (${count})`,
      savedModelSlugs: "已保存的模型标识",
      savedModelSlugsDescription: "为支持的提供方添加自定义模型标识。",
    },
    providers: {
      heading: "提供方",
      description: "选择可见的提供方、查看 CLI 安装状态并更新提供方工具。",
      updatesSection: "更新",
      pickerSection: "提供方选择器",
      toolsSection: "提供方工具",
      installTitle: (providerName) => `${providerName} 安装`,
      visibility: {
        title: "可见的提供方",
        description:
          "拖动调整选择器顺序，并隐藏不使用的提供方。当前线程正在使用的提供方始终保持可见。",
        statusAllVisible: "所有提供方均可见",
        statusCustomOrder: "自定义顺序",
        statusHidden: (count) => `已隐藏 ${count} 个提供方`,
        statusHiddenOne: "已隐藏 1 个提供方",
        showAria: (name) => `在选择器中显示 ${name}`,
        reorderAria: (name) => `调整 ${name} 顺序`,
        resetLabel: "提供方选择器",
      },
      updates: {
        title: "提供方更新",
        description: "更新 Peak Code 可以安全更新的已安装提供方工具。",
        statusNoUpdates: "未检测到提供方更新",
        statusAvailableOne: "有 1 项可用更新",
        statusAvailableMany: (count) => `有 ${count} 项可用更新`,
        statusAvailablePlural: (count) => `有 ${count} 项可用更新`,
        manualUpdate: "手动更新",
        updateButton: "更新",
        updatingButton: "正在更新",
        commandLabel: "命令：",
        runCommandTitle: (command) => `运行 ${command}`,
        versionAdvisoryNoCommand:
          "检测到新版本，但 Peak Code 未能为该安装识别出安全的一键更新命令。",
      },
      tools: {
        title: "已安装的 CLI",
        description: "查看提供方版本并更新工具，仅在需要覆写二进制路径时展开对应行。",
        statusNoUpdates: "未检测到提供方更新",
        statusAvailableOne: "有 1 项可用更新",
        statusAvailableMany: (count) => `有 ${count} 项可用更新`,
        statusAvailablePlural: (count) => `有 ${count} 项可用更新`,
        customBadge: "自定义",
        resetLabel: "提供方工具",
        binaryPathLabel: (providerName) => `${providerName} 可执行文件路径`,
        homePathLabel: "CODEX_HOME 路径",
        homePathDescription: "可选的自定义 Codex 主目录与配置目录。",
        agentDirLabel: "Pi 代理目录",
        agentDirDescription: "可选的自定义 Pi 代理目录，用于鉴权、模型、技能与命令。",
        apiEndpointLabel: "Cursor API 端点",
        apiEndpointDescription: "可选的 Cursor API 端点覆写，会传给 `cursor-agent -e`。",
        serverUrlLabel: (providerName) => `${providerName} 服务器地址`,
        serverUrlDescription: (providerName) =>
          `可选的现有 ${providerName} 服务器地址，留空将启动本地服务器。`,
        serverPasswordLabel: (providerName) => `${providerName} 服务器密码`,
        serverPasswordDescription: (providerName) => `可选的外部管理 ${providerName} 服务器密码。`,
        binaryPathDescription: (command) => `留空将使用 PATH 中的 \`${command}\`。`,
        binaryPathPlaceholder: (providerName) => `${providerName} 可执行文件路径`,
        homePathPlaceholder: "CODEX_HOME",
        agentDirPlaceholder: "Pi 代理目录",
        apiEndpointPlaceholder: "https://api2.cursor.sh",
        serverUrlPlaceholder: "http://127.0.0.1:4096",
        serverPasswordPlaceholder: (providerName) => `${providerName} 服务器密码`,
      },
      docs: {
        install: "安装",
        update: "更新",
        config: "配置",
        headless: "无头模式",
        label: "CLI 文档",
      },
      update: {
        queued: "更新已排队",
        updating: "更新中",
        updated: "已更新",
        failed: "更新失败",
        stillOutdated: "仍为旧版",
        versionDelta: (current, latest) => `${current} → ${latest}`,
        latest: (version) => `最新 ${version}`,
        current: (version) => `当前 ${version}`,
        errorFallback: "提供方更新未完成。",
      },
      cliDocs: "CLI 文档",
    },
    advanced: {
      heading: "高级",
      description: "快捷键、恢复与版本信息。",
      developerSection: "开发者工具",
      aboutSection: "关于",
      keybindings: {
        title: "快捷键",
        description: "打开持久化的 `keybindings.json` 文件以直接编辑高级快捷键。",
        pathPlaceholder: "正在解析快捷键路径…",
        openEditorHint: "将使用你偏好的编辑器打开。",
        openButton: "打开文件",
        openingButton: "正在打开…",
        noEditor: "未找到可用编辑器。",
        openError: "无法打开快捷键文件。",
        noEditorToast: "未找到可用编辑器。",
        openErrorFallback: "无法打开快捷键文件。",
        openErrorUnknown: "无法打开快捷键文件。",
      },
      recovery: {
        title: "恢复工具",
        description: "当本地状态不同步时重建本地项目索引，且不会清空现有聊天。",
        offerReason: "因存在项目但当前无聊天记录而显示。",
        hiddenReason: "仅在恢复操作适用时自动显示。",
        whatThisDoesLabel: "这会做什么",
        whatThisDoesBody: "重建本地项目索引并刷新项目快照，现有聊天保持不变。",
        repairButton: "修复状态",
        repairingButton: "正在修复…",
        confirmTitle: "修复本地状态？",
        confirmDescription: "这会重建本地项目索引并刷新项目快照。",
        confirmSpacer: "不会清空现有聊天，但可能需要一些时间。",
        successTitle: "本地状态已修复",
        successDescription: "项目索引已重建，现有聊天未受影响。",
        errorTitle: "修复失败",
        errorFallback: "无法修复本地状态。",
      },
      version: {
        title: "版本",
        description: "当前应用版本。",
        releaseHistory: "更新历史",
        releaseHistoryDescription:
          "每次更新的滚动日志，按时间倒序排列。与更新后弹窗中的内容一致，可随时回看。",
        viewReleaseHistory: "查看更新历史",
      },
    },
    changedSettingLabel: {
      theme: "主题",
      darkThemePack: "深色主题包",
      lightThemePack: "浅色主题包",
      defaultProvider: "默认提供方",
      newThreadMode: "新线程模式",
      sidebarPosition: "侧边栏位置",
      projectSortOrder: "项目排序",
      threadSortOrder: "线程排序",
      uiFont: "界面字体",
      codeFont: "代码字体",
      baseFontSize: "基础字号",
      fontSmoothing: "字体平滑",
      timeFormat: "时间格式",
      activityToasts: "活动提示",
      desktopNotifications: "桌面通知",
      assistantOutput: "助手输出",
      diffLineWrapping: "差异换行",
      deleteConfirmation: "删除确认",
      archiveConfirmation: "归档确认",
      terminalCloseConfirmation: "关闭终端确认",
      gitWritingModel: "Git 写入模型",
      customModels: "自定义模型",
      providerInstalls: "提供方安装",
      providerVisibility: "提供方可见性",
      providerOrder: "提供方顺序",
      language: "语言",
    },
    resetAria: (label) => `将「${label}」重置为默认`,
    resetTooltip: "重置为默认",
    restoreDefaultsConfirm: (labels) => `恢复默认设置？\n将重置：${labels}。`,
    themePack: {
      importTitle: "导入主题包",
      importDescription: "粘贴一个已分享的主题包字符串以立即应用。",
      apply: "应用",
      reset: "重置",
    },
  },
  dialog: {
    confirm: {
      deleteThread: (title) => `「${title}」\n\n这将永久删除该线程及其历史记录。`,
      deleteThreadPermanent: "删除线程",
      archiveThread: "归档线程",
      removeProject: (name) => `从侧边栏移除「${name}」？`,
      removeProjectAndThreads: (name, count) => `从侧边栏移除「${name}」并删除 ${count} 个线程？`,
      cancel: "取消",
      continue: "删除",
      discardDraft: "放弃新线程草稿？",
    },
    rename: {
      title: "重命名聊天",
      description: "保持简短易记。",
      submit: "重命名",
      cancel: "取消",
    },
    pullRequest: {
      title: "关联 Pull Request",
      description: "粘贴 GitHub Pull Request 的 URL 或编号以关联到此线程。",
      placeholder: "https://github.com/owner/repo/pull/42 或 #42",
      open: "打开",
      cancel: "取消",
    },
    worktreeHandoff: {
      title: "交接至工作树",
      description: "将会话迁移到新工作树中，避免中断当前工作。",
      submit: "交接",
      cancel: "取消",
    },
  },
  whatsNew: {
    title: "新增内容",
    popoutTitle: "Peak Code 更新内容",
    open: "打开",
    dismiss: "忽略",
    gotIt: "知道了",
    releaseNotes: "更新说明",
    readMore: "阅读更多",
    showLess: "收起",
    highlights: "亮点",
    allReleases: "所有版本",
    versionLabel: (version) => `v${version}`,
  },
  taskCompletion: {
    markAllRead: "全部标记为已读",
    viewChat: "查看聊天",
  },
  workspace: {
    fallbackTitle: "工作区",
    renameHint: "双击重命名",
    terminalTab: "终端",
    settingsAria: "工作区设置",
    loading: "正在加载工作区",
    emptyTitle: "没有打开的工作区",
    openInEditor: "在编辑器中打开",
  },
  terminal: {
    findPlaceholder: "查找",
    matchCase: "区分大小写",
    tabTerminal: "终端",
    tabChat: "聊天",
  },
  gitActions: {
    groupAria: "Git 操作",
    optionsAria: "Git 操作选项",
    prTitlePlaceholder: "留空以自动生成",
    linkUnavailable: "链接打开不可用。",
    noOpenPR: "未找到打开的 PR。",
    openPRErrorTitle: "无法打开 PR 链接",
    syncingTitle: "正在与远程同步…",
    syncSuccess: "远程已同步",
    alreadyUpToDate: "已是最新",
    syncFailed: "同步失败",
    createPRUnavailable: "无法创建 PR",
    noChanges: "没有可包含在 PR 中的变更。",
    running: "正在执行 Git 操作…",
    waiting: "等待 Git…",
    keeping: (name) => `保留 ${name}`,
    branchConfirmed: "分支名已确认。",
    creatingBranch: "正在创建分支…",
    switchedTo: (name) => `已切换到 ${name}`,
    createdCheckedOut: "分支已创建并签出。",
    createFailed: "创建分支失败",
    editorUnavailable: "编辑器打开不可用。",
    openFileFailed: "无法打开文件",
  },
  browser: {
    screenshotCopied: "浏览器截图已复制",
    urlPlaceholder: "搜索或输入 URL",
    actionsAria: "浏览器操作",
  },
  branchToolbar: {
    newWorktree: "新建工作树",
    handoffNewWorktree: "交接至新工作树",
    handoffLocal: "交接至本地",
    rateLimitsRemaining: "剩余速率限制",
    checkoutPR: "签出 Pull Request",
    searchPlaceholder: "搜索分支…",
    createTitle: "创建分支",
    discardStash: "放弃已保存的 stash？",
    loadingStash: "正在加载 stash…",
    fieldBranch: "分支",
    fieldWorktree: "工作树",
    fieldStash: "Stash",
    fieldName: "名称",
  },
  projectScripts: {
    groupAria: "项目脚本",
    actionAria: "脚本操作",
    editAria: (name) => `编辑 ${name}`,
    nameLabel: "名称",
    chooseIcon: "选择图标",
    testPlaceholder: "测试",
    keybindingLabel: "快捷键",
    pressShortcut: "按下快捷键",
    pressShortcutHint: "按下快捷键。使用退格键清除。",
    commandLabel: "命令",
    autoRunLabel: "创建工作树时自动运行",
    deleteConfirmDescription: "此操作无法撤销。",
    addScript: "添加脚本",
    delete: "删除",
  },
  themeEditor: {
    copiedTitle: "主题已复制",
    copiedDescription: (variant) => `已复制 ${variant} 主题分享串。`,
    copyFailedTitle: "复制失败",
    copyFailedDescription: "无法复制主题分享串。",
    codeAria: (label) => `${label} 代码主题`,
    systemDefault: "系统默认",
    translucentSidebar: "半透明侧边栏",
    translucentSidebarAria: (label) => `${label} 半透明侧边栏`,
    resetAria: (label) => `重置 ${label}`,
    resetTitle: "重置为默认",
    hexValueAria: (label) => `${label} 十六进制值`,
    importedTitle: "主题已导入",
    importedDescription: (variant) => `${variant} 主题包已更新。`,
    shareStringAria: "主题分享串",
    background: "背景",
    text: "文本",
    accent: "强调色",
    border: "边框",
    status: "状态",
    code: "代码",
    light: "浅色",
    dark: "深色",
    reset: "重置",
    shareString: "分享串",
    apply: "应用",
    import: "导入",
    foreground: "前景色",
    uiFont: "界面字体",
    codeFont: "代码字体",
    codeFontPlaceholder: '"JetBrains Mono"',
    contrast: "对比度",
    contextActiveSystem: (variant) => `系统当前正在使用此 ${variant} 主题。`,
    contextActiveLocked: "这是当前使用的主题。",
    contextInactiveSystem: (variant) => `当系统切换到 ${variant} 时使用。`,
    contextInactiveLocked: (mode) => `应用已锁定为 ${mode} 模式，此主题未启用。`,
    importDialogTitle: (variant) => `导入${variant === "dark" ? "深色" : "浅色"}主题`,
    importDialogDescription: (variant) =>
      `粘贴 codex-theme-v1: 分享串。嵌入的变体必须匹配 ${variant}，且所选代码主题必须存在于该变体。`,
    importDialogCancel: "取消",
    importDialogSubmit: "导入",
    importError: "无法导入该主题字符串。",
    importPlaceholder: 'codex-theme-v1:{"codeThemeId":"linear",...}',
    copy: "复制",
  },
  themePack: {
    importTitle: "导入主题包",
    importDescription: "粘贴一个已分享的主题包字符串以立即应用。",
    apply: "应用",
    reset: "重置",
  },
  restoreDefaults: {
    title: "恢复默认",
    description: (labels) => `恢复默认设置？\n将重置：${labels}。`,
    button: "恢复",
  },
  keybindings: {
    searchPlaceholder: "搜索快捷键…",
    title: "键盘快捷键",
  },
  releaseHistory: {
    title: "更新说明",
    open: "打开",
  },
  rateLimits: {
    reachedTitle: "已达到速率限制。",
    approachingTitle: "接近速率限制",
    planLimitTitle: "已达套餐限制",
    noData: "暂无速率限制数据。",
  },
  providerUsage: {
    title: (providerName) => `${providerName} 用量`,
    fallbackTitle: "用量",
    window: "时间窗",
    resetsAt: "重置于",
    noData: "暂无用量数据。",
  },
  debug: {
    actionFailed: "操作失败",
    fallback: "发生错误。",
  },
  notification: {
    retention: {
      title: "正在清理旧聊天…",
      preparing: "正在准备后台清理。",
      progress: (purged, total) => `已移除 ${purged} / {total} 个聊天。`,
      progressSimple: (purged) => `已移除 ${purged} 个聊天。`,
      compactingTitle: "正在压缩聊天数据库…",
      compactingReclaim: "正在回收未使用的数据库空间。",
      compactingFinishing: "正在完成清理。",
      pausedTitle: "清理已暂停",
      pausedDescription: "旧聊天将稍后重试。",
      successTitle: "旧聊天已清理",
      successDescription: (purged) => `已从数据库移除 ${purged} 个聊天。`,
      successDescriptionEmpty: "无需清理旧聊天。",
    },
    providerUpdate: {
      title: (providerName) => `正在更新 ${providerName}。`,
      titleMany: (count) => `正在更新 ${count} 个提供方。`,
      description: (providerName) => `正在更新 ${providerName}。`,
      descriptionMany: (count) => `正在更新 ${count} 个提供方。`,
      errorFallback: "更新命令未成功完成。",
      stillOutdated: "更新后该提供方仍显示为旧版。",
      requestFailed: "更新请求失败。",
      failedTitleAll: "提供方更新失败",
      failedTitleSome: "部分提供方更新失败",
      successTitleOne: (providerName) => `${providerName} 已更新`,
      successTitleMany: (count) => `已更新 ${count} 个提供方`,
      successDescription: "新会话将使用已刷新的提供方工具。",
      availableTitleOne: (providerName) => `${providerName} 有可用更新`,
      availableTitleMany: (count) => `${count} 个提供方有可用更新`,
      availableDescriptionOne: (providerName) => `${providerName} 有更新版本可用。`,
      availableDescriptionMany: (providerName, count) =>
        `${providerName} 及其他 ${count} 个提供方有更新版本可用。`,
      actionReview: "查看更新",
      actionUpdateAll: "全部更新",
    },
    keybindings: {
      invalidTitle: "快捷键配置无效",
      openConfigAction: "打开 keybindings.json",
      noEditor: "未找到可用编辑器。",
      openFileErrorTitle: "无法打开快捷键文件",
      openFileErrorFallback: "打开文件时出现未知错误。",
    },
  },
};

export const MESSAGES: Record<Language, Messages> = { en, zh };
export const NATIVE_LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "中文",
};
