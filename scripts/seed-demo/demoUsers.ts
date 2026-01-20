/**
 * Demo Users Data Generator
 *
 * Provides comprehensive demo user data for the Brain Platform.
 * Includes 25 users across various industries with realistic profiles.
 *
 * @version 1.0.0
 * @author Brain Platform Team
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Industry categories supported in the demo data.
 */
export type Industry =
  | 'Technology'
  | 'Finance'
  | 'Healthcare'
  | 'Retail'
  | 'Education'
  | 'Legal'
  | 'Creative'
  | 'Real Estate'
  | 'Consulting'
  | 'Manufacturing'
  | 'Hospitality'
  | 'Media'
  | 'Nonprofit'
  | 'Startup'
  | 'HR'
  | 'Sales'
  | 'Public Demo';

/**
 * Communication tone preferences.
 */
export type TonePreference =
  | 'professional'
  | 'casual'
  | 'friendly'
  | 'formal'
  | 'technical'
  | 'creative';

/**
 * Detail level preferences for responses.
 */
export type DetailLevel = 'concise' | 'balanced' | 'detailed' | 'comprehensive';

/**
 * User profile settings that customize AI behavior.
 */
export interface ProfileSettings {
  /** Preferred communication tone */
  tone: TonePreference;

  /** Preferred level of detail in responses */
  detailLevel: DetailLevel;

  /** Top priorities for the user based on industry */
  priorities: string[];

  /** Areas of interest or expertise */
  interests: string[];

  /** Notification preferences */
  notifications: {
    email: boolean;
    push: boolean;
    digest: 'daily' | 'weekly' | 'none';
  };

  /** AI interaction preferences */
  aiPreferences: {
    suggestionsEnabled: boolean;
    autoSummarize: boolean;
    contextWindow: 'short' | 'medium' | 'long';
  };
}

/**
 * Full demo user profile.
 */
export interface DemoUser {
  /** Unique Clerk user ID (format: demo_user_{industry}_{number}) */
  clerkUserId: string;

  /** User's full name */
  name: string;

  /** User's first name */
  firstName: string;

  /** User's last name */
  lastName: string;

  /** User's email address */
  email: string;

  /** User's industry */
  industry: Industry;

  /** User's job title/role */
  role: string;

  /** User's timezone (IANA format) */
  timezone: string;

  /** User's locale */
  locale: string;

  /** Profile avatar URL */
  avatarUrl: string | null;

  /** Whether this is the public demo user */
  isPublicDemo: boolean;

  /** Account creation timestamp */
  createdAt: Date;

  /** Last login timestamp */
  lastLoginAt: Date;

  /** Profile settings */
  profileSettings: ProfileSettings;
}

// =============================================================================
// TIMEZONE CONFIGURATIONS
// =============================================================================

const TIMEZONES = {
  US_PACIFIC: 'America/Los_Angeles',
  US_MOUNTAIN: 'America/Denver',
  US_CENTRAL: 'America/Chicago',
  US_EASTERN: 'America/New_York',
  UK: 'Europe/London',
  EU_CENTRAL: 'Europe/Berlin',
  ASIA_SINGAPORE: 'Asia/Singapore',
  ASIA_TOKYO: 'Asia/Tokyo',
  AUSTRALIA_SYDNEY: 'Australia/Sydney',
  INDIA: 'Asia/Kolkata',
} as const;

// =============================================================================
// INDUSTRY-SPECIFIC SETTINGS
// =============================================================================

