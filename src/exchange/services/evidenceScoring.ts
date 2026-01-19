/**
 * Enhanced Evidence Scoring Service
 *
 * Provides comprehensive evidence scoring for Orion Exchange marketplace.
 * Implements the enhanced scoring formula from Window 4 specification.
 *
 * Scoring Formula:
 * score = base + completionConfidence + mediaRichness + confirmations + recencyBoost - fraudPenalty
 *
 * Where:
 * - base: Starting score based on profile completeness (0-0.15)
 * - completionConfidence: Checklist completion percentage (0-0.25)
 * - mediaRichness: Photo/video evidence quality (0-0.25)
 * - confirmations: Customer/third-party confirmations (0-0.20)
 * - recencyBoost: Recent verified work bonus (0-0.10)
 * - fraudPenalty: Deduction for suspicious patterns (0-0.30)
 *
 * @version 4.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Artifact metadata for scoring.
 */
export interface ProofArtifact {
  type:
    | 'photo_before'
    | 'photo_after'
    | 'photo_during'
    | 'video'
    | 'receipt'
    | 'invoice'
    | 'document'
    | 'other';
  sizeBytes: number;
  contentHash: string;
  caption?: string;
  /** AI-verified flag */
  aiVerified?: boolean;
  /** EXIF/metadata extracted */
  hasMetadata?: boolean;
}

/**
 * Checklist item for scoring.
 */
export interface ChecklistItem {
  itemId: string;
  text: string;
  completed: boolean;
  completedAt?: number;
  /** Photo proof for this item */
  photoProof?: string;
}

/**
 * Customer confirmation for scoring.
 */
export interface CustomerConfirmation {
  confirmationType: 'work_completed' | 'quality_satisfactory' | 'recommendation';
  rating?: number;
  comments?: string;
  confirmedAt: number;
  /** Whether the customer was verified to be part of the transaction */
  customerVerified: boolean;
}

/**
 * Full proof data for scoring.
 */
export interface ProofData {
  proofId: string;
  businessId: string;
  orderId?: string;
  taskCategory: string;
  skillTags: string[];
  description?: string;
  checklist?: ChecklistItem[];
  artifacts: ProofArtifact[];
  customerConfirmation?: CustomerConfirmation;
  submittedAt: number;
  /** Historical proofs count for this business */
  historicalProofsCount: number;
  /** Days since last verified proof */
  daysSinceLastVerified?: number;
}

/**
 * Business profile data for base scoring.
 */
export interface BusinessProfileData {
  businessId: string;
  profileCompleteness: number; // 0-1
  hasVerifiedIdentity: boolean;
  hasConnectedStripe: boolean;
  hasCoverPhoto: boolean;
  hasServiceArea: boolean;
  hasOfferings: boolean;
  accountAgeDays: number;
  isProUser: boolean;
}

/**
 * Fraud indicator data.
 */
export interface FraudIndicators {
  /** Multiple proofs submitted in rapid succession */
  rapidSubmission: boolean;
  /** Generic/stock photos detected */
  genericPhotosDetected: boolean;
  /** Unusual metadata patterns */
  metadataAnomaly: boolean;
  /** Customer confirmation from same IP/device */
  suspiciousConfirmation: boolean;
  /** High volume of disputed orders */
  disputeRatio: number;
  /** Known fraudulent content hash matches */
  knownFraudHashMatch: boolean;
}

/**
 * Evidence score result with full breakdown.
 */
export interface EvidenceScoreResult {
  /** Final evidence score (0-1) */
  finalScore: number;

  /** Score breakdown */
  breakdown: {
    base: number;
    completionConfidence: number;
    mediaRichness: number;
    confirmations: number;
    recencyBoost: number;
    fraudPenalty: number;
  };

  /** Explanatory reasons for UI */
  reasons: EvidenceReason[];

  /** References to evidence that contributed to score */
  evidenceRefs: EvidenceReference[];

  /** Confidence level (low/medium/high) */
  confidence: 'low' | 'medium' | 'high';

  /** Timestamp of scoring */
  scoredAt: number;
}

/**
 * Human-readable reason for UI display.
 */
export interface EvidenceReason {
  code: string;
  label: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  contribution: number;
}

/**
 * Reference to evidence that contributed to score.
 */
