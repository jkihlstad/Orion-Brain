/**
 * Graph mapping for marketplace.proof_claim_verified events
 *
 * When a proof claim is verified by an admin, this mapping:
 * 1. Updates the ProofClaim node status to 'verified'
 * 2. Updates the Business proof counts
 * 3. Creates verification relationship
 */
import type { EventMapping } from '../../contracts';

export const marketplaceProofClaimVerifiedMapping: EventMapping = {
  eventType: 'marketplace.proof_claim_verified',
  version: '1.0.0',
  description: 'Maps proof claim verified events to update ProofClaim and Business nodes',

  nodeWrites: [
    {
      label: 'ProofClaim',
      mergeKey: {
        property: 'claimId',
        path: 'payload.claimId',
      },
      properties: [
        { property: 'claimId', source: 'payload.claimId', required: true },
        { property: 'status', source: { path: 'payload.status', default: 'verified' }, required: true },
        { property: 'verifiedBy', source: 'payload.verifiedBy', required: true },
        { property: 'verifiedAt', source: 'payload.verifiedAt', required: true },
        { property: 'traceId', source: 'traceId' },
      ],
      alias: 'proofClaim',
    },
    {
      label: 'Business',
      mergeKey: {
        property: 'businessId',
        path: 'payload.businessId',
      },
      properties: [
        { property: 'businessId', source: 'payload.businessId', required: true },
        { property: 'updatedAt', source: { path: 'timestampMs', transform: 'toTimestamp' } },
      ],
      alias: 'business',
      // Note: verifiedProofCount will be incremented via custom Cypher
    },
    {
      label: 'User',
      mergeKey: {
        property: 'userId',
        path: 'payload.verifiedBy',
      },
      properties: [
        { property: 'userId', source: 'payload.verifiedBy', required: true },
      ],
      alias: 'admin',
    },
  ],

  relationshipWrites: [
    {
      type: 'HAS_PROOF',
      from: {
        label: 'Business',
        keyProperty: 'businessId',
        keyPath: 'payload.businessId',
      },
      to: {
        label: 'ProofClaim',
        keyProperty: 'claimId',
        keyPath: 'payload.claimId',
      },
      properties: [
        { property: 'submittedAt', source: 'payload.verifiedAt', required: true },
      ],
    },
    {
      type: 'VERIFIED_BY',
      from: {
        label: 'ProofClaim',
        keyProperty: 'claimId',
        keyPath: 'payload.claimId',
      },
      to: {
        label: 'User',
        keyProperty: 'userId',
        keyPath: 'payload.verifiedBy',
      },
      properties: [
        { property: 'verifiedAt', source: 'payload.verifiedAt', required: true },
        { property: 'notes', source: 'payload.reviewNotes' },
        { property: 'traceId', source: 'traceId' },
      ],
    },
  ],

  // Note: Post-processing to update proof counts should be handled by the mapping engine
  // using the updateBusinessProofCounts query from neo4j-marketplace.ts
};
