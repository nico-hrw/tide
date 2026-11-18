import type { Metadata } from 'next';
import ApiDocsView from '@/components/Docs/ApiDocsView';
import { API_DOC } from '@/lib/apiDocs/content';

export const metadata: Metadata = {
  title: 'Tide API',
  description: 'Öffentliche Dokumentation der Tide-API für Notizen, Todos und Termine.',
};

// Public page, reachable without login (allow-listed in AuthGuard).
export default function ApiDocsPage() {
  return <ApiDocsView doc={API_DOC} />;
}
