import { API_DOC } from '@/lib/apiDocs/content';
import { toMarkdown } from '@/lib/apiDocs/markdown';

// Public, no login: plain-text Markdown edition of /docs/api for AI assistants.
export const dynamic = 'force-static';

export function GET() {
  return new Response(toMarkdown(API_DOC), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
