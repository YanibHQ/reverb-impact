import {
  OPENAPI_ADAPTER_MANIFEST,
  OPENAPI_ADMISSION_REPORT,
} from '../packages/adapter-openapi/src/index.js';
import {
  EVENTS_ADAPTER_MANIFEST,
  EVENTS_ADMISSION_REPORT,
} from '../packages/adapter-events/src/index.js';
import {
  DATABASE_ADAPTER_MANIFEST,
  DATABASE_ADMISSION_REPORT,
} from '../packages/adapter-database/src/index.js';
import {
  CONFIG_ADAPTER_MANIFEST,
  CONFIG_ADMISSION_REPORT,
} from '../packages/adapter-config/src/index.js';
import {
  HTTP_ADAPTER_MANIFEST,
  HTTP_ADMISSION_REPORT,
} from '../packages/adapter-http/src/index.js';
import {
  PROTOBUF_ADAPTER_MANIFEST,
  PROTOBUF_ADMISSION_REPORT,
} from '../packages/adapter-protobuf/src/index.js';
import {
  TYPESCRIPT_ADAPTER_MANIFEST,
  TYPESCRIPT_ADMISSION_REPORT,
} from '../packages/adapter-typescript/src/index.js';
import {
  validateAdapterManifest,
  validateAdapterManifestV2,
} from '../packages/adapter-sdk/src/index.js';

const denied = /\b(?:AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED)\b/i;
const manifests = [
  OPENAPI_ADAPTER_MANIFEST,
  PROTOBUF_ADAPTER_MANIFEST,
  TYPESCRIPT_ADAPTER_MANIFEST,
];
const manifestsV2 = [
  CONFIG_ADAPTER_MANIFEST,
  DATABASE_ADAPTER_MANIFEST,
  EVENTS_ADAPTER_MANIFEST,
  HTTP_ADAPTER_MANIFEST,
];
const reports = [
  CONFIG_ADMISSION_REPORT,
  DATABASE_ADMISSION_REPORT,
  EVENTS_ADMISSION_REPORT,
  HTTP_ADMISSION_REPORT,
  OPENAPI_ADMISSION_REPORT,
  PROTOBUF_ADMISSION_REPORT,
  TYPESCRIPT_ADMISSION_REPORT,
];

for (const manifest of manifests) {
  validateAdapterManifest(manifest);
  for (const tool of manifest.externalTools) {
    if (denied.test(tool.license)) throw new Error(`Denied adapter tool license: ${tool.id}`);
    if (!/^\d+\.\d+\.\d+$/.test(tool.version)) {
      throw new Error(`Adapter tool version is not exact SemVer: ${tool.id}`);
    }
  }
}

for (const manifest of manifestsV2) validateAdapterManifestV2(manifest);

for (const report of reports) {
  if (report.dependenciesAndLicenses.some((entry) => denied.test(entry))) {
    throw new Error(`Denied adapter dependency license: ${report.adapterId}`);
  }
}

process.stdout.write('Adapter package, parser, and external-tool licenses satisfy policy.\n');
