import { contentHash, hashCanonical, type RepoPath } from '@yanib/reverb-domain';

import { AdapterValidationError } from './validation.js';
import type {
  AdapterInvalidationPlan,
  AdapterPartitionDescriptor,
  AdapterPathChange,
} from './types.js';

function sorted(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validatePartitions(partitions: readonly AdapterPartitionDescriptor[]): void {
  const keys = new Set<string>();
  for (const partition of partitions) {
    if (partition.partitionKey.length === 0 || keys.has(partition.partitionKey)) {
      throw new AdapterValidationError(
        'invalid_partition_plan',
        'Partition keys must be non-empty and unique.',
      );
    }
    keys.add(partition.partitionKey);
    if (new Set(partition.ownedPaths).size !== partition.ownedPaths.length) {
      throw new AdapterValidationError(
        'invalid_partition_plan',
        'Partition-owned paths must be unique.',
      );
    }
    if (new Set(partition.dependencyKeys).size !== partition.dependencyKeys.length) {
      throw new AdapterValidationError(
        'invalid_partition_plan',
        'Partition dependency keys must be unique.',
      );
    }
  }
}

/**
 * Conservative path ownership planner shared by incremental adapters.
 * Unowned changed paths remain explicit and make the plan incomplete; callers
 * must not widen the source set or fall back to a repository scan.
 */
export function planPathPartitionInvalidation(input: {
  readonly partitions: readonly AdapterPartitionDescriptor[];
  readonly changes: readonly AdapterPathChange[];
}): AdapterInvalidationPlan {
  validatePartitions(input.partitions);
  const owners = new Map<RepoPath, Set<string>>();
  for (const partition of input.partitions) {
    for (const path of partition.ownedPaths) {
      const values = owners.get(path) ?? new Set<string>();
      values.add(partition.partitionKey);
      owners.set(path, values);
    }
  }

  const changedPaths = sorted(
    input.changes.flatMap((change) =>
      change.previousPath ? [change.path, change.previousPath] : [change.path],
    ),
  ) as readonly RepoPath[];
  const direct = new Set<string>();
  const unmatched = new Set<RepoPath>();
  for (const path of changedPaths) {
    const pathOwners = owners.get(path);
    if (!pathOwners || pathOwners.size === 0) unmatched.add(path);
    else pathOwners.forEach((key) => direct.add(key));
  }

  const invalidated = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const partition of input.partitions) {
      if (invalidated.has(partition.partitionKey)) continue;
      if (partition.dependencyKeys.some((dependency) => invalidated.has(dependency))) {
        invalidated.add(partition.partitionKey);
        changed = true;
      }
    }
  }
  const directPartitionKeys = sorted(direct);
  const invalidatedPartitionKeys = sorted(invalidated);
  const directSet = new Set(directPartitionKeys);
  const dependentPartitionKeys = invalidatedPartitionKeys.filter((key) => !directSet.has(key));
  const unmatchedPaths = sorted(unmatched) as readonly RepoPath[];
  const canonical = {
    changedPaths,
    directPartitionKeys,
    dependentPartitionKeys,
    invalidatedPartitionKeys,
    unmatchedPaths,
    complete: unmatchedPaths.length === 0,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
