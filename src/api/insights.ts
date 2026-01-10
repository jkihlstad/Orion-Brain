/**
 * Neural Intelligence Platform - Insights Implementation
 *
 * Uses LangGraph to generate insights, patterns, and recommendations
 * from user's captured data.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import type { EventType, SentimentAnalysis } from '../types/common';

// =============================================================================
// TYPES
// =============================================================================

export interface InsightsRequest {
  userId: string;
  timeRange: {
    start: number;
    end: number;
  };
  focusAreas?: InsightFocusArea[];
}

export type InsightFocusArea =
  | 'productivity'
  | 'relationships'
  | 'topics'
  | 'sentiment'
  | 'action_items'
  | 'meetings';

export interface InsightsResponse {
  summary: InsightSummary;
  patterns: Pattern[];
  recommendations: Recommendation[];
  metrics: InsightMetrics;
  generatedAt: number;
}

export interface InsightSummary {
  text: string;
  highlights: string[];
  period: string;
}

export interface Pattern {
  type: string;
  description: string;
  frequency: number;
  examples: string[];
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  relatedEventIds?: string[];
}

export type RecommendationType =
  | 'follow_up'
  | 'schedule_meeting'
  | 'complete_action'
  | 'review_topic'
  | 'connect_contact'
  | 'optimize_schedule';

export interface InsightMetrics {
  totalEvents: number;
  totalMeetingMinutes: number;
  uniqueContacts: number;
  topTopics: Array<{ topic: string; count: number }>;
  sentimentDistribution: Record<SentimentAnalysis['label'], number>;
  productivityScore: number;
  actionItemCompletionRate: number;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface AggregatedData {
  events: EventSummary[];
  contacts: ContactSummary[];
  topics: TopicSummary[];
  actionItems: ActionItemSummary[];
  meetings: MeetingSummary[];
  sentiments: SentimentSummary;
}

interface EventSummary {
  id: string;
  type: EventType;
  timestamp: number;
  text: string;
  sentiment?: SentimentAnalysis['label'];
  contactIds: string[];
  topics: string[];
}

interface ContactSummary {
  id: string;
  name: string;
  interactionCount: number;
  lastInteraction: number;
  averageSentiment: number;
  topics: string[];
}

interface TopicSummary {
  name: string;
  count: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  relatedContacts: string[];
}

interface ActionItemSummary {
  id: string;
  text: string;
  assignee?: string;
  dueDate?: number;
  status: 'open' | 'completed';
  createdAt: number;
  eventId: string;
}

interface MeetingSummary {
  id: string;
  title: string;
  timestamp: number;
  duration: number;
  participants: string[];
  topics: string[];
  actionItemCount: number;
}

interface SentimentSummary {
  overall: number;
  distribution: Record<SentimentAnalysis['label'], number>;
  trend: 'improving' | 'declining' | 'stable';
}

// =============================================================================
// LANGGRAPH STATE
// =============================================================================

interface InsightsState {
  // Input
  userId: string;
  timeRange: { start: number; end: number };
  focusAreas: InsightFocusArea[];

  // Aggregated data
  aggregatedData: AggregatedData | null;

  // Generated insights
  summary: InsightSummary | null;
  patterns: Pattern[];
  recommendations: Recommendation[];
  metrics: InsightMetrics | null;

  // Processing
  error: Error | null;
  processingStage: string;
}

const InsightsStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  timeRange: Annotation<{ start: number; end: number }>(),
  focusAreas: Annotation<InsightFocusArea[]>(),
  aggregatedData: Annotation<AggregatedData | null>(),
  summary: Annotation<InsightSummary | null>(),
  patterns: Annotation<Pattern[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  recommendations: Annotation<Recommendation[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  metrics: Annotation<InsightMetrics | null>(),
  error: Annotation<Error | null>(),
  processingStage: Annotation<string>(),
});

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  insightsModel: 'anthropic/claude-3-5-sonnet',
  maxEventsForContext: 500,
  maxTokensForContext: 8000,
};

// =============================================================================
// LLM CLIENT
// =============================================================================

function createLLMClient() {
  // TODO: Configure with OpenRouter
  return new ChatOpenAI({
    modelName: config.insightsModel,
    temperature: 0.3,
    configuration: {
      baseURL: config.openRouterBaseUrl,
    },
    apiKey: config.openRouterApiKey,
  });
}

// =============================================================================
// DATA AGGREGATION NODE
// =============================================================================

async function aggregateData(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  const { userId, timeRange } = state;

  try {
    // TODO: Replace with actual data fetching
    // Fetch from LanceDB and Neo4j

    const aggregatedData = await fetchAggregatedData(userId, timeRange);

    return {
      aggregatedData,
      processingStage: 'data_aggregated',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      processingStage: 'aggregation_failed',
    };
  }
}

/**
 * Fetch and aggregate data from LanceDB and Neo4j
 */
