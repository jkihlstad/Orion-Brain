/**
 * Vectorization QA Harness
 *
 * Testing and validation utilities for the vectorization pipeline.
 * Provides sample events, assertions, and end-to-end test scenarios.
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { RawEvent } from '../types/rawEvent';
import {
  createVectorizationPipeline,
  type VectorizationPipeline,
  type VectorizeResult,
} from './pipeline';
import { buildCFD, type CanonicalFeatureDocument } from './cfd';

// =============================================================================
// SAMPLE EVENTS FOR TESTING
// =============================================================================

/**
 * Sample event generator for different event types.
 */
export const SAMPLE_EVENTS: Record<string, () => RawEvent> = {
  'finance.transaction_created': () => ({
    eventId: `test_txn_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    clerkUserId: 'user_test123',
    eventType: 'finance.transaction_created',
    sourceApp: 'ios-finance',
    domain: 'finance',
    timestampMs: Date.now(),
    receivedAtMs: Date.now(),
    privacyScope: 'private',
    consentVersion: '1.0',
    payload: {
      transactionId: `txn_${Date.now()}`,
      amount: 42.50,
      currency: 'USD',
      merchant: 'Coffee Shop',
      merchantNormalized: 'coffee_shop',
      category: 'food_and_drink',
      subcategory: 'coffee',
      type: 'debit',
    },
    blobRefs: [],
    payloadPreview: 'Coffee Shop $42.50',
  }),

  'browser.page_viewed': () => ({
    eventId: `test_page_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    clerkUserId: 'user_test123',
    eventType: 'browser.page_viewed',
    sourceApp: 'ios-browser',
    domain: 'browser',
    timestampMs: Date.now(),
    receivedAtMs: Date.now(),
    privacyScope: 'private',
    consentVersion: '1.0',
    payload: {
      url: 'https://example.com/article/tech-news',
      host: 'example.com',
      title: 'Latest Technology News',
      sessionId: `session_${Date.now()}`,
      durationMs: 30000,
    },
    blobRefs: [],
    payloadPreview: 'Latest Technology News - example.com',
  }),

  'email.message_received': () => ({
    eventId: `test_email_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    clerkUserId: 'user_test123',
    eventType: 'email.message_received',
    sourceApp: 'ios-email',
    domain: 'email',
    timestampMs: Date.now(),
    receivedAtMs: Date.now(),
    privacyScope: 'private',
    consentVersion: '1.0',
    payload: {
      messageId: `msg_${Date.now()}`,
      threadId: `thread_${Date.now()}`,
      subject: 'Meeting Tomorrow at 3pm',
      fromAddress: 'colleague@company.com',
      toAddresses: ['user@example.com'],
      snippetText: 'Hi, can we meet tomorrow at 3pm to discuss the project?',
    },
    blobRefs: [],
    payloadPreview: 'Meeting Tomorrow at 3pm',
  }),

  'task.created': () => ({
    eventId: `test_task_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    clerkUserId: 'user_test123',
    eventType: 'task.created',
    sourceApp: 'ios-productivity',
    domain: 'task',
    timestampMs: Date.now(),
    receivedAtMs: Date.now(),
    privacyScope: 'private',
    consentVersion: '1.0',
    payload: {
      taskId: `task_${Date.now()}`,
      title: 'Review quarterly report',
      description: 'Review and approve the Q4 financial report before Friday',
      priority: 'high',
      status: 'pending',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    },
    blobRefs: [],
    payloadPreview: 'Review quarterly report',
  }),

  'social.post_created': () => ({
    eventId: `test_post_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    clerkUserId: 'user_test123',
    eventType: 'social.post_created',
    sourceApp: 'orion-social',
    domain: 'social',
    timestampMs: Date.now(),
    receivedAtMs: Date.now(),
    privacyScope: 'social',
    consentVersion: '1.0',
    payload: {
      postId: `post_${Date.now()}`,
      postType: 'text',
      textContent: 'Just launched my new project! Check it out at example.com',
      tags: ['launch', 'project', 'tech'],
    },
    blobRefs: [],
    payloadPreview: 'Just launched my new project!',
  }),
};

// =============================================================================
// QA TEST CASES
// =============================================================================

/**
 * QA test case definition.
 */
export interface QATestCase {
  name: string;
  description: string;
  eventType: string;
  expectedOutcome: 'success' | 'skip' | 'fail';
  assertions: (result: VectorizeResult, cfd?: CanonicalFeatureDocument) => AssertionResult[];
}

/**
 * Assertion result.
 */
export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Built-in QA test cases.
 */
export const QA_TEST_CASES: QATestCase[] = [
  {
    name: 'Finance Transaction Vectorization',
    description: 'Verify finance transactions are properly vectorized with merchant entity linking',
    eventType: 'finance.transaction_created',
    expectedOutcome: 'success',
    assertions: (result, cfd) => {
      const assertions: AssertionResult[] = [];

      assertions.push({
        name: 'Event processed successfully',
        passed: result.success === true,
        message: result.success ? 'Success' : `Failed: ${result.error}`,
      });

      assertions.push({
        name: 'Embeddings generated',
        passed: result.embeddingsGenerated > 0,
        message: `Generated ${result.embeddingsGenerated} embeddings`,
      });

      assertions.push({
        name: 'CFD has text summary',
        passed: !!cfd?.textSummary && cfd.textSummary.length > 0,
        message: cfd?.textSummary ? `Summary: ${cfd.textSummary.slice(0, 100)}...` : 'No summary',
      });

      assertions.push({
        name: 'CFD has merchant entity ref',
        passed: cfd?.entityRefs.some((e) => e.type === 'merchant') ?? false,
        message: `Entity refs: ${cfd?.entityRefs.map((e) => e.type).join(', ') || 'none'}`,
      });

      assertions.push({
        name: 'CFD has amount facet',
        passed: (cfd?.facets.amounts?.amount ?? 0) > 0,
        message: `Amount: ${cfd?.facets.amounts?.amount}`,
      });

      return assertions;
    },
  },

  {
    name: 'Browser Page View Vectorization',
    description: 'Verify browser page views extract URL, title, and domain entities',
    eventType: 'browser.page_viewed',
    expectedOutcome: 'success',
    assertions: (result, cfd) => {
      const assertions: AssertionResult[] = [];

      assertions.push({
        name: 'Event processed successfully',
        passed: result.success === true,
        message: result.success ? 'Success' : `Failed: ${result.error}`,
      });

      assertions.push({
        name: 'Domain extracted correctly',
        passed: cfd?.domain === 'browser',
        message: `Domain: ${cfd?.domain}`,
      });

      assertions.push({
        name: 'Keywords extracted',
        passed: (cfd?.keywords.length ?? 0) > 0,
        message: `Keywords: ${cfd?.keywords.slice(0, 5).join(', ')}`,
      });

      return assertions;
    },
  },

  {
    name: 'Email Message Vectorization',
    description: 'Verify email messages extract thread/message IDs and text content',
    eventType: 'email.message_received',
    expectedOutcome: 'success',
    assertions: (result, cfd) => {
      const assertions: AssertionResult[] = [];

      assertions.push({
        name: 'Event processed successfully',
        passed: result.success === true,
        message: result.success ? 'Success' : `Failed: ${result.error}`,
      });

      assertions.push({
        name: 'Privacy scope is private',
        passed: cfd?.privacyScope === 'private',
        message: `Privacy: ${cfd?.privacyScope}`,
      });

      assertions.push({
        name: 'Text summary contains subject',
        passed: cfd?.textSummary.includes('Meeting') ?? false,
        message: `Contains email subject: ${cfd?.textSummary.includes('Meeting')}`,
      });

      return assertions;
    },
  },

  {
    name: 'Social Post Vectorization',
    description: 'Verify social posts are vectorized with social privacy scope',
    eventType: 'social.post_created',
    expectedOutcome: 'success',
    assertions: (result, cfd) => {
      const assertions: AssertionResult[] = [];

      assertions.push({
        name: 'Event processed successfully',
        passed: result.success === true,
        message: result.success ? 'Success' : `Failed: ${result.error}`,
      });

      assertions.push({
        name: 'Privacy scope is social',
        passed: cfd?.privacyScope === 'social',
        message: `Privacy: ${cfd?.privacyScope}`,
      });

      assertions.push({
        name: 'Tags extracted as keywords',
        passed: cfd?.keywords.some((k) => ['launch', 'project', 'tech'].includes(k)) ?? false,
        message: `Keywords include tags: ${cfd?.keywords.slice(0, 5).join(', ')}`,
      });

      return assertions;
    },
  },
];

// =============================================================================
// QA HARNESS
// =============================================================================

/**
 * QA test result.
 */
export interface QATestResult {
  testCase: string;
  passed: boolean;
  assertions: AssertionResult[];
  vectorizeResult?: VectorizeResult;
  durationMs: number;
}

/**
 * QA suite result.
 */
export interface QASuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  results: QATestResult[];
  durationMs: number;
}

/**
 * QA Harness for testing vectorization.
 */
export class QAHarness {
  private env: Env;
  private pipeline: VectorizationPipeline | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Run a single test case.
   */
  async runTest(testCase: QATestCase): Promise<QATestResult> {
    const startTime = Date.now();

    // Generate sample event
    const eventGenerator = SAMPLE_EVENTS[testCase.eventType];
    if (!eventGenerator) {
      return {
        testCase: testCase.name,
        passed: false,
        assertions: [{
          name: 'Event generator exists',
          passed: false,
          message: `No sample event generator for type: ${testCase.eventType}`,
        }],
        durationMs: Date.now() - startTime,
      };
    }

    const event = eventGenerator();

    // Initialize pipeline if needed
    if (!this.pipeline) {
      this.pipeline = createVectorizationPipeline(this.env);
      await this.pipeline.initialize();
    }

    // Build CFD for assertions
    const policyConfig = this.pipeline.getPolicy();
    const cfd = buildCFD(event, policyConfig);

    // Vectorize the event
    const result = await this.pipeline.vectorizeEvent(event);

    // Run assertions
    const assertions = testCase.assertions(result, cfd);
    const passed = assertions.every((a) => a.passed);

    return {
      testCase: testCase.name,
      passed,
      assertions,
      vectorizeResult: result,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Run all test cases.
   */
  async runAllTests(testCases: QATestCase[] = QA_TEST_CASES): Promise<QASuiteResult> {
    const startTime = Date.now();
    const results: QATestResult[] = [];

    for (const testCase of testCases) {
      console.log(`[QAHarness] Running: ${testCase.name}`);
      const result = await this.runTest(testCase);
      results.push(result);
      console.log(`[QAHarness] ${result.passed ? 'PASSED' : 'FAILED'}: ${testCase.name}`);
    }

    const passed = results.filter((r) => r.passed).length;

    return {
      totalTests: results.length,
      passed,
      failed: results.length - passed,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a test report.
   */
  generateReport(suiteResult: QASuiteResult): string {
    const lines: string[] = [];

    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║              VECTORIZATION QA TEST REPORT                   ║');
    lines.push('╠════════════════════════════════════════════════════════════╣');
    lines.push(`║ Total Tests: ${suiteResult.totalTests.toString().padEnd(46)}║`);
    lines.push(`║ Passed: ${suiteResult.passed.toString().padEnd(51)}║`);
    lines.push(`║ Failed: ${suiteResult.failed.toString().padEnd(51)}║`);
    lines.push(`║ Duration: ${suiteResult.durationMs}ms`.padEnd(62) + '║');
    lines.push('╠════════════════════════════════════════════════════════════╣');

    for (const result of suiteResult.results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      lines.push(`║ ${status} │ ${result.testCase.slice(0, 50).padEnd(50)}║`);

      for (const assertion of result.assertions) {
        const assertStatus = assertion.passed ? '  ✓' : '  ✗';
        lines.push(`║    ${assertStatus} ${assertion.name.slice(0, 54).padEnd(54)}║`);
      }

      lines.push('╟────────────────────────────────────────────────────────────╢');
    }

    lines.push('╚════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }
}

/**
 * Create a QA harness instance.
 */
export function createQAHarness(env: Env): QAHarness {
  return new QAHarness(env);
}

/**
 * Run quick validation of the vectorization system.
 */
export async function runQuickValidation(env: Env): Promise<{
  success: boolean;
  message: string;
  details?: QASuiteResult;
}> {
  try {
    const harness = createQAHarness(env);
    const result = await harness.runAllTests();

    if (result.failed > 0) {
      return {
        success: false,
        message: `QA validation failed: ${result.failed}/${result.totalTests} tests failed`,
        details: result,
      };
    }

    return {
      success: true,
      message: `QA validation passed: ${result.passed}/${result.totalTests} tests passed`,
      details: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `QA validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
