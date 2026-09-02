import { createHash } from 'node:crypto';

import { HTTP_METHODS, type HttpMethod } from './identity.js';

export interface HttpBinding {
  readonly role: 'producer' | 'consumer';
  readonly method: HttpMethod;
  readonly routeTemplate?: string;
  readonly serviceHint?: string;
  readonly clientName?: string;
  readonly unresolvedExpressionHash?: string;
  readonly source: 'framework_route' | 'literal_http_call';
  readonly framework: string;
  readonly offset: number;
  readonly length: number;
}

export interface ParsedHttpSource {
  readonly bindings: readonly HttpBinding[];
  readonly limitations: readonly string[];
  readonly probable: boolean;
}

function hashExpression(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function method(value: string): HttpMethod | undefined {
  const normalized = value.toUpperCase();
  return HTTP_METHODS.includes(normalized as HttpMethod) ? (normalized as HttpMethod) : undefined;
}

function unquote(value: string): { readonly quote: string; readonly body: string } | undefined {
  const quote = value[0];
  if ((quote !== "'" && quote !== '"' && quote !== '`') || value.at(-1) !== quote) return undefined;
  return { quote, body: value.slice(1, -1) };
}

function normalizePath(body: string, template: boolean): string | undefined {
  let value = body;
  if (template) {
    let unresolved = false;
    value = value.replace(/\$\{([^}]+)\}/g, (_match, expression: string) => {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(expression.trim())) {
        unresolved = true;
      }
      return '{param}';
    });
    if (unresolved || value.includes('${')) return undefined;
  }
  value = value.split(/[?#]/, 1)[0]!;
  if (!value.startsWith('/') || value.includes('\0') || value.length > 2_048) return undefined;
  const segments = value
    .replace(/\/{2,}/g, '/')
    .split('/')
    .filter((segment, index) => index === 0 || segment.length > 0)
    .map((segment) =>
      /^:[A-Za-z_][A-Za-z0-9_]*$|^\{[^{}]+\}$|^<[^<>]+>$/.test(segment) ? '{param}' : segment,
    );
  const normalized = segments.join('/');
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function parseUrlExpression(value: string): {
  readonly routeTemplate?: string;
  readonly serviceHint?: string;
  readonly unresolvedExpressionHash?: string;
} {
  const quoted = unquote(value.trim());
  if (quoted === undefined) return { unresolvedExpressionHash: hashExpression(value) };
  const absolute = quoted.body.match(/^https?:\/\/([^/${}]+)(\/.*)?$/i);
  if (absolute !== null) {
    const routeTemplate = normalizePath(absolute[2] ?? '/', quoted.quote === '`');
    return routeTemplate === undefined
      ? { unresolvedExpressionHash: hashExpression(value) }
      : { serviceHint: absolute[1]!.toLowerCase(), routeTemplate };
  }
  const routeTemplate = normalizePath(quoted.body, quoted.quote === '`');
  return routeTemplate === undefined
    ? { unresolvedExpressionHash: hashExpression(value) }
    : { routeTemplate };
}

export function parseHttpSource(text: string, maximumItems: number): ParsedHttpSource {
  const bindings: HttpBinding[] = [];
  const limitations = new Set<string>();
  const probable =
    /\b(?:app|router|server|fastify|hono)\.(?:delete|get|head|options|patch|post|put)\s*\(|\bfetch\s*\(|\baxios\.(?:delete|get|head|options|patch|post|put)\s*\(|\b[A-Za-z_$][A-Za-z0-9_$]*\.(?:delete|get|head|options|patch|post|put)\s*\(/i.test(
      text,
    );
  const routeRegex =
    /\b(app|router|server|fastify|hono)\.(delete|get|head|options|patch|post|put)\s*\(\s*((?:'[^']*'|"[^"]*"|`(?:[^`\\]|\\.)*`))/gi;
  for (const match of text.matchAll(routeRegex)) {
    const parsedMethod = method(match[2]!);
    const parsedUrl = parseUrlExpression(match[3]!);
    if (parsedMethod === undefined) continue;
    if (parsedUrl.routeTemplate === undefined || parsedUrl.serviceHint !== undefined) {
      limitations.add('dynamic_route_registration');
      continue;
    }
    bindings.push({
      role: 'producer',
      method: parsedMethod,
      routeTemplate: parsedUrl.routeTemplate,
      source: 'framework_route',
      framework:
        match[1] === 'server' || match[1] === 'fastify'
          ? 'fastify'
          : match[1] === 'hono'
            ? 'hono'
            : match[1] === 'app'
              ? 'express_or_hono'
              : 'express_router',
      offset: match.index,
      length: match[0].length,
    });
  }
  const axiosRegex =
    /\baxios\.(delete|get|head|options|patch|post|put)\s*\(\s*((?:'[^']*'|"[^"]*"|`(?:[^`\\]|\\.)*`))/gi;
  for (const match of text.matchAll(axiosRegex)) {
    const parsedMethod = method(match[1]!);
    if (parsedMethod === undefined) continue;
    bindings.push({
      role: 'consumer',
      method: parsedMethod,
      ...parseUrlExpression(match[2]!),
      source: 'literal_http_call',
      framework: 'axios',
      offset: match.index,
      length: match[0].length,
    });
  }
  const fetchRegex = /\bfetch\s*\(\s*((?:'[^']*'|"[^"]*"|`(?:[^`\\]|\\.)*`))([\s\S]{0,512}?)\)/gi;
  for (const match of text.matchAll(fetchRegex)) {
    const methodProperty = /\bmethod\s*:/.test(match[2]!);
    const explicit = match[2]!.match(/\bmethod\s*:\s*['"]([A-Za-z]+)['"]/i)?.[1];
    if (methodProperty && explicit === undefined) {
      limitations.add('dynamic_http_method');
      continue;
    }
    const parsedMethod = method(explicit ?? 'GET');
    if (parsedMethod === undefined) {
      limitations.add('dynamic_http_method');
      continue;
    }
    bindings.push({
      role: 'consumer',
      method: parsedMethod,
      ...parseUrlExpression(match[1]!),
      source: 'literal_http_call',
      framework: 'fetch',
      offset: match.index,
      length: match[0].length,
    });
  }
  const clientRegex =
    /\b([A-Za-z_$][A-Za-z0-9_$]*)\.(delete|get|head|options|patch|post|put)\s*\(\s*((?:'[^']*'|"[^"]*"|`(?:[^`\\]|\\.)*`))/gi;
  for (const match of text.matchAll(clientRegex)) {
    if (['app', 'router', 'server', 'fastify', 'hono', 'axios'].includes(match[1]!.toLowerCase()))
      continue;
    const parsedMethod = method(match[2]!);
    if (parsedMethod === undefined) continue;
    bindings.push({
      role: 'consumer',
      method: parsedMethod,
      clientName: match[1]!,
      ...parseUrlExpression(match[3]!),
      source: 'literal_http_call',
      framework: 'configured_client',
      offset: match.index,
      length: match[0].length,
    });
  }
  if (
    /\b(?:fetch|axios\.[A-Za-z]+|[A-Za-z_$][A-Za-z0-9_$]*\.(?:get|post|put|patch|delete))\s*\(\s*(?!['"`])/i.test(
      text,
    )
  ) {
    limitations.add('dynamic_url');
  }
  if (/\b(?:use|register)\s*\([^)]*(?:proxy|rewrite)/i.test(text))
    limitations.add('proxy_rewrite_unsupported');
  if (/\b(?:app|router)\.use\s*\(\s*['"`][^'"`]+['"`]\s*,/i.test(text))
    limitations.add('mounted_router_prefix_unresolved');
  if (/\b(?:app|router|server|fastify|hono)\.route\s*\(/i.test(text))
    limitations.add('runtime_route_registration');
  if (bindings.some((binding) => binding.unresolvedExpressionHash !== undefined))
    limitations.add('dynamic_url');
  if (bindings.length > maximumItems) throw new Error('http_item_limit');
  if (probable && bindings.length === 0 && limitations.size === 0)
    limitations.add('http_syntax_unresolved');
  return { bindings, limitations: [...limitations].sort(), probable };
}