async function fetchAggregatedData(
  userId: string,
  timeRange: { start: number; end: number }
): Promise<AggregatedData> {
  // TODO: Implement with actual database queries

  // Placeholder - implement with actual clients
  console.log(`[Insights] Aggregating data for ${userId} from ${timeRange.start} to ${timeRange.end}`);

  return {
    events: [],
    contacts: [],
    topics: [],
    actionItems: [],
    meetings: [],
    sentiments: {
      overall: 0,
      distribution: { positive: 0, negative: 0, neutral: 0 },
      trend: 'stable',
    },
  };
}

// =============================================================================
// METRICS CALCULATION NODE
// =============================================================================

async function calculateMetrics(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  const { aggregatedData, timeRange } = state;

  if (!aggregatedData) {
    return { processingStage: 'metrics_skipped' };
  }

  try {
    // Calculate metrics from aggregated data
    const totalMeetingMinutes = aggregatedData.meetings.reduce(
      (sum, m) => sum + m.duration,
      0
    );

    const topTopics = aggregatedData.topics
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => ({ topic: t.name, count: t.count }));

    const completedActions = aggregatedData.actionItems.filter(
      (a) => a.status === 'completed'
    ).length;
    const totalActions = aggregatedData.actionItems.length;
    const actionItemCompletionRate =
      totalActions > 0 ? completedActions / totalActions : 0;

    // Calculate productivity score (simplified)
    const productivityScore = calculateProductivityScore(aggregatedData);

    const metrics: InsightMetrics = {
      totalEvents: aggregatedData.events.length,
      totalMeetingMinutes,
      uniqueContacts: aggregatedData.contacts.length,
      topTopics,
      sentimentDistribution: aggregatedData.sentiments.distribution,
      productivityScore,
      actionItemCompletionRate,
    };

    return {
      metrics,
      processingStage: 'metrics_calculated',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      processingStage: 'metrics_failed',
    };
  }
}

function calculateProductivityScore(data: AggregatedData): number {
  // Simplified productivity calculation
  // In production, this would be more sophisticated

  let score = 50; // Base score

  // Bonus for completed action items
  const completedRatio =
    data.actionItems.filter((a) => a.status === 'completed').length /
    Math.max(data.actionItems.length, 1);
  score += completedRatio * 20;

  // Bonus for positive sentiment
  const positiveRatio =
    data.sentiments.distribution.positive /
    Math.max(
      data.sentiments.distribution.positive +
        data.sentiments.distribution.negative +
        data.sentiments.distribution.neutral,
      1
    );
  score += positiveRatio * 15;

  // Penalty for too many meetings
  const meetingHours = data.meetings.reduce((sum, m) => sum + m.duration, 0) / 60;
  if (meetingHours > 20) {
    score -= Math.min((meetingHours - 20) * 2, 20);
  }

  return Math.max(0, Math.min(100, score));
}

// =============================================================================
// PATTERN DETECTION NODE
// =============================================================================

async function detectPatterns(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  const { aggregatedData, focusAreas } = state;

  if (!aggregatedData) {
    return { processingStage: 'patterns_skipped' };
  }

  try {
    const patterns: Pattern[] = [];

    // Topic patterns
    if (focusAreas.includes('topics') || focusAreas.length === 0) {
      const topicPatterns = detectTopicPatterns(aggregatedData);
      patterns.push(...topicPatterns);
    }

    // Relationship patterns
    if (focusAreas.includes('relationships') || focusAreas.length === 0) {
      const relationshipPatterns = detectRelationshipPatterns(aggregatedData);
      patterns.push(...relationshipPatterns);
    }

    // Meeting patterns
    if (focusAreas.includes('meetings') || focusAreas.length === 0) {
      const meetingPatterns = detectMeetingPatterns(aggregatedData);
      patterns.push(...meetingPatterns);
    }

    // Sentiment patterns
    if (focusAreas.includes('sentiment') || focusAreas.length === 0) {
      const sentimentPatterns = detectSentimentPatterns(aggregatedData);
      patterns.push(...sentimentPatterns);
    }

    return {
      patterns,
      processingStage: 'patterns_detected',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      processingStage: 'patterns_failed',
    };
  }
}

