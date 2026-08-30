import {
  adapterId,
  contentHash,
  sha256Bytes,
  type BoundedDiagnostic,
  type ConfigRevision,
  type FileArtifact,
  type GenerationId,
  type RepoPath,
  type TreeEntry,
} from '@yanibhq/reverb-domain';

export const FOUNDATION_PARSER_ID = adapterId('reverb.file-metadata');
export const FOUNDATION_PARSER_VERSION = '1.0.0';

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.go': 'go',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'javascript',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.mts': 'typescript',
  '.php': 'php',
  '.proto': 'protobuf',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.sh': 'shell',
  '.sql': 'sql',
  '.swift': 'swift',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.txt': 'text',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

const VENDORED_SEGMENTS = new Set(['node_modules', 'vendor', 'third_party', 'third-party', '.git']);
const GENERATED_SEGMENTS = new Set(['dist', 'build', 'coverage', '.next', 'target']);
const GENERATED_SUFFIXES = ['.min.js', '.min.css', '.generated.ts', '.g.ts', '.pb.go'];
const ARCHIVE_SUFFIXES = [
  '.zip',
  '.tar',
  '.tgz',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.jar',
  '.war',
];

function extension(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '';
}

function pathClassification(path: RepoPath): 'generated' | 'vendored' | 'unsupported' | null {
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  if (segments.some((segment) => VENDORED_SEGMENTS.has(segment))) return 'vendored';
  if (
    segments.some((segment) => GENERATED_SEGMENTS.has(segment)) ||
    GENERATED_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  ) {
    return 'generated';
  }
  if (ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return 'unsupported';
  return null;
}

function diagnostic(
  code: BoundedDiagnostic['code'],
  path: RepoPath,
  safeMessage: string,
  severity: BoundedDiagnostic['severity'] = 'warning',
): BoundedDiagnostic {
  return { code, severity, scope: path, safeMessage };
}

export interface ClassifyArtifactInput {
  readonly generationId: GenerationId;
  readonly entry: TreeEntry;
  readonly bytes?: Uint8Array;
  readonly configRevision: ConfigRevision;
  readonly maximumBytes: number;
  readonly reusedFromGenerationId?: GenerationId;
}

export interface ClassifiedArtifact {
  readonly artifact: FileArtifact;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly complete: boolean;
}

/**
 * The asynchronous seam used by hosts to isolate any parser implementation.
 * The Phase 001 metadata classifier is pure and bounded; third-party parsers
 * must implement this boundary through a sandboxed worker.
 */
export interface ArtifactParserBoundary {
  classify(input: ClassifyArtifactInput): Promise<ClassifiedArtifact>;
}

export class FoundationArtifactParserBoundary implements ArtifactParserBoundary {
  public async classify(input: ClassifyArtifactInput): Promise<ClassifiedArtifact> {
    return classifyArtifact(input);
  }
}

export function failedArtifact(
  input: ClassifyArtifactInput,
  diagnosticCode: Extract<BoundedDiagnostic['code'], 'parse_failure' | 'unreadable_blob'>,
  safeMessage: string,
): ClassifiedArtifact {
  return {
    artifact: {
      generationId: input.generationId,
      path: input.entry.path,
      sourceBlobId: input.entry.objectId,
      size: input.entry.size ?? 0,
      language: 'unknown',
      classification: 'unsupported',
      parseState: 'failed',
      parserId: FOUNDATION_PARSER_ID,
      parserVersion: FOUNDATION_PARSER_VERSION,
      configRevision: input.configRevision,
    },
    diagnostics: [diagnostic(diagnosticCode, input.entry.path, safeMessage, 'error')],
    complete: false,
  };
}

export function classifyArtifact(input: ClassifyArtifactInput): ClassifiedArtifact {
  const common = {
    generationId: input.generationId,
    path: input.entry.path,
    sourceBlobId: input.entry.objectId,
    size: input.entry.size ?? input.bytes?.length ?? 0,
    parserId: FOUNDATION_PARSER_ID,
    parserVersion: FOUNDATION_PARSER_VERSION,
    configRevision: input.configRevision,
    ...(input.reusedFromGenerationId
      ? { reusedFromGenerationId: input.reusedFromGenerationId }
      : {}),
  };
  if (input.entry.kind === 'symlink') {
    return {
      artifact: {
        ...common,
        language: 'symlink',
        classification: 'symlink',
        parseState: 'skipped',
      },
      diagnostics: [
        diagnostic('symlink_entry', input.entry.path, 'Symlink was recorded but not followed.'),
      ],
      complete: false,
    };
  }
  if (input.entry.kind === 'submodule') {
    return {
      artifact: {
        ...common,
        language: 'submodule',
        classification: 'submodule',
        parseState: 'skipped',
      },
      diagnostics: [
        diagnostic(
          'submodule_entry',
          input.entry.path,
          'Submodule content is outside this generation.',
        ),
      ],
      complete: false,
    };
  }
  const excluded = pathClassification(input.entry.path);
  if (excluded) {
    const code =
      excluded === 'generated'
        ? 'generated_path'
        : excluded === 'vendored'
          ? 'vendored_path'
          : 'unsupported_language';
    return {
      artifact: {
        ...common,
        language: 'unknown',
        classification: excluded,
        parseState: 'skipped',
      },
      diagnostics: [
        diagnostic(code, input.entry.path, 'File was classified outside baseline parsing.'),
      ],
      complete: false,
    };
  }
  if ((input.entry.size ?? 0) > input.maximumBytes || !input.bytes) {
    return {
      artifact: {
        ...common,
        language: 'unknown',
        classification: 'oversized',
        parseState: 'skipped',
      },
      diagnostics: [
        diagnostic('oversized_file', input.entry.path, 'File exceeds the source read limit.'),
      ],
      complete: false,
    };
  }
  const hash = contentHash(sha256Bytes(input.bytes));
  if (input.bytes.includes(0)) {
    return {
      artifact: {
        ...common,
        contentHash: hash,
        language: 'binary',
        classification: 'binary',
        parseState: 'skipped',
      },
      diagnostics: [diagnostic('binary_file', input.entry.path, 'Binary file was not parsed.')],
      complete: false,
    };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
  } catch {
    return {
      artifact: {
        ...common,
        contentHash: hash,
        language: 'binary',
        classification: 'binary',
        parseState: 'skipped',
      },
      diagnostics: [diagnostic('binary_file', input.entry.path, 'Non-UTF-8 file was not parsed.')],
      complete: false,
    };
  }
  const language = LANGUAGE_BY_EXTENSION[extension(input.entry.path)] ?? 'unknown';
  if (language === 'unknown') {
    return {
      artifact: {
        ...common,
        contentHash: hash,
        language,
        classification: 'unsupported',
        parseState: 'skipped',
        lineCount: text.length === 0 ? 0 : text.split('\n').length,
      },
      diagnostics: [
        diagnostic(
          'unsupported_language',
          input.entry.path,
          'Language is not recognized by the baseline index.',
        ),
      ],
      complete: false,
    };
  }
  return {
    artifact: {
      ...common,
      contentHash: hash,
      language,
      classification: 'source',
      parseState: 'parsed',
      lineCount: text.length === 0 ? 0 : text.split('\n').length,
    },
    diagnostics: [],
    complete: true,
  };
}

export function cachedArtifactToFile(
  cached: Omit<FileArtifact, 'generationId' | 'path' | 'reusedFromGenerationId'>,
  generationId: GenerationId,
  path: RepoPath,
  reusedFromGenerationId?: GenerationId,
): FileArtifact {
  const {
    generationId: _cachedGenerationId,
    path: _cachedPath,
    reusedFromGenerationId: _cachedReuse,
    ...portable
  } = cached as FileArtifact;
  void _cachedGenerationId;
  void _cachedPath;
  void _cachedReuse;
  return {
    ...portable,
    generationId,
    path,
    ...(reusedFromGenerationId ? { reusedFromGenerationId } : {}),
  };
}

export function artifactCacheValue(
  artifact: FileArtifact,
): Omit<FileArtifact, 'generationId' | 'path' | 'reusedFromGenerationId'> {
  const copy: Record<string, unknown> = { ...artifact };
  delete copy.generationId;
  delete copy.path;
  delete copy.reusedFromGenerationId;
  return copy as Omit<FileArtifact, 'generationId' | 'path' | 'reusedFromGenerationId'>;
}

export function overlayArtifactValue(artifact: FileArtifact): Omit<FileArtifact, 'generationId'> {
  const copy: Record<string, unknown> = { ...artifact };
  delete copy.generationId;
  return copy as Omit<FileArtifact, 'generationId'>;
}
