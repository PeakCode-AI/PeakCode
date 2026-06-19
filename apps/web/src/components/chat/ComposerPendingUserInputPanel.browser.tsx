import "../../index.css";

import { ApprovalRequestId, type UserInputQuestion } from "@peakcode/contracts";
import { useCallback, useRef, useState } from "react";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
  togglePendingUserInputOptionSelection,
} from "../../pendingUserInput";
import type { PendingUserInput } from "../../session-logic";

const REQUEST_ID = ApprovalRequestId.makeUnsafe("req-pending-user-input-test");

const SINGLE_QUESTION: UserInputQuestion = {
  id: "q1",
  header: "Pick one",
  question: "Choose exactly one thing.",
  options: [
    { label: "Single A", description: "first choice" },
    { label: "Single B", description: "second choice" },
  ],
  multiSelect: false,
};

const MULTI_QUESTION: UserInputQuestion = {
  id: "q2",
  header: "Pick many",
  question: "Choose any number of things.",
  multiSelect: true,
  options: [
    { label: "Multi X", description: "alpha" },
    { label: "Multi Y", description: "beta" },
    { label: "Multi Z", description: "gamma" },
  ],
};

// Faithful mirror of ChatView's pending-user-input wiring (onToggleActivePendingUserInputOption +
// onAdvanceActivePendingUserInput), reusing the real helpers so the panel exercises the same logic
// path it does in production. The harness owns the draft answers and active question index; the panel
// owns the click handling and 200ms single-select auto-advance.
function PanelHarness({
  questions,
  onSubmit,
}: {
  questions: ReadonlyArray<UserInputQuestion>;
  onSubmit: (answers: Record<string, string | string[]>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, PendingUserInputDraftAnswer>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const answersRef = useRef(answers);
  const indexRef = useRef(questionIndex);

  const prompt: PendingUserInput = {
    requestId: REQUEST_ID,
    createdAt: "2026-06-18T00:00:00.000Z",
    questions,
  };

  const onToggleOption = useCallback(
    (questionId: string, optionLabel: string): PendingUserInputDraftAnswer | null => {
      const question = questions.find((entry) => entry.id === questionId);
      if (!question) return null;
      const nextDraftAnswer = togglePendingUserInputOptionSelection(
        question,
        answersRef.current[questionId],
        optionLabel,
      );
      answersRef.current = { ...answersRef.current, [questionId]: nextDraftAnswer };
      setAnswers(answersRef.current);
      return nextDraftAnswer;
    },
    [questions],
  );

  const onAdvance = useCallback(
    (answerOverrides?: Record<string, PendingUserInputDraftAnswer>) => {
      const draft =
        answerOverrides && Object.keys(answerOverrides).length > 0
          ? { ...answersRef.current, ...answerOverrides }
          : answersRef.current;
      if (answerOverrides && Object.keys(answerOverrides).length > 0) {
        answersRef.current = draft;
        setAnswers(draft);
      }
      const progress = derivePendingUserInputProgress(questions, draft, indexRef.current);
      if (progress.isLastQuestion) {
        const resolved = buildPendingUserInputAnswers(questions, draft);
        if (resolved) onSubmit(resolved);
        return;
      }
      const activeQuestionId = progress.activeQuestion?.id ?? null;
      const hasActiveOverride = activeQuestionId
        ? answerOverrides?.[activeQuestionId] !== undefined
        : false;
      if (!progress.canAdvance && !hasActiveOverride) {
        return;
      }
      const nextIndex = progress.questionIndex + 1;
      indexRef.current = nextIndex;
      setQuestionIndex(nextIndex);
    },
    [questions, onSubmit],
  );

  return (
    <div>
      <ComposerPendingUserInputPanel
        pendingUserInputs={[prompt]}
        respondingRequestIds={[]}
        answers={answers}
        questionIndex={questionIndex}
        onToggleOption={onToggleOption}
        onAdvance={onAdvance}
      />
      <button type="button" onClick={() => onAdvance(undefined)}>
        harness-submit
      </button>
    </div>
  );
}

async function mountPanel(
  questions: ReadonlyArray<UserInputQuestion>,
  onSubmit: (answers: Record<string, string | string[]>) => void,
) {
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(<PanelHarness questions={questions} onSubmit={onSubmit} />, {
    container: host,
  });
  const cleanup = async () => {
    await screen.unmount();
    host.remove();
  };
  return { [Symbol.asyncDispose]: cleanup, cleanup };
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

describe("ComposerPendingUserInputPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not auto-submit a multi-select question reached via single-select auto-advance", async () => {
    const onSubmit = vi.fn();
    await using _ = await mountPanel([SINGLE_QUESTION, MULTI_QUESTION], onSubmit);

    // Answer the single-select question; this arms the 200ms auto-advance to the multi-select one.
    await page.getByText("Single A", { exact: true }).click();

    // Click the FIRST option of the multi-select question (Playwright auto-waits for it to render
    // after the auto-advance). Pre-fix, this set a 200ms timer that auto-submitted the whole round.
    await page.getByText("Multi X", { exact: true }).click();

    // Regression assertion: no auto-submit — the user must be able to keep selecting.
    await wait(300);
    expect(onSubmit).not.toHaveBeenCalled();

    // A second option can still be toggled on, then submitting collects BOTH selections.
    await page.getByText("Multi Y", { exact: true }).click();
    await page.getByText("harness-submit", { exact: true }).click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ q1: "Single A", q2: ["Multi X", "Multi Y"] });
  });

  it("still auto-submits a lone single-select question on click", async () => {
    const onSubmit = vi.fn();
    await using _ = await mountPanel([SINGLE_QUESTION], onSubmit);

    await page.getByText("Single A", { exact: true }).click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ q1: "Single A" });
  });
});