function detectTopicPatterns(data: AggregatedData): Pattern[] {
  const patterns: Pattern[] = [];

  // Find trending topics
  const trendingTopics = data.topics.filter((t) => t.trend === 'increasing');
  if (trendingTopics.length > 0) {
    patterns.push({
      type: 'trending_topics',
      description: `Topics gaining attention: ${trendingTopics.map((t) => t.name).join(', ')}`,
      frequency: trendingTopics.length,
      examples: trendingTopics.slice(0, 3).map((t) => t.name),
      trend: 'increasing',
    });
  }

  return patterns;
}

function detectRelationshipPatterns(data: AggregatedData): Pattern[] {
  const patterns: Pattern[] = [];

  // Find frequently contacted people
  const frequentContacts = data.contacts
    .filter((c) => c.interactionCount >= 5)
    .sort((a, b) => b.interactionCount - a.interactionCount);

  if (frequentContacts.length > 0) {
    patterns.push({
      type: 'frequent_contacts',
      description: `Most engaged contacts: ${frequentContacts.slice(0, 3).map((c) => c.name).join(', ')}`,
      frequency: frequentContacts.length,
      examples: frequentContacts.slice(0, 5).map((c) => c.name),
      trend: 'stable',
    });
  }

  return patterns;
}

function detectMeetingPatterns(data: AggregatedData): Pattern[] {
  const patterns: Pattern[] = [];

  // Analyze meeting distribution
  const totalMinutes = data.meetings.reduce((sum, m) => sum + m.duration, 0);
  const avgDuration = totalMinutes / Math.max(data.meetings.length, 1);

  if (avgDuration > 45) {
    patterns.push({
      type: 'long_meetings',
      description: `Average meeting duration is ${Math.round(avgDuration)} minutes`,
      frequency: data.meetings.filter((m) => m.duration > 45).length,
      examples: data.meetings
        .filter((m) => m.duration > 45)
        .slice(0, 3)
        .map((m) => m.title),
      trend: 'stable',
    });
  }

  return patterns;
}

function detectSentimentPatterns(data: AggregatedData): Pattern[] {
  const patterns: Pattern[] = [];

  const { distribution, trend } = data.sentiments;
  const total = distribution.positive + distribution.negative + distribution.neutral || 1;

  if (distribution.negative / total > 0.3) {
    patterns.push({
      type: 'negative_sentiment_spike',
      description: 'Higher than usual negative sentiment detected',
      frequency: distribution.negative,
      examples: [],
      trend: trend === 'declining' ? 'increasing' : 'stable',
    });
  }

  return patterns;
}

// =============================================================================
// RECOMMENDATION GENERATION NODE
// =============================================================================

async function generateRecommendations(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  const { aggregatedData, patterns, metrics, focusAreas } = state;

  if (!aggregatedData || !metrics) {
    return { processingStage: 'recommendations_skipped' };
  }

  try {
    const recommendations: Recommendation[] = [];

    // Action item follow-ups
    const overdueActions = aggregatedData.actionItems.filter(
      (a) =>
        a.status === 'open' && a.dueDate && a.dueDate < Date.now()
    );
    for (const action of overdueActions.slice(0, 3)) {
      recommendations.push({
        id: `action-${action.id}`,
        type: 'complete_action',
        title: 'Overdue action item',
        description: action.text,
        priority: 'high',
        relatedEventIds: [action.eventId],
      });
    }

    // Contact follow-ups
    const staleContacts = aggregatedData.contacts.filter(
      (c) =>
        c.interactionCount >= 3 &&
        Date.now() - c.lastInteraction > 14 * 24 * 60 * 60 * 1000 // 14 days
    );
    for (const contact of staleContacts.slice(0, 3)) {
      recommendations.push({
        id: `followup-${contact.id}`,
        type: 'follow_up',
        title: `Follow up with ${contact.name}`,
        description: `You haven't interacted with ${contact.name} in a while. Consider reaching out.`,
        priority: 'medium',
      });
    }

    // Meeting optimization
    if (metrics.totalMeetingMinutes > 20 * 60) {
      // More than 20 hours of meetings
      recommendations.push({
        id: 'optimize-meetings',
        type: 'optimize_schedule',
        title: 'Consider optimizing your meeting schedule',
        description: `You spent ${Math.round(metrics.totalMeetingMinutes / 60)} hours in meetings. Consider consolidating or shortening some meetings.`,
        priority: 'low',
      });
    }

    // Topic deep-dive
    const topTopic = metrics.topTopics[0];
    if (topTopic && topTopic.count >= 10) {
      recommendations.push({
        id: `topic-${topTopic.topic}`,
        type: 'review_topic',
        title: `Review your focus on "${topTopic.topic}"`,
        description: `"${topTopic.topic}" has been a major theme. Consider documenting key learnings or decisions.`,
        priority: 'low',
      });
    }

    return {
      recommendations,
      processingStage: 'recommendations_generated',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      processingStage: 'recommendations_failed',
    };
  }
}

