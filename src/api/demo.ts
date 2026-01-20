/**
 * Neural Intelligence Platform - Public Demo API
 *
 * Provides unauthenticated demo endpoints for showcasing platform capabilities.
 * Returns mock data that demonstrates the platform's features without requiring
 * real user authentication.
 *
 * IMPORTANT: These endpoints return only synthetic demo data and do not access
 * any real user information.
 *
 * @version 1.0.0
 * @author Demo API
 */

import type { Env } from '../env';

// =============================================================================
// TYPES
// =============================================================================

export interface DemoSearchResult {
  id: string;
  score: number;
  content: {
    text: string;
    summary: string;
    modality: 'audio_segment' | 'text_event' | 'browser_session';
  };
  highlights: string[];
  metadata: {
    source: string;
    timestamp: number;
    participants?: string[];
    topics?: string[];
    sentiment?: 'positive' | 'negative' | 'neutral';
  };
}

export interface DemoUser {
  id: string;
  name: string;
  role: string;
  avatar: string;
  stats: {
    eventsCaptures: number;
    contactsCount: number;
    insightsGenerated: number;
  };
  joinedAt: number;
}

export interface DemoInsight {
  summary: {
    text: string;
    highlights: string[];
    period: string;
  };
  patterns: Array<{
    type: string;
    description: string;
    frequency: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  recommendations: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  metrics: {
    totalEvents: number;
    totalMeetingMinutes: number;
    uniqueContacts: number;
    topTopics: Array<{ topic: string; count: number }>;
    productivityScore: number;
  };
}

export interface DemoEvent {
  id: string;
  type: 'audio_segment' | 'text_event' | 'browser_session' | 'image_frame';
  timestamp: number;
  title: string;
  summary: string;
  participants?: string[];
  topics?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  duration?: number;
}

// =============================================================================
// SAMPLE DATA
// =============================================================================

const DEMO_USERS: DemoUser[] = [
  {
    id: 'demo_user_001',
    name: 'Alex Chen',
    role: 'Product Manager',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    stats: {
      eventsCaptures: 1247,
      contactsCount: 89,
      insightsGenerated: 156,
    },
    joinedAt: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days ago
  },
  {
    id: 'demo_user_002',
    name: 'Sarah Johnson',
    role: 'Engineering Lead',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    stats: {
      eventsCaptures: 2341,
      contactsCount: 156,
      insightsGenerated: 289,
    },
    joinedAt: Date.now() - 180 * 24 * 60 * 60 * 1000, // 180 days ago
  },
  {
    id: 'demo_user_003',
    name: 'Marcus Williams',
    role: 'Sales Director',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
    stats: {
      eventsCaptures: 3892,
      contactsCount: 312,
      insightsGenerated: 445,
    },
    joinedAt: Date.now() - 365 * 24 * 60 * 60 * 1000, // 365 days ago
  },
];

const DEMO_SEARCH_DATA: Record<string, DemoSearchResult[]> = {
  'product launch': [
    {
      id: 'sr_001',
      score: 0.95,
      content: {
        text: 'We need to finalize the product launch timeline. Marketing wants to push for Q2, but engineering needs more time for testing. Let\'s schedule a sync with both teams.',
        summary: 'Discussion about Q2 product launch timeline coordination between marketing and engineering.',
        modality: 'audio_segment',
      },
      highlights: [
        'Q2 product launch timeline',
        'Marketing and engineering sync needed',
        'Testing phase requirements',
      ],
      metadata: {
        source: 'Team Standup Meeting',
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        participants: ['Alex Chen', 'Sarah Johnson', 'Mike Peters'],
        topics: ['product launch', 'Q2 planning', 'cross-team coordination'],
        sentiment: 'neutral',
      },
    },
    {
      id: 'sr_002',
      score: 0.89,
      content: {
        text: 'Product launch checklist reviewed. All major features are on track. Beta testing feedback has been positive with 4.5/5 average rating from early adopters.',
        summary: 'Positive beta testing results and launch readiness assessment.',
        modality: 'text_event',
      },
      highlights: [
        '4.5/5 beta testing rating',
        'Major features on track',
        'Positive early adopter feedback',
      ],
      metadata: {
        source: 'Product Review Notes',
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        topics: ['beta testing', 'product launch', 'user feedback'],
        sentiment: 'positive',
      },
    },
  ],
  'quarterly review': [
    {
      id: 'sr_003',
      score: 0.92,
      content: {
        text: 'Q4 results exceeded expectations by 15%. Customer retention improved to 94%. Next quarter focus areas: expand enterprise segment and reduce onboarding time.',
        summary: 'Strong Q4 performance with 15% above target and improved customer retention.',
        modality: 'audio_segment',
      },
      highlights: [
        '15% above expectations',
        '94% customer retention',
        'Enterprise expansion focus',
      ],
      metadata: {
        source: 'Quarterly Business Review',
        timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000,
        participants: ['Marcus Williams', 'CEO', 'CFO'],
        topics: ['Q4 review', 'business performance', 'enterprise strategy'],
        sentiment: 'positive',
      },
    },
  ],
  'meeting': [
    {
      id: 'sr_004',
      score: 0.88,
      content: {
        text: 'Action items from today\'s design review: 1) Update mockups for mobile view, 2) Schedule user testing session, 3) Review accessibility requirements with legal team.',
        summary: 'Design review meeting action items covering mobile, testing, and accessibility.',
        modality: 'audio_segment',
      },
      highlights: [
        'Mobile mockup updates needed',
        'User testing to be scheduled',
        'Accessibility review pending',
      ],
      metadata: {
        source: 'Design Review Meeting',
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
        participants: ['Sarah Johnson', 'Design Team', 'Legal'],
        topics: ['design review', 'mobile', 'accessibility', 'user testing'],
        sentiment: 'neutral',
      },
    },
    {
      id: 'sr_005',
      score: 0.85,
      content: {
        text: 'Client meeting went well. They\'re excited about the new features. Need to prepare detailed technical documentation and timeline for implementation.',
        summary: 'Successful client meeting with enthusiasm for new features.',
        modality: 'text_event',
      },
      highlights: [
        'Positive client reception',
        'Technical docs needed',
        'Implementation timeline required',
      ],
      metadata: {
        source: 'Client Notes',
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
        topics: ['client meeting', 'documentation', 'implementation'],
        sentiment: 'positive',
      },
    },
  ],
  default: [
    {
      id: 'sr_default_001',
      score: 0.75,
      content: {
        text: 'Weekly team sync completed. All projects on track. Discussed upcoming sprint priorities and resource allocation.',
        summary: 'Regular team sync covering project status and sprint planning.',
        modality: 'audio_segment',
      },
      highlights: [
        'Projects on track',
        'Sprint priorities discussed',
        'Resource allocation reviewed',
      ],
      metadata: {
        source: 'Team Weekly Sync',
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
        participants: ['Team Members'],
        topics: ['team sync', 'sprint planning', 'project status'],
        sentiment: 'neutral',
      },
    },
  ],
};

const DEMO_INSIGHTS: Record<string, DemoInsight> = {
  demo_user_001: {
    summary: {
      text: 'This week has been productive with a strong focus on product development and cross-team collaboration. You\'ve captured 47 events across 12 meetings and numerous text interactions. Your most engaged topics include product strategy, user research, and Q2 planning. There\'s been positive momentum in your interactions with engineering and design teams.',
      highlights: [
        'Product strategy discussions up 23% from last week',
        'Strong collaboration with engineering team',
        '3 action items completed, 2 pending',
        'Positive sentiment in 78% of interactions',
      ],
      period: 'Jan 13 - Jan 19, 2025',
    },
    patterns: [
      {
        type: 'topic_focus',
        description: 'Increasing focus on user experience and mobile development',
        frequency: 15,
        trend: 'increasing',
      },
      {
        type: 'collaboration',
        description: 'Strong engagement with engineering and design teams',
        frequency: 23,
        trend: 'stable',
      },
      {
        type: 'meeting_efficiency',
        description: 'Average meeting duration decreased by 12% while output increased',
        frequency: 8,
        trend: 'increasing',
      },
    ],
    recommendations: [
      {
        id: 'rec_001',
        type: 'follow_up',
        title: 'Follow up with Sarah on API integration',
        description: 'Your last discussion about the API integration was 5 days ago. Consider scheduling a quick sync to review progress.',
        priority: 'medium',
      },
      {
        id: 'rec_002',
        type: 'complete_action',
        title: 'Complete user research summary',
        description: 'The user research summary mentioned in Monday\'s meeting is due this week.',
        priority: 'high',
      },
      {
        id: 'rec_003',
        type: 'optimize_schedule',
        title: 'Consider consolidating recurring meetings',
        description: 'You have 3 similar status update meetings. Consolidating could save 2 hours weekly.',
        priority: 'low',
      },
    ],
    metrics: {
      totalEvents: 247,
      totalMeetingMinutes: 480,
      uniqueContacts: 18,
      topTopics: [
        { topic: 'Product Strategy', count: 34 },
        { topic: 'User Research', count: 28 },
        { topic: 'Q2 Planning', count: 22 },
        { topic: 'Mobile Development', count: 19 },
        { topic: 'Team Collaboration', count: 15 },
      ],
      productivityScore: 78,
    },
  },
  demo_user_002: {
    summary: {
      text: 'An intensive week focused on technical architecture and team leadership. Your code reviews and architectural discussions have shaped several key decisions. The team\'s velocity has improved, and technical debt reduction initiatives are showing results.',
      highlights: [
        'Led 5 architecture review sessions',
        'Technical debt reduced by 15%',
        'Team velocity up 20%',
        'Mentored 2 junior developers',
      ],
      period: 'Jan 13 - Jan 19, 2025',
    },
    patterns: [
      {
        type: 'technical_leadership',
        description: 'Increased time spent on architecture and code review',
        frequency: 28,
        trend: 'increasing',
      },
      {
        type: 'mentorship',
        description: 'Regular 1:1s with team members showing positive outcomes',
        frequency: 12,
        trend: 'stable',
      },
    ],
    recommendations: [
      {
        id: 'rec_004',
        type: 'review_topic',
        title: 'Document architecture decisions',
        description: 'Several key architecture decisions were made this week. Consider creating ADRs.',
        priority: 'medium',
      },
    ],
    metrics: {
      totalEvents: 341,
      totalMeetingMinutes: 720,
      uniqueContacts: 24,
      topTopics: [
        { topic: 'Architecture', count: 45 },
        { topic: 'Code Review', count: 38 },
        { topic: 'Team Management', count: 29 },
        { topic: 'Technical Debt', count: 22 },
        { topic: 'Performance', count: 18 },
      ],
      productivityScore: 85,
    },
  },
  demo_user_003: {
    summary: {
      text: 'Strong week for sales activities with significant pipeline growth. Your client interactions have been highly positive, and several deals are progressing well. The new enterprise outreach strategy is showing early promising results.',
      highlights: [
        'Pipeline grew by $450K',
        '8 new enterprise leads generated',
        '3 deals moved to negotiation stage',
        'Client satisfaction score: 4.8/5',
      ],
      period: 'Jan 13 - Jan 19, 2025',
    },
    patterns: [
      {
        type: 'sales_momentum',
        description: 'Enterprise segment showing strong growth trajectory',
        frequency: 18,
        trend: 'increasing',
      },
      {
        type: 'relationship_building',
        description: 'Deep engagement with key accounts',
        frequency: 25,
        trend: 'increasing',
      },
    ],
    recommendations: [
      {
        id: 'rec_005',
        type: 'follow_up',
        title: 'Schedule demo for Acme Corp',
        description: 'Acme Corp expressed interest 4 days ago. Strike while the iron is hot.',
        priority: 'high',
      },
      {
        id: 'rec_006',
        type: 'connect_contact',
        title: 'Introduce TechStart to solutions team',
        description: 'TechStart\'s requirements align well with our enterprise solution.',
        priority: 'medium',
      },
    ],
    metrics: {
      totalEvents: 489,
      totalMeetingMinutes: 960,
      uniqueContacts: 45,
      topTopics: [
        { topic: 'Enterprise Sales', count: 52 },
        { topic: 'Client Relations', count: 44 },
        { topic: 'Pipeline Review', count: 35 },
        { topic: 'Negotiations', count: 28 },
        { topic: 'Product Demo', count: 21 },
      ],
      productivityScore: 92,
    },
  },
};

const DEMO_EVENTS: Record<string, DemoEvent[]> = {
  demo_user_001: [
    {
      id: 'evt_001',
      type: 'audio_segment',
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      title: 'Product Strategy Sync',
      summary: 'Discussed Q2 roadmap priorities and feature prioritization framework.',
      participants: ['Sarah Johnson', 'Mike Peters', 'Design Team'],
      topics: ['product strategy', 'Q2 roadmap', 'prioritization'],
      sentiment: 'positive',
      duration: 45,
    },
    {
      id: 'evt_002',
      type: 'text_event',
      timestamp: Date.now() - 5 * 60 * 60 * 1000,
      title: 'User Research Notes',
      summary: 'Compiled feedback from 12 user interviews. Key themes: simplicity, mobile experience, integrations.',
      topics: ['user research', 'feedback', 'mobile'],
      sentiment: 'neutral',
    },
    {
      id: 'evt_003',
      type: 'browser_session',
      timestamp: Date.now() - 8 * 60 * 60 * 1000,
      title: 'Competitor Analysis',
      summary: 'Researched competitor pricing and feature comparison for market positioning.',
      topics: ['competitive analysis', 'pricing', 'market research'],
      sentiment: 'neutral',
      duration: 30,
    },
    {
      id: 'evt_004',
      type: 'audio_segment',
      timestamp: Date.now() - 24 * 60 * 60 * 1000,
      title: 'Sprint Planning',
      summary: 'Planned sprint 14 with engineering team. Committed to 34 story points.',
      participants: ['Engineering Team', 'Scrum Master'],
      topics: ['sprint planning', 'agile', 'engineering'],
      sentiment: 'positive',
      duration: 60,
    },
    {
      id: 'evt_005',
      type: 'text_event',
      timestamp: Date.now() - 26 * 60 * 60 * 1000,
      title: 'Feature Specification Draft',
      summary: 'Drafted specification for new collaboration features. Ready for engineering review.',
      topics: ['feature spec', 'collaboration', 'documentation'],
      sentiment: 'positive',
    },
  ],
  demo_user_002: [
    {
      id: 'evt_006',
      type: 'audio_segment',
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      title: 'Architecture Review',
      summary: 'Reviewed microservices migration plan. Approved phase 1 implementation.',
      participants: ['Backend Team', 'DevOps'],
      topics: ['architecture', 'microservices', 'migration'],
      sentiment: 'positive',
      duration: 90,
    },
    {
      id: 'evt_007',
      type: 'text_event',
      timestamp: Date.now() - 4 * 60 * 60 * 1000,
      title: 'Code Review Comments',
      summary: 'Reviewed 8 pull requests. Provided feedback on performance optimizations.',
      topics: ['code review', 'performance', 'best practices'],
      sentiment: 'neutral',
    },
    {
      id: 'evt_008',
      type: 'audio_segment',
      timestamp: Date.now() - 28 * 60 * 60 * 1000,
      title: '1:1 with Junior Developer',
      summary: 'Career development discussion. Set goals for next quarter.',
      participants: ['Junior Developer'],
      topics: ['mentorship', 'career development', 'goals'],
      sentiment: 'positive',
      duration: 30,
    },
  ],
  demo_user_003: [
    {
      id: 'evt_009',
      type: 'audio_segment',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      title: 'Enterprise Demo - TechCorp',
      summary: 'Presented enterprise solution to TechCorp. Strong interest in advanced analytics.',
      participants: ['TechCorp Team', 'Solutions Engineer'],
      topics: ['demo', 'enterprise', 'analytics'],
      sentiment: 'positive',
      duration: 60,
    },
    {
      id: 'evt_010',
      type: 'text_event',
      timestamp: Date.now() - 6 * 60 * 60 * 1000,
      title: 'Pipeline Update',
      summary: 'Updated CRM with latest deal statuses. 3 deals moved to closing stage.',
      topics: ['pipeline', 'CRM', 'deals'],
      sentiment: 'positive',
    },
    {
      id: 'evt_011',
      type: 'audio_segment',
      timestamp: Date.now() - 25 * 60 * 60 * 1000,
      title: 'Quarterly Sales Review',
      summary: 'Reviewed Q4 performance with leadership. Exceeded targets by 12%.',
      participants: ['Sales Team', 'VP Sales', 'CEO'],
      topics: ['quarterly review', 'sales performance', 'targets'],
      sentiment: 'positive',
      duration: 120,
    },
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a JSON response with CORS headers for demo endpoints
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Demo-Data': 'true',
    },
  });
}

