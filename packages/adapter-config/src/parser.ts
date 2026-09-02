export type ConfigurationFact = {
  readonly role: 'definition' | 'reference';
  readonly kind: 'configuration_key' | 'feature_flag' | 'secret_reference';
  readonly key: string;
  readonly provider?: string;
  readonly source: 'configuration_declaration' | 'configuration_read' | 'secret_reference';
  readonly offset: number;
  readonly length: number;
};

export interface ParsedConfigurationSource {
  readonly facts: readonly ConfigurationFact[];
  readonly limitations: readonly string[];
  readonly probable: boolean;
}

function bounded(value: string, maximum = 512): string {
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > maximum || normalized.includes('\0'))
    throw new Error('invalid_configuration_token');
  return normalized;
}

function addMatches(
  facts: ConfigurationFact[],
  text: string,
  regex: RegExp,
  create: (match: RegExpMatchArray) => Omit<ConfigurationFact, 'offset' | 'length'>,
) {
  for (const match of text.matchAll(regex))
    facts.push({ ...create(match), offset: match.index, length: match[0].length });
}

function parseExplicitManifest(text: string): readonly ConfigurationFact[] | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (
    record.schema !== 'reverb.configuration' ||
    record.schemaVersion !== '1.0' ||
    !Array.isArray(record.entries)
  )
    return undefined;
  let cursor = 0;
  return record.entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error('invalid_configuration_manifest');
    const item = entry as Record<string, unknown>;
    if (
      !['configuration_key', 'feature_flag', 'secret_reference'].includes(String(item.kind)) ||
      typeof item.key !== 'string'
    )
      throw new Error('invalid_configuration_manifest');
    if (item.kind === 'secret_reference' && typeof item.provider !== 'string')
      throw new Error('invalid_configuration_manifest');
    const needle = JSON.stringify(item.key);
    const located = text.indexOf(needle, cursor);
    const offset = located < 0 ? 0 : located;
    cursor = offset + needle.length;
    return {
      role: 'definition',
      kind: item.kind as ConfigurationFact['kind'],
      key: bounded(item.key),
      ...(item.kind === 'secret_reference' ? { provider: bounded(String(item.provider)) } : {}),
      source: item.kind === 'secret_reference' ? 'secret_reference' : 'configuration_declaration',
      offset,
      length: needle.length,
    };
  });
}

export function parseConfigurationSource(
  text: string,
  path: string,
  maximumItems: number,
): ParsedConfigurationSource {
  const facts: ConfigurationFact[] = [];
  const limitations = new Set<string>();
  const explicit = /(?:^|\/)reverb\.config\.json$/i.test(path)
    ? parseExplicitManifest(text)
    : undefined;
  if (explicit !== undefined) facts.push(...explicit);
  if (/(?:^|\/)\.env\.(?:example|sample|template)$/i.test(path)) {
    let offset = 0;
    for (const line of text.split(/(?<=\n)/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match !== null)
        facts.push({
          role: 'definition',
          kind: 'configuration_key',
          key: bounded(match[1]!),
          source: 'configuration_declaration',
          offset,
          length: match[0].length,
        });
      offset += line.length;
    }
  }
  addMatches(facts, text, /\bdefineConfigKey\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match) => ({
    role: 'definition',
    kind: 'configuration_key',
    key: bounded(match[1]!),
    source: 'configuration_declaration',
  }));
  addMatches(facts, text, /\bdefineFeatureFlag\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match) => ({
    role: 'definition',
    kind: 'feature_flag',
    key: bounded(match[1]!),
    source: 'configuration_declaration',
  }));
  addMatches(
    facts,
    text,
    /\bdefineSecretReference\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g,
    (match) => ({
      role: 'definition',
      kind: 'secret_reference',
      provider: bounded(match[1]!),
      key: bounded(match[2]!),
      source: 'secret_reference',
    }),
  );
  addMatches(facts, text, /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, (match) => ({
    role: 'reference',
    kind: 'configuration_key',
    key: bounded(match[1]!),
    source: 'configuration_read',
  }));
  addMatches(facts, text, /\bprocess\.env\s*\[\s*['"]([^'"]+)['"]\s*\]/g, (match) => ({
    role: 'reference',
    kind: 'configuration_key',
    key: bounded(match[1]!),
    source: 'configuration_read',
  }));
  addMatches(
    facts,
    text,
    /\b(?:Deno\.env\.get|os\.getenv|getenv|config\.(?:get|require))\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match) => ({
      role: 'reference',
      kind: 'configuration_key',
      key: bounded(match[1]!),
      source: 'configuration_read',
    }),
  );
  addMatches(
    facts,
    text,
    /\b(?:isFeatureEnabled|featureFlags\.(?:isEnabled|get)|flags\.(?:isEnabled|get|variation))\s*\(\s*['"]([^'"]+)['"]/g,
    (match) => ({
      role: 'reference',
      kind: 'feature_flag',
      key: bounded(match[1]!),
      source: 'configuration_read',
    }),
  );
  addMatches(
    facts,
    text,
    /\bsecrets\.get\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g,
    (match) => ({
      role: 'reference',
      kind: 'secret_reference',
      provider: bounded(match[1]!),
      key: bounded(match[2]!),
      source: 'secret_reference',
    }),
  );
  addMatches(facts, text, /\bsecretManager\.getSecret\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match) => ({
    role: 'reference',
    kind: 'secret_reference',
    provider: 'host_secret_manager',
    key: bounded(match[1]!),
    source: 'secret_reference',
  }));
  if (
    /\bprocess\.env\s*\[(?!\s*['"])/.test(text) ||
    /\b(?:config\.(?:get|require)|flags\.(?:get|isEnabled|variation)|featureFlags\.(?:get|isEnabled))\s*\(\s*(?!['"])/.test(
      text,
    )
  )
    limitations.add('computed_configuration_key');
  if (/\b(?:secrets\.get|secretManager\.getSecret)\s*\(\s*(?!['"])/.test(text))
    limitations.add('computed_secret_reference');
  const probable =
    facts.length > 0 ||
    limitations.size > 0 ||
    /(?:^|\/)reverb\.config\.json$|(?:^|\/)\.env\.(?:example|sample|template)$/i.test(path);
  if (facts.length > maximumItems) throw new Error('configuration_item_limit');
  if (probable && facts.length === 0 && limitations.size === 0)
    limitations.add('configuration_syntax_unresolved');
  return { facts, limitations: [...limitations].sort(), probable };
}