// =============================================================================
// SUMMARY GENERATION NODE (LLM-POWERED)
// =============================================================================

async function generateSummary(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  const { aggregatedData, patterns, recommendations, metrics, timeRange } = state;

  if (!aggregatedData || !metrics) {
    return { processingStage: 'summary_skipped' };
  }

  try {
    const llm = createLLMClient();

    // Build context for LLM
    const context = buildSummaryContext(aggregatedData, patterns, metrics, timeRange);

    const systemPrompt = `You are an AI assistant helping users understand their captured conversations and activities.
Generate a concise, friendly summary of their recent activity.
Focus on key highlights, patterns, and actionable insights.
Keep the summary to 2-3 paragraphs.
Use bullet points for highlights.`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(context),
    ]);

    const summaryText = response.content as string;

    // Extract highlights from patterns and recommendations
    const highlights = [
      ...patterns.slice(0, 2).map((p) => p.description),
      ...recommendations.slice(0, 2).map((r) => r.title),
    ];

    // Format period string
    const periodStart = new Date(timeRange.start).toLocaleDateString();
    const periodEnd = new Date(timeRange.end).toLocaleDateString();
    const period = `${periodStart} - ${periodEnd}`;

    const summary: InsightSummary = {
      text: summaryText,
      highlights,
      period,
    };

    return {
      summary,
      processingStage: 'summary_generated',
    };
  } catch (error) {
    // If LLM fails, generate a basic summary
    console.error('[Insights] LLM summary generation failed:', error);

    const fallbackSummary: InsightSummary = {
      text: `Over this period, you captured ${metrics.totalEvents} events, spent ${Math.round(metrics.totalMeetingMinutes / 60)} hours in meetings, and interacted with ${metrics.uniqueContacts} contacts.`,
      highlights: patterns.slice(0, 3).map((p) => p.description),
      period: `${new Date(timeRange.start).toLocaleDateString()} - ${new Date(timeRange.end).toLocaleDateString()}`,
    };

    return {
      summary: fallbackSummary,
      processingStage: 'summary_generated_fallback',
    };
  }
}

function buildSummaryContext(
  data: AggregatedData,
  patterns: Pattern[],
  metrics: InsightMetrics,
  timeRange: { start: number; end: number }
): string {
  const parts: string[] = [];

  parts.push(`Time period: ${new Date(timeRange.start).toLocaleDateString()} to ${new Date(timeRange.end).toLocaleDateString()}`);
  parts.push('');
  parts.push('Key Metrics:');
  parts.push(`- Total events captured: ${metrics.totalEvents}`);
  parts.push(`- Meeting time: ${Math.round(metrics.totalMeetingMinutes / 60)} hours`);
  parts.push(`- Unique contacts: ${metrics.uniqueContacts}`);
  parts.push(`- Action item completion rate: ${Math.round(metrics.actionItemCompletionRate * 100)}%`);
  parts.push(`- Productivity score: ${Math.round(metrics.productivityScore)}/100`);
  parts.push('');

  if (metrics.topTopics.length > 0) {
    parts.push('Top Topics:');
    for (const topic of metrics.topTopics.slice(0, 5)) {
      parts.push(`- ${topic.topic}: ${topic.count} mentions`);
    }
    parts.push('');
  }

  if (patterns.length > 0) {
    parts.push('Detected Patterns:');
    for (const pattern of patterns.slice(0, 5)) {
      parts.push(`- ${pattern.description}`);
    }
    parts.push('');
  }

  parts.push(`Sentiment distribution: ${metrics.sentimentDistribution.positive} positive, ${metrics.sentimentDistribution.neutral} neutral, ${metrics.sentimentDistribution.negative} negative`);

  return parts.join('\n');
}