/**
 * Create an error response
 */
function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message, demo: true }, status);
}

/**
 * Find demo search results matching a query
 */
function findSearchResults(query: string): DemoSearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();

  // Check for exact matches first
  for (const [key, results] of Object.entries(DEMO_SEARCH_DATA)) {
    if (key === 'default') continue;
    if (normalizedQuery.includes(key) || key.includes(normalizedQuery)) {
      return results;
    }
  }

  // Return default results if no match
  return DEMO_SEARCH_DATA['default'] || [];
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Handle GET /api/demo/search?q={query}
 *
 * Search demo data with a query string.
 * Returns mock search results demonstrating semantic search capabilities.
 */
export async function handleDemoSearch(
  request: Request,
  _env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || url.searchParams.get('query');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  if (!query || query.trim().length === 0) {
    return errorResponse('Missing required query parameter: q');
  }

  const results = findSearchResults(query);

  return jsonResponse({
    query,
    results: results.slice(0, limit),
    totalResults: results.length,
    searchTime: Math.random() * 50 + 20, // Simulated search time in ms
    demo: true,
    message: 'This is demo data. Sign up to search your own captured conversations.',
  });
}

/**
 * Handle GET /api/demo/users
 *
 * List demo user profiles.
 * Returns sanitized demo user information.
 */
