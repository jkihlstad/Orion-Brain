/**
 * Event Generators for Brain Platform Demo Data
 *
 * Generates realistic events for different source apps based on user industry/profession.
 * Event distribution: Browser 30%, Calendar 20%, Tasks 15%, Workouts 10%,
 * Sleep 10%, Email 10%, Social 5%
 *
 * @version 1.0.0
 */

import { v7 as uuidv7 } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source apps supported by the ingestion system (from Convex schema).
 */
export type SourceApp =
  | 'browser'
  | 'dating'
  | 'social'
  | 'sleep'
  | 'calendar'
  | 'email'
  | 'workouts'
  | 'tasks'
  | 'voice'
  | 'photos'
  | 'music'
  | 'location'
  | 'health'
  | 'finance'
  | 'notes'
  | 'contacts'
  | 'messages'
  | 'exchange'
  | 'marketplace';

/**
 * Privacy scope for events.
 */
export type PrivacyScope = 'private' | 'social' | 'public';

/**
 * Brain processing status.
 */
export type BrainStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

/**
 * User industry/profession for generating contextual content.
 */
export type Industry =
  | 'technology'
  | 'healthcare'
  | 'finance'
  | 'education'
  | 'creative'
  | 'legal'
  | 'retail'
  | 'consulting'
  | 'engineering'
  | 'general';

/**
 * Demo user structure for event generation.
 */
export interface DemoUser {
  clerkUserId: string;
  email: string;
  name: string;
  industry: Industry;
  timezone: string;
  consentVersion: string;
}

/**
 * Generated event structure matching Convex schema.
 */
