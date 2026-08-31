import { randomBytes } from 'node:crypto';

import { createPrefixedUuidV7, instant, type Instant } from '@yanib/reverb-domain';
import {
  portSuccess,
  type CancellationPort,
  type Clock,
  type PortResult,
  type TelemetryPort,
} from '@yanib/reverb-application';

export function systemInstant(date = new Date()): Instant {
  return instant(date.toISOString());
}

export function createSystemId(prefix: string, now = systemInstant()): string {
  return createPrefixedUuidV7(prefix, now, randomBytes(10));
}

export class SystemClock implements Clock {
  public now(): Instant {
    return systemInstant();
  }
}

export class AlwaysCurrentCancellation implements CancellationPort {
  public async isCurrent(): Promise<PortResult<boolean>> {
    return portSuccess(true);
  }
}

export class NoopTelemetry implements TelemetryPort {
  public emit(): void {
    // Local telemetry is disabled by default.
  }
}
