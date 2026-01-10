/**
 * Neural Intelligence Platform - iOS Ingestion API
 *
 * API endpoints for iOS Edge App media ingestion. Handles:
 * - Single media ingestion from iOS app
 * - Batch ingestion for multiple tasks
 * - Task status checking
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Middleware
import { clerkAuth, getUserId } from '../middleware/clerkAuth';

// LangGraph workflow
import { processEvent } from '../langgraph/graph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Media types supported for iOS ingestion
 */
export type iOSMediaType = 'audio' | 'video' | 'image' | 'text' | 'browser_session';

/**
 * Task types for iOS processing
 */
export type iOSTaskType =
  | 'media_ingest'
  | 'embedding_generate'
  | 'transcription'
  | 'ocr'
  | 'speaker_diarization';

/**
 * iOS ingestion request payload
 */
export interface iOSIngestPayload {
  mediaType: iOSMediaType;
  filePath: string;
  userId: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
  privacyScope?: 'private' | 'social' | 'public';
}

/**
 * iOS ingestion request
 */
export interface iOSIngestRequest {
  taskId: string;
  taskType: iOSTaskType;
  payload: iOSIngestPayload;
}

/**
 * iOS ingestion response
 */
export interface iOSIngestResponse {
  success: boolean;
  output?: {
    vector?: number[];
    metadata?: Record<string, unknown>;
    eventId?: string;
    lanceDbRowId?: string;
  };
  error?: string;
  taskId: string;
}

/**
 * Batch ingestion request
 */
export interface iOSBatchIngestRequest {
  tasks: iOSIngestRequest[];
}

/**
 * Batch ingestion response
 */
export interface iOSBatchIngestResponse {
  success: boolean;
  results: iOSIngestResponse[];
  totalSucceeded: number;
  totalFailed: number;
}

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Task status response
 */
export interface TaskStatusResponse {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  result?: iOSIngestResponse['output'];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

const iOSMediaTypeSchema = z.enum(['audio', 'video', 'image', 'text', 'browser_session']);

const iOSTaskTypeSchema = z.enum([
  'media_ingest',
  'embedding_generate',
  'transcription',
  'ocr',
  'speaker_diarization',
]);

const iOSIngestPayloadSchema = z.object({
  mediaType: iOSMediaTypeSchema,
  filePath: z.string().min(1, 'filePath is required'),
  userId: z.string().min(1, 'userId is required'),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number().optional(),
  privacyScope: z.enum(['private', 'social', 'public']).optional().default('private'),
});

const iOSIngestRequestSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  taskType: iOSTaskTypeSchema,
  payload: iOSIngestPayloadSchema,
});

const iOSBatchIngestRequestSchema = z.object({
  tasks: z.array(iOSIngestRequestSchema).min(1, 'At least one task is required').max(100, 'Maximum 100 tasks per batch'),
});

// =============================================================================
// IN-MEMORY TASK STORE (Replace with Redis in production)
// =============================================================================

interface TaskRecord {
  taskId: string;
  status: TaskStatus;
  progress: number;
  result?: iOSIngestResponse['output'];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const taskStore = new Map<string, TaskRecord>();

// Cleanup old tasks periodically (keep for 24 hours)
const TASK_TTL_MS = 24 * 60 * 60 * 1000;

function cleanupOldTasks(): void {
  const now = Date.now();
  for (const [taskId, task] of taskStore.entries()) {
    if (now - task.createdAt > TASK_TTL_MS) {
      taskStore.delete(taskId);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupOldTasks, 60 * 60 * 1000);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Update task status in store
 */
function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  updates: Partial<TaskRecord> = {}
): void {
  const existing = taskStore.get(taskId);
  const now = Date.now();

  taskStore.set(taskId, {
    taskId,
    status,
    progress: updates.progress ?? existing?.progress ?? 0,
    result: updates.result ?? existing?.result,
    error: updates.error ?? existing?.error,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

/**
 * Convert iOS media type to common EventType
 */
function mediaTypeToEventType(mediaType: iOSMediaType): string {
  switch (mediaType) {
    case 'audio':
      return 'audio_segment';
    case 'video':
      return 'video_segment';
    case 'image':
      return 'image_frame';
    case 'text':
      return 'text_event';
    case 'browser_session':
      return 'browser_session';
    default:
      return 'text_event';
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * POST /v1/brain/ios/ingest
 * Accept media ingestion from iOS app
 */
async function handleIngest(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = iOSIngestRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        taskId: req.body?.taskId || 'unknown',
      } as iOSIngestResponse);
      return;
    }

    const { taskId, taskType: _taskType, payload } = validationResult.data;
    void _taskType; // Currently unused, reserved for future task-type-specific processing
    const authenticatedUserId = getUserId(req);

    // Verify the payload userId matches the authenticated user
    if (payload.userId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        error: 'User ID in payload does not match authenticated user',
        taskId,
      } as iOSIngestResponse);
      return;
    }

    // Initialize task in store
    updateTaskStatus(taskId, 'processing', { progress: 0 });

    // Generate event ID
    const eventId = uuidv4();
    const timestamp = payload.timestamp || Date.now();

    try {
      // Process based on task type
      updateTaskStatus(taskId, 'processing', { progress: 25 });

      // Queue for async processing via LangGraph
      setImmediate(async () => {
        try {
          await processEvent(eventId);
          updateTaskStatus(taskId, 'completed', {
            progress: 100,
            result: {
              eventId,
              metadata: {
                mediaType: payload.mediaType,
                processedAt: Date.now(),
              },
            },
          });
        } catch (error) {
          updateTaskStatus(taskId, 'failed', {
            error: error instanceof Error ? error.message : 'Processing failed',
          });
        }
      });

      // Return immediate response with task queued
      const response: iOSIngestResponse = {
        success: true,
        output: {
          eventId,
          metadata: {
            mediaType: payload.mediaType,
            eventType: mediaTypeToEventType(payload.mediaType),
            timestamp,
            status: 'queued',
          },
        },
        taskId,
      };

      res.status(202).json(response);
    } catch (error) {
      updateTaskStatus(taskId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
        taskId,
      } as iOSIngestResponse);
    }
  } catch (error) {
    console.error('[iOS Ingest] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      taskId: req.body?.taskId || 'unknown',
    } as iOSIngestResponse);
  }
}