const INDUSTRY_DEFAULTS: Record<Industry, Omit<ProfileSettings, 'notifications' | 'aiPreferences'>> = {
  Technology: {
    tone: 'technical',
    detailLevel: 'detailed',
    priorities: ['product development', 'system architecture', 'team collaboration', 'code quality'],
    interests: ['software engineering', 'AI/ML', 'cloud infrastructure', 'DevOps'],
  },
  Finance: {
    tone: 'formal',
    detailLevel: 'comprehensive',
    priorities: ['risk management', 'regulatory compliance', 'portfolio optimization', 'market analysis'],
    interests: ['investment strategies', 'financial modeling', 'market trends', 'fintech'],
  },
  Healthcare: {
    tone: 'professional',
    detailLevel: 'detailed',
    priorities: ['patient care', 'clinical accuracy', 'regulatory compliance', 'research'],
    interests: ['medical research', 'healthcare technology', 'patient outcomes', 'telemedicine'],
  },
  Retail: {
    tone: 'friendly',
    detailLevel: 'balanced',
    priorities: ['customer experience', 'inventory management', 'sales optimization', 'brand awareness'],
    interests: ['e-commerce', 'consumer behavior', 'supply chain', 'marketing'],
  },
  Education: {
    tone: 'friendly',
    detailLevel: 'comprehensive',
    priorities: ['student outcomes', 'curriculum development', 'engagement', 'accessibility'],
    interests: ['EdTech', 'learning methodologies', 'assessment strategies', 'inclusion'],
  },
  Legal: {
    tone: 'formal',
    detailLevel: 'comprehensive',
    priorities: ['case preparation', 'legal research', 'client communication', 'compliance'],
    interests: ['contract law', 'litigation', 'legal technology', 'regulatory updates'],
  },
  Creative: {
    tone: 'creative',
    detailLevel: 'balanced',
    priorities: ['creative vision', 'client satisfaction', 'brand consistency', 'innovation'],
    interests: ['design trends', 'visual storytelling', 'brand strategy', 'creative tools'],
  },
  'Real Estate': {
    tone: 'professional',
    detailLevel: 'balanced',
    priorities: ['property valuation', 'client relationships', 'market trends', 'deal closing'],
    interests: ['market analysis', 'property development', 'investment opportunities', 'PropTech'],
  },
  Consulting: {
    tone: 'professional',
    detailLevel: 'comprehensive',
    priorities: ['client success', 'strategic planning', 'deliverable quality', 'thought leadership'],
    interests: ['business strategy', 'digital transformation', 'change management', 'industry trends'],
  },
  Manufacturing: {
    tone: 'technical',
    detailLevel: 'detailed',
    priorities: ['production efficiency', 'quality control', 'supply chain', 'safety compliance'],
    interests: ['Industry 4.0', 'automation', 'lean manufacturing', 'sustainability'],
  },
  Hospitality: {
    tone: 'friendly',
    detailLevel: 'concise',
    priorities: ['guest satisfaction', 'operational efficiency', 'revenue management', 'team morale'],
    interests: ['customer experience', 'hospitality trends', 'sustainability', 'service innovation'],
  },
  Media: {
    tone: 'creative',
    detailLevel: 'balanced',
    priorities: ['content quality', 'audience engagement', 'distribution', 'monetization'],
    interests: ['content strategy', 'digital media', 'audience analytics', 'emerging platforms'],
  },
  Nonprofit: {
    tone: 'friendly',
    detailLevel: 'balanced',
    priorities: ['mission impact', 'donor relations', 'community engagement', 'transparency'],
    interests: ['social impact', 'fundraising', 'volunteer management', 'grant writing'],
  },
  Startup: {
    tone: 'casual',
    detailLevel: 'concise',
    priorities: ['product-market fit', 'growth metrics', 'fundraising', 'team building'],
    interests: ['entrepreneurship', 'venture capital', 'growth hacking', 'innovation'],
  },
  HR: {
    tone: 'professional',
    detailLevel: 'detailed',
    priorities: ['talent acquisition', 'employee engagement', 'compliance', 'culture development'],
    interests: ['HR technology', 'organizational development', 'benefits optimization', 'DEI'],
  },
  Sales: {
    tone: 'friendly',
    detailLevel: 'concise',
    priorities: ['revenue targets', 'pipeline management', 'customer relationships', 'team performance'],
    interests: ['sales methodologies', 'CRM optimization', 'negotiation', 'market expansion'],
  },
  'Public Demo': {
    tone: 'friendly',
    detailLevel: 'balanced',
    priorities: ['product exploration', 'feature discovery', 'use case understanding'],
    interests: ['AI assistants', 'productivity tools', 'knowledge management'],
  },
};

// =============================================================================
// DEMO USER DATA
// =============================================================================

const baseDate = new Date('2024-01-01T00:00:00Z');

/**
 * Creates a demo user with all required fields.
 */
