import { parseAllDocuments } from 'yaml';

export type InfrastructureFact = {
  readonly role: 'definition' | 'reference';
  readonly kind: 'service' | 'workload' | 'container' | 'endpoint' | 'output';
  readonly name: string;
  readonly port?: string;
  readonly protocol?: string;
  readonly remoteStateAlias?: string;
  readonly source: 'kubernetes_manifest' | 'helm_rendered_manifest' | 'terraform_configuration';
  readonly offset: number;
  readonly length: number;
};
export interface ParsedInfrastructureSource {
  readonly facts: readonly InfrastructureFact[];
  readonly limitations: readonly string[];
  readonly probable: boolean;
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, max = 512): string {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new Error('invalid_infrastructure_token');
  const normalized = String(value).normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > max || normalized.includes('\0'))
    throw new Error('invalid_infrastructure_token');
  return normalized;
}
function locate(text: string, value: string, cursor: { value: number }) {
  let offset = text.indexOf(value, cursor.value);
  if (offset < 0) offset = text.indexOf(value);
  if (offset < 0) throw new Error('infrastructure_location_unresolved');
  cursor.value = offset + value.length;
  return { offset, length: value.length };
}
function renderHelm(text: string, values: Readonly<Record<string, unknown>>) {
  let unresolved = false;
  const rendered = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, expression: string) => {
    const match = expression.trim().match(/^\.Values\.([A-Za-z0-9_.-]+)$/);
    const raw = match === null ? undefined : values[match[1]!];
    if (
      (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') ||
      String(raw).length > whole.length
    ) {
      unresolved = true;
      return ' '.repeat(whole.length);
    }
    return String(raw) + ' '.repeat(whole.length - String(raw).length);
  });
  return { rendered, unresolved };
}
function yamlFacts(
  text: string,
  source: InfrastructureFact['source'],
  maximumItems: number,
): InfrastructureFact[] {
  const facts: InfrastructureFact[] = [];
  const cursor = { value: 0 };
  for (const document of parseAllDocuments(text, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  })) {
    if (document.errors.length > 0) throw new Error('invalid_yaml');
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    if (!record(value)) continue;
    if (typeof value.kind !== 'string') continue;
    const kind = bounded(value.kind);
    if (!['Service', 'Ingress', 'Deployment', 'StatefulSet', 'DaemonSet'].includes(kind)) continue;
    const metadata = record(value.metadata) ? value.metadata : {};
    const name = typeof metadata.name === 'string' ? bounded(metadata.name) : undefined;
    if (name === undefined) continue;
    if (kind === 'Service') {
      facts.push({
        role: 'definition',
        kind: 'service',
        name,
        source,
        ...locate(text, name, cursor),
      });
      const spec = record(value.spec) ? value.spec : {};
      if (Array.isArray(spec.ports))
        for (const item of spec.ports) {
          if (!record(item) || item.port === undefined) continue;
          const port = bounded(item.port);
          const protocol = bounded(item.protocol ?? 'TCP');
          facts.push({
            role: 'definition',
            kind: 'endpoint',
            name,
            port,
            protocol,
            source,
            ...locate(text, port, cursor),
          });
        }
    } else if (kind === 'Ingress') {
      const spec = record(value.spec) ? value.spec : {};
      const rules = Array.isArray(spec.rules) ? spec.rules : [];
      for (const rule of rules) {
        if (!record(rule) || !record(rule.http) || !Array.isArray(rule.http.paths)) continue;
        for (const path of rule.http.paths) {
          if (!record(path) || !record(path.backend) || !record(path.backend.service)) continue;
          const service = path.backend.service;
          const serviceName = bounded(service.name);
          facts.push({
            role: 'reference',
            kind: 'service',
            name: serviceName,
            source,
            ...locate(text, serviceName, cursor),
          });
          if (record(service.port)) {
            const port = bounded(service.port.number ?? service.port.name);
            facts.push({
              role: 'reference',
              kind: 'endpoint',
              name: serviceName,
              port,
              protocol: 'TCP',
              source,
              ...locate(text, port, cursor),
            });
          }
        }
      }
    } else if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind)) {
      facts.push({
        role: 'definition',
        kind: 'workload',
        name: `${kind.toLowerCase()}/${name}`,
        source,
        ...locate(text, name, cursor),
      });
      const spec =
        record(value.spec) && record(value.spec.template) && record(value.spec.template.spec)
          ? value.spec.template.spec
          : {};
      if (Array.isArray(spec.containers))
        for (const container of spec.containers) {
          if (!record(container) || typeof container.name !== 'string') continue;
          const containerName = bounded(container.name);
          facts.push({
            role: 'definition',
            kind: 'container',
            name: `${name}/${containerName}`,
            source,
            ...locate(text, containerName, cursor),
          });
        }
    }
    if (facts.length > maximumItems) throw new Error('infrastructure_item_limit');
  }
  return facts;
}
function blocks(text: string, header: RegExp) {
  const result: { match: RegExpMatchArray; body: string; offset: number; length: number }[] = [];
  for (const match of text.matchAll(header)) {
    let depth = 1;
    let quote = false;
    let index = match.index + match[0].length;
    for (; index < text.length && depth > 0; index += 1) {
      const char = text[index];
      if (char === '"' && text[index - 1] !== '\\') quote = !quote;
      if (quote) continue;
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    }
    if (depth === 0)
      result.push({
        match,
        body: text.slice(match.index + match[0].length, index - 1),
        offset: match.index,
        length: index - match.index,
      });
  }
  return result;
}
function terraformFacts(text: string, maximumItems: number): InfrastructureFact[] {
  const facts: InfrastructureFact[] = [];
  for (const block of blocks(
    text,
    /\bresource\s+"kubernetes_service"\s+"([A-Za-z0-9_-]+)"\s*\{/g,
  )) {
    const literal = block.body.match(/\bname\s*=\s*"([^"]+)"/);
    const name = bounded(literal?.[1] ?? block.match[1]);
    facts.push({
      role: 'definition',
      kind: 'service',
      name,
      source: 'terraform_configuration',
      offset: block.offset,
      length: block.length,
    });
    for (const portMatch of block.body.matchAll(/\bport\s*=\s*(\d+)/g)) {
      facts.push({
        role: 'definition',
        kind: 'endpoint',
        name,
        port: portMatch[1]!,
        protocol: 'TCP',
        source: 'terraform_configuration',
        offset: block.offset + block.match[0].length + portMatch.index,
        length: portMatch[0].length,
      });
    }
  }
  for (const block of blocks(text, /\boutput\s+"([A-Za-z0-9_-]+)"\s*\{/g))
    facts.push({
      role: 'definition',
      kind: 'output',
      name: bounded(block.match[1]),
      source: 'terraform_configuration',
      offset: block.offset,
      length: block.length,
    });
  for (const match of text.matchAll(
    /\bdata\.terraform_remote_state\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/g,
  ))
    facts.push({
      role: 'reference',
      kind: 'output',
      name: bounded(match[2]),
      remoteStateAlias: bounded(match[1]),
      source: 'terraform_configuration',
      offset: match.index,
      length: match[0].length,
    });
  if (facts.length > maximumItems) throw new Error('infrastructure_item_limit');
  return facts;
}
export function parseInfrastructureSource(
  text: string,
  path: string,
  context: Readonly<Record<string, unknown>>,
  maximumItems: number,
): ParsedInfrastructureSource {
  const limitations = new Set<string>();
  let facts: InfrastructureFact[] = [];
  const kubernetesMarker =
    /^\s*apiVersion\s*:/im.test(text) &&
    /^\s*kind\s*:\s*(?:Service|Ingress|Deployment|StatefulSet|DaemonSet)\b/im.test(text);
  const helm = /(?:^|\/)templates\/|\.helm\.ya?ml$/i.test(path) && /\{\{/.test(text);
  const yaml = /\.ya?ml$/i.test(path) && kubernetesMarker;
  const terraform =
    /\.tf$/i.test(path) && /\b(?:resource|output|data\.terraform_remote_state)\b/.test(text);
  if (helm) {
    const values = record(context.helmValues) ? context.helmValues : {};
    const rendered = renderHelm(text, values);
    if (rendered.unresolved) limitations.add('helm_template_unresolved');
    else facts = yamlFacts(rendered.rendered, 'helm_rendered_manifest', maximumItems);
  } else if (yaml) facts = yamlFacts(text, 'kubernetes_manifest', maximumItems);
  else if (terraform) facts = terraformFacts(text, maximumItems);
  const probable = helm || yaml || terraform;
  if (probable && facts.length === 0 && limitations.size === 0)
    limitations.add('infrastructure_syntax_unresolved');
  return { facts, limitations: [...limitations].sort(), probable };
}