export interface GeneratedEvent {
  eventId: string;
  traceId: string;
  idempotencyKey?: string;
  sourceApp: SourceApp;
  eventType: string;
  domain: string;
  timestampMs: number;
  receivedAtMs: number;
  clerkUserId: string;
  consentVersion: string;
  privacyScope: PrivacyScope;
  payload: Record<string, unknown>;
  payloadPreview: string;
  blobRefs?: string[];
  brainStatus: BrainStatus;
  brainAttempts: number;
  brainLeaseWorkerId?: string;
  brainLeaseExpiresAtMs?: number;
  brainError?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Use 28 days to stay safely within Convex's 30-day limit
const THIRTY_DAYS_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Event type distribution weights (must sum to 100).
 */
const EVENT_DISTRIBUTION = {
  browser: 30,
  calendar: 20,
  tasks: 15,
  workouts: 10,
  sleep: 10,
  email: 10,
  social: 5,
} as const;

// =============================================================================
// INDUSTRY-SPECIFIC DATA
// =============================================================================

/**
 * Industry-specific browsing patterns.
 */
const INDUSTRY_SITES: Record<Industry, { sites: string[]; searches: string[] }> = {
  technology: {
    sites: [
      'github.com/trending',
      'stackoverflow.com/questions',
      'news.ycombinator.com',
      'dev.to',
      'medium.com/programming',
      'reddit.com/r/programming',
      'aws.amazon.com/console',
      'vercel.com/dashboard',
      'docs.docker.com',
      'npmjs.com',
      'typescript.org/docs',
      'react.dev',
      'nextjs.org/docs',
      'anthropic.com/docs',
      'openai.com/docs',
    ],
    searches: [
      'typescript best practices 2024',
      'react server components tutorial',
      'docker compose networking',
      'kubernetes vs serverless',
      'claude api streaming',
      'convex database pricing',
      'vector database comparison',
      'LLM fine tuning guide',
      'rust vs go performance',
      'microservices architecture patterns',
    ],
  },
  healthcare: {
    sites: [
      'pubmed.ncbi.nlm.nih.gov',
      'uptodate.com',
      'medscape.com',
      'nejm.org',
      'jamanetwork.com',
      'mayoclinic.org',
      'cdc.gov/health',
      'who.int/health-topics',
      'epocrates.com',
      'clinicaltrials.gov',
      'merckmanuals.com',
      'aafp.org',
      'healthline.com/medical',
      'webmd.com/professional',
    ],
    searches: [
      'latest treatment protocols diabetes',
      'drug interaction checker',
      'clinical trial results 2024',
      'EHR system comparison',
      'HIPAA compliance checklist',
      'telemedicine best practices',
      'patient communication tools',
      'medical imaging AI',
      'burnout prevention healthcare',
      'continuing medical education',
    ],
  },
  finance: {
    sites: [
      'bloomberg.com',
      'wsj.com/markets',
      'reuters.com/finance',
      'ft.com',
      'seekingalpha.com',
      'morningstar.com',
      'tradingview.com',
      'finviz.com',
      'sec.gov/edgar',
      'federalreserve.gov',
      'yahoo.com/finance',
      'investopedia.com',
      'coinmarketcap.com',
      'cmegroup.com',
    ],
    searches: [
      'federal reserve rate decision',
      'Q4 earnings calendar',
      'bond yield curve analysis',
      'SEC filing requirements',
      'risk management frameworks',
      'portfolio rebalancing strategy',
      'cryptocurrency regulation update',
      'ESG investing trends',
      'market volatility indicators',
      'algorithmic trading strategies',
    ],
  },
  education: {
    sites: [
      'scholar.google.com',
      'jstor.org',
      'canvas.instructure.com',
      'coursera.org',
      'edx.org',
      'khanacademy.org',
      'quizlet.com',
      'turnitin.com',
      'grammarly.com',
      'zotero.org',
      'mendeley.com',
      'researchgate.net',
      'academia.edu',
      'chronicle.com',
    ],
    searches: [
      'active learning strategies',
      'student engagement techniques',
      'rubric design best practices',
      'online teaching tools',
      'academic integrity policies',
      'curriculum development framework',
      'educational technology trends',
      'peer review process',
      'grant writing tips',
      'sabbatical planning',
    ],
  },
  creative: {
    sites: [
      'behance.net',
      'dribbble.com',
      'figma.com',
      'adobe.com/creativecloud',
      'canva.com',
      'unsplash.com',
      'pinterest.com',
      'awwwards.com',
      'creativebloq.com',
      'designmodo.com',
      'fonts.google.com',
      'coolors.co',
      'midjourney.com',
      'vimeo.com',
    ],
    searches: [
      'UI design trends 2024',
      'color palette generator',
      'typography pairing guide',
      'motion design tutorial',
      'brand identity guidelines',
      'AI art generation tools',
      'portfolio website examples',
      'design system components',
      'accessibility design standards',
      'creative brief template',
    ],
  },
  legal: {
    sites: [
      'westlaw.com',
      'lexisnexis.com',
      'law.cornell.edu',
      'findlaw.com',
      'casetext.com',
      'scotusblog.com',
      'oyez.org',
      'lawreview.org',
      'uscourts.gov',
      'abajournal.com',
      'law360.com',
      'bloomberg.com/law',
      'justia.com',
      'pacer.gov',
    ],
    searches: [
      'recent supreme court decisions',
      'contract template commercial',
      'legal brief formatting',
      'discovery request examples',
      'billable hours tracking software',
      'client intake forms',
      'legal malpractice insurance',
      'bar exam preparation',
      'mediation vs arbitration',
      'intellectual property protection',
    ],
  },
  retail: {
    sites: [
      'shopify.com/admin',
      'amazon.com/seller',
      'etsy.com/shop-manager',
      'squarespace.com/commerce',
      'salesforce.com',
      'hubspot.com',
      'mailchimp.com',
      'klaviyo.com',
      'google.com/analytics',
      'semrush.com',
      'facebook.com/business',
      'instagram.com/business',
      'tiktok.com/business',
      'returnly.com',
    ],
    searches: [
      'ecommerce conversion optimization',
      'inventory management software',
      'customer retention strategies',
      'social media marketing tips',
      'product photography guide',
      'shipping rate calculator',
      'point of sale comparison',
      'customer service best practices',
      'holiday sales preparation',
      'influencer marketing ROI',
    ],
  },
  consulting: {
    sites: [
      'mckinsey.com/insights',
      'bcg.com/publications',
      'hbr.org',
      'strategyand.pwc.com',
      'bain.com/insights',
      'deloitte.com/insights',
      'accenture.com/insights',
      'gartner.com',
      'forrester.com',
      'statista.com',
      'miro.com',
      'lucidchart.com',
      'notion.so',
      'airtable.com',
    ],
    searches: [
      'management consulting frameworks',
      'market sizing methodology',
      'competitive analysis template',
      'business case development',
      'change management models',
      'stakeholder mapping tool',
      'executive presentation design',
      'industry benchmarking data',
      'due diligence checklist',
      'digital transformation roadmap',
    ],
  },
  engineering: {
    sites: [
      'autodesk.com',
      'solidworks.com',
      'mathworks.com',
      'asme.org',
      'ieee.org',
      'engineering.com',
      'thomasnet.com',
      'grabcad.com',
      'engineeringtoolbox.com',
      'simscale.com',
      'ansys.com',
      'ptc.com/creo',
      'siemens.com/plm',
      'ni.com/labview',
    ],
    searches: [
      'CAD best practices',
      'FEA simulation tutorial',
      'materials selection guide',
      'manufacturing tolerance standards',
      'project management engineering',
      'safety factor calculation',
      'thermal analysis software',
      'PCB design guidelines',
      'quality control methods',
      'patent application process',
    ],
  },
  general: {
    sites: [
      'google.com',
      'linkedin.com',
      'amazon.com',
      'youtube.com',
      'reddit.com',
      'twitter.com',
      'facebook.com',
      'instagram.com',
      'wikipedia.org',
      'news.google.com',
      'weather.com',
      'maps.google.com',
      'gmail.com',
      'drive.google.com',
    ],
    searches: [
      'productivity tips working from home',
      'best project management apps',
      'how to negotiate salary',
      'work life balance strategies',
      'professional development courses',
      'networking event tips',
      'resume writing guide',
      'interview preparation',
      'remote work best practices',
      'career change advice',
    ],
  },
};

/**
 * Industry-specific meeting types and topics.
 */
const INDUSTRY_MEETINGS: Record<Industry, { titles: string[]; locations: string[] }> = {
  technology: {
    titles: [
      'Sprint Planning',
      'Code Review Session',
      'Architecture Discussion',
      'Tech Debt Review',
      'Feature Demo',
      'Incident Postmortem',
      'Security Review',
      'Performance Optimization',
      'API Design Review',
      'DevOps Sync',
    ],
    locations: ['Zoom', 'Google Meet', 'Slack Huddle', 'Conference Room A', 'Remote'],
  },
  healthcare: {
    titles: [
      'Patient Case Review',
      'Departmental Grand Rounds',
      'Quality Improvement Meeting',
      'M&M Conference',
      'Care Coordination',
      'Staff Training Session',
      'Compliance Review',
      'Research Team Sync',
      'Telemedicine Consult',
      'Safety Committee',
    ],
    locations: ['Conference Room', 'Telehealth Platform', 'Hospital Auditorium', 'Zoom', 'Teams'],
  },
  finance: {
    titles: [
      'Portfolio Review',
      'Client Quarterly Review',
      'Risk Assessment Meeting',
      'Compliance Training',
      'Investment Committee',
      'Market Analysis Session',
      'Due Diligence Call',
      'Board Presentation Prep',
      'Audit Review',
      'Strategy Planning',
    ],
    locations: ['Board Room', 'Bloomberg Terminal Room', 'Client Office', 'Zoom', 'Teams'],
  },
  education: {
    titles: [
      'Faculty Meeting',
      'Curriculum Committee',
      'Student Advising',
      'Thesis Committee',
      'Department Seminar',
      'Accreditation Review',
      'Parent-Teacher Conference',
      'Research Collaboration',
      'Grant Review',
      'Teaching Assistant Training',
    ],
    locations: ['Faculty Lounge', 'Dean\'s Office', 'Classroom 101', 'Zoom', 'Library Meeting Room'],
  },
  creative: {
    titles: [
      'Creative Brief Review',
      'Design Critique',
      'Client Presentation',
      'Brainstorming Session',
      'Brand Workshop',
      'Photo/Video Review',
      'Campaign Planning',
      'Vendor Meeting',
      'Portfolio Review',
      'Style Guide Review',
    ],
    locations: ['Design Studio', 'Client Office', 'Figma Live', 'Zoom', 'Coffee Shop'],
  },
  legal: {
    titles: [
      'Case Strategy Meeting',
      'Client Consultation',
      'Deposition Prep',
      'Partner Meeting',
      'Settlement Conference',
      'Document Review',
      'Witness Preparation',
      'Continuing Education',
      'Pro Bono Committee',
      'Associates Meeting',
    ],
    locations: ['Conference Room', 'Courthouse', 'Client Office', 'Zoom', 'Law Library'],
  },
  retail: {
    titles: [
      'Sales Review',
      'Inventory Planning',
      'Vendor Negotiation',
      'Marketing Strategy',
      'Store Manager Sync',
      'Customer Service Training',
      'Visual Merchandising',
      'Product Launch Planning',
      'E-commerce Review',
      'Seasonal Planning',
    ],
    locations: ['Office', 'Store Floor', 'Vendor Showroom', 'Zoom', 'Teams'],
  },
  consulting: {
    titles: [
      'Client Kickoff',
      'Stakeholder Interview',
      'Working Session',
      'Steering Committee',
      'Partner Review',
      'Deliverable Review',
      'Internal Training',
      'Industry Research',
      'Proposal Development',
      'Case Team Sync',
    ],
    locations: ['Client Site', 'Office', 'Zoom', 'Teams', 'Airport Lounge'],
  },
  engineering: {
    titles: [
      'Design Review',
      'Project Kickoff',
      'Safety Review',
      'Supplier Meeting',
      'Testing Protocol Review',
      'Manufacturing Sync',
      'QA Meeting',
      'Prototype Review',
      'Standards Compliance',
      'Cross-functional Sync',
    ],
    locations: ['Engineering Lab', 'Conference Room', 'Plant Floor', 'Zoom', 'CAD Room'],
  },
  general: {
    titles: [
      'Team Standup',
      'One-on-One',
      'All Hands Meeting',
      'Project Sync',
      'Training Session',
      'Performance Review',
      'Town Hall',
      'Department Meeting',
      'Client Call',
      'Planning Session',
    ],
    locations: ['Office', 'Conference Room', 'Zoom', 'Teams', 'Google Meet'],
  },
};

/**
 * Industry-specific task types.
 */
const INDUSTRY_TASKS: Record<Industry, string[]> = {
  technology: [
    'Fix bug in authentication flow',
    'Write unit tests for payment module',
    'Review pull request #234',
    'Update API documentation',
    'Refactor database queries',
    'Set up CI/CD pipeline',
    'Research new monitoring tools',
    'Optimize image loading',
    'Implement caching layer',
    'Security audit checklist',
  ],
  healthcare: [
    'Complete patient charts',
    'Review lab results',
    'Follow up with specialist referral',
    'Update treatment plan',
    'Complete CME requirements',
    'Review insurance authorizations',
    'Staff scheduling for next week',
    'Medication reconciliation',
    'Quality metrics reporting',
    'Patient education materials',
  ],
  finance: [
    'Prepare quarterly report',
    'Review investment performance',
    'Update client portfolio allocation',
    'Complete compliance training',
    'Reconcile accounts',
    'Risk assessment review',
    'Prepare board presentation',
    'Research market trends',
    'Update financial models',
    'Client onboarding documents',
  ],
  education: [
    'Grade student assignments',
    'Prepare lecture materials',
    'Update syllabus',
    'Review thesis draft',
    'Write recommendation letters',
    'Submit grant application',
    'Office hours preparation',
    'Research paper revision',
    'Committee report',
    'Course evaluation review',
  ],
  creative: [
    'Revise logo concepts',
    'Create social media assets',
    'Update portfolio website',
    'Client feedback revisions',
    'Prepare mood board',
    'Export final deliverables',
    'Invoice client',
    'Research design trends',
    'Organize asset library',
    'Color palette development',
  ],
  legal: [
    'Draft motion for summary judgment',
    'Review contract amendments',
    'Prepare discovery responses',
    'Research case precedents',
    'Update client billing',
    'Witness interview notes',
    'File court documents',
    'Pro bono case review',
    'CLE credit tracking',
    'Conflict check completion',
  ],
  retail: [
    'Update product listings',
    'Process returns',
    'Inventory count',
    'Schedule staff shifts',
    'Respond to customer reviews',
    'Plan promotional campaign',
    'Vendor payment processing',
    'Visual display updates',
    'Sales report analysis',
    'Reorder low stock items',
  ],
  consulting: [
    'Complete client deliverable',
    'Prepare presentation deck',
    'Conduct stakeholder interviews',
    'Data analysis for project',
    'Draft project status update',
    'Review team work products',
    'Expense report submission',
    'Proposal writing',
    'Industry research synthesis',
    'Internal knowledge sharing',
  ],
  engineering: [
    'Complete design drawings',
    'Run simulation analysis',
    'Review test results',
    'Update project schedule',
    'Vendor specification review',
    'Safety compliance check',
    'Material selection analysis',
    'Prototype testing',
    'Documentation update',
    'Cost estimation',
  ],
  general: [
    'Complete project deliverable',
    'Review team performance',
    'Update project status',
    'Schedule team meeting',
    'Prepare presentation',
    'Email follow-ups',
    'Organize files',
    'Training completion',
    'Budget review',
    'Quarterly planning',
  ],
};

/**
 * Workout types with exercises.
 */
const WORKOUT_TYPES = [
  {
    type: 'strength',
    name: 'Upper Body Strength',
    exercises: ['Bench Press', 'Shoulder Press', 'Bicep Curls', 'Tricep Dips', 'Lat Pulldown'],
  },
  {
    type: 'strength',
    name: 'Lower Body Strength',
    exercises: ['Squats', 'Deadlifts', 'Lunges', 'Leg Press', 'Calf Raises'],
  },
  {
    type: 'cardio',
    name: 'Morning Run',
    exercises: ['5K Run'],
  },
  {
    type: 'cardio',
    name: 'HIIT Session',
    exercises: ['Burpees', 'Mountain Climbers', 'Jump Squats', 'High Knees', 'Box Jumps'],
  },
  {
    type: 'flexibility',
    name: 'Yoga Flow',
    exercises: ['Sun Salutation', 'Warrior Poses', 'Downward Dog', 'Tree Pose', 'Savasana'],
  },
  {
    type: 'cardio',
    name: 'Cycling',
    exercises: ['60-minute Ride'],
  },
  {
    type: 'strength',
    name: 'Full Body Circuit',
    exercises: ['Push-ups', 'Pull-ups', 'Squats', 'Planks', 'Rows'],
  },
  {
    type: 'cardio',
    name: 'Swimming',
    exercises: ['Freestyle Laps', 'Breaststroke', 'Backstroke'],
  },
];

/**
 * Email subjects by industry.
 */
const INDUSTRY_EMAILS: Record<Industry, { subjects: string[]; senders: string[] }> = {
  technology: {
    subjects: [
      'Re: Pull Request Review',
      'Sprint Retrospective Notes',
      'Production Incident Alert',
      'New Feature Requirements',
      'Tech Blog Post Draft',
      'Conference Invitation',
      'Team Lunch Tomorrow',
      'Code Review Feedback',
      'Deployment Schedule Update',
      'Performance Metrics Report',
    ],
    senders: ['engineering@company.com', 'devops@company.com', 'pm@company.com', 'cto@company.com'],
  },
  healthcare: {
    subjects: [
      'Patient Lab Results',
      'Scheduling Change Request',
      'CME Course Available',
      'Department Meeting Agenda',
      'Insurance Authorization Update',
      'New Protocol Implementation',
      'Staff Schedule Change',
      'Research Collaboration Opportunity',
      'Compliance Reminder',
      'Grand Rounds Announcement',
    ],
    senders: ['admin@hospital.org', 'nursing@hospital.org', 'hr@hospital.org', 'research@hospital.org'],
  },
  finance: {
    subjects: [
      'Market Update Report',
      'Client Portfolio Review',
      'Compliance Alert',
      'Q4 Earnings Call',
      'Investment Committee Agenda',
      'Risk Assessment Update',
      'New Regulatory Requirements',
      'Client Meeting Request',
      'Research Note',
      'Monthly Performance Summary',
    ],
    senders: ['compliance@firm.com', 'research@firm.com', 'operations@firm.com', 'client.services@firm.com'],
  },
  education: {
    subjects: [
      'Grade Submission Reminder',
      'Faculty Meeting Agenda',
      'Grant Application Deadline',
      'Student Inquiry',
      'Curriculum Committee Update',
      'Research Symposium',
      'Office Hours Change',
      'Department Newsletter',
      'Accreditation Documents',
      'Sabbatical Application',
    ],
    senders: ['dean@university.edu', 'registrar@university.edu', 'grants@university.edu', 'hr@university.edu'],
  },
  creative: {
    subjects: [
      'Client Feedback on Designs',
      'Project Brief Update',
      'Asset Delivery Confirmation',
      'Invoice Payment Received',
      'New Project Opportunity',
      'Portfolio Feature Request',
      'Brand Guidelines Update',
      'Creative Review Session',
      'Vendor Quote',
      'Inspiration Newsletter',
    ],
    senders: ['client@company.com', 'accounts@agency.com', 'creative.director@agency.com', 'pm@agency.com'],
  },
  legal: {
    subjects: [
      'Case Status Update',
      'Court Filing Deadline',
      'Client Document Request',
      'Settlement Offer',
      'Discovery Response Due',
      'Partner Meeting Agenda',
      'CLE Opportunity',
      'Billing Summary',
      'Conflict Check Results',
      'New Client Intake',
    ],
    senders: ['paralegal@firm.com', 'billing@firm.com', 'managing.partner@firm.com', 'client@company.com'],
  },
  retail: {
    subjects: [
      'Daily Sales Report',
      'Inventory Alert',
      'Customer Complaint',
      'Vendor Shipment Update',
      'Marketing Campaign Results',
      'Staff Schedule',
      'New Product Launch',
      'Customer Review Summary',
      'Promotional Planning',
      'Return Authorization',
    ],
    senders: ['operations@store.com', 'marketing@store.com', 'hr@store.com', 'vendor@supplier.com'],
  },
  consulting: {
    subjects: [
      'Project Status Update',
      'Client Meeting Follow-up',
      'Deliverable Review Request',
      'Travel Itinerary',
      'Expense Approval',
      'Knowledge Share Session',
      'Proposal Feedback',
      'Staffing Request',
      'Industry Research',
      'Partner Review Notes',
    ],
    senders: ['engagement.manager@consulting.com', 'travel@consulting.com', 'partner@consulting.com', 'client@company.com'],
  },
  engineering: {
    subjects: [
      'Design Review Notes',
      'Test Results Summary',
      'Project Timeline Update',
      'Vendor Specification',
      'Safety Incident Report',
      'Equipment Maintenance',
      'Material Approval',
      'Budget Review',
      'Permit Application Status',
      'Team Meeting Agenda',
    ],
    senders: ['pm@engineering.com', 'safety@engineering.com', 'procurement@engineering.com', 'vendor@supplier.com'],
  },
  general: {
    subjects: [
      'Team Meeting Tomorrow',
      'Project Update',
      'Action Items from Meeting',
      'Vacation Request',
      'Training Opportunity',
      'Monthly Newsletter',
      'Company Announcement',
      'Benefits Enrollment',
      'Performance Review',
      'Team Building Event',
    ],
    senders: ['manager@company.com', 'hr@company.com', 'team@company.com', 'admin@company.com'],
  },
};

/**
 * Social message topics.
 */
const SOCIAL_MESSAGES = [
  { topic: 'Work', messages: ['Running late to the meeting', 'Did you see the announcement?', 'Quick question about the project'] },
  { topic: 'Personal', messages: ['Dinner plans tonight?', 'Happy birthday!', 'How was your weekend?'] },
  { topic: 'Planning', messages: ['What time works for you?', 'Can we reschedule?', 'Let me know when you are free'] },
  { topic: 'Sharing', messages: ['Check out this article', 'Thought you would like this', 'Interesting read'] },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generates a UUID v7 for event identification.
 */
function generateEventId(): string {
  return uuidv7();
}

/**
 * Generates a trace ID for end-to-end tracking.
 */
function generateTraceId(): string {
  return `trace_${uuidv7()}`;
}

/**
 * Generates a random timestamp within the past 30 days.
 */
function generateTimestamp(): number {
  const now = Date.now();
  const offset = Math.random() * THIRTY_DAYS_MS;
  return now - offset;
}

/**
 * Generates a timestamp for a specific time of day (for sleep events).
 */
function generateTimeOfDay(baseTimestamp: number, hour: number, minuteVariance: number = 30): number {
  const date = new Date(baseTimestamp);
  date.setHours(hour, Math.floor(Math.random() * minuteVariance), 0, 0);
  return date.getTime();
}

/**
 * Picks a random item from an array.
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Picks multiple random items from an array.
 */
function randomPickMultiple<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generates a random duration in minutes.
 */
function randomDuration(minMinutes: number, maxMinutes: number): number {
  return Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
}

/**
 * Truncates a string to max length for payload preview.
 */
function truncatePreview(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Determines brain status based on timestamp (older events more likely to be completed).
 */
function determineBrainStatus(timestampMs: number): BrainStatus {
  const ageMs = Date.now() - timestampMs;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > 24) {
    // Events older than 24 hours: 90% completed, 5% failed, 5% skipped
    const rand = Math.random();
    if (rand < 0.90) return 'completed';
    if (rand < 0.95) return 'failed';
    return 'skipped';
  } else if (ageHours > 1) {
    // Events 1-24 hours old: 70% completed, 20% pending, 10% processing
    const rand = Math.random();
    if (rand < 0.70) return 'completed';
    if (rand < 0.90) return 'pending';
    return 'processing';
  } else {
    // Events less than 1 hour old: 30% completed, 50% pending, 20% processing
    const rand = Math.random();
    if (rand < 0.30) return 'completed';
    if (rand < 0.80) return 'pending';
    return 'processing';
  }
}

// =============================================================================
// EVENT GENERATORS
// =============================================================================

/**
 * Generates a browser event (page_visit, search_query, bookmark_added, reading_session).
 */
function generateBrowserEvent(user: DemoUser): GeneratedEvent {
  const eventTypes = ['page_visit', 'search_query', 'bookmark_added', 'reading_session'];
  const weights = [50, 25, 10, 15]; // Distribution within browser events

  // Weighted random selection
  const rand = Math.random() * 100;
  let cumulative = 0;
  let eventType = eventTypes[0];
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      eventType = eventTypes[i];
      break;
    }
  }

