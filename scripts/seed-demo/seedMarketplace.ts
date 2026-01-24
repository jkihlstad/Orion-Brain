/**
 * Marketplace Demo Data Seeding Script
 *
 * Seeds the Neo4j graph database with realistic marketplace demo data including:
 * - 50+ business profiles across various industries
 * - Offerings for each business
 * - Verified proof claims (3-10 per business)
 * - Relationships between businesses, proofs, and users
 *
 * Usage: npx tsx scripts/seed-demo/seedMarketplace.ts
 *
 * Environment Variables:
 * - NEO4J_HTTP_URL: Neo4j Query API URL
 * - NEO4J_USER: Neo4j username
 * - NEO4J_PASS: Neo4j password
 *
 * @version 1.0.0
 */

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
// TYPES
// =============================================================================

type MarketplaceIndustry =
  | 'software_tech'
  | 'legal'
  | 'healthcare'
  | 'marketing'
  | 'financial'
  | 'construction'
  | 'creative'
  | 'education'
  | 'real_estate'
  | 'fitness_wellness';

type ProofType = 'completion' | 'certification' | 'portfolio' | 'testimonial';

type ProofStatus = 'submitted' | 'verified' | 'rejected';

interface BusinessProfile {
  businessId: string;
  ownerId: string;
  name: string;
  description: string;
  primaryCategory: string;
  tags: string[];
  serviceAreaType: 'radius' | 'regions' | 'remote';
  serviceAreaLat: number | null;
  serviceAreaLng: number | null;
  serviceAreaRadiusMiles: number | null;
  serviceAreaRegions: string[] | null;
  status: 'draft' | 'active' | 'suspended';
  isVerified: boolean;
  proofSharingEnabled: boolean;
  verifiedProofCount: number;
  totalCompletions: number;
  lastVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
  // Contact info
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
  // Rating
  averageRating: number;
  reviewCount: number;
}

interface Offering {
  offeringId: string;
  businessId: string;
  title: string;
  description: string;
  offeringType: 'service' | 'product' | 'consultation';
  tags: string[];
  priceType: 'fixed' | 'hourly' | 'quote' | 'free';
  priceAmountCents: number | null;
  priceCurrency: string;
  status: 'active' | 'inactive';
  createdAt: number;
  updatedAt: number;
}

interface ProofClaim {
  claimId: string;
  businessId: string;
  proofType: ProofType;
  title: string;
  description: string;
  serviceTags: string[];
  clientReference: string | null;
  completedAt: number | null;
  status: ProofStatus;
  verifiedBy: string | null;
  verifiedAt: number | null;
  rejectionReason: string | null;
  submittedAt: number;
}

// =============================================================================
// DATA GENERATORS - INDUSTRY SPECIFIC
// =============================================================================

interface IndustryData {
  category: string;
  tags: string[];
  businessNamePrefixes: string[];
  businessNameSuffixes: string[];
  descriptions: string[];
  offerings: Array<{
    title: string;
    description: string;
    type: 'service' | 'product' | 'consultation';
    priceType: 'fixed' | 'hourly' | 'quote' | 'free';
    priceRange: [number, number]; // in cents
  }>;
  proofTemplates: Array<{
    type: ProofType;
    titleTemplate: string;
    descriptionTemplate: string;
    serviceTags: string[];
  }>;
  certifications: string[];
}

