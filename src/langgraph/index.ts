/**
 * Neural Intelligence Platform - LangGraph Module Index
 *
 * Exports all LangGraph workflow components.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

export {
  // Graph and workflow
  createBrainGraph,
  brainGraph,
  processEvent,
  processEvents,

  // State and configuration
  BrainStateAnnotation,
  DEFAULT_CONFIG,

  // Stores
  idempotencyStore,
  deadLetterQueue,
} from './graph';

export type {
  BrainState,
  BrainGraphConfig,
  ConvexEvent,
  Enrichments,
  StorageResults,
  GraphResults,
  ProcessingResult,
  ActionItem,
  Decision,
  SpeakerStat,
} from './graph';