  const industryData = INDUSTRY_SITES[user.industry];
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  switch (eventType) {
    case 'page_visit': {
      const url = `https://${randomPick(industryData.sites)}`;
      const duration = randomDuration(10, 600); // 10 seconds to 10 minutes
      payload = {
        url,
        title: `Page on ${new URL(url).hostname}`,
        duration_seconds: duration,
        referrer: Math.random() > 0.7 ? 'https://google.com/search' : null,
        device_type: randomPick(['desktop', 'mobile', 'tablet']),
      };
      payloadPreview = truncatePreview(`Visited ${url} for ${duration}s`);
      break;
    }
    case 'search_query': {
      const query = randomPick(industryData.searches);
      const resultsClicked = Math.floor(Math.random() * 5);
      payload = {
        query,
        search_engine: randomPick(['google', 'duckduckgo', 'bing']),
        results_clicked: resultsClicked,
        time_to_first_click_ms: resultsClicked > 0 ? randomDuration(1000, 30000) : null,
      };
      payloadPreview = truncatePreview(`Searched: "${query}" (${resultsClicked} results clicked)`);
      break;
    }
    case 'bookmark_added': {
      const url = `https://${randomPick(industryData.sites)}`;
      const folder = randomPick(['Work', 'Research', 'Reading List', 'Favorites', 'To Review']);
      payload = {
        url,
        title: `Bookmark: ${new URL(url).hostname}`,
        folder,
        tags: randomPickMultiple(['important', 'reference', 'todo', 'archive'], Math.floor(Math.random() * 3)),
      };
      payloadPreview = truncatePreview(`Bookmarked ${url} to ${folder}`);
      break;
    }
    case 'reading_session': {
      const url = `https://${randomPick(industryData.sites)}`;
      const duration = randomDuration(120, 1800); // 2-30 minutes
      const scrollDepth = Math.floor(Math.random() * 100);
      payload = {
        url,
        title: `Article on ${new URL(url).hostname}`,
        duration_seconds: duration,
        scroll_depth_percent: scrollDepth,
        highlights_count: Math.floor(Math.random() * 5),
        completed: scrollDepth > 80,
      };
      payloadPreview = truncatePreview(`Read article on ${new URL(url).hostname} for ${Math.round(duration / 60)}min (${scrollDepth}% scroll)`);
      break;
    }
    default:
      payload = {};
      payloadPreview = 'Browser activity';
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'browser',
    eventType: `browser.${eventType}`,
    domain: 'browser',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 5000), // 0-5 second delay
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : brainStatus === 'failed' ? 3 : 0,
    brainError: brainStatus === 'failed' ? 'Processing timeout exceeded' : undefined,
  };
}

