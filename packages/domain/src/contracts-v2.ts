import type { ContractKind } from './vocabularies.js';
import { CONTRACT_KINDS } from './vocabularies.js';

export const NEW_CONTRACT_KINDS_V2 = [
  'event.destination',
  'event.payload_schema',
  'database.table',
  'database.column',
  'database.enum',
  'http.route',
  'configuration.key',
  'configuration.feature_flag',
  'infrastructure.service',
  'infrastructure.endpoint',
  'infrastructure.output',
] as const;

export type NewContractKindV2 = (typeof NEW_CONTRACT_KINDS_V2)[number];

/**
 * Schema-major 2 contract vocabulary. The schema-major 1 `CONTRACT_KINDS`
 * export remains frozen and is deliberately not widened.
 */
export const CONTRACT_KINDS_V2 = Object.freeze([
  ...CONTRACT_KINDS,
  ...NEW_CONTRACT_KINDS_V2,
] as const);

export type ContractKindV2 = ContractKind | NewContractKindV2;
