#!/usr/bin/env npx tsx
/**
 * Demo Data Seeding Orchestration Script
 *
 * Coordinates all demo data seeding for the Brain Platform.
 * Generates events for demo users and outputs them for Convex import.
 *
 * Usage:
 *   npx tsx scripts/seed-demo/index.ts [options]
 *
 * Options:
 *   --users <n>           Number of users to seed (default: 25)
 *   --events-per-user <n> Events per user (default: 500)
 *   --output <path>       Output file path (default: ./demo-events.json)
 *   --dry-run             Just show what would be generated
 *   --neo4j               Also seed Neo4j (not implemented yet)
 *   --clear               Clear existing demo data first (not implemented yet)
 *
 * @version 1.0.0
 * @author Brain Platform Team
 */

import * as fs from 'fs';
import * as path from 'path';

// Import generators and demo users
import {
  DEMO_USERS,
  DemoUser as ImportedDemoUser,
  getUserCountByIndustry,
  getAllIndustries,
} from './demoUsers';

import {
  generateEventsForUser,
  getEventDistribution,
  GeneratedEvent,
  DemoUser as EventDemoUser,
  Industry as EventIndustry,
} from './eventGenerators';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface CommandLineArgs {
  users: number;
  eventsPerUser: number;
  output: string;
  dryRun: boolean;
  neo4j: boolean;
  clear: boolean;
}