// =============================================================================
// FINALIZE NODE
// =============================================================================

async function finalizeInsights(
  state: typeof InsightsStateAnnotation.State
): Promise<Partial<typeof InsightsStateAnnotation.State>> {
  return {
    processingStage: 'completed',
  };
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

function routeOnError(
  state: typeof InsightsStateAnnotation.State
): 'finalize' | 'calculate_metrics' {
  if (state.error) {
    console.error('[Insights] Error in pipeline:', state.error);
    return 'finalize';
  }
  return 'calculate_metrics';
}

// =============================================================================
// GRAPH CONSTRUCTION
// =============================================================================

function createInsightsGraph() {
  const workflow = new StateGraph(InsightsStateAnnotation)
    .addNode('aggregate_data', aggregateData)
    .addNode('calculate_metrics', calculateMetrics)
    .addNode('detect_patterns', detectPatterns)
    .addNode('generate_recommendations', generateRecommendations)
    .addNode('generate_summary', generateSummary)
    .addNode('finalize', finalizeInsights)

    .addEdge(START, 'aggregate_data')
    .addConditionalEdges('aggregate_data', routeOnError)
    .addEdge('calculate_metrics', 'detect_patterns')
    .addEdge('detect_patterns', 'generate_recommendations')
    .addEdge('generate_recommendations', 'generate_summary')
    .addEdge('generate_summary', 'finalize')
    .addEdge('finalize', END);

  return workflow.compile();
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Generate insights for a user
 *
 * @example
 * ```typescript
 * const insights = await generateInsights({
 *   userId: 'user_123',
 *   timeRange: {
 *     start: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
 *     end: Date.now(),
 *   },
 *   focusAreas: ['productivity', 'relationships'],
 * });
 * ```
 */
export async function generateInsights(
  request: InsightsRequest
): Promise<InsightsResponse> {
  const graph = createInsightsGraph();

  const initialState: typeof InsightsStateAnnotation.State = {
    userId: request.userId,
    timeRange: request.timeRange,
    focusAreas: request.focusAreas || [],
    aggregatedData: null,
    summary: null,
    patterns: [],
    recommendations: [],
    metrics: null,
    error: null,
    processingStage: 'starting',
  };

  const result = await graph.invoke(initialState);

  if (result.error) {
    throw result.error;
  }

  return {
    summary: result.summary || {
      text: 'Unable to generate summary',
      highlights: [],
      period: `${new Date(request.timeRange.start).toLocaleDateString()} - ${new Date(request.timeRange.end).toLocaleDateString()}`,
    },
    patterns: result.patterns,
    recommendations: result.recommendations,
    metrics: result.metrics || {
      totalEvents: 0,
      totalMeetingMinutes: 0,
      uniqueContacts: 0,
      topTopics: [],
      sentimentDistribution: { positive: 0, negative: 0, neutral: 0 },
      productivityScore: 0,
      actionItemCompletionRate: 0,
    },
    generatedAt: Date.now(),
  };
}

// =============================================================================
// STREAMING INSIGHTS
// =============================================================================

/**
 * Stream insights generation for real-time updates
 */
export async function* streamInsights(
  request: InsightsRequest
): AsyncGenerator<{ stage: string; data: Partial<InsightsResponse> }> {
  const graph = createInsightsGraph();

  const initialState: typeof InsightsStateAnnotation.State = {
    userId: request.userId,
    timeRange: request.timeRange,
    focusAreas: request.focusAreas || [],
    aggregatedData: null,
    summary: null,
    patterns: [],
    recommendations: [],
    metrics: null,
    error: null,
    processingStage: 'starting',
  };

  // Stream through the graph
  for await (const chunk of await graph.stream(initialState)) {
    const [nodeName, state] = Object.entries(chunk)[0] as [string, typeof InsightsStateAnnotation.State];

    yield {
      stage: nodeName,
      data: {
        summary: state.summary || undefined,
        patterns: state.patterns.length > 0 ? state.patterns : undefined,
        recommendations: state.recommendations.length > 0 ? state.recommendations : undefined,
        metrics: state.metrics || undefined,
      },
    };
  }
}
