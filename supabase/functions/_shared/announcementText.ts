// Small, shared formatting vocabulary. HTML is always treated as text.
export const announcementLimit = 2000;
export type AnnouncementPart = { text: string } | { mark: 'bold' | 'italic' | 'underline' | 'strike'; children: AnnouncementPart[] };
const marks = { '**': 'bold', '__': 'underline', '~~': 'strike', '_': 'italic' } as const;

export function announcementParts(text: string, depth = 0): AnnouncementPart[] {
  if (depth > 8) return [{ text }];
  const pattern = /(\*\*|__|~~|_)(?=\S)([\s\S]*?\S)\1/g;
  const parts: AnnouncementPart[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    if (index > start) parts.push({ text: text.slice(start, index) });
    parts.push({ mark: marks[match[1] as keyof typeof marks], children: announcementParts(match[2], depth + 1) });
    start = index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}

export function announcementPlainText(text: string): string {
  const flatten = (parts: AnnouncementPart[]): string => parts.map(part => 'text' in part ? part.text : flatten(part.children)).join('');
  return text.split('\n').map(line => flatten(announcementParts(line))).join('\n').replace(/^- /gm, '• ');
}
