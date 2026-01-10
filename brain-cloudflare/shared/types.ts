export type PrivacyScope = "private" | "social" | "public";

export type BrainJobMessage = {
  eventId: string;      // Convex event document ID
  userId: string;       // Convex userId (stringified)
  eventType: string;    // e.g. "audio_recorded", "page_visit", "speaker_cluster_labeled"
  sourceApp?: string;
  attempt?: number;     // consumer increments on retry
};

export type SearchRequest = {
  query: string;
  topK?: number;
  modalities?: Array<"text" | "audio" | "image" | "video">;
  privacyScope?: PrivacyScope; // max allowed (default: private)
};

export type SearchResult = {
  eventId: string;
  score: number;
  snippet?: string;
  timestamp?: number;
  sourceApp?: string;
  contact?: { contactId: string; displayName: string; category: string } | null;
};

export type InsightRequest = {
  timeRange?: { fromMs: number; toMs: number };
  focus?: "relationships" | "retention" | "mood" | "workouts" | "tasks" | "daily_summary";
};

export type ConvexEvent = {
  _id: string;
  userId: string;
  eventType: string;
  sourceApp: string;
  timestamp: number;
  ingestedAt: number;
  privacyScope: PrivacyScope;
  modality: any;
  context: any;
  brainAttempts?: number;
};
