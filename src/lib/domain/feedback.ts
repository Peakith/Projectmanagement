import type { FeedbackStatus } from "./labels";

export type RoundLike = { round_number: number; is_extra: boolean; status: FeedbackStatus };

export type NextRoundInfo = {
  nextRoundNumber: number;
  /** De volgende ronde valt buiten de inbegrepen rondes en vereist geregistreerd meerwerk. */
  requiresExtraApproval: boolean;
  /** Er loopt nog een ronde die niet verwerkt is. */
  blockedByOpenRound: boolean;
  /** Signaal: aanvullende feedback kan buiten de afgesproken scope vallen. */
  scopeWarning: boolean;
  usedIncluded: number;
};

/** Feedbackrondes gelden per video. Versies en exports verbruiken geen ronde. */
export function nextRoundInfo(includedRounds: number, rounds: RoundLike[], approved: boolean): NextRoundInfo {
  const sorted = [...rounds].sort((a, b) => a.round_number - b.round_number);
  const nextRoundNumber = (sorted.at(-1)?.round_number ?? 0) + 1;
  const usedIncluded = sorted.filter((r) => !r.is_extra).length;
  const blockedByOpenRound = sorted.some((r) => r.status !== "verwerkt");
  const requiresExtraApproval = nextRoundNumber > includedRounds;
  return {
    nextRoundNumber,
    requiresExtraApproval,
    blockedByOpenRound,
    scopeWarning: !approved && usedIncluded >= includedRounds,
    usedIncluded,
  };
}

export function roundLabel(r: { round_number: number; is_extra: boolean }): string {
  return r.is_extra ? `Extra ronde ${r.round_number}` : `Ronde ${r.round_number}`;
}