/**
 * Generates a calendar event (event_created, meeting_joined, event_rsvp).
 */
function generateCalendarEvent(user: DemoUser): GeneratedEvent {
  const eventTypes = ['event_created', 'meeting_joined', 'event_rsvp'];
  const weights = [40, 40, 20];

  const rand = Math.random() * 100;
  let cumulative = 0;
  let eventType = eventTypes[0];
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      eventType = eventTypes[i];
      break;
    }
  }

  const industryData = INDUSTRY_MEETINGS[user.industry];
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  const meetingTitle = randomPick(industryData.titles);
  const location = randomPick(industryData.locations);
  const duration = randomDuration(15, 120);

  switch (eventType) {
    case 'event_created': {
      const startTime = timestampMs + randomDuration(60, 10080) * 60 * 1000; // 1 hour to 1 week in future
      payload = {
        title: meetingTitle,
        start_time: startTime,
        end_time: startTime + duration * 60 * 1000,
        location,
        attendees_count: Math.floor(Math.random() * 10) + 1,
        is_recurring: Math.random() > 0.7,
        calendar: randomPick(['Work', 'Personal', 'Team']),
      };
      payloadPreview = truncatePreview(`Created: "${meetingTitle}" at ${location} (${duration}min)`);
      break;
    }
    case 'meeting_joined': {
      const joinDelay = Math.floor(Math.random() * 10) - 5; // -5 to +5 minutes
      payload = {
        title: meetingTitle,
        location,
        join_time_offset_minutes: joinDelay,
        duration_minutes: duration,
        attendees_present: Math.floor(Math.random() * 8) + 2,
        is_organizer: Math.random() > 0.7,
      };
      payloadPreview = truncatePreview(`Joined: "${meetingTitle}" (${joinDelay >= 0 ? '+' : ''}${joinDelay}min from start)`);
      break;
    }
    case 'event_rsvp': {
      const response = randomPick(['accepted', 'declined', 'tentative']);
      payload = {
        title: meetingTitle,
        response,
        responded_within_hours: Math.floor(Math.random() * 48),
        organizer_email: `organizer@${user.email.split('@')[1]}`,
        has_conflict: response === 'declined' ? Math.random() > 0.5 : false,
      };
      payloadPreview = truncatePreview(`RSVP ${response}: "${meetingTitle}"`);
      break;
    }
    default:
      payload = {};
      payloadPreview = 'Calendar activity';
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'calendar',
    eventType: `calendar.${eventType}`,
    domain: 'calendar',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 3000),
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : brainStatus === 'failed' ? 2 : 0,
  };
}

