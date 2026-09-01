import type { ContractReference, DeclaredDifferResult } from '../packages/adapter-sdk/src/index.js';
import type { ConsumerGenerationSelection } from '../packages/domain/src/index.js';
import {
  isGitHubHostedJobKind,
  type CheckWriteResult,
  type GitHubHostedJobKind,
} from '../packages/host-github/src/index.js';

declare const referenceBase: Omit<
  ContractReference,
  'canonicalKey' | 'unresolvedPattern' | 'unresolvedReason'
>;

const resolvedReference = {
  ...referenceBase,
  canonicalKey: 'typescript:npm:@acme/api#Pet',
} satisfies ContractReference;

const unresolvedReference = {
  ...referenceBase,
  unresolvedPattern: '@acme/api/*',
  unresolvedReason: 'dynamic_import',
} satisfies ContractReference;

// @ts-expect-error A reference cannot be both resolved and unresolved.
const contradictoryReference: ContractReference = {
  ...referenceBase,
  canonicalKey: 'typescript:npm:@acme/api#Pet',
  unresolvedPattern: '@acme/api/*',
  unresolvedReason: 'dynamic_import',
};

// @ts-expect-error An unresolved reference requires both a pattern and a reason.
const incompleteReference: ContractReference = {
  ...referenceBase,
  unresolvedPattern: '@acme/api/*',
};

declare const differBase: Pick<DeclaredDifferResult, 'stdout' | 'metadata'>;

const successfulDiff = {
  ...differBase,
  state: 'compatible',
} satisfies DeclaredDifferResult;

const failedDiff = {
  ...differBase,
  state: 'tool_failure',
  failureCode: 'tool_timeout',
} satisfies DeclaredDifferResult;

declare const compatibleDiff: Extract<DeclaredDifferResult, { readonly state: 'compatible' }>;
const compatibleState: 'compatible' = compatibleDiff.state;

// @ts-expect-error Tool failures always carry a stable failure code.
const uncodedFailure: DeclaredDifferResult = { ...differBase, state: 'tool_failure' };

// @ts-expect-error Successful differ results cannot carry failure metadata.
const contradictoryDiff: DeclaredDifferResult = {
  ...differBase,
  state: 'compatible',
  failureCode: 'unexpected',
};

type SelectedConsumer = Extract<
  ConsumerGenerationSelection,
  { readonly state: 'current' | 'stale' }
>;

declare const selectedConsumerBase: Omit<SelectedConsumer, 'state'>;
declare const repositoryId: ConsumerGenerationSelection['repositoryId'];

const currentConsumer = {
  ...selectedConsumerBase,
  state: 'current',
} satisfies ConsumerGenerationSelection;

const unavailableConsumer = {
  repositoryId,
  state: 'not_indexed',
  reason: 'contracts_not_indexed',
} satisfies ConsumerGenerationSelection;

declare const selectedCurrentConsumer: Extract<
  ConsumerGenerationSelection,
  { readonly state: 'current' }
>;
const currentState: 'current' = selectedCurrentConsumer.state;

// @ts-expect-error Current selections require generation, commit, freshness, and coverage data.
const incompleteCurrentConsumer: ConsumerGenerationSelection = {
  repositoryId,
  state: 'current',
};

// @ts-expect-error Unavailable selections cannot claim a selected generation.
const contradictoryUnavailableConsumer: ConsumerGenerationSelection = {
  ...selectedConsumerBase,
  state: 'not_indexed',
  reason: 'contracts_not_indexed',
};

const deliveredCheck = {
  state: 'delivered',
  externalId: 'check-1',
  requests: 1,
} satisfies CheckWriteResult;

const skippedCheck = { state: 'disabled', requests: 0 } satisfies CheckWriteResult;

declare const disabledCheck: Extract<CheckWriteResult, { readonly state: 'disabled' }>;
const disabledState: 'disabled' = disabledCheck.state;

// @ts-expect-error Delivered checks always contain the provider external ID.
const incompleteDeliveredCheck: CheckWriteResult = { state: 'delivered', requests: 1 };

// @ts-expect-error Non-delivery states cannot claim a provider external ID.
const contradictorySkippedCheck: CheckWriteResult = {
  state: 'disabled',
  externalId: 'check-1',
  requests: 0,
};

declare const persistedKind: string;
if (isGitHubHostedJobKind(persistedKind)) {
  const hostedKind: GitHubHostedJobKind = persistedKind;
  void hostedKind;
}

// @ts-expect-error Hosted job kinds are a closed vocabulary.
const unsupportedKind: GitHubHostedJobKind = 'unknown_job';

void [
  resolvedReference,
  unresolvedReference,
  contradictoryReference,
  incompleteReference,
  successfulDiff,
  failedDiff,
  compatibleState,
  uncodedFailure,
  contradictoryDiff,
  currentConsumer,
  unavailableConsumer,
  currentState,
  incompleteCurrentConsumer,
  contradictoryUnavailableConsumer,
  deliveredCheck,
  skippedCheck,
  disabledState,
  incompleteDeliveredCheck,
  contradictorySkippedCheck,
  unsupportedKind,
];
