import type { ReactNode } from 'react';
import { announcementParts, type AnnouncementPart } from '../../supabase/functions/_shared/announcementText';

function renderParts(parts: AnnouncementPart[]): ReactNode {
  return parts.map((part, index) => {
    if ('text' in part) return part.text;
    const children = renderParts(part.children);
    switch (part.mark) {
      case 'bold': return <strong key={index}>{children}</strong>;
      case 'italic': return <em key={index}>{children}</em>;
      case 'underline': return <u key={index}>{children}</u>;
      case 'strike': return <s key={index}>{children}</s>;
    }
  });
}

export default function AnnouncementMessage({ body, className = '' }: { body: string; className?: string }) {
  const lines = body.split('\n');
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].startsWith('- ')) {
      const start = index;
      const items: ReactNode[] = [];
      do { items.push(<li key={index}>{renderParts(announcementParts(lines[index].slice(2)))}</li>); index++; }
      while (index < lines.length && lines[index].startsWith('- '));
      blocks.push(<ul key={start} className="list-disc pl-6">{items}</ul>);
      index--;
    } else blocks.push(<div key={index} className="min-h-[1.25em]">{renderParts(announcementParts(lines[index]))}</div>);
  }
  return <div className={`whitespace-pre-wrap break-words text-sm ${className}`}>{blocks}</div>;
}