const INDUSTRY_DATA: Record<MarketplaceIndustry, IndustryData> = {
  software_tech: {
    category: 'Software & Technology',
    tags: ['software', 'technology', 'consulting', 'development', 'IT', 'cloud', 'SaaS', 'web development', 'mobile apps', 'AI/ML'],
    businessNamePrefixes: ['Apex', 'Nova', 'Quantum', 'Digital', 'Cloud', 'Tech', 'Cyber', 'Data', 'Logic', 'Byte'],
    businessNameSuffixes: ['Solutions', 'Systems', 'Technologies', 'Labs', 'Innovations', 'Tech', 'Digital', 'Software', 'Consulting'],
    descriptions: [
      'Full-stack software development and consulting services for businesses of all sizes.',
      'Cloud infrastructure and DevOps solutions to accelerate your digital transformation.',
      'Custom software solutions designed to solve your unique business challenges.',
      'Enterprise software consulting with expertise in modern architectures.',
      'AI and machine learning solutions to unlock insights from your data.',
    ],
    offerings: [
      { title: 'Web Application Development', description: 'Custom web applications built with modern frameworks', type: 'service', priceType: 'hourly', priceRange: [15000, 25000] },
      { title: 'Cloud Migration Services', description: 'Seamless migration to AWS, Azure, or GCP', type: 'service', priceType: 'quote', priceRange: [500000, 2000000] },
      { title: 'Technical Consultation', description: '1-hour technical architecture consultation', type: 'consultation', priceType: 'fixed', priceRange: [20000, 50000] },
      { title: 'Mobile App Development', description: 'iOS and Android app development', type: 'service', priceType: 'quote', priceRange: [1000000, 5000000] },
      { title: 'Code Review & Audit', description: 'Comprehensive code quality assessment', type: 'service', priceType: 'fixed', priceRange: [100000, 300000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Completed {project} for {client}', descriptionTemplate: 'Successfully delivered {project} project including {details}', serviceTags: ['development', 'deployment'] },
      { type: 'certification', titleTemplate: '{cert} Certified', descriptionTemplate: 'Achieved {cert} certification demonstrating expertise in {area}', serviceTags: ['certified', 'professional'] },
      { type: 'portfolio', titleTemplate: '{project} Case Study', descriptionTemplate: 'Detailed case study of {project} implementation with measurable results', serviceTags: ['portfolio', 'case-study'] },
      { type: 'testimonial', titleTemplate: 'Client Review - {client}', descriptionTemplate: '{client} provided a 5-star review for our {service} work', serviceTags: ['review', 'testimonial'] },
    ],
    certifications: ['AWS Solutions Architect', 'Google Cloud Professional', 'Microsoft Azure Expert', 'Kubernetes Administrator', 'Certified Scrum Master'],
  },
  legal: {
    category: 'Legal Services',
    tags: ['legal', 'law', 'attorney', 'lawyer', 'litigation', 'contracts', 'compliance', 'corporate law', 'estate planning', 'family law'],
    businessNamePrefixes: ['Sterling', 'Blackstone', 'Harrison', 'Montgomery', 'Westbrook', 'Parker', 'Mitchell', 'Crawford', 'Sullivan', 'Bennett'],
    businessNameSuffixes: ['Law Group', 'Legal', 'Law Firm', 'Attorneys', '& Associates', 'Legal Services', 'Law Partners', 'Legal Counsel'],
    descriptions: [
      'Experienced legal counsel specializing in corporate law and business transactions.',
      'Family law firm dedicated to protecting your rights and your familys future.',
      'Comprehensive legal services for small businesses and startups.',
      'Estate planning and probate services with compassionate representation.',
      'Litigation specialists with a proven track record of success.',
    ],
    offerings: [
      { title: 'Business Formation', description: 'LLC, Corporation, and Partnership formation services', type: 'service', priceType: 'fixed', priceRange: [50000, 200000] },
      { title: 'Contract Review', description: 'Comprehensive contract review and negotiation', type: 'service', priceType: 'hourly', priceRange: [25000, 50000] },
      { title: 'Legal Consultation', description: 'Initial legal consultation and case assessment', type: 'consultation', priceType: 'fixed', priceRange: [15000, 30000] },
      { title: 'Estate Planning Package', description: 'Wills, trusts, and power of attorney documents', type: 'service', priceType: 'fixed', priceRange: [150000, 500000] },
      { title: 'Trademark Registration', description: 'Full trademark search and registration service', type: 'service', priceType: 'fixed', priceRange: [100000, 250000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Successfully resolved {case} matter', descriptionTemplate: 'Achieved favorable outcome in {case} case for {client}', serviceTags: ['litigation', 'resolution'] },
      { type: 'certification', titleTemplate: 'Bar Admission - {state}', descriptionTemplate: 'Licensed to practice law in {state}', serviceTags: ['licensed', 'bar-admission'] },
      { type: 'testimonial', titleTemplate: 'Client Testimonial - {client}', descriptionTemplate: '{client} highly recommends our {service} services', serviceTags: ['review', 'client-success'] },
      { type: 'portfolio', titleTemplate: 'Notable Case - {case}', descriptionTemplate: 'Successfully handled {case} involving {details}', serviceTags: ['case-study', 'track-record'] },
    ],
    certifications: ['State Bar Certified', 'Board Certified Specialist', 'Martindale-Hubbell AV Rated', 'Super Lawyers Selected', 'AVVO 10.0 Rating'],
  },
  healthcare: {
    category: 'Healthcare',
    tags: ['healthcare', 'medical', 'wellness', 'therapy', 'mental health', 'physical therapy', 'nutrition', 'chiropractic', 'dental', 'optometry'],
    businessNamePrefixes: ['Wellness', 'Harmony', 'Vitality', 'Premier', 'Advanced', 'Complete', 'Integrated', 'Total', 'Family', 'Elite'],
    businessNameSuffixes: ['Health', 'Medical Center', 'Clinic', 'Care', 'Wellness', 'Healthcare', 'Medicine', 'Health Services', 'Medical Group'],
    descriptions: [
      'Comprehensive primary care with a focus on preventive medicine.',
      'Physical therapy and rehabilitation services to help you recover and thrive.',
      'Mental health counseling with a compassionate, patient-centered approach.',
      'Integrative medicine combining traditional and holistic treatments.',
      'Specialized care for the whole family from pediatrics to geriatrics.',
    ],
    offerings: [
      { title: 'Initial Health Assessment', description: 'Comprehensive health evaluation and wellness plan', type: 'consultation', priceType: 'fixed', priceRange: [15000, 35000] },
      { title: 'Physical Therapy Session', description: 'One-hour physical therapy treatment session', type: 'service', priceType: 'fixed', priceRange: [10000, 20000] },
      { title: 'Nutritional Counseling', description: 'Personalized nutrition planning and guidance', type: 'consultation', priceType: 'hourly', priceRange: [10000, 20000] },
      { title: 'Mental Health Therapy', description: 'Individual therapy session with licensed counselor', type: 'service', priceType: 'fixed', priceRange: [12000, 25000] },
      { title: 'Wellness Package', description: 'Monthly wellness program with regular check-ins', type: 'service', priceType: 'fixed', priceRange: [50000, 150000] },
    ],
    proofTemplates: [
      { type: 'certification', titleTemplate: '{cert} Licensed Provider', descriptionTemplate: 'State-licensed healthcare provider with {cert} credentials', serviceTags: ['licensed', 'certified'] },
      { type: 'completion', titleTemplate: 'Patient Success - {condition}', descriptionTemplate: 'Helped patient recover from {condition} through comprehensive treatment', serviceTags: ['patient-care', 'recovery'] },
      { type: 'testimonial', titleTemplate: 'Patient Review', descriptionTemplate: 'Patient provided excellent feedback on {service} treatment', serviceTags: ['review', 'patient-satisfaction'] },
      { type: 'certification', titleTemplate: 'Board Certification - {specialty}', descriptionTemplate: 'Board certified in {specialty} by recognized medical board', serviceTags: ['board-certified', 'specialist'] },
    ],
    certifications: ['Board Certified', 'State Licensed', 'HIPAA Compliant', 'Joint Commission Accredited', 'Medicare Certified'],
  },
  marketing: {
    category: 'Marketing & Advertising',
    tags: ['marketing', 'advertising', 'digital marketing', 'SEO', 'social media', 'branding', 'content marketing', 'PPC', 'email marketing', 'PR'],
    businessNamePrefixes: ['Amplify', 'Spark', 'Elevate', 'Impact', 'Growth', 'Buzz', 'Momentum', 'Ignite', 'Launch', 'Catalyst'],
    businessNameSuffixes: ['Marketing', 'Media', 'Agency', 'Digital', 'Creative', 'Communications', 'Strategies', 'Group', 'Studios'],
    descriptions: [
      'Full-service digital marketing agency driving measurable results.',
      'Creative branding and design services that make your business stand out.',
      'Data-driven marketing strategies to accelerate your growth.',
      'Social media management and content creation for modern brands.',
      'SEO and PPC specialists helping businesses dominate search results.',
    ],
    offerings: [
      { title: 'Brand Strategy Package', description: 'Complete brand identity development and guidelines', type: 'service', priceType: 'fixed', priceRange: [300000, 1000000] },
      { title: 'Monthly SEO Services', description: 'Ongoing SEO optimization and content strategy', type: 'service', priceType: 'fixed', priceRange: [200000, 500000] },
      { title: 'Marketing Consultation', description: 'Strategic marketing assessment and recommendations', type: 'consultation', priceType: 'fixed', priceRange: [25000, 75000] },
      { title: 'Social Media Management', description: 'Full social media management and content creation', type: 'service', priceType: 'fixed', priceRange: [150000, 400000] },
      { title: 'PPC Campaign Management', description: 'Google Ads and social media advertising management', type: 'service', priceType: 'fixed', priceRange: [100000, 300000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Campaign Success - {client}', descriptionTemplate: 'Achieved {metric} increase in {goal} for {client}', serviceTags: ['campaign', 'results'] },
      { type: 'portfolio', titleTemplate: 'Case Study - {client}', descriptionTemplate: 'Detailed marketing success story with {client} showing {results}', serviceTags: ['case-study', 'portfolio'] },
      { type: 'certification', titleTemplate: '{platform} Certified Partner', descriptionTemplate: 'Official certification as {platform} advertising partner', serviceTags: ['certified', 'partner'] },
      { type: 'testimonial', titleTemplate: 'Client Success Story - {client}', descriptionTemplate: '{client} achieved exceptional results through our marketing services', serviceTags: ['review', 'success'] },
    ],
    certifications: ['Google Ads Certified', 'Meta Business Partner', 'HubSpot Certified', 'Hootsuite Certified', 'Semrush Certified'],
  },
  financial: {
    category: 'Financial Services',
    tags: ['financial', 'accounting', 'bookkeeping', 'tax', 'investment', 'wealth management', 'CFO services', 'audit', 'payroll', 'financial planning'],
    businessNamePrefixes: ['Summit', 'Pinnacle', 'Cornerstone', 'Legacy', 'Horizon', 'Compass', 'Prosperity', 'Sterling', 'Capital', 'Keystone'],
    businessNameSuffixes: ['Financial', 'Advisors', 'Wealth Management', 'Accounting', 'CPA', 'Financial Group', 'Tax Services', 'Consulting'],
    descriptions: [
      'Comprehensive accounting and tax services for businesses and individuals.',
      'Wealth management and investment advisory for high-net-worth clients.',
      'CFO-level financial guidance for growing businesses.',
      'Tax planning and preparation with year-round support.',
      'Bookkeeping and payroll services that let you focus on your business.',
    ],
    offerings: [
      { title: 'Business Tax Preparation', description: 'Complete business tax return preparation and filing', type: 'service', priceType: 'fixed', priceRange: [50000, 200000] },
      { title: 'Monthly Bookkeeping', description: 'Full-service monthly bookkeeping and reconciliation', type: 'service', priceType: 'fixed', priceRange: [30000, 100000] },
      { title: 'Financial Planning Session', description: 'Comprehensive financial planning consultation', type: 'consultation', priceType: 'fixed', priceRange: [25000, 75000] },
      { title: 'Fractional CFO Services', description: 'Part-time CFO services for growing businesses', type: 'service', priceType: 'hourly', priceRange: [20000, 50000] },
      { title: 'Investment Advisory', description: 'Personalized investment management services', type: 'service', priceType: 'quote', priceRange: [100000, 500000] },
    ],
    proofTemplates: [
      { type: 'certification', titleTemplate: 'CPA License - {state}', descriptionTemplate: 'Licensed Certified Public Accountant in {state}', serviceTags: ['CPA', 'licensed'] },
      { type: 'completion', titleTemplate: 'Tax Season Success - {year}', descriptionTemplate: 'Successfully completed {count} tax returns with 100% accuracy', serviceTags: ['tax', 'compliance'] },
      { type: 'testimonial', titleTemplate: 'Client Review - {client}', descriptionTemplate: '{client} saved {amount} through our tax planning strategies', serviceTags: ['review', 'savings'] },
      { type: 'certification', titleTemplate: '{cert} Designation', descriptionTemplate: 'Earned {cert} professional designation', serviceTags: ['certified', 'professional'] },
    ],
    certifications: ['CPA Licensed', 'CFP Certified', 'CFA Charterholder', 'EA Enrolled Agent', 'Series 65 Licensed'],
  },
  construction: {
    category: 'Construction & Contracting',
    tags: ['construction', 'contractor', 'remodeling', 'renovation', 'home improvement', 'roofing', 'plumbing', 'electrical', 'HVAC', 'general contractor'],
    businessNamePrefixes: ['Premier', 'Quality', 'Master', 'Pro', 'Elite', 'Custom', 'Superior', 'Allied', 'Precision', 'Reliable'],
    businessNameSuffixes: ['Construction', 'Builders', 'Contracting', 'Services', 'Renovations', 'Home Services', 'Remodeling', 'Building'],
    descriptions: [
      'Full-service general contracting for residential and commercial projects.',
      'Kitchen and bathroom remodeling specialists with attention to detail.',
      'Licensed electricians providing safe, code-compliant installations.',
      'Professional roofing services with quality workmanship guaranteed.',
      'HVAC installation, repair, and maintenance for comfort year-round.',
    ],
    offerings: [
      { title: 'Free Project Estimate', description: 'On-site evaluation and detailed project estimate', type: 'consultation', priceType: 'free', priceRange: [0, 0] },
      { title: 'Kitchen Remodel', description: 'Complete kitchen renovation including design and installation', type: 'service', priceType: 'quote', priceRange: [1500000, 5000000] },
      { title: 'Bathroom Remodel', description: 'Full bathroom renovation and modernization', type: 'service', priceType: 'quote', priceRange: [800000, 2500000] },
      { title: 'Electrical Service Call', description: 'Electrical repair and troubleshooting service', type: 'service', priceType: 'hourly', priceRange: [10000, 20000] },
      { title: 'Roof Inspection & Repair', description: 'Comprehensive roof inspection with repair recommendations', type: 'service', priceType: 'fixed', priceRange: [25000, 75000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Project Completed - {project}', descriptionTemplate: 'Successfully completed {project} for satisfied homeowner', serviceTags: ['completed', 'quality'] },
      { type: 'certification', titleTemplate: 'Licensed Contractor - {state}', descriptionTemplate: 'State-licensed contractor in {state} with bonding and insurance', serviceTags: ['licensed', 'bonded'] },
      { type: 'portfolio', titleTemplate: 'Before & After - {project}', descriptionTemplate: 'Transformation showcase of {project} renovation', serviceTags: ['portfolio', 'before-after'] },
      { type: 'testimonial', titleTemplate: 'Homeowner Review', descriptionTemplate: 'Homeowner highly satisfied with {project} work quality and timeline', serviceTags: ['review', 'satisfaction'] },
    ],
    certifications: ['State Licensed', 'Bonded & Insured', 'EPA Certified', 'OSHA Compliant', 'BBB A+ Rating'],
  },
  creative: {
    category: 'Creative Services',
    tags: ['design', 'photography', 'videography', 'graphic design', 'web design', 'illustration', 'animation', 'creative', 'visual arts', 'branding'],
    businessNamePrefixes: ['Vision', 'Pixel', 'Frame', 'Studio', 'Creative', 'Artisan', 'Crafted', 'Inspired', 'Modern', 'Bold'],
    businessNameSuffixes: ['Studio', 'Creative', 'Design', 'Photography', 'Productions', 'Visuals', 'Media', 'Arts', 'Works'],
    descriptions: [
      'Award-winning graphic design studio creating memorable brand identities.',
      'Professional photography services for events, portraits, and commercial needs.',
      'Video production company specializing in corporate and promotional content.',
      'Web design and development creating beautiful, functional websites.',
      'Creative illustration and animation for brands and publications.',
    ],
    offerings: [
      { title: 'Logo Design Package', description: 'Custom logo design with multiple concepts and revisions', type: 'service', priceType: 'fixed', priceRange: [50000, 200000] },
      { title: 'Event Photography', description: 'Professional event photography with edited images', type: 'service', priceType: 'fixed', priceRange: [100000, 400000] },
      { title: 'Video Production', description: 'Full video production from concept to final edit', type: 'service', priceType: 'quote', priceRange: [300000, 1500000] },
      { title: 'Website Design', description: 'Custom website design and development', type: 'service', priceType: 'fixed', priceRange: [200000, 800000] },
      { title: 'Creative Consultation', description: 'Brand strategy and creative direction session', type: 'consultation', priceType: 'hourly', priceRange: [15000, 30000] },
    ],
    proofTemplates: [
      { type: 'portfolio', titleTemplate: 'Featured Work - {project}', descriptionTemplate: 'Showcase of {project} creative work for {client}', serviceTags: ['portfolio', 'featured'] },
      { type: 'completion', titleTemplate: 'Project Delivered - {client}', descriptionTemplate: 'Successfully delivered {project} for {client}', serviceTags: ['completed', 'delivered'] },
      { type: 'testimonial', titleTemplate: 'Client Testimonial - {client}', descriptionTemplate: '{client} loved our creative work on {project}', serviceTags: ['review', 'testimonial'] },
      { type: 'certification', titleTemplate: 'Award Winner - {award}', descriptionTemplate: 'Recognized with {award} for excellence in creative work', serviceTags: ['award', 'recognition'] },
    ],
    certifications: ['Adobe Certified', 'Award Winner', 'Published Artist', 'Professional Member AIGA', 'PPA Certified'],
  },
  education: {
    category: 'Education & Tutoring',
    tags: ['tutoring', 'education', 'teaching', 'test prep', 'academic coaching', 'online learning', 'STEM', 'language learning', 'music lessons', 'college prep'],
    businessNamePrefixes: ['Bright', 'Scholar', 'Academic', 'Learning', 'Success', 'Excel', 'Aspire', 'Achievers', 'Future', 'Knowledge'],
    businessNameSuffixes: ['Academy', 'Tutoring', 'Learning Center', 'Education', 'Prep', 'Institute', 'School', 'Hub'],
    descriptions: [
      'Personalized tutoring services helping students achieve academic excellence.',
      'Test preparation specialists for SAT, ACT, GRE, and professional exams.',
      'STEM education programs making science and math accessible and fun.',
      'Language learning services with native-speaking instructors.',
      'Music lessons for all ages and skill levels from experienced musicians.',
    ],
    offerings: [
      { title: 'Private Tutoring Session', description: 'One-on-one tutoring session with expert tutor', type: 'service', priceType: 'hourly', priceRange: [5000, 15000] },
      { title: 'SAT Prep Course', description: 'Comprehensive SAT preparation program', type: 'service', priceType: 'fixed', priceRange: [100000, 300000] },
      { title: 'Academic Assessment', description: 'Comprehensive academic skills assessment', type: 'consultation', priceType: 'fixed', priceRange: [10000, 25000] },
      { title: 'Language Course Package', description: '10-session language learning package', type: 'service', priceType: 'fixed', priceRange: [50000, 150000] },
      { title: 'College Counseling', description: 'College application and admissions counseling', type: 'consultation', priceType: 'hourly', priceRange: [10000, 25000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Student Success - {result}', descriptionTemplate: 'Student achieved {result} after completing our program', serviceTags: ['success', 'results'] },
      { type: 'certification', titleTemplate: 'Teaching Credential - {subject}', descriptionTemplate: 'Certified teacher in {subject} with {years} years experience', serviceTags: ['certified', 'teacher'] },
      { type: 'testimonial', titleTemplate: 'Parent Review', descriptionTemplate: 'Parents thrilled with students {improvement} improvement', serviceTags: ['review', 'satisfaction'] },
      { type: 'portfolio', titleTemplate: 'Program Results - {year}', descriptionTemplate: '{percent}% of students improved their scores by {points}+ points', serviceTags: ['results', 'statistics'] },
    ],
    certifications: ['State Certified Teacher', 'Masters in Education', 'Test Prep Certified', 'Tutoring Association Member', 'Background Checked'],
  },
  real_estate: {
    category: 'Real Estate',
    tags: ['real estate', 'realtor', 'property', 'homes', 'buying', 'selling', 'rental', 'commercial real estate', 'property management', 'investment property'],
    businessNamePrefixes: ['Prime', 'Golden', 'Pacific', 'Coastal', 'Metro', 'Urban', 'Heritage', 'Landmark', 'Prestige', 'Signature'],
    businessNameSuffixes: ['Realty', 'Real Estate', 'Properties', 'Group', 'Homes', 'Estates', 'Real Estate Group', 'Realtors'],
    descriptions: [
      'Experienced real estate team helping buyers find their dream homes.',
      'Listing specialists with a track record of selling homes fast.',
      'Commercial real estate experts serving businesses and investors.',
      'Property management services for residential and commercial properties.',
      'Investment property specialists helping build wealth through real estate.',
    ],
    offerings: [
      { title: 'Free Home Valuation', description: 'Comprehensive market analysis and home valuation', type: 'consultation', priceType: 'free', priceRange: [0, 0] },
      { title: 'Buyer Representation', description: 'Full-service buyer agent representation', type: 'service', priceType: 'quote', priceRange: [0, 0] },
      { title: 'Listing Services', description: 'Complete home selling and marketing services', type: 'service', priceType: 'quote', priceRange: [0, 0] },
      { title: 'Property Management', description: 'Full-service property management for landlords', type: 'service', priceType: 'quote', priceRange: [0, 0] },
      { title: 'Investment Consultation', description: 'Real estate investment strategy consultation', type: 'consultation', priceType: 'fixed', priceRange: [25000, 75000] },
    ],
    proofTemplates: [
      { type: 'completion', titleTemplate: 'Home Sold - {address}', descriptionTemplate: 'Successfully sold {address} for {price} in {days} days', serviceTags: ['sold', 'transaction'] },
      { type: 'certification', titleTemplate: 'Licensed Realtor - {state}', descriptionTemplate: 'Licensed real estate agent in {state}', serviceTags: ['licensed', 'realtor'] },
      { type: 'testimonial', titleTemplate: 'Client Review - {type}', descriptionTemplate: 'Happy {type} shares their experience working with us', serviceTags: ['review', 'client'] },
      { type: 'portfolio', titleTemplate: 'Sales Record - {year}', descriptionTemplate: 'Closed {count} transactions totaling ${volume} in {year}', serviceTags: ['performance', 'track-record'] },
    ],
    certifications: ['Licensed Realtor', 'NAR Member', 'Certified Negotiation Expert', 'Luxury Home Specialist', 'e-PRO Certified'],
  },
  fitness_wellness: {
    category: 'Fitness & Wellness',
    tags: ['fitness', 'personal training', 'yoga', 'pilates', 'nutrition', 'wellness coaching', 'gym', 'crossfit', 'meditation', 'health coaching'],
    businessNamePrefixes: ['Peak', 'Strong', 'Balanced', 'Vital', 'Active', 'Fit', 'Core', 'Flow', 'Zen', 'Power'],
    businessNameSuffixes: ['Fitness', 'Training', 'Wellness', 'Studio', 'Performance', 'Health', 'Coaching', 'Gym'],
    descriptions: [
      'Certified personal trainers helping you reach your fitness goals.',
      'Yoga and meditation studio offering classes for all levels.',
      'Nutrition coaching and meal planning for optimal health.',
      'Wellness coaching integrating mind, body, and lifestyle.',
      'Group fitness classes in a supportive community environment.',
    ],
    offerings: [
      { title: 'Personal Training Session', description: 'One-on-one personal training session', type: 'service', priceType: 'fixed', priceRange: [5000, 15000] },
      { title: 'Fitness Assessment', description: 'Comprehensive fitness evaluation and goal setting', type: 'consultation', priceType: 'fixed', priceRange: [7500, 15000] },
      { title: 'Monthly Training Package', description: '12 personal training sessions per month', type: 'service', priceType: 'fixed', priceRange: [50000, 150000] },
      { title: 'Nutrition Coaching', description: 'Personalized nutrition plan and coaching', type: 'service', priceType: 'fixed', priceRange: [20000, 50000] },
      { title: 'Yoga Class Package', description: '10-class yoga pass', type: 'service', priceType: 'fixed', priceRange: [10000, 25000] },
    ],
    proofTemplates: [
      { type: 'certification', titleTemplate: '{cert} Certified Trainer', descriptionTemplate: 'Nationally certified personal trainer with {cert} credential', serviceTags: ['certified', 'trainer'] },
      { type: 'completion', titleTemplate: 'Client Transformation - {client}', descriptionTemplate: '{client} achieved {result} through dedicated training program', serviceTags: ['transformation', 'results'] },
      { type: 'testimonial', titleTemplate: 'Client Success Story', descriptionTemplate: 'Client shares their fitness journey and amazing results', serviceTags: ['review', 'success'] },
      { type: 'certification', titleTemplate: 'Specialty Certification - {specialty}', descriptionTemplate: 'Specialized certification in {specialty} training', serviceTags: ['specialist', 'certified'] },
    ],
    certifications: ['NASM Certified', 'ACE Certified', 'CrossFit Level 2', 'RYT-200 Yoga', 'Precision Nutrition Certified'],
  },
};

// =============================================================================
// LOCATION DATA
// =============================================================================

interface Location {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

const LOCATIONS: Location[] = [
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  { city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784 },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
  { city: 'Minneapolis', state: 'MN', lat: 44.9778, lng: -93.2650 },
  { city: 'Salt Lake City', state: 'UT', lat: 40.7608, lng: -111.8910 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7970 },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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
function generatePastTimestamp(daysAgo: number = 365): number {
  const now = Date.now();
  const offset = Math.random() * daysAgo * 24 * 60 * 60 * 1000;
  return now - offset;
}

/**
 * Generates a realistic phone number.
 */
function generatePhoneNumber(): string {
  return `+1${randomRange(200, 999)}${randomRange(100, 999)}${randomRange(1000, 9999)}`;
}

/**
 * Generates a website URL from business name.
 */
function generateWebsiteUrl(businessName: string): string {
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const tld = randomPick(['.com', '.io', '.co', '.net']);
  return `https://www.${slug}${tld}`;
}

// =============================================================================
// BUSINESS GENERATION
// =============================================================================

/**
 * Generates a unique business name.
 */
function generateBusinessName(industryData: IndustryData, usedNames: Set<string>): string {
  let name: string;
  let attempts = 0;

  do {
    const prefix = randomPick(industryData.businessNamePrefixes);
    const suffix = randomPick(industryData.businessNameSuffixes);
    name = `${prefix} ${suffix}`;
    attempts++;
  } while (usedNames.has(name) && attempts < 100);

  if (usedNames.has(name)) {
    name = `${name} ${randomRange(1, 999)}`;
  }

  usedNames.add(name);
  return name;
}

/**
 * Generates businesses for a specific industry.
 */
function generateBusinessesForIndustry(
  industry: MarketplaceIndustry,
  count: number,
  usedNames: Set<string>
): BusinessProfile[] {
  const industryData = INDUSTRY_DATA[industry];
  const businesses: BusinessProfile[] = [];

  for (let i = 0; i < count; i++) {
    const businessId = `biz_${uuidv7()}`;
    const ownerId = `owner_${uuidv7()}`;
    const name = generateBusinessName(industryData, usedNames);
    const location = randomPick(LOCATIONS);
    const createdAt = generatePastTimestamp(365);
    const isVerified = Math.random() > 0.3; // 70% verified
    const proofSharingEnabled = isVerified && Math.random() > 0.2; // 80% of verified enable sharing
    const verifiedProofCount = proofSharingEnabled ? randomRange(3, 15) : 0;
    const lastVerifiedAt = proofSharingEnabled ? generatePastTimestamp(90) : null;

    // Service area type based on industry
    type ServiceAreaType = 'radius' | 'regions' | 'remote';
    let serviceAreaType: ServiceAreaType = 'radius';
    if (industry === 'software_tech' || industry === 'education') {
      serviceAreaType = Math.random() > 0.5 ? 'remote' : 'radius';
    } else if (Math.random() > 0.8) {
      serviceAreaType = 'regions';
    }

    const business: BusinessProfile = {
      businessId,
      ownerId,
      name,
      description: randomPick(industryData.descriptions),
      primaryCategory: industryData.category,
      tags: randomPickMultiple(industryData.tags, randomRange(4, 8)),
      serviceAreaType,
      serviceAreaLat: serviceAreaType !== 'remote' ? location.lat : null,
      serviceAreaLng: serviceAreaType !== 'remote' ? location.lng : null,
      serviceAreaRadiusMiles: serviceAreaType === 'radius' ? randomRange(10, 50) : null,
      serviceAreaRegions: serviceAreaType === 'regions' ? [location.state] : null,
      status: 'active',
      isVerified,
      proofSharingEnabled,
      verifiedProofCount,
      totalCompletions: proofSharingEnabled ? randomRange(10, 100) : randomRange(0, 20),
      lastVerifiedAt,
      createdAt,
      updatedAt: Math.max(createdAt, generatePastTimestamp(30)),
      contactEmail: `contact@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
      contactPhone: Math.random() > 0.2 ? generatePhoneNumber() : null,
      websiteUrl: Math.random() > 0.3 ? generateWebsiteUrl(name) : null,
      averageRating: 3.5 + Math.random() * 1.5, // 3.5-5.0
      reviewCount: randomRange(5, 150),
    };

    businesses.push(business);
  }

  return businesses;
}

/**
 * Generates offerings for a business.
 */
function generateOfferingsForBusiness(
  business: BusinessProfile,
  industry: MarketplaceIndustry
): Offering[] {
  const industryData = INDUSTRY_DATA[industry];
  const offerings: Offering[] = [];
  const offeringCount = randomRange(2, 5);
  const selectedOfferings = randomPickMultiple(industryData.offerings, offeringCount);

  for (const template of selectedOfferings) {
    const offeringId = `off_${uuidv7()}`;
    const isFree = template.priceType === 'free';
    const isQuote = template.priceType === 'quote';
    const priceAmountCents = (isFree || isQuote)
      ? null
      : randomRange(template.priceRange[0], template.priceRange[1]);

    const offering: Offering = {
      offeringId,
      businessId: business.businessId,
      title: template.title,
      description: template.description,
      offeringType: template.type,
      tags: randomPickMultiple(industryData.tags, randomRange(2, 4)),
      priceType: template.priceType,
      priceAmountCents,
      priceCurrency: 'USD',
      status: 'active',
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };

    offerings.push(offering);
  }

  return offerings;
}

/**
 * Generates proof claims for a business.
 */
function generateProofClaimsForBusiness(
  business: BusinessProfile,
  industry: MarketplaceIndustry,
  adminUserId: string
): ProofClaim[] {
  if (!business.proofSharingEnabled) {
    return [];
  }

  const industryData = INDUSTRY_DATA[industry];
  const claims: ProofClaim[] = [];
  const claimCount = randomRange(3, 10);

  // Common placeholder values for templates
  const clients = ['Client A', 'Client B', 'Tech Corp', 'Growth Inc', 'Enterprise Co', 'Local Business', 'Startup XYZ'];
  const projects = ['Website Redesign', 'System Integration', 'Marketing Campaign', 'Brand Refresh', 'Custom Solution'];
  const metrics = ['50%', '100%', '3x', '200%', '10x'];
  const goals = ['ROI', 'engagement', 'conversions', 'traffic', 'efficiency'];
  const results = ['exceptional growth', 'significant improvement', 'measurable success', 'outstanding outcomes'];

  for (let i = 0; i < claimCount; i++) {
    const claimId = `claim_${uuidv7()}`;
    const template = randomPick(industryData.proofTemplates);
    const submittedAt = generatePastTimestamp(180);
    const isVerified = Math.random() > 0.15; // 85% verified

    // Fill in template placeholders
    let title = template.titleTemplate
      .replace('{client}', randomPick(clients))
      .replace('{project}', randomPick(projects))
      .replace('{cert}', randomPick(industryData.certifications))
      .replace('{state}', randomPick(LOCATIONS).state)
      .replace('{award}', 'Design Excellence Award')
      .replace('{case}', 'complex litigation')
      .replace('{condition}', 'chronic back pain')
      .replace('{specialty}', 'Internal Medicine')
      .replace('{platform}', 'Google')
      .replace('{year}', '2024')
      .replace('{address}', '123 Main St')
      .replace('{type}', 'homebuyer')
      .replace('{result}', '150 point score increase')
      .replace('{subject}', 'Mathematics');

    let description = template.descriptionTemplate
      .replace('{client}', randomPick(clients))
      .replace('{project}', randomPick(projects))
      .replace('{details}', 'full deployment and training')
      .replace('{cert}', randomPick(industryData.certifications))
      .replace('{area}', 'cloud architecture')
      .replace('{service}', industryData.category.toLowerCase())
      .replace('{case}', 'contract dispute')
      .replace('{metric}', randomPick(metrics))
      .replace('{goal}', randomPick(goals))
      .replace('{results}', randomPick(results))
      .replace('{state}', randomPick(LOCATIONS).state)
      .replace('{amount}', '$' + randomRange(1000, 50000))
      .replace('{count}', String(randomRange(50, 500)))
      .replace('{price}', '$' + randomRange(300000, 2000000))
      .replace('{days}', String(randomRange(15, 90)))
      .replace('{volume}', randomRange(1, 50) + 'M')
      .replace('{year}', '2024')
      .replace('{years}', String(randomRange(5, 20)))
      .replace('{percent}', String(randomRange(85, 98)))
      .replace('{points}', String(randomRange(50, 200)))
      .replace('{improvement}', randomRange(20, 50) + '%')
      .replace('{specialty}', 'strength training')
      .replace('{result}', 'their fitness goals');

    const claim: ProofClaim = {
      claimId,
      businessId: business.businessId,
      proofType: template.type,
      title,
      description,
      serviceTags: template.serviceTags,
      clientReference: template.type === 'completion' || template.type === 'testimonial'
        ? `ref_${randomRange(10000, 99999)}`
        : null,
      completedAt: template.type === 'completion' ? generatePastTimestamp(90) : null,
      status: isVerified ? 'verified' : 'submitted',
      verifiedBy: isVerified ? adminUserId : null,
      verifiedAt: isVerified ? submittedAt + randomRange(1, 7) * 24 * 60 * 60 * 1000 : null,
      rejectionReason: null,
      submittedAt,
    };

    claims.push(claim);
  }

  return claims;
}

// =============================================================================
// NEO4J SEEDING FUNCTIONS
// =============================================================================

/**
 * Creates marketplace constraints and indexes.
 */
async function createMarketplaceSchema(env: Neo4jEnv): Promise<void> {
  console.log('Creating marketplace schema constraints and indexes...');

  const constraints = [
    `CREATE CONSTRAINT marketplace_business_id_unique IF NOT EXISTS
     FOR (b:Business) REQUIRE b.businessId IS UNIQUE`,
    `CREATE CONSTRAINT marketplace_offering_id_unique IF NOT EXISTS
     FOR (o:Offering) REQUIRE o.offeringId IS UNIQUE`,
    `CREATE CONSTRAINT marketplace_proof_claim_id_unique IF NOT EXISTS
     FOR (p:ProofClaim) REQUIRE p.claimId IS UNIQUE`,
  ];

  const indexes = [
    `CREATE INDEX marketplace_business_owner IF NOT EXISTS FOR (b:Business) ON (b.ownerId)`,
    `CREATE INDEX marketplace_business_status IF NOT EXISTS FOR (b:Business) ON (b.status)`,
    `CREATE INDEX marketplace_business_category IF NOT EXISTS FOR (b:Business) ON (b.primaryCategory)`,
    `CREATE INDEX marketplace_business_verified IF NOT EXISTS FOR (b:Business) ON (b.isVerified)`,
    `CREATE INDEX marketplace_offering_business IF NOT EXISTS FOR (o:Offering) ON (o.businessId)`,
    `CREATE INDEX marketplace_proof_business IF NOT EXISTS FOR (p:ProofClaim) ON (p.businessId)`,
    `CREATE INDEX marketplace_proof_status IF NOT EXISTS FOR (p:ProofClaim) ON (p.status)`,
  ];

  for (const constraint of constraints) {
    try {
      await neo4jRun(env, constraint);
    } catch (error) {
      // Constraint may already exist
    }
  }

  for (const index of indexes) {
    try {
      await neo4jRun(env, index);
    } catch (error) {
      // Index may already exist
    }
  }

  console.log('Schema created successfully.');
}

/**
 * Seeds a business owner user node.
 */
async function seedBusinessOwner(env: Neo4jEnv, ownerId: string, businessName: string): Promise<void> {
  const cypher = `
    MERGE (u:User {userId: $userId})
    ON CREATE SET
      u.email = $email,
      u.displayName = $displayName,
      u.isMarketplaceOwner = true,
      u.createdAt = $createdAt,
      u.schemaVersion = 1
    ON MATCH SET
      u.isMarketplaceOwner = true
    RETURN u.userId AS userId
  `;

  await neo4jRun(env, cypher, {
    userId: ownerId,
    email: `owner.${ownerId.slice(-8)}@marketplace.demo`,
    displayName: `Owner of ${businessName}`,
    createdAt: Date.now(),
  });
}

/**
 * Seeds a business node.
 */
async function seedBusiness(env: Neo4jEnv, business: BusinessProfile): Promise<void> {
  const cypher = `
    MERGE (b:Business {businessId: $businessId})
    ON CREATE SET
      b.ownerId = $ownerId,
      b.name = $name,
      b.description = $description,
      b.primaryCategory = $primaryCategory,
      b.tagsJson = $tagsJson,
      b.serviceAreaType = $serviceAreaType,
      b.serviceAreaLat = $serviceAreaLat,
      b.serviceAreaLng = $serviceAreaLng,
      b.serviceAreaRadiusMiles = $serviceAreaRadiusMiles,
      b.serviceAreaRegionsJson = $serviceAreaRegionsJson,
      b.status = $status,
      b.isVerified = $isVerified,
      b.proofSharingEnabled = $proofSharingEnabled,
      b.verifiedProofCount = $verifiedProofCount,
      b.totalCompletions = $totalCompletions,
      b.lastVerifiedAt = $lastVerifiedAt,
      b.createdAt = $createdAt,
      b.updatedAt = $updatedAt,
      b.contactEmail = $contactEmail,
      b.contactPhone = $contactPhone,
      b.websiteUrl = $websiteUrl,
      b.averageRating = $averageRating,
      b.reviewCount = $reviewCount,
      b.schemaVersion = 1
    ON MATCH SET
      b.name = $name,
      b.description = $description,
      b.updatedAt = $updatedAt,
      b.schemaVersion = 1
    RETURN b.businessId AS businessId
  `;

  await neo4jRun(env, cypher, {
    businessId: business.businessId,
    ownerId: business.ownerId,
    name: business.name,
    description: business.description,
    primaryCategory: business.primaryCategory,
    tagsJson: JSON.stringify(business.tags),
    serviceAreaType: business.serviceAreaType,
    serviceAreaLat: business.serviceAreaLat,
    serviceAreaLng: business.serviceAreaLng,
    serviceAreaRadiusMiles: business.serviceAreaRadiusMiles,
    serviceAreaRegionsJson: business.serviceAreaRegions ? JSON.stringify(business.serviceAreaRegions) : null,
    status: business.status,
    isVerified: business.isVerified,
    proofSharingEnabled: business.proofSharingEnabled,
    verifiedProofCount: business.verifiedProofCount,
    totalCompletions: business.totalCompletions,
    lastVerifiedAt: business.lastVerifiedAt,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    contactEmail: business.contactEmail,
    contactPhone: business.contactPhone,
    websiteUrl: business.websiteUrl,
    averageRating: business.averageRating,
    reviewCount: business.reviewCount,
  });
}

/**
 * Creates OWNS_BUSINESS relationship.
 */
async function seedOwnsBusinessRelationship(
  env: Neo4jEnv,
  ownerId: string,
  businessId: string,
  createdAt: number
): Promise<void> {
  const cypher = `
    MATCH (u:User {userId: $ownerId})
    MATCH (b:Business {businessId: $businessId})
    MERGE (u)-[r:OWNS_BUSINESS]->(b)
    ON CREATE SET r.createdAt = $createdAt
    RETURN type(r) AS relType
  `;

  await neo4jRun(env, cypher, {
    ownerId,
    businessId,
    createdAt,
  });
}

/**
 * Seeds an offering node.
 */
async function seedOffering(env: Neo4jEnv, offering: Offering): Promise<void> {
  const cypher = `
    MERGE (o:Offering {offeringId: $offeringId})
    ON CREATE SET
      o.businessId = $businessId,
      o.title = $title,
      o.description = $description,
      o.offeringType = $offeringType,
      o.tagsJson = $tagsJson,
      o.priceType = $priceType,
      o.priceAmountCents = $priceAmountCents,
      o.priceCurrency = $priceCurrency,
      o.status = $status,
      o.createdAt = $createdAt,
      o.updatedAt = $updatedAt,
      o.schemaVersion = 1
    ON MATCH SET
      o.title = $title,
      o.description = $description,
      o.updatedAt = $updatedAt,
      o.schemaVersion = 1
    RETURN o.offeringId AS offeringId
  `;

  await neo4jRun(env, cypher, {
    offeringId: offering.offeringId,
    businessId: offering.businessId,
    title: offering.title,
    description: offering.description,
    offeringType: offering.offeringType,
    tagsJson: JSON.stringify(offering.tags),
    priceType: offering.priceType,
    priceAmountCents: offering.priceAmountCents,
    priceCurrency: offering.priceCurrency,
    status: offering.status,
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  });
}

/**
 * Creates OFFERS relationship.
 */
async function seedOffersRelationship(
  env: Neo4jEnv,
  businessId: string,
  offeringId: string,
  displayOrder: number,
  createdAt: number
): Promise<void> {
  const cypher = `
    MATCH (b:Business {businessId: $businessId})
    MATCH (o:Offering {offeringId: $offeringId})
    MERGE (b)-[r:OFFERS]->(o)
    ON CREATE SET
      r.createdAt = $createdAt,
      r.displayOrder = $displayOrder
    RETURN type(r) AS relType
  `;

  await neo4jRun(env, cypher, {
    businessId,
    offeringId,
    displayOrder,
    createdAt,
  });
}

/**
 * Seeds a proof claim node.
 */
async function seedProofClaim(env: Neo4jEnv, claim: ProofClaim): Promise<void> {
  const cypher = `
    MERGE (p:ProofClaim {claimId: $claimId})
    ON CREATE SET
      p.businessId = $businessId,
      p.proofType = $proofType,
      p.title = $title,
      p.description = $description,
      p.serviceTagsJson = $serviceTagsJson,
      p.clientReference = $clientReference,
      p.completedAt = $completedAt,
      p.status = $status,
      p.verifiedBy = $verifiedBy,
      p.verifiedAt = $verifiedAt,
      p.rejectionReason = $rejectionReason,
      p.submittedAt = $submittedAt,
      p.schemaVersion = 1
    ON MATCH SET
      p.title = $title,
      p.description = $description,
      p.status = $status,
      p.verifiedBy = $verifiedBy,
      p.verifiedAt = $verifiedAt,
      p.schemaVersion = 1
    RETURN p.claimId AS claimId
  `;

  await neo4jRun(env, cypher, {
    claimId: claim.claimId,
    businessId: claim.businessId,
    proofType: claim.proofType,
    title: claim.title,
    description: claim.description,
    serviceTagsJson: JSON.stringify(claim.serviceTags),
    clientReference: claim.clientReference,
    completedAt: claim.completedAt,
    status: claim.status,
    verifiedBy: claim.verifiedBy,
    verifiedAt: claim.verifiedAt,
    rejectionReason: claim.rejectionReason,
    submittedAt: claim.submittedAt,
  });
}

/**
 * Creates HAS_PROOF relationship.
 */
async function seedHasProofRelationship(
  env: Neo4jEnv,
  businessId: string,
  claimId: string,
  submittedAt: number
): Promise<void> {
  const cypher = `
    MATCH (b:Business {businessId: $businessId})
    MATCH (p:ProofClaim {claimId: $claimId})
    MERGE (b)-[r:HAS_PROOF]->(p)
    ON CREATE SET r.submittedAt = $submittedAt
    RETURN type(r) AS relType
  `;

  await neo4jRun(env, cypher, {
    businessId,
    claimId,
    submittedAt,
  });
}

/**
 * Creates admin user for verification.
 */
async function seedAdminUser(env: Neo4jEnv, adminUserId: string): Promise<void> {
  const cypher = `
    MERGE (u:User {userId: $userId})
    ON CREATE SET
      u.email = 'admin@marketplace.demo',
      u.displayName = 'Marketplace Admin',
      u.isAdmin = true,
      u.createdAt = $createdAt,
      u.schemaVersion = 1
    RETURN u.userId AS userId
  `;

  await neo4jRun(env, cypher, {
    userId: adminUserId,
    createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
  });
}

/**
 * Creates VERIFIED_BY relationship.
 */
async function seedVerifiedByRelationship(
  env: Neo4jEnv,
  claimId: string,
  adminUserId: string,
  verifiedAt: number
): Promise<void> {
  const cypher = `
    MATCH (p:ProofClaim {claimId: $claimId})
    MATCH (u:User {userId: $adminUserId})
    MERGE (p)-[r:VERIFIED_BY]->(u)
    ON CREATE SET
      r.verifiedAt = $verifiedAt,
      r.notes = 'Verified through demo seeding'
    RETURN type(r) AS relType
  `;

  await neo4jRun(env, cypher, {
    claimId,
    adminUserId,
    verifiedAt,
  });
}

// =============================================================================
// LANCEDB DATA EXPORT
// =============================================================================

/**
 * Generates LanceDB-compatible data for a business.
 */
function generateLanceDBData(
  business: BusinessProfile,
  offerings: Offering[]
): object[] {
  const rows: object[] = [];

  // Business-level entry
  rows.push({
    id: `lance_${business.businessId}`,
    businessId: business.businessId,
    ownerId: business.ownerId,
    offeringId: null,
    businessName: business.name,
    businessDescription: business.description,
    primaryCategory: business.primaryCategory,
    tagsJson: JSON.stringify(business.tags),
    offeringTitle: null,
    offeringDescription: null,
    offeringType: null,
    serviceAreaType: business.serviceAreaType,
    serviceAreaLat: business.serviceAreaLat,
    serviceAreaLng: business.serviceAreaLng,
    serviceAreaRadiusMiles: business.serviceAreaRadiusMiles,
    serviceAreaRegionsJson: business.serviceAreaRegions ? JSON.stringify(business.serviceAreaRegions) : null,
    businessStatus: business.status,
    isVerified: business.isVerified,
    proofSharingEnabled: business.proofSharingEnabled,
    verifiedProofCount: business.verifiedProofCount,
    totalCompletions: business.totalCompletions,
    exactTagMatches: 0,
    lastVerifiedAt: business.lastVerifiedAt,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    schemaVersion: '1.0.0',
    // textVector would be generated by embedding service
  });

  // Offering-level entries
  for (const offering of offerings) {
    rows.push({
      id: `lance_${offering.offeringId}`,
      businessId: business.businessId,
      ownerId: business.ownerId,
      offeringId: offering.offeringId,
      businessName: business.name,
      businessDescription: business.description,
      primaryCategory: business.primaryCategory,
      tagsJson: JSON.stringify([...business.tags, ...offering.tags]),
      offeringTitle: offering.title,
      offeringDescription: offering.description,
      offeringType: offering.offeringType,
      serviceAreaType: business.serviceAreaType,
      serviceAreaLat: business.serviceAreaLat,
      serviceAreaLng: business.serviceAreaLng,
      serviceAreaRadiusMiles: business.serviceAreaRadiusMiles,
      serviceAreaRegionsJson: business.serviceAreaRegions ? JSON.stringify(business.serviceAreaRegions) : null,
      businessStatus: business.status,
      isVerified: business.isVerified,
      proofSharingEnabled: business.proofSharingEnabled,
      verifiedProofCount: business.verifiedProofCount,
      totalCompletions: business.totalCompletions,
      exactTagMatches: 0,
      lastVerifiedAt: business.lastVerifiedAt,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
      schemaVersion: '1.0.0',
    });
  }

  return rows;
}

// =============================================================================
// CLEAR MARKETPLACE DATA
// =============================================================================

/**
 * Clears all marketplace demo data from Neo4j.
 */
export async function clearMarketplaceData(env: Neo4jEnv): Promise<void> {
  console.log('\n========================================');
  console.log('CLEARING MARKETPLACE DEMO DATA FROM NEO4J');
  console.log('========================================\n');

  const clearCypher = `
    MATCH (b:Business)
    OPTIONAL MATCH (b)-[:HAS_PROOF]->(p:ProofClaim)
    OPTIONAL MATCH (b)<-[:OFFERS]-(o:Offering)
    OPTIONAL MATCH (b)<-[:OWNS_BUSINESS]-(owner:User)
    WHERE owner.isMarketplaceOwner = true
    DETACH DELETE p, o, b, owner
    RETURN count(*) AS deletedCount
  `;

  try {
    await neo4jRun(env, clearCypher);
    console.log('Successfully cleared all marketplace demo data.');
  } catch (error) {
    console.error('Error clearing marketplace data:', error);
    throw error;
  }
}

// =============================================================================
// MAIN SEEDING FUNCTION
// =============================================================================

/**
 * Seeds all marketplace demo data into Neo4j.
 */
export async function seedMarketplace(env: Neo4jEnv): Promise<{
  stats: {
    businesses: number;
    offerings: number;
    proofClaims: number;
    owners: number;
  };
  lanceDBData: object[];
}> {
  console.log('\n========================================');
  console.log('SEEDING MARKETPLACE DEMO DATA');
  console.log('========================================\n');

  const stats = {
    businesses: 0,
    offerings: 0,
    proofClaims: 0,
    owners: 0,
  };

  const lanceDBData: object[] = [];
  const usedNames = new Set<string>();

  // Create schema
  await createMarketplaceSchema(env);

  // Create admin user for verifications
  const adminUserId = 'admin_marketplace_verifier';
  await seedAdminUser(env, adminUserId);

  // Distribution of businesses per industry (total: 55)
  const industryDistribution: Record<MarketplaceIndustry, number> = {
    software_tech: 8,
    legal: 5,
    healthcare: 6,
    marketing: 5,
    financial: 5,
    construction: 6,
    creative: 5,
    education: 5,
    real_estate: 5,
    fitness_wellness: 5,
  };

  for (const [industry, count] of Object.entries(industryDistribution)) {
    const industryKey = industry as MarketplaceIndustry;
    console.log(`\n--- Seeding ${count} ${INDUSTRY_DATA[industryKey].category} businesses ---`);

    const businesses = generateBusinessesForIndustry(industryKey, count, usedNames);

    for (const business of businesses) {
      // Seed owner
      await seedBusinessOwner(env, business.ownerId, business.name);
      stats.owners++;

      // Seed business
      await seedBusiness(env, business);
      stats.businesses++;

      // Create owner relationship
      await seedOwnsBusinessRelationship(env, business.ownerId, business.businessId, business.createdAt);

      // Generate and seed offerings
      const offerings = generateOfferingsForBusiness(business, industryKey);
      for (let i = 0; i < offerings.length; i++) {
        const offering = offerings[i];
        await seedOffering(env, offering);
        await seedOffersRelationship(env, business.businessId, offering.offeringId, i, offering.createdAt);
        stats.offerings++;
      }

      // Generate and seed proof claims
      const claims = generateProofClaimsForBusiness(business, industryKey, adminUserId);
      for (const claim of claims) {
        await seedProofClaim(env, claim);
        await seedHasProofRelationship(env, business.businessId, claim.claimId, claim.submittedAt);

        if (claim.verifiedBy && claim.verifiedAt) {
          await seedVerifiedByRelationship(env, claim.claimId, claim.verifiedBy, claim.verifiedAt);
        }

        stats.proofClaims++;
      }

      // Generate LanceDB data
      lanceDBData.push(...generateLanceDBData(business, offerings));

      console.log(`  Created: ${business.name} (${offerings.length} offerings, ${claims.length} proofs)`);
    }
  }

  console.log('\n========================================');
  console.log('MARKETPLACE SEEDING COMPLETE');
  console.log('========================================');
  console.log(`\nSummary:`);
  console.log(`  - Businesses: ${stats.businesses}`);
  console.log(`  - Offerings: ${stats.offerings}`);
  console.log(`  - Proof Claims: ${stats.proofClaims}`);
  console.log(`  - Business Owners: ${stats.owners}`);
  console.log(`  - LanceDB Rows Generated: ${lanceDBData.length}`);
  console.log('\n');

  return { stats, lanceDBData };
}

// =============================================================================
// SCRIPT ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldClear = args.includes('--clear') || args.includes('-c');
  const shouldSeed = !args.includes('--clear-only');
  const exportLanceDB = args.includes('--export-lancedb');

  try {
    const env = loadEnv();

    console.log('Marketplace Demo Data Seeding Script');
    console.log('====================================');
    console.log(`URL: ${env.NEO4J_HTTP_URL}`);
    console.log(`User: ${env.NEO4J_USER}`);
    console.log(`Clear existing: ${shouldClear}`);
    console.log(`Seed new data: ${shouldSeed}`);
    console.log(`Export LanceDB data: ${exportLanceDB}`);

    if (shouldClear) {
      await clearMarketplaceData(env);
    }

    if (shouldSeed) {
      const { lanceDBData } = await seedMarketplace(env);

      if (exportLanceDB) {
        // Write LanceDB data to JSON file for later import
        const fs = await import('fs/promises');
        const outputPath = './marketplace-lancedb-data.json';
        await fs.writeFile(outputPath, JSON.stringify(lanceDBData, null, 2));
        console.log(`LanceDB data exported to: ${outputPath}`);
      }
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
