/**
 * Neo4j Demo Data Seeding Script
 *
 * Seeds the Neo4j graph database with demo users, contacts, speaker clusters,
 * events, and their relationships.
 *
 * Usage: npx tsx scripts/seed-demo/seedNeo4j.ts
 *
 * Environment Variables:
 * - NEO4J_HTTP_URL: Neo4j Query API URL (e.g., https://xxx.databases.neo4j.io/db/neo4j/query/v2)
 * - NEO4J_USER: Neo4j username
 * - NEO4J_PASS: Neo4j password
 *
 * @version 1.0.0
 */

import { DEMO_USERS, type DemoUser } from './demoUsers';
import { v7 as uuidv7 } from 'uuid';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface Neo4jEnv {
  NEO4J_HTTP_URL: string;
  NEO4J_USER: string;
  NEO4J_PASS: string;
}

/**
 * Loads environment variables for Neo4j connection.
 */
function loadEnv(): Neo4jEnv {
  const NEO4J_HTTP_URL = process.env.NEO4J_HTTP_URL;
  const NEO4J_USER = process.env.NEO4J_USER;
  const NEO4J_PASS = process.env.NEO4J_PASS;

  if (!NEO4J_HTTP_URL || !NEO4J_USER || !NEO4J_PASS) {
    throw new Error(
      'Missing required environment variables: NEO4J_HTTP_URL, NEO4J_USER, NEO4J_PASS'
    );
  }

  return { NEO4J_HTTP_URL, NEO4J_USER, NEO4J_PASS };
}

// =============================================================================
// NEO4J HTTP API CLIENT
// =============================================================================

/**
 * Executes a Cypher query against Neo4j using the HTTP Query API.
 */