interface SeedingStatistics {
  totalUsers: number;
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySourceApp: Record<string, number>;
  dateRange: {
    earliest: Date;
    latest: Date;
  };
  usersProcessed: string[];
  generationTimeMs: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_USERS = 25;
const DEFAULT_EVENTS_PER_USER = 500;
const DEFAULT_OUTPUT = './demo-events.json';
const CONSENT_VERSION = '1.0.0';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parses command line arguments.
 */
function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  const result: CommandLineArgs = {
    users: DEFAULT_USERS,
    eventsPerUser: DEFAULT_EVENTS_PER_USER,
    output: DEFAULT_OUTPUT,
    dryRun: false,
    neo4j: false,
    clear: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--users':
        result.users = parseInt(args[++i], 10);
        if (isNaN(result.users) || result.users < 1) {
          console.error('Error: --users must be a positive integer');
          process.exit(1);
        }
        break;

      case '--events-per-user':
        result.eventsPerUser = parseInt(args[++i], 10);
        if (isNaN(result.eventsPerUser) || result.eventsPerUser < 1) {
          console.error('Error: --events-per-user must be a positive integer');
          process.exit(1);
        }
        break;

      case '--output':
        result.output = args[++i];
        if (!result.output) {
          console.error('Error: --output requires a file path');
          process.exit(1);
        }
        break;

      case '--dry-run':
        result.dryRun = true;
        break;

      case '--neo4j':
        result.neo4j = true;
        break;

      case '--clear':
        result.clear = true;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return result;
}

/**
 * Prints help message.
 */
function printHelp(): void {
  console.log(`
Demo Data Seeding Script for Brain Platform

Usage:
  npx tsx scripts/seed-demo/index.ts [options]

Options:
  --users <n>           Number of users to seed (default: ${DEFAULT_USERS})
  --events-per-user <n> Events per user (default: ${DEFAULT_EVENTS_PER_USER})
  --output <path>       Output file path (default: ${DEFAULT_OUTPUT})
  --dry-run             Just show what would be generated without creating files
  --neo4j               Also seed Neo4j (placeholder for future implementation)
  --clear               Clear existing demo data first (placeholder for future implementation)
  --help, -h            Show this help message

Examples:
  # Generate default demo data
  npx tsx scripts/seed-demo/index.ts

  # Generate 1000 events per user for 10 users
  npx tsx scripts/seed-demo/index.ts --users 10 --events-per-user 1000

  # Dry run to preview generation
  npx tsx scripts/seed-demo/index.ts --dry-run

  # Custom output location
  npx tsx scripts/seed-demo/index.ts --output ./data/my-demo-events.json
`);
}

// =============================================================================
// LOGGING UTILITIES
// =============================================================================

/**
 * Logs a section header.
 */
function logSection(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

/**
 * Logs a progress update.
 */
function logProgress(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Logs a success message.
 */
function logSuccess(message: string): void {
  console.log(`[OK] ${message}`);
}

/**
 * Logs a warning message.
 */
function logWarning(message: string): void {
  console.log(`[WARN] ${message}`);
}

/**
 * Logs an error message.
 */
function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

// =============================================================================
// USER CONVERSION
// =============================================================================

/**
 * Converts an imported DemoUser to the format expected by event generators.
 */
function convertToEventUser(user: ImportedDemoUser): EventDemoUser {
  // Map the industry from demoUsers format to eventGenerators format
  const industryMap: Record<string, EventIndustry> = {
    'Technology': 'technology',
    'Finance': 'finance',
    'Healthcare': 'healthcare',
    'Retail': 'retail',
    'Education': 'education',
    'Legal': 'legal',
    'Creative': 'creative',
    'Real Estate': 'general',
    'Consulting': 'consulting',
    'Manufacturing': 'engineering',
    'Hospitality': 'general',
    'Media': 'creative',
    'Nonprofit': 'general',
    'Startup': 'technology',
    'HR': 'general',
    'Sales': 'general',
    'Public Demo': 'general',
  };

  return {
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    industry: industryMap[user.industry] || 'general',
    timezone: user.timezone,
    consentVersion: CONSENT_VERSION,
  };
}

// =============================================================================
// EVENT GENERATION
// =============================================================================

/**
 * Generates events for all selected users.
 */
function generateAllEvents(
  users: ImportedDemoUser[],
  eventsPerUser: number,
  dryRun: boolean
): { events: GeneratedEvent[]; stats: SeedingStatistics } {
  const startTime = Date.now();
  const allEvents: GeneratedEvent[] = [];
  const usersProcessed: string[] = [];

  logSection('Event Generation');
  logProgress(`Generating ${eventsPerUser} events for ${users.length} users...`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const eventUser = convertToEventUser(user);

    logProgress(`[${i + 1}/${users.length}] Generating events for ${user.name} (${user.industry})...`);

    if (!dryRun) {
      const userEvents = generateEventsForUser(eventUser, eventsPerUser);
      allEvents.push(...userEvents);
    }

    usersProcessed.push(user.clerkUserId);
  }

  // Calculate statistics
  let eventsByType: Record<string, number> = {};
  let eventsBySourceApp: Record<string, number> = {};
  let earliest = new Date();
  let latest = new Date(0);

  if (!dryRun && allEvents.length > 0) {
    eventsBySourceApp = getEventDistribution(allEvents);

    // Calculate event types
    for (const event of allEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

      const eventDate = new Date(event.timestampMs);
      if (eventDate < earliest) earliest = eventDate;
      if (eventDate > latest) latest = eventDate;
    }
  } else if (dryRun) {
    // Estimate distribution for dry run based on the expected percentages
    const totalEvents = users.length * eventsPerUser;
    eventsBySourceApp = {
      browser: Math.round(totalEvents * 0.30),
      calendar: Math.round(totalEvents * 0.20),
      tasks: Math.round(totalEvents * 0.15),
      workouts: Math.round(totalEvents * 0.10),
      sleep: Math.round(totalEvents * 0.10),
      email: Math.round(totalEvents * 0.10),
      social: Math.round(totalEvents * 0.05),
    };
    // For dry run, use current time range estimate
    earliest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    latest = new Date();
  }

  const generationTimeMs = Date.now() - startTime;

  const stats: SeedingStatistics = {
    totalUsers: users.length,
    totalEvents: dryRun ? users.length * eventsPerUser : allEvents.length,
    eventsByType,
    eventsBySourceApp,
    dateRange: { earliest, latest },
    usersProcessed,
    generationTimeMs,
  };

  return { events: allEvents, stats };
}

// =============================================================================
// FILE OUTPUT
// =============================================================================

/**
 * Writes events to a JSON file for Convex import.
 */
function writeEventsToFile(events: GeneratedEvent[], outputPath: string): void {
  logSection('Writing Output File');

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logProgress(`Created directory: ${dir}`);
  }

  // Format for Convex import (JSON Lines format is often preferred for large imports)
  // We'll output both a standard JSON array and a JSONL version
  const absolutePath = path.resolve(outputPath);
  const jsonlPath = absolutePath.replace(/\.json$/, '.jsonl');

  // Write JSON array format
  logProgress(`Writing JSON array to: ${absolutePath}`);
  fs.writeFileSync(absolutePath, JSON.stringify(events, null, 2));
  logSuccess(`Wrote ${events.length} events to ${absolutePath}`);

  // Write JSONL format for streaming imports
  logProgress(`Writing JSONL to: ${jsonlPath}`);
  const jsonlContent = events.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(jsonlPath, jsonlContent);
  logSuccess(`Wrote ${events.length} events to ${jsonlPath}`);

  // Calculate file sizes
  const jsonSize = fs.statSync(absolutePath).size;
  const jsonlSize = fs.statSync(jsonlPath).size;
  logProgress(`JSON file size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);
  logProgress(`JSONL file size: ${(jsonlSize / 1024 / 1024).toFixed(2)} MB`);
}

// =============================================================================
// STATISTICS OUTPUT
// =============================================================================

/**
 * Prints comprehensive seeding statistics.
 */
function printStatistics(stats: SeedingStatistics, dryRun: boolean): void {
  logSection('Seeding Statistics');

  if (dryRun) {
    console.log('\n[DRY RUN - No data was actually generated]\n');
  }

  console.log('Summary:');
  console.log(`  Total Users:        ${stats.totalUsers}`);
  console.log(`  Total Events:       ${stats.totalEvents.toLocaleString()}`);
  console.log(`  Generation Time:    ${(stats.generationTimeMs / 1000).toFixed(2)}s`);
  console.log(`  Events per Second:  ${Math.round(stats.totalEvents / (stats.generationTimeMs / 1000)).toLocaleString()}`);

  console.log('\nEvents by Source App:');
  const sortedSourceApps = Object.entries(stats.eventsBySourceApp).sort((a, b) => b[1] - a[1]);
  for (const [app, count] of sortedSourceApps) {
    const percentage = ((count / stats.totalEvents) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(parseFloat(percentage) / 2));
    console.log(`  ${app.padEnd(12)} ${count.toString().padStart(8)} (${percentage.padStart(5)}%) ${bar}`);
  }

  if (!dryRun && Object.keys(stats.eventsByType).length > 0) {
    console.log('\nTop Event Types:');
    const sortedTypes = Object.entries(stats.eventsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [type, count] of sortedTypes) {
      const percentage = ((count / stats.totalEvents) * 100).toFixed(1);
      console.log(`  ${type.padEnd(30)} ${count.toString().padStart(8)} (${percentage.padStart(5)}%)`);
    }
  }

  console.log('\nDate Range Covered:');
  console.log(`  Earliest:  ${stats.dateRange.earliest.toISOString()}`);
  console.log(`  Latest:    ${stats.dateRange.latest.toISOString()}`);
  const daysCovered = Math.round((stats.dateRange.latest.getTime() - stats.dateRange.earliest.getTime()) / (24 * 60 * 60 * 1000));
  console.log(`  Days:      ${daysCovered}`);

  console.log('\nUsers Processed:');
  const userCountByIndustry = getUserCountByIndustry();
  const industries = getAllIndustries();
  for (const industry of industries) {
    const count = userCountByIndustry.get(industry) || 0;
    console.log(`  ${industry.padEnd(15)} ${count} user${count !== 1 ? 's' : ''}`);
  }
}

// =============================================================================
// NEO4J SEEDING (PLACEHOLDER)
// =============================================================================

/**
 * Seeds Neo4j with demo data (placeholder for future implementation).
 */
async function seedNeo4j(events: GeneratedEvent[]): Promise<void> {
  logSection('Neo4j Seeding');
  logWarning('Neo4j seeding is not yet implemented.');
  logProgress('To implement Neo4j seeding, add Neo4j driver and connection logic.');
  logProgress(`Would seed ${events.length} events to Neo4j.`);
}

// =============================================================================
// CLEAR EXISTING DATA (PLACEHOLDER)
// =============================================================================

/**
 * Clears existing demo data (placeholder for future implementation).
 */
async function clearExistingData(): Promise<void> {
  logSection('Clearing Existing Data');
  logWarning('Clear functionality is not yet implemented.');
  logProgress('To implement clearing, add Convex and Neo4j deletion logic.');
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Main orchestration function.
 */
async function main(): Promise<void> {
  console.log(`
  ____                _         ____  _       _    __
 | __ ) _ __ __ _   _(_)_ __   |  _ \\| | __ _| |_ / _| ___  _ __ _ __ ___
 |  _ \\| '__/ _\` | | | | '_ \\  | |_) | |/ _\` | __| |_ / _ \\| '__| '_ \` _ \\
 | |_) | | | (_| | | | | | | | |  __/| | (_| | |_|  _| (_) | |  | | | | | |
 |____/|_|  \\__,_| |_|_|_| |_| |_|   |_|\\__,_|\\__|_|  \\___/|_|  |_| |_| |_|

  Demo Data Seeding Script
  `);

