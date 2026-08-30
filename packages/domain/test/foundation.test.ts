import {
  canonicalJson,
  analysisId,
  adapterId,
  commitSha,
  configRevision,
  contentHash,
  createPrefixedUuidV7,
  createRegistrySnapshot,
  enumValue,
  evidenceId,
  generationId,
  generationLeaseId,
  GENERATION_STATES,
  hashCanonical,
  hashLengthPrefixed,
  instant,
  jobId,
  overlayId,
  registryRevision,
  repoPath,
  repositoryStableId,
  reviewEventId,
  ReverbError,
  treeHash,
  workspaceId,
} from '../src/index.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const NOW = instant('2026-08-28T20:00:00.000Z');
const WORKSPACE = workspaceId('wsp_01990f64-0000-7000-8000-000000000001');
const REPOSITORY = repositoryStableId(
  'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
);

describe('foundation values', () => {
  it('creates valid prefixed UUIDv7 identities from explicit inputs', () => {
    const value = createPrefixedUuidV7(
      'wsp',
      NOW,
      Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
    expect(workspaceId(value)).toBe(value);
    expect(value).toMatch(/^wsp_[0-9a-f-]+$/);
    expect(value.split('-')[2]?.startsWith('7')).toBe(true);
  });

  it('canonicalizes Git SHAs and rejects malformed values with stable codes', () => {
    expect(commitSha('A'.repeat(40))).toBe('a'.repeat(40));
    expect(() => commitSha('not-a-sha')).toThrowError(
      expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_sha' }),
    );
    expect(() => contentHash(`sha1:${'a'.repeat(40)}`)).toThrowError(
      expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_hash' }),
    );
  });

  it('rejects absolute, escaping, noncanonical, backslash, and NUL paths', () => {
    const invalid = [
      '/etc/passwd',
      '../secret',
      'src/../secret',
      './src.ts',
      'src//index.ts',
      'src/',
      'C:/secret',
      'src\\index.ts',
      'src\0secret',
    ];
    invalid.forEach((value) =>
      expect(() => repoPath(value)).toThrowError(
        expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_path' }),
      ),
    );
    expect(repoPath('src/api/index.ts')).toBe('src/api/index.ts');
  });

  it('round-trips arbitrary safe path segments', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { minLength: 1, maxLength: 8 }),
        (segments) => {
          const value = segments.join('/');
          expect(repoPath(value)).toBe(value);
        },
      ),
    );
  });

  it('round-trips every opaque foundation value through canonical JSON', () => {
    const uuid = '01990f64-0000-7000-8000-000000000099';
    const cases: readonly [string, (value: string) => string][] = [
      [`wsp_${uuid}`, workspaceId],
      [`gen_${uuid}`, generationId],
      [`lea_${uuid}`, generationLeaseId],
      [`ovl_${uuid}`, overlayId],
      [`evd_${uuid}`, evidenceId],
      [`job_${uuid}`, jobId],
      [`ana_${uuid}`, analysisId],
      [`rev_${uuid}`, reviewEventId],
      ['github:1234', repositoryStableId],
      ['a'.repeat(40), commitSha],
      ['b'.repeat(40), treeHash],
      [`sha256:${'c'.repeat(64)}`, contentHash],
      [`reg_sha256:${'d'.repeat(64)}`, registryRevision],
      [`cfg_sha256:${'e'.repeat(64)}`, configRevision],
      ['reverb.file-metadata', adapterId],
      ['src/index.ts', repoPath],
      ['2026-08-28T20:00:00.000Z', instant],
    ];
    for (const [input, parser] of cases) {
      const value = parser(input);
      expect(JSON.parse(canonicalJson({ value }))).toEqual({ value: input });
      expect(parser(value)).toBe(value);
    }
  });

  it('rejects open-ended enum values with a stable code', () => {
    expect(() => enumValue(GENERATION_STATES, 'done', 'GenerationState')).toThrowError(
      expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_enum' }),
    );
  });
});