async function neo4jRun(
  env: Neo4jEnv,
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const auth = Buffer.from(`${env.NEO4J_USER}:${env.NEO4J_PASS}`).toString('base64');

  const res = await fetch(env.NEO4J_HTTP_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      statement: cypher,
      parameters: params,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Neo4j query failed: ${res.status} - ${errorText}`);
  }

  return res.json();
}

// =============================================================================
// DATA GENERATORS
// =============================================================================

/**
 * Realistic first names for contact generation.
 */
const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon',
  'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy',
  'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda',
  'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen',
];

/**
 * Realistic last names for contact generation.
 */
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
  'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
];

/**
 * Relationship types for contacts.
 */
const RELATIONSHIP_TYPES = [
  'colleague', 'manager', 'direct_report', 'client', 'vendor',
  'friend', 'family', 'mentor', 'mentee', 'partner',
  'acquaintance', 'professional_contact', 'investor', 'advisor',
];

/**
 * Contact categories based on user industry.
 */
const INDUSTRY_CONTACT_CATEGORIES: Record<string, string[]> = {
  Technology: ['Engineering', 'Product', 'Design', 'DevOps', 'Data Science', 'Management'],
  Finance: ['Trading', 'Risk', 'Compliance', 'Investment', 'Operations', 'Client Services'],
  Healthcare: ['Clinical', 'Research', 'Administration', 'Nursing', 'Pharmacy', 'Specialists'],
  Retail: ['Sales', 'Marketing', 'Operations', 'Supply Chain', 'Customer Service', 'Merchandising'],
  Education: ['Faculty', 'Administration', 'Research', 'Student Services', 'IT', 'Library'],
  Legal: ['Litigation', 'Corporate', 'Compliance', 'Paralegal', 'Contracts', 'IP'],
  Creative: ['Design', 'Art Direction', 'Copywriting', 'Production', 'Strategy', 'Account Management'],
  'Real Estate': ['Sales', 'Leasing', 'Property Management', 'Development', 'Appraisal', 'Finance'],
  Consulting: ['Strategy', 'Operations', 'Technology', 'Finance', 'HR', 'Marketing'],
  Manufacturing: ['Engineering', 'Quality', 'Production', 'Supply Chain', 'Safety', 'Maintenance'],
  Hospitality: ['Front Desk', 'Food & Beverage', 'Housekeeping', 'Events', 'Management', 'Sales'],
  Media: ['Editorial', 'Production', 'Marketing', 'Distribution', 'Digital', 'Advertising'],
  Nonprofit: ['Programs', 'Development', 'Communications', 'Volunteer', 'Finance', 'Executive'],
  Startup: ['Engineering', 'Product', 'Marketing', 'Sales', 'Operations', 'Investors'],
  HR: ['Recruiting', 'Benefits', 'Training', 'Compliance', 'Employee Relations', 'Payroll'],
  Sales: ['Inside Sales', 'Field Sales', 'Account Management', 'Sales Ops', 'Business Development', 'Support'],
  'Public Demo': ['General', 'Demo', 'Support', 'Product', 'Engineering'],
};

/**
 * Event types for sample events.
 */
const EVENT_TYPES = [
  'meeting.started', 'meeting.ended', 'call.completed', 'message.sent',
  'document.created', 'task.completed', 'calendar.event_created',
  'email.received', 'browser.page_visit', 'voice.recording_completed',
];

/**
 * Source apps for sample events.
 */
const SOURCE_APPS = ['calendar', 'email', 'browser', 'voice', 'tasks', 'social'];

/**
 * Picks a random item from an array.
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Picks multiple unique random items from an array.
 */
function randomPickMultiple<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * Generates a random number within a range.
 */
function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a timestamp within the past N days.
 */
function generatePastTimestamp(daysAgo: number = 90): number {
  const now = Date.now();
  const offset = Math.random() * daysAgo * 24 * 60 * 60 * 1000;
  return now - offset;
}

// =============================================================================
// CONTACT GENERATION
// =============================================================================

interface GeneratedContact {
  contactId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  relationship: string;
  category: string;
  notes: string | null;
  firstInteraction: number;
  lastInteraction: number;
  interactionCount: number;
}

/**
 * Generates contacts for a user.
 */
function generateContactsForUser(user: DemoUser, count: number): GeneratedContact[] {
  const contacts: GeneratedContact[] = [];
  const usedNames = new Set<string>();
  const categories = INDUSTRY_CONTACT_CATEGORIES[user.industry] || INDUSTRY_CONTACT_CATEGORIES['Public Demo'];

  for (let i = 0; i < count; i++) {
    // Generate unique name
    let firstName: string;
    let lastName: string;
    let fullName: string;

    do {
      firstName = randomPick(FIRST_NAMES);
      lastName = randomPick(LAST_NAMES);
      fullName = `${firstName} ${lastName}`;
    } while (usedNames.has(fullName));

    usedNames.add(fullName);

    const hasEmail = Math.random() > 0.2; // 80% have email
    const hasPhone = Math.random() > 0.5; // 50% have phone
    const hasNotes = Math.random() > 0.6; // 40% have notes

    const firstInteraction = generatePastTimestamp(180);
    const lastInteraction = generatePastTimestamp(30);

    contacts.push({
      contactId: `contact_${user.clerkUserId}_${uuidv7()}`,
      userId: user.clerkUserId,
      displayName: fullName,
      email: hasEmail
        ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomPick(['company.com', 'client.org', 'partner.io', 'vendor.net', 'firm.com'])}`
        : null,
      phone: hasPhone
        ? `+1${randomRange(200, 999)}${randomRange(100, 999)}${randomRange(1000, 9999)}`
        : null,
      relationship: randomPick(RELATIONSHIP_TYPES),
      category: randomPick(categories),
      notes: hasNotes
        ? `Met at ${randomPick(['conference', 'meeting', 'intro call', 'networking event', 'project kickoff'])}`
        : null,
      firstInteraction,
      lastInteraction: Math.max(firstInteraction, lastInteraction),
      interactionCount: randomRange(1, 50),
    });
  }

  return contacts;
}

// =============================================================================
// SPEAKER CLUSTER GENERATION
// =============================================================================