export interface EvidenceReference {
  type: 'artifact' | 'checklist' | 'confirmation' | 'profile' | 'history';
  refId: string;
  label: string;
  weight: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface EvidenceScoringConfig {
  /** Weights for each component */
  weights: {
    base: number;
    completionConfidence: number;
    mediaRichness: number;
    confirmations: number;
    recencyBoost: number;
    maxFraudPenalty: number;
  };

  /** Media scoring parameters */
  media: {
    photoBeforeAfterBonus: number;
    videoBonus: number;
    multiplePhotosBonus: number;
    aiVerifiedBonus: number;
    metadataBonus: number;
    minPhotosForFullScore: number;
  };

  /** Confirmation scoring parameters */
  confirmation: {
    workCompletedWeight: number;
    qualitySatisfactoryWeight: number;
    recommendationWeight: number;
    verifiedCustomerBonus: number;
    ratingMultiplier: number;
  };

  /** Recency decay */
  recency: {
    halfLifeDays: number;
    minBonus: number;
    maxBonus: number;
  };

  /** Fraud detection thresholds */
  fraud: {
    rapidSubmissionThresholdMinutes: number;
    rapidSubmissionPenalty: number;
    genericPhotoPenalty: number;
    metadataAnomalyPenalty: number;
    suspiciousConfirmationPenalty: number;
    disputeRatioThreshold: number;
    disputePenaltyMultiplier: number;
    knownFraudHashPenalty: number;
  };

  /** Profile base score parameters */
  profile: {
    identityWeight: number;
    stripeWeight: number;
    coverPhotoWeight: number;
    serviceAreaWeight: number;
    offeringsWeight: number;
    accountAgeBonus: number;
    proUserBonus: number;
  };
}

const DEFAULT_CONFIG: EvidenceScoringConfig = {
  weights: {
    base: 0.15,
    completionConfidence: 0.25,
    mediaRichness: 0.25,
    confirmations: 0.20,
    recencyBoost: 0.10,
    maxFraudPenalty: 0.30,
  },

  media: {
    photoBeforeAfterBonus: 0.30,
    videoBonus: 0.25,
    multiplePhotosBonus: 0.15,
    aiVerifiedBonus: 0.15,
    metadataBonus: 0.10,
    minPhotosForFullScore: 3,
  },

  confirmation: {
    workCompletedWeight: 0.40,
    qualitySatisfactoryWeight: 0.35,
    recommendationWeight: 0.25,
    verifiedCustomerBonus: 0.20,
    ratingMultiplier: 0.20, // Per star above 3
  },

  recency: {
    halfLifeDays: 30,
    minBonus: 0,
    maxBonus: 0.10,
  },

  fraud: {
    rapidSubmissionThresholdMinutes: 10,
    rapidSubmissionPenalty: 0.15,
    genericPhotoPenalty: 0.20,
    metadataAnomalyPenalty: 0.10,
    suspiciousConfirmationPenalty: 0.25,
    disputeRatioThreshold: 0.15,
    disputePenaltyMultiplier: 1.0,
    knownFraudHashPenalty: 0.30,
  },

  profile: {
    identityWeight: 0.25,
    stripeWeight: 0.20,
    coverPhotoWeight: 0.15,
    serviceAreaWeight: 0.15,
    offeringsWeight: 0.15,
    accountAgeBonus: 0.05,
    proUserBonus: 0.05,
  },
};

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate base score from business profile.
 */
function calculateBaseScore(
  profile: BusinessProfileData,
  config: EvidenceScoringConfig
): { score: number; reasons: EvidenceReason[]; refs: EvidenceReference[] } {
  const reasons: EvidenceReason[] = [];
  const refs: EvidenceReference[] = [];
  let score = 0;

  // Profile completeness components
  if (profile.hasVerifiedIdentity) {
    score += config.profile.identityWeight;
    reasons.push({
      code: 'VERIFIED_IDENTITY',
      label: 'Verified identity',
      description: 'Business owner identity has been verified',
      impact: 'positive',
      contribution: config.profile.identityWeight,
    });
    refs.push({
      type: 'profile',
      refId: `${profile.businessId}:identity`,
      label: 'Identity verification',
      weight: config.profile.identityWeight,
    });
  }

  if (profile.hasConnectedStripe) {
    score += config.profile.stripeWeight;
    reasons.push({
      code: 'STRIPE_CONNECTED',
      label: 'Payments enabled',
      description: 'Business can accept verified payments',
      impact: 'positive',
      contribution: config.profile.stripeWeight,
    });
    refs.push({
      type: 'profile',
      refId: `${profile.businessId}:stripe`,
      label: 'Stripe connection',
      weight: config.profile.stripeWeight,
    });
  }

  if (profile.hasCoverPhoto) {
    score += config.profile.coverPhotoWeight;
  }

  if (profile.hasServiceArea) {
    score += config.profile.serviceAreaWeight;
  }

  if (profile.hasOfferings) {
    score += config.profile.offeringsWeight;
  }

  // Account age bonus (caps at 1 year)
  if (profile.accountAgeDays > 90) {
    const ageBonus = Math.min(
      config.profile.accountAgeBonus,
      (profile.accountAgeDays / 365) * config.profile.accountAgeBonus
    );
    score += ageBonus;
    if (ageBonus > 0.02) {
      reasons.push({
        code: 'ESTABLISHED_ACCOUNT',
        label: 'Established business',
        description: `Account active for ${Math.floor(profile.accountAgeDays / 30)} months`,
        impact: 'positive',
        contribution: ageBonus,
      });
    }
  }

  // Pro user bonus
  if (profile.isProUser) {
    score += config.profile.proUserBonus;
    reasons.push({
      code: 'PRO_USER',
      label: 'Pro member',
      description: 'Business has Pro subscription',
      impact: 'positive',
      contribution: config.profile.proUserBonus,
    });
  }

  // Scale to configured weight
  const normalizedScore = Math.min(1, score) * config.weights.base;

  return { score: normalizedScore, reasons, refs };
}

/**
 * Calculate checklist completion confidence score.
 */
function calculateCompletionConfidence(
  checklist: ChecklistItem[] | undefined,
  config: EvidenceScoringConfig
): { score: number; reasons: EvidenceReason[]; refs: EvidenceReference[] } {
  const reasons: EvidenceReason[] = [];
  const refs: EvidenceReference[] = [];

  if (!checklist || checklist.length === 0) {
    return { score: 0, reasons, refs };
  }

  const completedCount = checklist.filter((item) => item.completed).length;
  const completionRate = completedCount / checklist.length;

  // Photo-verified items get extra weight
  const photoVerifiedCount = checklist.filter(
    (item) => item.completed && item.photoProof
  ).length;
  const photoVerificationRate =
    checklist.length > 0 ? photoVerifiedCount / checklist.length : 0;

  // Combined score: 70% completion rate + 30% photo verification
  const rawScore = completionRate * 0.7 + photoVerificationRate * 0.3;
  const normalizedScore = rawScore * config.weights.completionConfidence;

  // Add reasons
  if (completionRate >= 1.0) {
    reasons.push({
      code: 'ALL_TASKS_COMPLETED',
      label: 'All tasks completed',
      description: `Completed ${completedCount}/${checklist.length} checklist items`,
      impact: 'positive',
      contribution: normalizedScore * 0.7,
    });
  } else if (completionRate >= 0.8) {
    reasons.push({
      code: 'MOST_TASKS_COMPLETED',
      label: 'Most tasks completed',
      description: `Completed ${completedCount}/${checklist.length} checklist items`,
      impact: 'positive',
      contribution: normalizedScore * 0.7,
    });
  }

  if (photoVerifiedCount > 0) {
    reasons.push({
      code: 'PHOTO_VERIFIED_TASKS',
      label: 'Photo-verified work',
      description: `${photoVerifiedCount} tasks verified with photos`,
      impact: 'positive',
      contribution: normalizedScore * 0.3,
    });
    refs.push({
      type: 'checklist',
      refId: `checklist:photo_verified`,
      label: `${photoVerifiedCount} photo-verified tasks`,
      weight: photoVerificationRate,
    });
  }

  return { score: normalizedScore, reasons, refs };
}

/**
 * Calculate media richness score from artifacts.
 */
function calculateMediaRichness(
  artifacts: ProofArtifact[],
  config: EvidenceScoringConfig
): { score: number; reasons: EvidenceReason[]; refs: EvidenceReference[] } {
  const reasons: EvidenceReason[] = [];
  const refs: EvidenceReference[] = [];

  if (artifacts.length === 0) {
    return { score: 0, reasons, refs };
  }

  let rawScore = 0;

  // Count artifact types
  const photoBefore = artifacts.filter((a) => a.type === 'photo_before');
  const photoAfter = artifacts.filter((a) => a.type === 'photo_after');
  const photoDuring = artifacts.filter((a) => a.type === 'photo_during');
  const videos = artifacts.filter((a) => a.type === 'video');
  const receipts = artifacts.filter((a) =>
    ['receipt', 'invoice'].includes(a.type)
  );

  // Before/after pair bonus
  if (photoBefore.length > 0 && photoAfter.length > 0) {
    rawScore += config.media.photoBeforeAfterBonus;
    reasons.push({
      code: 'BEFORE_AFTER_PHOTOS',
      label: 'Before & after photos',
      description: 'Shows transformation of completed work',
      impact: 'positive',
      contribution: config.media.photoBeforeAfterBonus,
    });
    refs.push({
      type: 'artifact',
      refId: `artifacts:before_after`,
      label: 'Before/after comparison',
      weight: config.media.photoBeforeAfterBonus,
    });
  }

  // Video bonus
  const firstVideo = videos[0];
  if (videos.length > 0 && firstVideo) {
    rawScore += config.media.videoBonus;
    reasons.push({
      code: 'VIDEO_EVIDENCE',
      label: 'Video evidence',
      description: `${videos.length} video${videos.length > 1 ? 's' : ''} showing work`,
      impact: 'positive',
      contribution: config.media.videoBonus,
    });
    refs.push({
      type: 'artifact',
      refId: firstVideo.contentHash,
      label: 'Video proof',
      weight: config.media.videoBonus,
    });
  }

  // Multiple photos bonus (during work)
  const totalPhotos =
    photoBefore.length + photoAfter.length + photoDuring.length;
  if (totalPhotos >= config.media.minPhotosForFullScore) {
    rawScore += config.media.multiplePhotosBonus;
    reasons.push({
      code: 'MULTIPLE_PHOTOS',
      label: `${totalPhotos} photos`,
      description: 'Comprehensive photo documentation',
      impact: 'positive',
      contribution: config.media.multiplePhotosBonus,
    });
  }

  // AI verified artifacts
  const aiVerifiedCount = artifacts.filter((a) => a.aiVerified).length;
  if (aiVerifiedCount > 0) {
    const aiBonus =
      (aiVerifiedCount / artifacts.length) * config.media.aiVerifiedBonus;
    rawScore += aiBonus;
    reasons.push({
      code: 'AI_VERIFIED',
      label: 'AI-verified content',
      description: `${aiVerifiedCount} photos verified by AI`,
      impact: 'positive',
      contribution: aiBonus,
    });
  }

  // Metadata present (EXIF data)
  const metadataCount = artifacts.filter((a) => a.hasMetadata).length;
  if (metadataCount > 0) {
    const metadataBonus =
      (metadataCount / artifacts.length) * config.media.metadataBonus;
    rawScore += metadataBonus;
  }

  // Receipts/invoices add credibility
  const firstReceipt = receipts[0];
  if (receipts.length > 0 && firstReceipt) {
    const receiptBonus = 0.10;
    rawScore += receiptBonus;
    reasons.push({
      code: 'RECEIPT_INCLUDED',
      label: 'Receipt/invoice included',
      description: 'Financial documentation provided',
      impact: 'positive',
      contribution: receiptBonus,
    });
    refs.push({
      type: 'artifact',
      refId: firstReceipt.contentHash,
      label: 'Receipt/invoice',
      weight: receiptBonus,
    });
  }

  const normalizedScore = Math.min(1, rawScore) * config.weights.mediaRichness;

  return { score: normalizedScore, reasons, refs };
}

/**
 * Calculate confirmation score from customer feedback.
 */
function calculateConfirmationScore(
  confirmation: CustomerConfirmation | undefined,
  config: EvidenceScoringConfig
): { score: number; reasons: EvidenceReason[]; refs: EvidenceReference[] } {
  const reasons: EvidenceReason[] = [];
  const refs: EvidenceReference[] = [];

  if (!confirmation) {
    return { score: 0, reasons, refs };
  }

  let rawScore = 0;

  // Confirmation type weight
  switch (confirmation.confirmationType) {
    case 'recommendation':
      rawScore += config.confirmation.recommendationWeight;
      reasons.push({
        code: 'CUSTOMER_RECOMMENDATION',
        label: 'Customer recommendation',
        description: 'Customer would recommend this business',
        impact: 'positive',
        contribution: config.confirmation.recommendationWeight,
      });
      break;
    case 'quality_satisfactory':
      rawScore += config.confirmation.qualitySatisfactoryWeight;
      reasons.push({
        code: 'QUALITY_CONFIRMED',
        label: 'Quality confirmed',
        description: 'Customer confirmed work quality',
        impact: 'positive',
        contribution: config.confirmation.qualitySatisfactoryWeight,
      });
      break;
    case 'work_completed':
      rawScore += config.confirmation.workCompletedWeight;
      reasons.push({
        code: 'WORK_CONFIRMED',
        label: 'Work confirmed',
        description: 'Customer confirmed work completion',
        impact: 'positive',
        contribution: config.confirmation.workCompletedWeight,
      });
      break;
  }

  refs.push({
    type: 'confirmation',
    refId: `confirmation:${confirmation.confirmationType}`,
    label: `Customer ${confirmation.confirmationType.replace('_', ' ')}`,
    weight: rawScore,
  });

  // Verified customer bonus
  if (confirmation.customerVerified) {
    rawScore += config.confirmation.verifiedCustomerBonus;
    reasons.push({
      code: 'VERIFIED_CUSTOMER',
      label: 'Verified customer',
      description: 'Customer was part of the original transaction',
      impact: 'positive',
      contribution: config.confirmation.verifiedCustomerBonus,
    });
  }

  // Rating bonus (above 3 stars)
  if (confirmation.rating && confirmation.rating > 3) {
    const ratingBonus =
      (confirmation.rating - 3) * config.confirmation.ratingMultiplier;
    rawScore += ratingBonus;
    reasons.push({
      code: 'HIGH_RATING',
      label: `${confirmation.rating}-star rating`,
      description: 'Customer gave high rating',
      impact: 'positive',
      contribution: ratingBonus,
    });
  }

  const normalizedScore = Math.min(1, rawScore) * config.weights.confirmations;

  return { score: normalizedScore, reasons, refs };
}

/**
 * Calculate recency boost based on time since last verification.
 */
function calculateRecencyBoost(
  daysSinceLastVerified: number | undefined,
  config: EvidenceScoringConfig
): { score: number; reasons: EvidenceReason[]; refs: EvidenceReference[] } {
  const reasons: EvidenceReason[] = [];
  const refs: EvidenceReference[] = [];

  if (daysSinceLastVerified === undefined) {
    return { score: 0, reasons, refs };
  }

  // Exponential decay: boost = maxBoost * 2^(-days / halfLife)
  const decayFactor = Math.pow(
    2,
    -daysSinceLastVerified / config.recency.halfLifeDays
  );
  const boost = config.recency.maxBonus * decayFactor;
  const normalizedScore = Math.max(
    config.recency.minBonus,
    boost * config.weights.recencyBoost
  );

  if (daysSinceLastVerified < 7) {
    reasons.push({
      code: 'RECENT_VERIFICATION',
      label: 'Recently verified',
      description: 'Had verified work within the past week',
      impact: 'positive',
      contribution: normalizedScore,
    });
    refs.push({
      type: 'history',
      refId: 'recency:week',
      label: 'Recent verification',
      weight: normalizedScore,
    });
  } else if (daysSinceLastVerified < 30) {
    reasons.push({
      code: 'MONTHLY_ACTIVITY',
      label: 'Active this month',
      description: 'Had verified work within the past month',
      impact: 'positive',
      contribution: normalizedScore,
    });
  }

  return { score: normalizedScore, reasons, refs };
}

/**
 * Calculate fraud penalty based on suspicious indicators.
 */
function calculateFraudPenalty(
  indicators: FraudIndicators | undefined,
  config: EvidenceScoringConfig
): { penalty: number; reasons: EvidenceReason[] } {
  const reasons: EvidenceReason[] = [];

  if (!indicators) {
    return { penalty: 0, reasons };
  }

  let totalPenalty = 0;

  if (indicators.knownFraudHashMatch) {
    totalPenalty += config.fraud.knownFraudHashPenalty;
    reasons.push({
      code: 'FRAUD_CONTENT_DETECTED',
      label: 'Suspicious content',
      description: 'Content matches known fraudulent patterns',
      impact: 'negative',
      contribution: -config.fraud.knownFraudHashPenalty,
    });
  }

  if (indicators.suspiciousConfirmation) {
    totalPenalty += config.fraud.suspiciousConfirmationPenalty;
    reasons.push({
      code: 'SUSPICIOUS_CONFIRMATION',
      label: 'Unverified confirmation',
      description: 'Customer confirmation could not be verified',
      impact: 'negative',
      contribution: -config.fraud.suspiciousConfirmationPenalty,
    });
  }

  if (indicators.genericPhotosDetected) {
    totalPenalty += config.fraud.genericPhotoPenalty;
    reasons.push({
      code: 'GENERIC_PHOTOS',
      label: 'Stock photos detected',
      description: 'Photos appear to be generic/stock images',
      impact: 'negative',
      contribution: -config.fraud.genericPhotoPenalty,
    });
  }

  if (indicators.rapidSubmission) {
    totalPenalty += config.fraud.rapidSubmissionPenalty;
    reasons.push({
      code: 'RAPID_SUBMISSION',
      label: 'Rapid submissions',
      description: 'Multiple proofs submitted in quick succession',
      impact: 'negative',
      contribution: -config.fraud.rapidSubmissionPenalty,
    });
  }

  if (indicators.metadataAnomaly) {
    totalPenalty += config.fraud.metadataAnomalyPenalty;
  }

  // Dispute ratio penalty
  if (indicators.disputeRatio > config.fraud.disputeRatioThreshold) {
    const disputePenalty =
      indicators.disputeRatio * config.fraud.disputePenaltyMultiplier;
    totalPenalty += disputePenalty;
    reasons.push({
      code: 'HIGH_DISPUTE_RATE',
      label: 'Dispute history',
      description: `${Math.round(indicators.disputeRatio * 100)}% dispute rate`,
      impact: 'negative',
      contribution: -disputePenalty,
    });
  }

  // Cap at maximum penalty
  const finalPenalty = Math.min(totalPenalty, config.weights.maxFraudPenalty);

  return { penalty: finalPenalty, reasons };
}

/**
 * Determine confidence level based on data completeness.
 */
function determineConfidence(
  proof: ProofData,
  confirmation: CustomerConfirmation | undefined,
  profile: BusinessProfileData
): 'low' | 'medium' | 'high' {
  let confidenceScore = 0;

  // Profile completeness
  if (profile.hasVerifiedIdentity) confidenceScore += 2;
  if (profile.hasConnectedStripe) confidenceScore += 1;

  // Proof completeness
  if (proof.checklist && proof.checklist.length > 0) confidenceScore += 1;
  if (proof.artifacts.length >= 3) confidenceScore += 1;
  if (proof.artifacts.some((a) => a.type === 'video')) confidenceScore += 1;
  if (proof.artifacts.some((a) => a.aiVerified)) confidenceScore += 2;

  // Confirmation
  if (confirmation) {
    confidenceScore += 2;
    if (confirmation.customerVerified) confidenceScore += 2;
    if (confirmation.rating && confirmation.rating >= 4) confidenceScore += 1;
  }

  // Historical data
  if (proof.historicalProofsCount >= 10) confidenceScore += 1;

  if (confidenceScore >= 10) return 'high';
  if (confidenceScore >= 5) return 'medium';
  return 'low';
}

// =============================================================================
// MAIN SCORING FUNCTION
// =============================================================================

/**
 * Calculate comprehensive evidence score for a proof submission.
 *
 * @param proof - Proof data to score
 * @param profile - Business profile data
 * @param fraudIndicators - Optional fraud detection results
 * @param config - Scoring configuration
 * @returns Full evidence score result with breakdown
 */
export function calculateEvidenceScore(
  proof: ProofData,
  profile: BusinessProfileData,
  fraudIndicators?: FraudIndicators,
  config: EvidenceScoringConfig = DEFAULT_CONFIG
): EvidenceScoreResult {
  const allReasons: EvidenceReason[] = [];
  const allRefs: EvidenceReference[] = [];

  // Calculate each component
  const baseResult = calculateBaseScore(profile, config);
  allReasons.push(...baseResult.reasons);
  allRefs.push(...baseResult.refs);

  const completionResult = calculateCompletionConfidence(proof.checklist, config);
  allReasons.push(...completionResult.reasons);
  allRefs.push(...completionResult.refs);

  const mediaResult = calculateMediaRichness(proof.artifacts, config);
  allReasons.push(...mediaResult.reasons);
  allRefs.push(...mediaResult.refs);

  const confirmationResult = calculateConfirmationScore(
    proof.customerConfirmation,
    config
  );
  allReasons.push(...confirmationResult.reasons);
  allRefs.push(...confirmationResult.refs);

  const recencyResult = calculateRecencyBoost(proof.daysSinceLastVerified, config);
  allReasons.push(...recencyResult.reasons);
  allRefs.push(...recencyResult.refs);

  const fraudResult = calculateFraudPenalty(fraudIndicators, config);
  allReasons.push(...fraudResult.reasons);

  // Calculate final score
  const rawScore =
    baseResult.score +
    completionResult.score +
    mediaResult.score +
    confirmationResult.score +
    recencyResult.score -
    fraudResult.penalty;

  const finalScore = Math.max(0, Math.min(1, rawScore));

  // Determine confidence
  const confidence = determineConfidence(
    proof,
    proof.customerConfirmation,
    profile
  );

  return {
    finalScore,
    breakdown: {
      base: baseResult.score,
      completionConfidence: completionResult.score,
      mediaRichness: mediaResult.score,
      confirmations: confirmationResult.score,
      recencyBoost: recencyResult.score,
      fraudPenalty: fraudResult.penalty,
    },
    reasons: allReasons.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    evidenceRefs: allRefs,
    confidence,
    scoredAt: Date.now(),
  };
}

/**
 * Calculate aggregate evidence score for a business based on all their proofs.
 */
export function calculateAggregateEvidenceScore(
  proofScores: EvidenceScoreResult[]
): {
  averageScore: number;
  weightedScore: number;
  totalProofs: number;
  highConfidenceCount: number;
  topReasons: EvidenceReason[];
} {
  if (proofScores.length === 0) {
    return {
      averageScore: 0,
      weightedScore: 0,
      totalProofs: 0,
      highConfidenceCount: 0,
      topReasons: [],
    };
  }

  // Simple average
  const averageScore =
    proofScores.reduce((sum, s) => sum + s.finalScore, 0) / proofScores.length;

  // Weighted by confidence
  const confidenceWeights = { low: 0.5, medium: 1.0, high: 1.5 };
  let weightedSum = 0;
  let totalWeight = 0;

  for (const score of proofScores) {
    const weight = confidenceWeights[score.confidence];
    weightedSum += score.finalScore * weight;
    totalWeight += weight;
  }

  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Count high confidence proofs
  const highConfidenceCount = proofScores.filter(
    (s) => s.confidence === 'high'
  ).length;

  // Aggregate top reasons
  const reasonCounts = new Map<string, { reason: EvidenceReason; count: number }>();
  for (const score of proofScores) {
    for (const reason of score.reasons) {
      const existing = reasonCounts.get(reason.code);
      if (existing) {
        existing.count++;
        existing.reason.contribution += reason.contribution;
      } else {
        reasonCounts.set(reason.code, { reason: { ...reason }, count: 1 });
      }
    }
  }

  // Average contributions and sort by count
  const topReasons = Array.from(reasonCounts.values())
    .map(({ reason, count }) => ({
      ...reason,
      contribution: reason.contribution / count,
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  return {
    averageScore,
    weightedScore,
    totalProofs: proofScores.length,
    highConfidenceCount,
    topReasons,
  };
}

// Export config for testing
export { DEFAULT_CONFIG as EVIDENCE_SCORING_CONFIG };
export type { EvidenceScoringConfig };
