export function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')       // unordered list markers
    .replace(/^\s*\d+\.\s+/, '')       // ordered list markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g, '')  // only valid HTML tags
    .trim();
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeTypography(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')  // smart double quotes → straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")                // smart single quotes → straight
    .replace(/\u2014/g, '--')                                    // em dash → --
    .replace(/\u2013/g, '-')                                     // en dash → -
    .replace(/\u2026/g, '...');                                  // ellipsis → ...
}