  // Parse command line arguments
  const args = parseArgs();

  logSection('Configuration');
  console.log(`  Users to seed:      ${args.users}`);
  console.log(`  Events per user:    ${args.eventsPerUser}`);
  console.log(`  Total events:       ${(args.users * args.eventsPerUser).toLocaleString()}`);
  console.log(`  Output file:        ${args.output}`);
  console.log(`  Dry run:            ${args.dryRun}`);
  console.log(`  Seed Neo4j:         ${args.neo4j}`);
  console.log(`  Clear existing:     ${args.clear}`);

  // Validate user count against available demo users
  if (args.users > DEMO_USERS.length) {
    logWarning(`Requested ${args.users} users but only ${DEMO_USERS.length} demo users available.`);
    args.users = DEMO_USERS.length;
    logProgress(`Adjusted to ${args.users} users.`);
  }

  // Select users to process
  const selectedUsers = DEMO_USERS.slice(0, args.users);

  // Clear existing data if requested
  if (args.clear) {
    await clearExistingData();
  }

  // Generate events
  const { events, stats } = generateAllEvents(selectedUsers, args.eventsPerUser, args.dryRun);

  // Write to file if not dry run
  if (!args.dryRun) {
    writeEventsToFile(events, args.output);
  }

  // Seed Neo4j if requested
  if (args.neo4j && !args.dryRun) {
    await seedNeo4j(events);
  }

  // Print statistics
  printStatistics(stats, args.dryRun);

  logSection('Completed');
  if (args.dryRun) {
    logSuccess('Dry run completed. No data was written.');
  } else {
    logSuccess(`Successfully generated ${stats.totalEvents.toLocaleString()} events for ${stats.totalUsers} users.`);
    logProgress(`Import the events using: npx convex import --table events ${path.resolve(args.output)}`);
  }
}

// =============================================================================
// SCRIPT EXECUTION
// =============================================================================

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