describe('canonical hashing', () => {
  it('sorts object keys without reordering arrays', () => {
    expect(canonicalJson({ z: 1, a: ['b', 'a'] })).toBe('{"a":["b","a"],"z":1}');
    expect(hashCanonical({ b: 2, a: 1 })).toBe(hashCanonical({ a: 1, b: 2 }));
  });

  it('uses length prefixes so field boundaries cannot collide', () => {
    expect(hashLengthPrefixed(['ab', 'c'])).not.toBe(hashLengthPrefixed(['a', 'bc']));
  });

  it('rejects undefined, cyclic, and non-finite inputs', () => {
    expect(() => canonicalJson({ missing: undefined })).toThrowError(ReverbError);
    expect(() => canonicalJson(Number.NaN)).toThrowError(ReverbError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrowError(ReverbError);
  });
});

describe('registry revisions', () => {
  const baseInput = {
    workspaceId: WORKSPACE,
    sequence: 1,
    createdAt: NOW,
    createdBy: 'fixture-user',
    source: 'test',
    reason: 'fixture',
    repositories: [
      {
        repositoryId: REPOSITORY,
        alias: 'api',
        rootPath: '/fixture/api',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: 'consent-v1',
      },
    ],
  } as const;

  it('is deterministic for the same versioned content', () => {
    const left = createRegistrySnapshot(baseInput);
    const right = createRegistrySnapshot(baseInput);
    expect(left.revision.revision).toBe(right.revision.revision);
    expect(configRevision(left.revision.configRevision)).toBe(left.revision.configRevision);
    expect(registryRevision(left.revision.revision)).toBe(left.revision.revision);
  });

  it('changes revision when sequence or membership changes', () => {
    const first = createRegistrySnapshot(baseInput);
    const second = createRegistrySnapshot({ ...baseInput, sequence: 2 });
    expect(second.revision.revision).not.toBe(first.revision.revision);
  });

  it('rejects unknown service repositories and ambiguous aliases', () => {
    expect(() =>
      createRegistrySnapshot({
        ...baseInput,
        services: [
          {
            id: 'svc-unknown',
            repositoryId: repositoryStableId(
              'local:sha256:9999999999999999999999999999999999999999999999999999999999999999',
            ),
            rootPath: repoPath('src'),
            environment: 'production',
            owner: 'team',
            validFrom: NOW,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining<Partial<ReverbError>>({ code: 'unknown_repository' }));

    const services = [
      {
        id: 'svc-a',
        repositoryId: REPOSITORY,
        rootPath: repoPath('src/a'),
        environment: 'production',
        owner: 'team-a',
        validFrom: NOW,
      },
      {
        id: 'svc-b',
        repositoryId: REPOSITORY,
        rootPath: repoPath('src/b'),
        environment: 'production',
        owner: 'team-b',
        validFrom: NOW,
      },
    ] as const;
    expect(() =>
      createRegistrySnapshot({
        ...baseInput,
        services,
        aliases: services.map((service) => ({
          serviceId: service.id,
          kind: 'host' as const,
          value: 'api.example.test',
          environment: 'production',
          provenance: 'operator' as const,
          source: 'fixture',
          owner: service.owner,
          validFrom: NOW,
        })),
      }),
    ).toThrowError(expect.objectContaining<Partial<ReverbError>>({ code: 'ambiguous_alias' }));
  });

  it('rejects invalid validity intervals and missing environment or ownership', () => {
    const invalidService = {
      id: 'svc-api',
      repositoryId: REPOSITORY,
      rootPath: repoPath('src'),
      environment: 'production',
      owner: 'team-api',
      validFrom: NOW,
      validUntil: instant('2026-08-28T19:00:00.000Z'),
    };
    expect(() => createRegistrySnapshot({ ...baseInput, services: [invalidService] })).toThrowError(
      expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_registry' }),
    );
    expect(() =>
      createRegistrySnapshot({
        ...baseInput,
        services: [
          {
            id: invalidService.id,
            repositoryId: invalidService.repositoryId,
            rootPath: invalidService.rootPath,
            environment: '',
            owner: '',
            validFrom: invalidService.validFrom,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_registry' }));
  });
});