/**
 * Generates a task event (task_created, task_completed, task_updated).
 */
function generateTaskEvent(user: DemoUser): GeneratedEvent {
  const eventTypes = ['task_created', 'task_completed', 'task_updated'];
  const weights = [35, 40, 25];

  const rand = Math.random() * 100;
  let cumulative = 0;
  let eventType = eventTypes[0];
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      eventType = eventTypes[i];
      break;
    }
  }

  const industryTasks = INDUSTRY_TASKS[user.industry];
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  const taskTitle = randomPick(industryTasks);
  const priority = randomPick(['low', 'medium', 'high', 'urgent']);
  const project = randomPick(['Q4 Goals', 'Ongoing', 'Sprint 23', 'Personal', 'Team']);

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  switch (eventType) {
    case 'task_created': {
      const dueDate = timestampMs + randomDuration(1, 14) * 24 * 60 * 60 * 1000;
      payload = {
        title: taskTitle,
        priority,
        project,
        due_date: dueDate,
        tags: randomPickMultiple(['focus', 'blocked', 'review', 'delegate'], Math.floor(Math.random() * 2)),
        estimated_hours: Math.floor(Math.random() * 8) + 1,
      };
      payloadPreview = truncatePreview(`Created task: "${taskTitle}" [${priority}]`);
      break;
    }
    case 'task_completed': {
      const createdDaysAgo = Math.floor(Math.random() * 14) + 1;
      const estimatedHours = Math.floor(Math.random() * 8) + 1;
      const actualHours = estimatedHours + (Math.random() - 0.5) * 4;
      payload = {
        title: taskTitle,
        priority,
        project,
        created_days_ago: createdDaysAgo,
        estimated_hours: estimatedHours,
        actual_hours: Math.max(0.5, actualHours),
        completed_on_time: actualHours <= estimatedHours,
      };
      payloadPreview = truncatePreview(`Completed: "${taskTitle}" (${actualHours.toFixed(1)}h)`);
      break;
    }
    case 'task_updated': {
      const updates = randomPickMultiple(['priority', 'due_date', 'assignee', 'description', 'tags'], Math.floor(Math.random() * 2) + 1);
      payload = {
        title: taskTitle,
        fields_updated: updates,
        previous_priority: priority,
        new_priority: randomPick(['low', 'medium', 'high', 'urgent']),
        update_reason: randomPick(['scope_change', 'reprioritization', 'clarification', 'delegation']),
      };
      payloadPreview = truncatePreview(`Updated "${taskTitle}": ${updates.join(', ')}`);
      break;
    }
    default:
      payload = {};
      payloadPreview = 'Task activity';
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'tasks',
    eventType: `tasks.${eventType}`,
    domain: 'tasks',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 2000),
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : 0,
  };
}

