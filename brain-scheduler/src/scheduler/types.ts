export type Env = {
  CONVEX_BRAIN_BASE_URL: string;
  CONVEX_BRAIN_ADMIN_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_API_KEY: string;
};

export type QueueMessage =
  | { type: "SCHEDULE_REOPTIMIZE"; userId: string; runId?: string; horizonDays?: number };

export type WorkDayWindow = { weekday: number; startMinutes: number; endMinutes: number };

export type ScheduleSettings = {
  version: number;
  windows: WorkDayWindow[];
  meetingBufferMinutes: number;
  minFocusBlockMinutes: number;
  maxDailyMeetingMinutes?: number | null;
  allowTaskSplitting: boolean;
  allowRescheduleMeetings: boolean;
  calendarsIncluded: string[];
  reoptimizeOnNewMeeting: boolean;
  reoptimizeOnTaskChange: boolean;
};

export type CalendarEvent = {
  id: string;
  startAt: number;
  endAt: number;
  title: string;
  kind: "meeting" | "personal" | "block";
  isLocked?: boolean;
};

export type Lock = {
  lockId: string;
  kind: string;
  targetId: string;
  isActive: boolean;
};

export type TaskItem = {
  id: string;
  title: string;
  notes?: string;
  dueAt?: number;
  estMinutes?: number;
  priority?: number;
  deadlineFlex?: "hard" | "soft";
  splittable?: boolean;
};

export type EnrichedTaskItem = TaskItem & {
  estMinutes: number;
  priority: number;
  deadlineFlex: "hard" | "soft";
  splittable: boolean;
  reason: string;
};

export type TimeBlockProposal = {
  proposalId: string;
  action: "create" | "move" | "delete";
  title: string;
  startAt: number;
  endAt: number;
  notes?: string;
  reason: string;
  confidence: number;
  blockId?: string;
  ekEventId?: string;
  sourceEventIds: string[];
};

export type SchedulerContextRequest = { userId: string; horizonDays: number };

export type SchedulerContext = {
  userId: string;
  timezone: string;
  horizonDays: number;
  scheduleSettings: ScheduleSettings;
  locks: Lock[];
  calendarEvents: CalendarEvent[];
  existingTimeBlocks: CalendarEvent[];
  tasks: TaskItem[];
};

export type AvailabilityWindow = { startAt: number; endAt: number };

export type ProposalWriteRequest = { userId: string; runId: string; proposals: TimeBlockProposal[] };