interface GeneratedSpeakerCluster {
  clusterId: string;
  userId: string;
  label: string | null;
  isUserVoice: boolean;
  segmentCount: number;
  totalDuration: number;
  qualityScore: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Generates speaker clusters for a user.
 */
function generateSpeakerClustersForUser(
  user: DemoUser,
  contacts: GeneratedContact[],
  clusterCount: number
): GeneratedSpeakerCluster[] {
  const clusters: GeneratedSpeakerCluster[] = [];

  // First cluster is always the user's own voice
  const userFirstSeen = generatePastTimestamp(90);
  const userLastSeen = generatePastTimestamp(7);

  clusters.push({
    clusterId: `cluster_${user.clerkUserId}_self_${uuidv7()}`,
    userId: user.clerkUserId,
    label: 'Me',
    isUserVoice: true,
    segmentCount: randomRange(100, 500),
    totalDuration: randomRange(3600, 36000), // 1-10 hours
    qualityScore: 0.85 + Math.random() * 0.15,
    firstSeen: userFirstSeen,
    lastSeen: Math.max(userFirstSeen, userLastSeen),
  });

  // Generate additional clusters for contacts
  const contactsToLink = randomPickMultiple(contacts, Math.min(clusterCount - 1, contacts.length));

  for (const contact of contactsToLink) {
    const firstSeen = generatePastTimestamp(90);
    const lastSeen = generatePastTimestamp(14);

    clusters.push({
      clusterId: `cluster_${user.clerkUserId}_${uuidv7()}`,
      userId: user.clerkUserId,
      label: contact.displayName,
      isUserVoice: false,
      segmentCount: randomRange(5, 100),
      totalDuration: randomRange(300, 7200), // 5 min to 2 hours
      qualityScore: 0.6 + Math.random() * 0.35,
      firstSeen,
      lastSeen: Math.max(firstSeen, lastSeen),
    });
  }

  // Add some unlabeled clusters
  const unlabeledCount = randomRange(0, 2);
  for (let i = 0; i < unlabeledCount; i++) {
    const firstSeen = generatePastTimestamp(60);
    const lastSeen = generatePastTimestamp(14);

    clusters.push({
      clusterId: `cluster_${user.clerkUserId}_unknown_${uuidv7()}`,
      userId: user.clerkUserId,
      label: null, // Unlabeled
      isUserVoice: false,
      segmentCount: randomRange(2, 20),
      totalDuration: randomRange(60, 1800), // 1-30 min
      qualityScore: 0.4 + Math.random() * 0.3,
      firstSeen,
      lastSeen: Math.max(firstSeen, lastSeen),
    });
  }

  return clusters;
}

// =============================================================================
// EVENT GENERATION
// =============================================================================

interface GeneratedEvent {
  eventId: string;
  userId: string;
  eventType: string;
  sourceApp: string;
  privacyScope: string;
  timestamp: number;
  summary: string;
  lancedbTable: string;
  lancedbRowId: string;
}

/**
 * Generates sample events for a user.
 */
function generateEventsForUser(user: DemoUser, count: number): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];

  const eventSummaries: Record<string, string[]> = {
    'meeting.started': ['Team standup', 'Client call', 'Project review', '1:1 with manager', 'Sprint planning'],
    'meeting.ended': ['Finished team meeting', 'Completed client call', 'Wrapped up review session'],
    'call.completed': ['Sales call completed', 'Support call resolved', 'Partner discussion'],
    'message.sent': ['Sent project update', 'Shared document', 'Replied to inquiry'],
    'document.created': ['Created proposal', 'Drafted report', 'New presentation'],
    'task.completed': ['Finished code review', 'Completed analysis', 'Submitted deliverable'],
    'calendar.event_created': ['Scheduled meeting', 'Blocked focus time', 'Set reminder'],
    'email.received': ['New client inquiry', 'Project feedback', 'Team update'],
    'browser.page_visit': ['Research session', 'Documentation review', 'News reading'],
    'voice.recording_completed': ['Meeting recording', 'Voice memo', 'Interview recording'],
  };

  for (let i = 0; i < count; i++) {
    const eventType = randomPick(EVENT_TYPES);
    const timestamp = generatePastTimestamp(30);

    events.push({
      eventId: `event_${user.clerkUserId}_${uuidv7()}`,
      userId: user.clerkUserId,
      eventType,
      sourceApp: randomPick(SOURCE_APPS),
      privacyScope: randomPick(['private', 'social', 'public']),
      timestamp,
      summary: randomPick(eventSummaries[eventType] || ['Activity recorded']),
      lancedbTable: 'events_v1',
      lancedbRowId: uuidv7(),
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// =============================================================================
// SEEDING FUNCTIONS
// =============================================================================

/**
 * Creates a User node in Neo4j.
 */
async function seedUser(env: Neo4jEnv, user: DemoUser): Promise<void> {
  const cypher = `
    MERGE (u:User {userId: $userId})
    ON CREATE SET
      u.email = $email,
      u.displayName = $displayName,
      u.industry = $industry,
      u.role = $role,
      u.timezone = $timezone,
      u.createdAt = $createdAt,
      u.schemaVersion = 1
    ON MATCH SET
      u.email = $email,
      u.displayName = $displayName,
      u.industry = $industry,
      u.role = $role,
      u.timezone = $timezone,
      u.schemaVersion = 1
    RETURN u.userId AS userId
  `;

  await neo4jRun(env, cypher, {
    userId: user.clerkUserId,
    email: user.email,
    displayName: user.name,
    industry: user.industry,
    role: user.role,
    timezone: user.timezone,
    createdAt: user.createdAt.getTime(),
  });
}

/**
 * Creates a Contact node and HAS_CONTACT relationship.
 */
async function seedContact(env: Neo4jEnv, contact: GeneratedContact): Promise<void> {
  const cypher = `
    MATCH (u:User {userId: $userId})
    MERGE (c:Contact {contactId: $contactId})
    ON CREATE SET
      c.userId = $userId,
      c.displayName = $displayName,
      c.email = $email,
      c.phone = $phone,
      c.relationship = $relationship,
      c.category = $category,
      c.notes = $notes,
      c.firstInteraction = $firstInteraction,
      c.lastInteraction = $lastInteraction,
      c.interactionCount = $interactionCount,
      c.isVerified = false,
      c.schemaVersion = 1,
      c.createdAt = timestamp()
    ON MATCH SET
      c.displayName = $displayName,
      c.email = $email,
      c.phone = $phone,
      c.relationship = $relationship,
      c.category = $category,
      c.notes = $notes,
      c.lastInteraction = $lastInteraction,
      c.interactionCount = $interactionCount,
      c.schemaVersion = 1
    MERGE (u)-[:HAS_CONTACT]->(c)
    RETURN c.contactId AS contactId
  `;

  await neo4jRun(env, cypher, {
    userId: contact.userId,
    contactId: contact.contactId,
    displayName: contact.displayName,
    email: contact.email,
    phone: contact.phone,
    relationship: contact.relationship,
    category: contact.category,
    notes: contact.notes,
    firstInteraction: contact.firstInteraction,
    lastInteraction: contact.lastInteraction,
    interactionCount: contact.interactionCount,
  });
}

/**
 * Creates a SpeakerCluster node and HAS_SPEAKER_CLUSTER relationship.
 */
async function seedSpeakerCluster(env: Neo4jEnv, cluster: GeneratedSpeakerCluster): Promise<void> {
  // Generate a dummy centroid vector (128 dimensions for speaker embeddings)
  const centroidVector = Array.from({ length: 128 }, () => Math.random() * 2 - 1);

  const cypher = `
    MATCH (u:User {userId: $userId})
    MERGE (sc:SpeakerCluster {clusterId: $clusterId})
    ON CREATE SET
      sc.userId = $userId,
      sc.label = $label,
      sc.isUserVoice = $isUserVoice,
      sc.segmentCount = $segmentCount,
      sc.totalDuration = $totalDuration,
      sc.qualityScore = $qualityScore,
      sc.firstSeen = $firstSeen,
      sc.lastSeen = $lastSeen,
      sc.centroidVectorJson = $centroidVectorJson,
      sc.isLabeled = $isLabeled,
      sc.schemaVersion = 1,
      sc.createdAt = timestamp()
    ON MATCH SET
      sc.label = $label,
      sc.segmentCount = $segmentCount,
      sc.totalDuration = $totalDuration,
      sc.qualityScore = $qualityScore,
      sc.lastSeen = $lastSeen,
      sc.isLabeled = $isLabeled,
      sc.schemaVersion = 1
    MERGE (u)-[r:HAS_SPEAKER_CLUSTER]->(sc)
    ON CREATE SET
      r.createdAt = timestamp(),
      r.creationMethod = 'auto_clustering'
    RETURN sc.clusterId AS clusterId
  `;

  await neo4jRun(env, cypher, {
    userId: cluster.userId,
    clusterId: cluster.clusterId,
    label: cluster.label,
    isUserVoice: cluster.isUserVoice,
    segmentCount: cluster.segmentCount,
    totalDuration: cluster.totalDuration,
    qualityScore: cluster.qualityScore,
    firstSeen: cluster.firstSeen,
    lastSeen: cluster.lastSeen,
    centroidVectorJson: JSON.stringify(centroidVector),
    isLabeled: cluster.label !== null,
  });
}

/**
 * Creates a RESOLVES_TO relationship between SpeakerCluster and Contact.
 */
async function seedClusterContactResolution(
  env: Neo4jEnv,
  cluster: GeneratedSpeakerCluster,
  contacts: GeneratedContact[]
): Promise<void> {
  if (!cluster.label || cluster.isUserVoice) {
    return; // Skip if unlabeled or user's own voice
  }

  // Find the contact that matches this cluster's label
  const matchingContact = contacts.find((c) => c.displayName === cluster.label);

  if (!matchingContact) {
    return;
  }

  const cypher = `
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})
    MATCH (c:Contact {contactId: $contactId})
    MERGE (sc)-[r:RESOLVES_TO]->(c)
    ON CREATE SET
      r.resolvedAt = timestamp(),
      r.confidence = $confidence,
      r.resolutionMethod = 'auto_suggested'
    ON MATCH SET
      r.confidence = $confidence
    RETURN type(r) AS relType
  `;

  await neo4jRun(env, cypher, {
    clusterId: cluster.clusterId,
    contactId: matchingContact.contactId,
    confidence: 0.8 + Math.random() * 0.2, // 0.8-1.0 confidence
  });
}

/**
 * Creates an Event node and GENERATED relationship.
 */
async function seedEvent(env: Neo4jEnv, event: GeneratedEvent): Promise<void> {
  const cypher = `
    MATCH (u:User {userId: $userId})
    MERGE (e:Event {eventId: $eventId})
    ON CREATE SET
      e.userId = $userId,
      e.eventType = $eventType,
      e.sourceApp = $sourceApp,
      e.privacyScope = $privacyScope,
      e.timestamp = $timestamp,
      e.summary = $summary,
      e.lancedbTable = $lancedbTable,
      e.lancedbRowId = $lancedbRowId,
      e.schemaVersion = 1
    ON MATCH SET
      e.summary = $summary,
      e.schemaVersion = 1
    MERGE (u)-[r:GENERATED]->(e)
    ON CREATE SET r.timestamp = $timestamp
    RETURN e.eventId AS eventId
  `;

  await neo4jRun(env, cypher, {
    userId: event.userId,
    eventId: event.eventId,
    eventType: event.eventType,
    sourceApp: event.sourceApp,
    privacyScope: event.privacyScope,
    timestamp: event.timestamp,
    summary: event.summary,
    lancedbTable: event.lancedbTable,
    lancedbRowId: event.lancedbRowId,
  });
}

// =============================================================================
// CLEAR DEMO DATA
// =============================================================================

/**
 * Clears all demo data from Neo4j.
 * Only removes nodes/relationships associated with demo users.
 */
export async function clearDemoData(env: Neo4jEnv): Promise<void> {
  console.log('\n========================================');
  console.log('CLEARING DEMO DATA FROM NEO4J');
  console.log('========================================\n');

  // Get all demo user IDs
  const demoUserIds = DEMO_USERS.map((u) => u.clerkUserId);

  console.log(`Clearing data for ${demoUserIds.length} demo users...`);

  // Delete all nodes and relationships for demo users
  const clearCypher = `
    UNWIND $userIds AS userId
    MATCH (u:User {userId: userId})
    OPTIONAL MATCH (u)-[:GENERATED]->(e:Event)
    OPTIONAL MATCH (u)-[:HAS_SPEAKER_CLUSTER]->(sc:SpeakerCluster)
    OPTIONAL MATCH (u)-[:HAS_CONTACT]->(c:Contact)
    OPTIONAL MATCH (sc)-[:RESOLVES_TO]->(resolvedContact:Contact)
    DETACH DELETE e, sc, c, resolvedContact
    WITH u
    DETACH DELETE u
    RETURN count(*) AS deletedCount
  `;

  try {
    await neo4jRun(env, clearCypher, { userIds: demoUserIds });
    console.log('Successfully cleared all demo data.');
  } catch (error) {
    console.error('Error clearing demo data:', error);
    throw error;
  }
}

// =============================================================================
// MAIN SEEDING FUNCTION
// =============================================================================

/**
 * Seeds all demo data into Neo4j.
 */
export async function seedNeo4j(env: Neo4jEnv): Promise<void> {
  console.log('\n========================================');
  console.log('SEEDING NEO4J WITH DEMO DATA');
  console.log('========================================\n');

  const stats = {
    users: 0,
    contacts: 0,
    speakerClusters: 0,
    events: 0,
    resolutions: 0,
  };

  for (const user of DEMO_USERS) {
    console.log(`\n--- Seeding user: ${user.name} (${user.industry}) ---`);

    // 1. Create User node
    console.log('  Creating User node...');
    await seedUser(env, user);
    stats.users++;

    // 2. Generate and create Contacts (5-10 per user)
    const contactCount = randomRange(5, 10);
    const contacts = generateContactsForUser(user, contactCount);
    console.log(`  Creating ${contacts.length} Contact nodes...`);

    for (const contact of contacts) {
      await seedContact(env, contact);
      stats.contacts++;
    }

    // 3. Generate and create SpeakerClusters (3-5 per user)
    const clusterCount = randomRange(3, 5);
    const clusters = generateSpeakerClustersForUser(user, contacts, clusterCount);
    console.log(`  Creating ${clusters.length} SpeakerCluster nodes...`);

    for (const cluster of clusters) {
      await seedSpeakerCluster(env, cluster);
      stats.speakerClusters++;
    }

    // 4. Create RESOLVES_TO relationships
    console.log('  Creating RESOLVES_TO relationships...');
    for (const cluster of clusters) {
      await seedClusterContactResolution(env, cluster, contacts);
      if (cluster.label && !cluster.isUserVoice) {
        stats.resolutions++;
      }
    }

    // 5. Generate and create sample Events (5-15 per user)
    const eventCount = randomRange(5, 15);
    const events = generateEventsForUser(user, eventCount);
    console.log(`  Creating ${events.length} Event nodes...`);

    for (const event of events) {
      await seedEvent(env, event);
      stats.events++;
    }
  }

  console.log('\n========================================');
  console.log('SEEDING COMPLETE');
  console.log('========================================');
  console.log(`\nSummary:`);
  console.log(`  - Users: ${stats.users}`);
  console.log(`  - Contacts: ${stats.contacts}`);
  console.log(`  - Speaker Clusters: ${stats.speakerClusters}`);
  console.log(`  - Events: ${stats.events}`);
  console.log(`  - Cluster-Contact Resolutions: ${stats.resolutions}`);
  console.log('\n');
}

// =============================================================================
// SCRIPT ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldClear = args.includes('--clear') || args.includes('-c');
  const shouldSeed = !args.includes('--clear-only');

  try {
    const env = loadEnv();

    console.log('Neo4j Demo Data Seeding Script');
    console.log('==============================');
    console.log(`URL: ${env.NEO4J_HTTP_URL}`);
    console.log(`User: ${env.NEO4J_USER}`);
    console.log(`Clear existing: ${shouldClear}`);
    console.log(`Seed new data: ${shouldSeed}`);

    if (shouldClear) {
      await clearDemoData(env);
    }

    if (shouldSeed) {
      await seedNeo4j(env);
    }

    console.log('Script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\nError running script:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();