/**
 * Generates a workout event (workout_started, workout_completed, exercise_completed).
 */
function generateWorkoutEvent(user: DemoUser): GeneratedEvent {
  const eventTypes = ['workout_started', 'workout_completed', 'exercise_completed'];
  const weights = [20, 25, 55];

  const rand = Math.random() * 100;
  let cumulative = 0;
  let eventType = eventTypes[0];
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      eventType = eventTypes[i];
      break;
    }
  }

  const workout = randomPick(WORKOUT_TYPES);
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  switch (eventType) {
    case 'workout_started': {
      payload = {
        workout_name: workout.name,
        workout_type: workout.type,
        planned_exercises: workout.exercises,
        planned_duration_minutes: randomDuration(30, 90),
        location: randomPick(['Home Gym', 'Fitness Center', 'Outdoors', 'Office Gym']),
      };
      payloadPreview = truncatePreview(`Started: ${workout.name} (${workout.type})`);
      break;
    }
    case 'workout_completed': {
      const duration = randomDuration(25, 100);
      const caloriesBurned = duration * (workout.type === 'cardio' ? 10 : 6);
      payload = {
        workout_name: workout.name,
        workout_type: workout.type,
        duration_minutes: duration,
        calories_burned: caloriesBurned,
        exercises_completed: workout.exercises.length,
        average_heart_rate: Math.floor(Math.random() * 40) + 120,
        max_heart_rate: Math.floor(Math.random() * 30) + 160,
        perceived_effort: Math.floor(Math.random() * 4) + 6, // 6-10 scale
      };
      payloadPreview = truncatePreview(`Completed: ${workout.name} - ${duration}min, ${caloriesBurned}cal`);
      break;
    }
    case 'exercise_completed': {
      const exercise = randomPick(workout.exercises);
      const sets = Math.floor(Math.random() * 3) + 2;
      const reps = Math.floor(Math.random() * 8) + 8;
      payload = {
        exercise_name: exercise,
        workout_name: workout.name,
        sets_completed: sets,
        reps_per_set: reps,
        weight_lbs: workout.type === 'strength' ? Math.floor(Math.random() * 100) + 20 : null,
        rest_time_seconds: Math.floor(Math.random() * 60) + 30,
        form_rating: Math.floor(Math.random() * 3) + 3, // 3-5 scale
      };
      payloadPreview = truncatePreview(`${exercise}: ${sets}x${reps}${payload.weight_lbs ? ` @ ${payload.weight_lbs}lbs` : ''}`);
      break;
    }
    default:
      payload = {};
      payloadPreview = 'Workout activity';
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'workouts',
    eventType: `workouts.${eventType}`,
    domain: 'workouts',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 10000),
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : 0,
  };
}