/**
 * POST /v1/brain/ios/batch
 * Batch ingestion for multiple tasks
 */
async function handleBatchIngest(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = iOSBatchIngestRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        results: [],
        totalSucceeded: 0,
        totalFailed: 0,
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return;
    }

    const { tasks } = validationResult.data;
    const authenticatedUserId = getUserId(req);
    const results: iOSIngestResponse[] = [];
    let totalSucceeded = 0;
    let totalFailed = 0;

    // Process each task
    for (const task of tasks) {
      const { taskId, taskType: _batchTaskType, payload } = task;
      void _batchTaskType; // Currently unused, reserved for future task-type-specific processing

      // Verify user ID matches for each task
      if (payload.userId !== authenticatedUserId) {
        results.push({
          success: false,
          error: 'User ID in payload does not match authenticated user',
          taskId,
        });
        totalFailed++;
        continue;
      }

      try {
        // Initialize task
        updateTaskStatus(taskId, 'processing', { progress: 0 });

        const eventId = uuidv4();
        const timestamp = payload.timestamp || Date.now();

        // Queue for async processing
        setImmediate(async () => {
          try {
            await processEvent(eventId);
            updateTaskStatus(taskId, 'completed', {
              progress: 100,
              result: { eventId, metadata: { mediaType: payload.mediaType } },
            });
          } catch (error) {
            updateTaskStatus(taskId, 'failed', {
              error: error instanceof Error ? error.message : 'Processing failed',
            });
          }
        });

        results.push({
          success: true,
          output: {
            eventId,
            metadata: {
              mediaType: payload.mediaType,
              eventType: mediaTypeToEventType(payload.mediaType),
              timestamp,
              status: 'queued',
            },
          },
          taskId,
        });
        totalSucceeded++;
      } catch (error) {
        updateTaskStatus(taskId, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed',
          taskId,
        });
        totalFailed++;
      }
    }

    const response: iOSBatchIngestResponse = {
      success: totalFailed === 0,
      results,
      totalSucceeded,
      totalFailed,
    };

    res.status(202).json(response);
  } catch (error) {
    console.error('[iOS Batch Ingest] Error:', error);
    res.status(500).json({
      success: false,
      results: [],
      totalSucceeded: 0,
      totalFailed: 0,
      error: 'Internal server error',
    });
  }
}

/**
 * GET /v1/brain/ios/status/:taskId
 * Check task processing status
 */
async function handleTaskStatus(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'taskId is required',
        },
      });
      return;
    }

    const task = taskStore.get(taskId);

    if (!task) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Task ${taskId} not found`,
        },
      });
      return;
    }

    const response: TaskStatusResponse = {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    res.json(response);
  } catch (error) {
    console.error('[iOS Status] Error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get task status',
      },
    });
  }
}

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create iOS ingestion router with Clerk authentication
 */
export function createiOSIngestRouter(): Router {
  const router = Router();

  // Apply Clerk authentication to all routes
  router.use(clerkAuth({
    skipPaths: [], // All paths require auth
  }));

  // POST /v1/brain/ios/ingest - Single media ingestion
  router.post('/ingest', handleIngest as express.RequestHandler);

  // POST /v1/brain/ios/batch - Batch ingestion
  router.post('/batch', handleBatchIngest as express.RequestHandler);

  // GET /v1/brain/ios/status/:taskId - Check task status
  router.get('/status/:taskId', handleTaskStatus as express.RequestHandler);

  return router;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  handleIngest,
  handleBatchIngest,
  handleTaskStatus,
  iOSIngestRequestSchema,
  iOSBatchIngestRequestSchema,
};
