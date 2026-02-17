import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripMarkdown, normalizeWhitespace, normalizeTypography } from './strip.js';

export interface MatchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  matchedSource: string;
}

/**
 * Resolve a relative file path within rootDir.
 * Tries .md and .mdx extensions if the path has no extension.
 */
export function resolveFilePath(rootDir: string, relativePath: string): string | null {
  const absRoot = resolve(rootDir);
  const candidate = resolve(absRoot, relativePath);

  // Security: ensure path is within rootDir
  if (!candidate.startsWith(absRoot + '/') && candidate !== absRoot) {
    return null;
  }

  if (existsSync(candidate)) return candidate;

  // Try extensions
  for (const ext of ['.md', '.mdx']) {
    const withExt = candidate + ext;
    if (existsSync(withExt)) return withExt;
  }

  return null;
}

/**
 * List all Markdown/MDX files in a directory recursively.
 */
export function listMarkdownFiles(rootDir: string, prefix = ''): string[] {
  const absRoot = resolve(rootDir);
  const dir = prefix ? join(absRoot, prefix) : absRoot;
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listMarkdownFiles(rootDir, relPath));
    } else if (/\.(md|mdx)$/.test(entry.name)) {
      results.push(relPath);
    }
  }

  return results;
}

/**
 * Find selected text in a Markdown/MDX source file.
 * Returns the matched line range and original source text.
 */
export function findInSource(filePath: string, selectedText: string): MatchResult | null {
  const source = readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');
  const normalizedSelected = normalizeTypography(normalizeWhitespace(selectedText));

  if (!normalizedSelected) return null;

  // Skip frontmatter
  let contentStart = 0;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        contentStart = i + 1;
        break;
      }
    }
  }

  // Skip empty lines and import lines after frontmatter
  while (contentStart < lines.length) {
    const trimmed = lines[contentStart]?.trim();
    if (trimmed === '' || trimmed?.startsWith('import ')) {
      contentStart++;
    } else {
      break;
    }
  }

  // Build plain text representation with line mapping
  const plainLines: { text: string; lineIndex: number }[] = [];
  let inCodeBlock = false;
  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i]!;
    // Detect fenced code block boundaries
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue; // skip fence markers
    }
    if (inCodeBlock) {
      // Code block content: use as-is (no markdown stripping)
      const trimmed = line.trimEnd();
      if (trimmed) {
        plainLines.push({ text: trimmed, lineIndex: i });
      }
    } else {
      const stripped = stripMarkdown(line);
      if (stripped) {
        plainLines.push({ text: stripped, lineIndex: i });
      }
    }
  }

  // Pre-normalize each line for consistent position tracking.
  // Without this, code block lines with leading whitespace cause offset mismatches
  // between the normalized search string and the character count loop.
  const entries: { text: string; lineIndex: number }[] = [];
  for (const pl of plainLines) {
    const normalized = normalizeTypography(normalizeWhitespace(pl.text));
    if (normalized) {
      entries.push({ text: normalized, lineIndex: pl.lineIndex });
    }
  }

  // Concatenate for multi-line matching (already normalized, join is clean)
  const joinedPlain = entries.map((e) => e.text).join(' ');
  const matchIndex = joinedPlain.indexOf(normalizedSelected);

  if (matchIndex === -1) return null;

  // Find which lines the match spans
  let charCount = 0;
  let startEntryIdx = -1;
  let endEntryIdx = -1;

  for (let i = 0; i < entries.length; i++) {
    const lineEnd = charCount + entries[i]!.text.length;

    if (startEntryIdx === -1 && lineEnd > matchIndex) {
      startEntryIdx = i;
    }
    if (lineEnd >= matchIndex + normalizedSelected.length) {
      endEntryIdx = i;
      break;
    }

    charCount = lineEnd + 1; // +1 for the space joiner
  }

  if (startEntryIdx === -1 || endEntryIdx === -1) return null;

  const startLine = entries[startEntryIdx]!.lineIndex;
  const endLine = entries[endEntryIdx]!.lineIndex;

  const matchedSource = lines.slice(startLine, endLine + 1).join('\n');

  return {
    filePath,
    startLine: startLine + 1, // 1-indexed
    endLine: endLine + 1,
    matchedSource,
  };
}

/**
 * Find a section by heading text in a Markdown/MDX file.
 * A section spans from the heading line to the line before the next heading
 * of equal or higher level (or end of file).
 */
export function findSection(
  filePath: string,
  headingText: string,
  headingLevel: number,
): MatchResult | null {
  const source = readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');

  // Skip frontmatter
  let contentStart = 0;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        contentStart = i + 1;
        break;
      }
    }
  }

  // Find the heading line
  const headingPrefix = '#'.repeat(headingLevel) + ' ';
  let startLine = -1;

  for (let i = contentStart; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith(headingPrefix)) {
      const text = stripMarkdown(trimmed);
      if (normalizeTypography(normalizeWhitespace(text)) === normalizeTypography(normalizeWhitespace(headingText))) {
        startLine = i;
        break;
      }
    }
  }

  if (startLine === -1) return null;

  // Find section end: next heading of equal or higher level, or EOF
  // Must track code blocks to avoid treating # in code as headings
  let endLine = lines.length - 1;
  let inCodeBlock = false;
  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = trimmed.match(/^(#{1,6})\s/);
    if (match && match[1]!.length <= headingLevel) {
      // Exclude trailing blank lines before next heading
      endLine = i - 1;
      while (endLine > startLine && lines[endLine]!.trim() === '') {
        endLine--;
      }
      break;
    }
  }

  const matchedSource = lines.slice(startLine, endLine + 1).join('\n');

  return {
    filePath,
    startLine: startLine + 1, // 1-indexed
    endLine: endLine + 1,
    matchedSource,
  };
}