/**
 * Generates a sleep event (sleep_session_start, sleep_session_end).
 */
function generateSleepEvent(user: DemoUser): GeneratedEvent {
  const eventType = Math.random() > 0.5 ? 'sleep_session_start' : 'sleep_session_end';

  // Generate a base date within last 30 days
  const baseTimestamp = generateTimestamp();
  const brainStatus = determineBrainStatus(baseTimestamp);

  let payload: Record<string, unknown>;
  let payloadPreview: string;
  let timestampMs: number;

  if (eventType === 'sleep_session_start') {
    // Bedtime typically 9pm-12am with variance
    timestampMs = generateTimeOfDay(baseTimestamp, 21 + Math.floor(Math.random() * 4), 60);
    const plannedWakeTime = timestampMs + (7 + Math.random() * 2) * 60 * 60 * 1000; // 7-9 hours later

    payload = {
      bedtime: new Date(timestampMs).toISOString(),
      planned_wake_time: new Date(plannedWakeTime).toISOString(),
      sleep_goal_hours: 7 + Math.floor(Math.random() * 2),
      device: randomPick(['Apple Watch', 'Oura Ring', 'Fitbit', 'Whoop']),
      pre_sleep_activity: randomPick(['reading', 'meditation', 'screen_time', 'exercise', 'none']),
      caffeine_hours_ago: Math.floor(Math.random() * 12) + 4,
    };
    payloadPreview = truncatePreview(`Sleep started at ${new Date(timestampMs).toLocaleTimeString()}`);
  } else {
    // Wake time typically 5am-9am with variance
    timestampMs = generateTimeOfDay(baseTimestamp, 5 + Math.floor(Math.random() * 5), 60);
    const sleepDuration = 5 + Math.random() * 4; // 5-9 hours
    const sleepStart = timestampMs - sleepDuration * 60 * 60 * 1000;

    const deepSleepPercent = 15 + Math.random() * 15;
    const remSleepPercent = 20 + Math.random() * 10;
    const lightSleepPercent = 100 - deepSleepPercent - remSleepPercent;

    payload = {
      wake_time: new Date(timestampMs).toISOString(),
      sleep_start: new Date(sleepStart).toISOString(),
      total_sleep_hours: sleepDuration.toFixed(1),
      sleep_score: Math.floor(Math.random() * 30) + 70, // 70-100
      deep_sleep_percent: deepSleepPercent.toFixed(1),
      rem_sleep_percent: remSleepPercent.toFixed(1),
      light_sleep_percent: lightSleepPercent.toFixed(1),
      times_woken: Math.floor(Math.random() * 4),
      average_heart_rate: Math.floor(Math.random() * 15) + 50,
      hrv_average: Math.floor(Math.random() * 40) + 30,
    };
    payloadPreview = truncatePreview(`Slept ${sleepDuration.toFixed(1)}h, score: ${payload.sleep_score}`);
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'sleep',
    eventType: `sleep.${eventType}`,
    domain: 'sleep',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 60000), // Up to 1 minute delay
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : 0,
  };
}

/**
 * Generates an email event (email_received, email_sent, email_replied).
 */
function generateEmailEvent(user: DemoUser): GeneratedEvent {
  const eventTypes = ['email_received', 'email_sent', 'email_replied'];
  const weights = [50, 30, 20];

  const rand = Math.random() * 100;
  let cumulative = 0;
  let eventType = eventTypes[0];
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      eventType = eventTypes[i];
      break;
    }
  }

  const industryEmails = INDUSTRY_EMAILS[user.industry];
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  const subject = randomPick(industryEmails.subjects);
  const isImportant = Math.random() > 0.8;

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  switch (eventType) {
    case 'email_received': {
      const sender = randomPick(industryEmails.senders);
      payload = {
        subject,
        from: sender,
        to: user.email,
        is_important: isImportant,
        has_attachments: Math.random() > 0.7,
        attachment_count: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
        is_thread: Math.random() > 0.5,
        thread_position: Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 2 : 1,
        labels: randomPickMultiple(['inbox', 'important', 'starred', 'work'], Math.floor(Math.random() * 2) + 1),
      };
      payloadPreview = truncatePreview(`Received: "${subject}" from ${sender}`);
      break;
    }
    case 'email_sent': {
      const recipient = randomPick(industryEmails.senders);
      payload = {
        subject,
        from: user.email,
        to: recipient,
        cc_count: Math.floor(Math.random() * 3),
        has_attachments: Math.random() > 0.8,
        word_count: Math.floor(Math.random() * 300) + 50,
        compose_time_seconds: Math.floor(Math.random() * 600) + 60,
        is_reply: false,
      };
      payloadPreview = truncatePreview(`Sent: "${subject}" to ${recipient}`);
      break;
    }
    case 'email_replied': {
      const originalSender = randomPick(industryEmails.senders);
      const replyDelay = Math.floor(Math.random() * 480) + 5; // 5 min to 8 hours
      payload = {
        subject: `Re: ${subject}`,
        original_from: originalSender,
        reply_to: originalSender,
        reply_delay_minutes: replyDelay,
        word_count: Math.floor(Math.random() * 200) + 30,
        thread_length: Math.floor(Math.random() * 6) + 2,
        is_inline_reply: Math.random() > 0.5,
      };
      payloadPreview = truncatePreview(`Replied to "${subject}" (${replyDelay}min delay)`);
      break;
    }
    default:
      payload = {};
      payloadPreview = 'Email activity';
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'email',
    eventType: `email.${eventType}`,
    domain: 'email',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 5000),
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'private',
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : 0,
  };
}

