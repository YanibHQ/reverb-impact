import {
  OPENAPI_ADAPTER_MANIFEST,
  OPENAPI_ADMISSION_REPORT,
} from '../packages/adapter-openapi/src/index.js';
import {
  PROTOBUF_ADAPTER_MANIFEST,
  PROTOBUF_ADMISSION_REPORT,
} from '../packages/adapter-protobuf/src/index.js';
import {
  TYPESCRIPT_ADAPTER_MANIFEST,
  TYPESCRIPT_ADMISSION_REPORT,
} from '../packages/adapter-typescript/src/index.js';
import { validateAdapterManifest } from '../packages/adapter-sdk/src/index.js';

const denied = /\b(?:AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED)\b/i;
const manifests = [
  OPENAPI_ADAPTER_MANIFEST,
  PROTOBUF_ADAPTER_MANIFEST,
  TYPESCRIPT_ADAPTER_MANIFEST,
];
const reports = [OPENAPI_ADMISSION_REPORT, PROTOBUF_ADMISSION_REPORT, TYPESCRIPT_ADMISSION_REPORT];

for (const manifest of manifests) {
  validateAdapterManifest(manifest);
  for (const tool of manifest.externalTools) {
    if (denied.test(tool.license)) throw new Error(`Denied adapter tool license: ${tool.id}`);
    if (!/^\d+\.\d+\.\d+$/.test(tool.version)) {
      throw new Error(`Adapter tool version is not exact SemVer: ${tool.id}`);
    }
  }
}

for (const report of reports) {
  if (report.dependenciesAndLicenses.some((entry) => denied.test(entry))) {
    throw new Error(`Denied adapter dependency license: ${report.adapterId}`);
  }
}

process.stdout.write('Adapter package, parser, and external-tool licenses satisfy policy.\n');
