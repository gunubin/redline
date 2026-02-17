import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'toml';

export interface RouteConfig {
  pattern: string;
  file: string;
}

export interface ProxyConfig {
  target: string;
  root: string;
  routes: RouteConfig[];
}

export interface RedlineConfig {
  proxy: ProxyConfig;
}

export function loadConfig(configPath: string): RedlineConfig | null {
  const absPath = resolve(configPath);
  if (!existsSync(absPath)) {
    return null;
  }

  const configDir = resolve(absPath, '..');

  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch (err) {
    console.error(`[redline-ai] Failed to read config: ${absPath}`);
    console.error(err instanceof Error ? err.message : err);
    return null;
  }

  let parsed: {
    proxy?: {
      target?: string;
      root?: string;
      routes?: RouteConfig[];
    };
  };
  try {
    parsed = parse(raw) as typeof parsed;
  } catch (err) {
    console.error(`[redline-ai] Invalid TOML in config: ${absPath}`);
    console.error(err instanceof Error ? err.message : err);
    return null;
  }

  // Resolve root relative to config file location
  const rawRoot = parsed.proxy?.root ?? '.';
  const resolvedRoot = resolve(configDir, rawRoot);

  return {
    proxy: {
      target: parsed.proxy?.target ?? 'http://localhost:3000',
      root: resolvedRoot,
      routes: parsed.proxy?.routes ?? [],
    },
  };
}