function createDemoUser(
  firstName: string,
  lastName: string,
  industry: Industry,
  role: string,
  timezone: string,
  number: number,
  isPublicDemo = false,
  settingsOverrides?: Partial<ProfileSettings>
): DemoUser {
  const industryKey = industry.toLowerCase().replace(/\s+/g, '_');
  const clerkUserId = isPublicDemo
    ? 'demo_user_public_demo_1'
    : `demo_user_${industryKey}_${number}`;

  const email = isPublicDemo
    ? 'public.demo@demo.brain-platform.com'
    : `${firstName.toLowerCase()}.${lastName.toLowerCase()}@demo.brain-platform.com`;

  const industryDefaults = INDUSTRY_DEFAULTS[industry];

  const profileSettings: ProfileSettings = {
    tone: settingsOverrides?.tone ?? industryDefaults.tone,
    detailLevel: settingsOverrides?.detailLevel ?? industryDefaults.detailLevel,
    priorities: settingsOverrides?.priorities ?? industryDefaults.priorities,
    interests: settingsOverrides?.interests ?? industryDefaults.interests,
    notifications: settingsOverrides?.notifications ?? {
      email: true,
      push: true,
      digest: 'daily',
    },
    aiPreferences: settingsOverrides?.aiPreferences ?? {
      suggestionsEnabled: true,
      autoSummarize: true,
      contextWindow: 'medium',
    },
  };

  // Stagger creation and login dates for realism
  const dayOffset = number * 3;
  const createdAt = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const lastLoginAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

  return {
    clerkUserId,
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    email,
    industry,
    role,
    timezone,
    locale: 'en-US',
    avatarUrl: null,
    isPublicDemo,
    createdAt,
    lastLoginAt,
    profileSettings,
  };
}

// =============================================================================
// DEMO USERS ARRAY
// =============================================================================

/**
 * Complete array of 25 demo users across various industries.
 */
export const DEMO_USERS: DemoUser[] = [
  // Technology (3 users)
  createDemoUser(
    'Alex',
    'Chen',
    'Technology',
    'Senior Software Engineer',
    TIMEZONES.US_PACIFIC,
    1,
    false,
    { aiPreferences: { suggestionsEnabled: true, autoSummarize: true, contextWindow: 'long' } }
  ),
  createDemoUser(
    'Sarah',
    'Patel',
    'Technology',
    'Engineering Manager',
    TIMEZONES.US_EASTERN,
    2,
    false,
    { detailLevel: 'comprehensive' }
  ),
  createDemoUser(
    'Marcus',
    'Johnson',
    'Technology',
    'DevOps Lead',
    TIMEZONES.EU_CENTRAL,
    3,
    false,
    { tone: 'professional' }
  ),

  // Finance (2 users)
  createDemoUser(
    'Victoria',
    'Reynolds',
    'Finance',
    'Investment Analyst',
    TIMEZONES.US_EASTERN,
    1
  ),
  createDemoUser(
    'David',
    'Nakamura',
    'Finance',
    'Risk Manager',
    TIMEZONES.ASIA_TOKYO,
    2,
    false,
    { notifications: { email: true, push: false, digest: 'weekly' } }
  ),

  // Healthcare (2 users)
  createDemoUser(
    'Dr. Emily',
    'Okonkwo',
    'Healthcare',
    'Clinical Research Director',
    TIMEZONES.US_CENTRAL,
    1
  ),
  createDemoUser(
    'Michael',
    'Hernandez',
    'Healthcare',
    'Healthcare Administrator',
    TIMEZONES.US_MOUNTAIN,
    2,
    false,
    { detailLevel: 'balanced' }
  ),

  // Retail (2 users)
  createDemoUser(
    'Jennifer',
    'Kim',
    'Retail',
    'E-commerce Director',
    TIMEZONES.US_PACIFIC,
    1
  ),
  createDemoUser(
    'Robert',
    'Singh',
    'Retail',
    'Supply Chain Manager',
    TIMEZONES.INDIA,
    2,
    false,
    { tone: 'professional' }
  ),

  // Education (2 users)
  createDemoUser(
    'Amanda',
    'Williams',
    'Education',
    'Curriculum Developer',
    TIMEZONES.US_EASTERN,
    1
  ),
  createDemoUser(
    'James',
    'Oduya',
    'Education',
    'EdTech Program Director',
    TIMEZONES.UK,
    2,
    false,
    { aiPreferences: { suggestionsEnabled: true, autoSummarize: true, contextWindow: 'long' } }
  ),

  // Legal (2 users)
  createDemoUser(
    'Catherine',
    'Morrison',
    'Legal',
    'Senior Corporate Counsel',
    TIMEZONES.US_EASTERN,
    1
  ),
  createDemoUser(
    'Thomas',
    'Zhang',
    'Legal',
    'Litigation Associate',
    TIMEZONES.ASIA_SINGAPORE,
    2,
    false,
    { detailLevel: 'detailed' }
  ),

  // Creative (2 users)
  createDemoUser(
    'Olivia',
    'Martinez',
    'Creative',
    'Creative Director',
    TIMEZONES.US_PACIFIC,
    1
  ),
  createDemoUser(
    'Daniel',
    'Bergstrom',
    'Creative',
    'UX Design Lead',
    TIMEZONES.EU_CENTRAL,
    2,
    false,
    { tone: 'casual' }
  ),

  // Real Estate (1 user)
  createDemoUser(
    'Rachel',
    'Thompson',
    'Real Estate',
    'Commercial Real Estate Broker',
    TIMEZONES.US_CENTRAL,
    1
  ),

  // Consulting (1 user)
  createDemoUser(
    'Christopher',
    'Adebayo',
    'Consulting',
    'Strategy Consultant',
    TIMEZONES.UK,
    1,
    false,
    { aiPreferences: { suggestionsEnabled: true, autoSummarize: true, contextWindow: 'long' } }
  ),

  // Manufacturing (1 user)
  createDemoUser(
    'Patricia',
    'Mueller',
    'Manufacturing',
    'Operations Manager',
    TIMEZONES.EU_CENTRAL,
    1
  ),

  // Hospitality (1 user)
  createDemoUser(
    'Andrew',
    'Costa',
    'Hospitality',
    'Hotel General Manager',
    TIMEZONES.US_PACIFIC,
    1
  ),

  // Media (1 user)
  createDemoUser(
    'Sophia',
    'Lee',
    'Media',
    'Content Strategy Director',
    TIMEZONES.US_EASTERN,
    1
  ),

  // Nonprofit (1 user)
  createDemoUser(
    'Benjamin',
    'Wright',
    'Nonprofit',
    'Executive Director',
    TIMEZONES.US_CENTRAL,
    1
  ),

  // Startup (1 user)
  createDemoUser(
    'Megan',
    'Russo',
    'Startup',
    'Co-Founder & CEO',
    TIMEZONES.US_PACIFIC,
    1,
    false,
    {
      notifications: { email: true, push: true, digest: 'none' },
      aiPreferences: { suggestionsEnabled: true, autoSummarize: false, contextWindow: 'short' },
    }
  ),

  // HR (1 user)
  createDemoUser(
    'Nicole',
    'Foster',
    'HR',
    'VP of People Operations',
    TIMEZONES.US_EASTERN,
    1
  ),

  // Sales (1 user)
  createDemoUser(
    'Kevin',
    'ODonnell',
    'Sales',
    'Regional Sales Director',
    TIMEZONES.US_CENTRAL,
    1,
    false,
    {
      aiPreferences: { suggestionsEnabled: true, autoSummarize: true, contextWindow: 'short' },
    }
  ),

  // Public Demo User (1 user)
  createDemoUser(
    'Demo',
    'User',
    'Public Demo',
    'Platform Explorer',
    TIMEZONES.US_PACIFIC,
    1,
    true,
    {
      tone: 'friendly',
      detailLevel: 'balanced',
      notifications: { email: false, push: false, digest: 'none' },
      aiPreferences: { suggestionsEnabled: true, autoSummarize: true, contextWindow: 'medium' },
    }
  ),
];

