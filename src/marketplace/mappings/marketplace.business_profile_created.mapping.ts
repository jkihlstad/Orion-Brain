/**
 * Graph mapping for marketplace.business_profile_created events
 *
 * Creates Business node with relationship to owner User.
 */
import type { EventMapping } from '../../contracts';

export const marketplaceBusinessProfileCreatedMapping: EventMapping = {
  eventType: 'marketplace.business_profile_created',
  version: '1.0.0',
  description: 'Maps business profile created events to Business nodes',

  nodeWrites: [
    {
      label: 'Business',
      mergeKey: {
        property: 'businessId',
        path: 'payload.businessId',
      },
      properties: [
        { property: 'businessId', source: 'payload.businessId', required: true },
        { property: 'ownerId', source: 'payload.ownerId', required: true },
        { property: 'name', source: 'payload.name', required: true },
        { property: 'description', source: 'payload.description' },
        { property: 'primaryCategory', source: 'payload.primaryCategory', required: true },
        { property: 'tagsJson', source: { path: 'payload.tags', transform: 'toString' } },
        { property: 'serviceAreaType', source: 'payload.serviceArea.type' },
        { property: 'serviceAreaLat', source: { path: 'payload.serviceArea.center.lat', transform: 'toNumber' } },
        { property: 'serviceAreaLng', source: { path: 'payload.serviceArea.center.lng', transform: 'toNumber' } },
        { property: 'serviceAreaRadiusMiles', source: { path: 'payload.serviceArea.radiusMiles', transform: 'toNumber' } },
        { property: 'serviceAreaRegionsJson', source: { path: 'payload.serviceArea.regions', transform: 'toString' } },
        { property: 'status', source: { path: 'payload.status', default: 'draft' } },
        { property: 'isVerified', source: { path: 'payload.isVerified', default: false } },
        { property: 'proofSharingEnabled', source: { path: 'payload.proofSharingEnabled', default: false } },
        { property: 'verifiedProofCount', source: { path: 'payload.verifiedProofCount', default: 0 } },
        { property: 'totalCompletions', source: { path: 'payload.totalCompletions', default: 0 } },
        { property: 'createdAt', source: { path: 'timestampMs', transform: 'toTimestamp' } },
        { property: 'updatedAt', source: { path: 'timestampMs', transform: 'toTimestamp' } },
        { property: 'traceId', source: 'traceId' },
      ],
      alias: 'business',
    },
    {
      label: 'User',
      mergeKey: {
        property: 'userId',
        path: 'payload.ownerId',
      },
      properties: [
        { property: 'userId', source: 'payload.ownerId', required: true },
      ],
      alias: 'owner',
    },
  ],

  relationshipWrites: [
    {
      type: 'OWNS_BUSINESS',
      from: {
        label: 'User',
        keyProperty: 'userId',
        keyPath: 'payload.ownerId',
      },
      to: {
        label: 'Business',
        keyProperty: 'businessId',
        keyPath: 'payload.businessId',
      },
      properties: [
        { property: 'createdAt', source: { path: 'timestampMs', transform: 'toTimestamp' }, required: true },
        { property: 'traceId', source: 'traceId' },
      ],
    },
  ],
};