export async function handleDemoUsers(
  _request: Request,
  _env: Env
): Promise<Response> {
  return jsonResponse({
    users: DEMO_USERS,
    total: DEMO_USERS.length,
    demo: true,
    message: 'These are demo user profiles showcasing platform capabilities.',
  });
}

/**
 * Handle GET /api/demo/insights?userId={id}
 *
 * Get pre-computed insights for a demo user.
 * Returns sample insights demonstrating the AI-powered insights feature.
 */
export async function handleDemoInsights(
  request: Request,
  _env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || 'demo_user_001';

  const insights = DEMO_INSIGHTS[userId] || DEMO_INSIGHTS['demo_user_001'];

  if (!insights) {
    return errorResponse('Demo user not found', 404);
  }

  return jsonResponse({
    userId,
    insights,
    generatedAt: Date.now(),
    demo: true,
    message: 'These are pre-computed demo insights. Real insights are generated dynamically from your data.',
  });
}

/**
 * Handle GET /api/demo/events?userId={id}&limit={n}
 *
 * Get recent events for a demo user.
 * Returns sample events demonstrating the event capture feature.
 */
export async function handleDemoEvents(
  request: Request,
  _env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || 'demo_user_001';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  const events = DEMO_EVENTS[userId] || DEMO_EVENTS['demo_user_001'];

  if (!events) {
    return errorResponse('Demo user not found', 404);
  }

  const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);

  return jsonResponse({
    userId,
    events: sortedEvents.slice(0, limit),
    total: events.length,
    hasMore: events.length > limit,
    demo: true,
    message: 'These are sample events. Your real events would include your captured conversations and activities.',
  });
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export function handleDemoCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Route demo API requests
 *
 * @param request - Incoming request
 * @param env - Environment bindings
 * @returns Response or null if route doesn't match
 */
export async function routeDemoRequest(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Handle CORS preflight
  if (method === 'OPTIONS' && path.startsWith('/api/demo/')) {
    return handleDemoCors();
  }

  // Only handle GET requests for demo endpoints
  if (method !== 'GET') {
    return null;
  }

  // Route: GET /api/demo/search
  if (path === '/api/demo/search') {
    return handleDemoSearch(request, env);
  }

  // Route: GET /api/demo/users
  if (path === '/api/demo/users') {
    return handleDemoUsers(request, env);
  }

  // Route: GET /api/demo/insights
  if (path === '/api/demo/insights') {
    return handleDemoInsights(request, env);
  }

  // Route: GET /api/demo/events
  if (path === '/api/demo/events') {
    return handleDemoEvents(request, env);
  }

  return null;
}