// =============================================================================
// PUBLIC DEMO USER
// =============================================================================

/**
 * The public demo user for unauthenticated access.
 * This user has limited permissions and is used for public demonstrations.
 */
export const PUBLIC_DEMO_USER: DemoUser = DEMO_USERS.find((user) => user.isPublicDemo)!;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets all users in a specific industry.
 *
 * @param industry - The industry to filter by
 * @returns Array of users in the specified industry
 */
export function getUsersByIndustry(industry: Industry): DemoUser[] {
  return DEMO_USERS.filter((user) => user.industry === industry);
}

/**
 * Gets a user by their Clerk user ID.
 *
 * @param clerkUserId - The Clerk user ID to search for
 * @returns The user if found, undefined otherwise
 */
export function getUserById(clerkUserId: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.clerkUserId === clerkUserId);
}

/**
 * Gets a user by their email address.
 *
 * @param email - The email address to search for
 * @returns The user if found, undefined otherwise
 */
export function getUserByEmail(email: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

/**
 * Gets all industries represented in the demo data.
 *
 * @returns Array of unique industries
 */
export function getAllIndustries(): Industry[] {
  return [...new Set(DEMO_USERS.map((user) => user.industry))];
}

/**
 * Gets the count of users per industry.
 *
 * @returns Map of industry to user count
 */
export function getUserCountByIndustry(): Map<Industry, number> {
  const counts = new Map<Industry, number>();
  for (const user of DEMO_USERS) {
    counts.set(user.industry, (counts.get(user.industry) ?? 0) + 1);
  }
  return counts;
}

/**
 * Gets users by timezone.
 *
 * @param timezone - The IANA timezone to filter by
 * @returns Array of users in the specified timezone
 */
export function getUsersByTimezone(timezone: string): DemoUser[] {
  return DEMO_USERS.filter((user) => user.timezone === timezone);
}

/**
 * Gets users by tone preference.
 *
 * @param tone - The tone preference to filter by
 * @returns Array of users with the specified tone preference
 */
export function getUsersByTonePreference(tone: TonePreference): DemoUser[] {
  return DEMO_USERS.filter((user) => user.profileSettings.tone === tone);
}

/**
 * Gets non-public demo users (authenticated demo users only).
 *
 * @returns Array of authenticated demo users
 */
export function getAuthenticatedDemoUsers(): DemoUser[] {
  return DEMO_USERS.filter((user) => !user.isPublicDemo);
}

/**
 * Gets a random demo user (excluding public demo user).
 *
 * @returns A random authenticated demo user
 */
export function getRandomDemoUser(): DemoUser {
  const authenticatedUsers = getAuthenticatedDemoUsers();
  const randomIndex = Math.floor(Math.random() * authenticatedUsers.length);
  return authenticatedUsers[randomIndex];
}

/**
 * Creates a summary of all demo users for logging/debugging.
 *
 * @returns Summary string of all demo users
 */
export function getDemoUsersSummary(): string {
  const lines: string[] = [
    '=== Demo Users Summary ===',
    `Total Users: ${DEMO_USERS.length}`,
    '',
    'Users by Industry:',
  ];

  const counts = getUserCountByIndustry();
  for (const [industry, count] of counts) {
    lines.push(`  ${industry}: ${count}`);
  }

  lines.push('', 'All Users:', '');

  for (const user of DEMO_USERS) {
    lines.push(
      `  ${user.name} (${user.role})`,
      `    ID: ${user.clerkUserId}`,
      `    Email: ${user.email}`,
      `    Industry: ${user.industry}`,
      `    Timezone: ${user.timezone}`,
      ''
    );
  }

  return lines.join('\n');
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if a string is a valid Industry.
 *
 * @param value - The value to check
 * @returns True if the value is a valid Industry
 */
export function isValidIndustry(value: string): value is Industry {
  const validIndustries: Industry[] = [
    'Technology',
    'Finance',
    'Healthcare',
    'Retail',
    'Education',
    'Legal',
    'Creative',
    'Real Estate',
    'Consulting',
    'Manufacturing',
    'Hospitality',
    'Media',
    'Nonprofit',
    'Startup',
    'HR',
    'Sales',
    'Public Demo',
  ];
  return validIndustries.includes(value as Industry);
}

/**
 * Type guard to check if a string is a valid TonePreference.
 *
 * @param value - The value to check
 * @returns True if the value is a valid TonePreference
 */
export function isValidTonePreference(value: string): value is TonePreference {
  const validTones: TonePreference[] = [
    'professional',
    'casual',
    'friendly',
    'formal',
    'technical',
    'creative',
  ];
  return validTones.includes(value as TonePreference);
}

/**
 * Type guard to check if a string is a valid DetailLevel.
 *
 * @param value - The value to check
 * @returns True if the value is a valid DetailLevel
 */
export function isValidDetailLevel(value: string): value is DetailLevel {
  const validLevels: DetailLevel[] = ['concise', 'balanced', 'detailed', 'comprehensive'];
  return validLevels.includes(value as DetailLevel);
}

// =============================================================================
// EXPORTS SUMMARY
// =============================================================================

/**
 * Module exports:
 *
 * Types:
 * - Industry: All supported industry categories
 * - TonePreference: Communication tone options
 * - DetailLevel: Response detail level options
 * - ProfileSettings: User profile settings interface
 * - DemoUser: Full demo user profile interface
 *
 * Constants:
 * - DEMO_USERS: Array of 25 demo users
 * - PUBLIC_DEMO_USER: The special unauthenticated access user
 *
 * Helper Functions:
 * - getUsersByIndustry(industry): Get users by industry
 * - getUserById(clerkUserId): Get user by Clerk ID
 * - getUserByEmail(email): Get user by email
 * - getAllIndustries(): Get all unique industries
 * - getUserCountByIndustry(): Get user count per industry
 * - getUsersByTimezone(timezone): Get users by timezone
 * - getUsersByTonePreference(tone): Get users by tone preference
 * - getAuthenticatedDemoUsers(): Get non-public demo users
 * - getRandomDemoUser(): Get a random authenticated user
 * - getDemoUsersSummary(): Get summary string for debugging
 *
 * Type Guards:
 * - isValidIndustry(value): Check if string is valid Industry
 * - isValidTonePreference(value): Check if string is valid TonePreference
 * - isValidDetailLevel(value): Check if string is valid DetailLevel
 */
