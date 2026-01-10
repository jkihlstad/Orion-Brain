export type Env = {
  CONVEX_BRAIN_BASE_URL: string;
  CONVEX_BRAIN_ADMIN_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_API_KEY: string;
};

export type SocialQueueMessage =
  | { type: "SOCIAL_MEETING_SUGGEST"; proposerUserId: string; inviteeUserId: string; durationMinutes: number; title: string; runId?: string }
  | { type: "SOCIAL_MEETING_FINALIZE"; proposalId: string; runId?: string };

export type AvailabilityWindow = { startAt: number; endAt: number };

export type SocialAvailabilityContext = {
  proposerUserId: string;
  inviteeUserId: string;
  durationMinutes: number;
  title: string;
  proposerWindows: AvailabilityWindow[];
  inviteeWindows: AvailabilityWindow[];
  constraints: {
    proposerTimezone: string;
    inviteeTimezone: string;
  };
};

export type SlotCandidate = { startAt: number; endAt: number; score: number; reason: string };
