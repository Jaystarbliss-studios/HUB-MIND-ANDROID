import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ResourceType } from '../types';
import { getLocalDocsMap } from './offlineSync';
import { getCachedCollection } from '../services/jessWorkspaceCache';


function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ing$/i, '')
    .replace(/ed$/i, '')
    .replace(/s$/i, '');
}

function tokenize(value: any): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter(t => t.length >= 2);
}

function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = old;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

function relevance(term: string, item: any): number {
  const queryTokens = tokenize(term);
  if (!queryTokens.length) return 0;

  const titleTokens = tokenize(item.title || item.name);
  const bodyTokens = tokenize([
    item.title, item.name, item.description, item.content, item.category,
    item.notes, item.tags, item.projectName, item.clientName, item.assigneeName,
    item.location, item.summary
  ].join(' '));

  const title = titleTokens.join(' ');
  const body = bodyTokens.join(' ');
  const phrase = queryTokens.join(' ');
  let score = title.includes(phrase) ? 30 : 0;

  for (const queryToken of queryTokens) {
    let best = 0;
    for (const candidate of titleTokens) {
      if (candidate.includes(queryToken) || queryToken.includes(candidate)) best = Math.max(best, 0.95);
      else best = Math.max(best, editSimilarity(queryToken, candidate));
    }
    if (best >= 0.82) score += 9;
    else if (best >= 0.68) score += 5;
    else if (body.includes(queryToken)) score += 4;
  }

  // Conversational requests often contain filler words. Reward records where
  // several meaningful concepts agree, but do not require the exact title.
  const meaningfulMatches = queryTokens.filter(t => body.includes(t)).length;
  score += Math.min(12, meaningfulMatches * 2);
  return score;
}

export interface SearchResult {
  type: ResourceType;
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

const searchCollections: Partial<Record<ResourceType, string>> = {
  document: 'documents',
  task: 'tasks',
  project: 'projects',
  meeting: 'meetings',
  client: 'clients',
  followUp: 'followUps',
  knowledge: 'knowledge',
  report: 'reports',
};

const searchRoutes: Partial<Record<ResourceType, string>> = {
  document: 'documents',
  task: 'tasks',
  project: 'projects',
  meeting: 'meetings',
  client: 'clients',
  followUp: 'follow-ups',
  followup: 'follow-ups',
  knowledge: 'knowledge',
  report: 'reports',
};

async function getVisibleDocs(collectionName: string, userId: string, max: number): Promise<any[]> {
  const map = new Map<string, any>();
  const colRef = collection(db, collectionName);

  if (collectionName === 'documents') {
    try {
      const local = getLocalDocsMap();
      Object.values(local).forEach(d => {
        if (d && d.id) map.set(d.id, { id: d.id, ...d });
      });
    } catch {}
  }

  const queries = [
    query(colRef, where('ownerId', '==', userId), limit(max)),
    query(colRef, where('createdBy', '==', userId), limit(max)),
    query(colRef, where('visibility', '==', 'workspace'), limit(max)),
  ];

  await Promise.all(
    queries.map(async q => {
      try {
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          map.set(d.id, { id: d.id, ...d.data() });
        }
      } catch {
        // Continue querying safely
      }
    })
  );

  return [...map.values()];
}

export async function globalSearch(
  term: string,
  userId: string,
  maxPerType = 12,
  role: 'admin' | 'staff' = 'staff'
): Promise<SearchResult[]> {
  const needle = term.trim().toLowerCase();
  if (!needle || !userId) return [];
  const results: SearchResult[] = [];

  const types = Object.keys(searchCollections) as ResourceType[];
  for (const type of types) {
    const collName = searchCollections[type];
    if (!collName) continue;

    let docs: any[] = getCachedCollection<any>(collName);
    try {
      if (type === 'document') {
        const local = getLocalDocsMap();
        Object.values(local).forEach(d => {
          if (d && d.id && !docs.some(x => x.id === d.id)) docs.push({ id: d.id, ...d });
        });
      }

      // The warm cache is the normal path. Only query Firestore when the cache has
      // not populated this collection yet, preventing a fresh network scan on every
      // voice search.
      if (docs.length === 0) {
        if (role === 'admin') {
          const snap = await getDocs(query(collection(db, collName), limit(60)));
          docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          docs = await getVisibleDocs(collName, userId, 60);
        }
      }
    } catch {
      if (!docs.length) continue;
    }

    let matchesForType = 0;
    for (const x of docs) {
      if (matchesForType >= maxPerType) break;
      const score = relevance(needle, x);
      if (score <= 0) continue;
      const title = String(x.title || x.name || x.description || x.id);
      const route = searchRoutes[type] || collName;
      results.push({
        type,
        id: x.id,
        title,
        subtitle: x.description ? String(x.description) : undefined,
        path: `/${route}/${x.id}`,
        relevance: score,
      } as SearchResult & { relevance: number });
      matchesForType++;
    }
  }

  return results.sort((a: any, b: any) => (b.relevance || 0) - (a.relevance || 0)).slice(0, 50);
}
