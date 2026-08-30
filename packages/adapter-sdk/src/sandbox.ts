import type { ContentHash } from '@yanibhq/reverb-domain';

import type { DifferMetadata, ExternalToolDeclaration } from './types.js';
import { AdapterValidationError } from './validation.js';

export interface AdapterSandboxRequest {
  readonly toolId: string;
  readonly argv: readonly string[];
  readonly inputRefs: readonly string[];
  readonly timeoutMs: number;
  readonly maximumOutputBytes: number;
  readonly network: false;
  readonly readOnlyInputs: true;
  readonly scratchOutput: true;
  readonly memoryMiB: number;
  readonly environment: Readonly<Record<string, never>>;
}

export interface AdapterSandboxResult {
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
  readonly stderrCode: string | null;
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
}

export type AdapterSandboxPortResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly failure: {
        readonly kind: string;
        readonly code: string;
        readonly safeMessage: string;
        readonly retryable: boolean;
      };
    };

export interface AdapterSandboxRunner {
  run(request: AdapterSandboxRequest): Promise<AdapterSandboxPortResult<AdapterSandboxResult>>;
}

export interface DifferExitMap {
  readonly compatible: readonly number[];
  readonly breaking: readonly number[];
  readonly unknown: readonly number[];
}

export interface DeclaredDifferResult {
  readonly state: 'compatible' | 'breaking' | 'unknown' | 'tool_failure';
  readonly stdout: Uint8Array;
  readonly failureCode?: string;
  readonly metadata: DifferMetadata;
}

const INPUT_REF = /^blob:sha256:[0-9a-f]{64}$/;

function metadata(tool: ExternalToolDeclaration, category: string): DifferMetadata {
  return {
    toolId: tool.id,
    toolVersion: tool.version,
    toolDigest: tool.digest,
    toolLicense: tool.license,
    category,
  };
}

export class DeclaredExternalDiffer {
  public constructor(
    private readonly tool: ExternalToolDeclaration,
    private readonly sandbox: AdapterSandboxRunner,
    private readonly options: {
      readonly timeoutMs: number;
      readonly memoryMiB: number;
      readonly maximumOutputBytes: number;
      readonly exitMap: DifferExitMap;
      readonly category: string;
    },
  ) {
    if (tool.network !== false)
      throw new AdapterValidationError('unsafe_tool', 'Differ tools must deny network.');
  }

  public async run(
    argv: readonly string[],
    inputRefs: readonly string[],
  ): Promise<DeclaredDifferResult> {
    if (
      argv.length === 0 ||
      argv.length > 64 ||
      argv.some((argument) => argument.length > 2048 || argument.includes('\0'))
    ) {
      throw new AdapterValidationError('invalid_tool_argv', 'Differ argv is invalid.');
    }
    if (inputRefs.length === 0 || inputRefs.some((reference) => !INPUT_REF.test(reference))) {
      throw new AdapterValidationError(
        'unsafe_tool_input',
        'Differ inputs must be content-addressed read-only blobs.',
      );
    }
    const result = await this.sandbox.run({
      toolId: this.tool.id,
      argv: [...argv],
      inputRefs: [...inputRefs],
      timeoutMs: this.options.timeoutMs,
      maximumOutputBytes: this.options.maximumOutputBytes,
      network: false,
      readOnlyInputs: true,
      scratchOutput: true,
      memoryMiB: this.options.memoryMiB,
      environment: {},
    });
    const toolMetadata = metadata(this.tool, this.options.category);
    if (!result.ok) {
      return {
        state: 'tool_failure',
        stdout: new Uint8Array(),
        failureCode: result.failure.code,
        metadata: toolMetadata,
      };
    }
    if (result.value.timedOut)
      return {
        state: 'tool_failure',
        stdout: new Uint8Array(),
        failureCode: 'tool_timeout',
        metadata: toolMetadata,
      };
    if (result.value.outputTruncated)
      return {
        state: 'tool_failure',
        stdout: new Uint8Array(),
        failureCode: 'tool_output_truncated',
        metadata: toolMetadata,
      };
    const exitCode = result.value.exitCode;
    if (exitCode !== null && this.options.exitMap.compatible.includes(exitCode)) {
      return { state: 'compatible', stdout: result.value.stdout, metadata: toolMetadata };
    }
    if (exitCode !== null && this.options.exitMap.breaking.includes(exitCode)) {
      return { state: 'breaking', stdout: result.value.stdout, metadata: toolMetadata };
    }
    if (exitCode !== null && this.options.exitMap.unknown.includes(exitCode)) {
      return { state: 'unknown', stdout: result.value.stdout, metadata: toolMetadata };
    }
    return {
      state: 'tool_failure',
      stdout: new Uint8Array(),
      failureCode: result.value.stderrCode ?? 'unmapped_tool_exit',
      metadata: toolMetadata,
    };
  }
}

export function contentInputReference(hash: ContentHash): string {
  return `blob:${hash}`;
}