/**
 * Generates a social event (message_sent, message_received).
 */
function generateSocialEvent(user: DemoUser): GeneratedEvent {
  const eventType = Math.random() > 0.5 ? 'message_sent' : 'message_received';

  const messageData = randomPick(SOCIAL_MESSAGES);
  const message = randomPick(messageData.messages);
  const timestampMs = generateTimestamp();
  const brainStatus = determineBrainStatus(timestampMs);

  const platform = randomPick(['iMessage', 'WhatsApp', 'Slack', 'Discord', 'Telegram']);
  const contactName = randomPick(['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery']);

  let payload: Record<string, unknown>;
  let payloadPreview: string;

  if (eventType === 'message_sent') {
    payload = {
      platform,
      recipient: contactName,
      message_preview: message,
      topic: messageData.topic,
      character_count: message.length,
      has_media: Math.random() > 0.85,
      is_group_chat: Math.random() > 0.7,
      group_size: Math.random() > 0.7 ? Math.floor(Math.random() * 10) + 3 : null,
    };
    payloadPreview = truncatePreview(`Sent to ${contactName} on ${platform}: "${message}"`);
  } else {
    const responseTime = Math.floor(Math.random() * 3600); // 0-60 minutes in seconds
    payload = {
      platform,
      sender: contactName,
      message_preview: message,
      topic: messageData.topic,
      character_count: message.length,
      has_media: Math.random() > 0.85,
      is_group_chat: Math.random() > 0.7,
      responded: Math.random() > 0.3,
      response_time_seconds: Math.random() > 0.3 ? responseTime : null,
    };
    payloadPreview = truncatePreview(`From ${contactName} on ${platform}: "${message}"`);
  }

  return {
    eventId: generateEventId(),
    traceId: generateTraceId(),
    sourceApp: 'social',
    eventType: `social.${eventType}`,
    domain: 'social',
    timestampMs,
    receivedAtMs: timestampMs + Math.floor(Math.random() * 2000),
    clerkUserId: user.clerkUserId,
    consentVersion: user.consentVersion,
    privacyScope: 'social', // Social events have 'social' privacy scope
    payload,
    payloadPreview,
    brainStatus,
    brainAttempts: brainStatus === 'completed' ? 1 : 0,
  };
}

// =============================================================================
// MAIN GENERATOR FUNCTION
// =============================================================================

/**
 * Generator function mapping for each event type.
 */
const EVENT_GENERATORS: Record<string, (user: DemoUser) => GeneratedEvent> = {
  browser: generateBrowserEvent,
  calendar: generateCalendarEvent,
  tasks: generateTaskEvent,
  workouts: generateWorkoutEvent,
  sleep: generateSleepEvent,
  email: generateEmailEvent,
  social: generateSocialEvent,
};

/**
 * Selects an event type based on the distribution weights.
 */
function selectEventType(): keyof typeof EVENT_DISTRIBUTION {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const [type, weight] of Object.entries(EVENT_DISTRIBUTION)) {
    cumulative += weight;
    if (rand < cumulative) {
      return type as keyof typeof EVENT_DISTRIBUTION;
    }
  }

  return 'browser'; // Default fallback
}

/**
 * Generates a mix of events for a user based on the defined distribution.
 *
 * @param user - The demo user to generate events for
 * @param count - The number of events to generate
 * @returns Array of generated events
 */
export function generateEventsForUser(user: DemoUser, count: number): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];

  for (let i = 0; i < count; i++) {
    const eventType = selectEventType();
    const generator = EVENT_GENERATORS[eventType];

    if (generator) {
      events.push(generator(user));
    }
  }

  // Sort events by timestamp (oldest first)
  events.sort((a, b) => a.timestampMs - b.timestampMs);

  return events;
}

/**
 * Generates events for a specific event type only.
 * Useful for testing or targeted data generation.
 *
 * @param user - The demo user to generate events for
 * @param eventType - The type of events to generate
 * @param count - The number of events to generate
 * @returns Array of generated events
 */
export function generateEventsOfType(
  user: DemoUser,
  eventType: keyof typeof EVENT_DISTRIBUTION,
  count: number
): GeneratedEvent[] {
  const generator = EVENT_GENERATORS[eventType];

  if (!generator) {
    throw new Error(`Unknown event type: ${eventType}`);
  }

  const events: GeneratedEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push(generator(user));
  }

  // Sort events by timestamp (oldest first)
  events.sort((a, b) => a.timestampMs - b.timestampMs);

  return events;
}

/**
 * Generates a summary of event distribution for a set of events.
 * Useful for verification and debugging.
 *
 * @param events - Array of generated events
 * @returns Distribution summary object
 */
export function getEventDistribution(events: GeneratedEvent[]): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const event of events) {
    const type = event.sourceApp;
    distribution[type] = (distribution[type] || 0) + 1;
  }

  return distribution;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Individual generators for fine-grained control
  generateBrowserEvent,
  generateCalendarEvent,
  generateTaskEvent,
  generateWorkoutEvent,
  generateSleepEvent,
  generateEmailEvent,
  generateSocialEvent,

  // Utility functions
  generateEventId,
  generateTraceId,
  generateTimestamp,
  truncatePreview,

  // Constants
  EVENT_DISTRIBUTION,
  INDUSTRY_SITES,
  INDUSTRY_MEETINGS,
  INDUSTRY_TASKS,
  INDUSTRY_EMAILS,
  WORKOUT_TYPES,
  SOCIAL_MESSAGES,
};
