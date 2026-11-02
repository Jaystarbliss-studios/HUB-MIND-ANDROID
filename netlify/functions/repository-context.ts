import {
  getFullRepositoryStatus,
  fetchHubMindReleases,
  fetchHubMindCommits,
  inspectCodebase,
} from '../../src/server/githubService.ts';
import { performGlobalWebSearch } from '../../src/server/webSearchService.ts';

const responseJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    },
  });

export default async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return responseJson({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, '');
    const forceFresh = url.searchParams.get('fresh') === 'true';

    if (pathname.endsWith('/api/web-search')) {
      let query = url.searchParams.get('query') || '';
      if (req.method === 'POST') {
        const body: any = await req.json().catch(() => ({}));
        if (body?.query) query = String(body.query);
      }
      const result = await performGlobalWebSearch(query.trim());
      return responseJson(result);
    }

    if (pathname.endsWith('/api/github/releases')) {
      const releases = await fetchHubMindReleases(forceFresh);
      return responseJson({ success: true, releases, count: releases.length });
    }

    if (pathname.endsWith('/api/github/commits')) {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
      const commits = await fetchHubMindCommits(limit, forceFresh);
      return responseJson({ success: true, commits, count: commits.length });
    }

    if (pathname.endsWith('/api/github/codebase')) {
      const targetPath = String(url.searchParams.get('path') || '').trim();
      const branch = String(url.searchParams.get('branch') || 'main').trim();
      const result = await inspectCodebase(targetPath, branch);
      return responseJson(result);
    }

    const status = await getFullRepositoryStatus(forceFresh);
    return responseJson({
      ...status,
      defaultBranch: status.overview?.defaultBranch || 'main',
      updatedAt: status.overview?.updatedAt || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      recentPullRequests: status.recentPulls || [],
      interpretationRules: [
        'A merged pull request is evidence that its listed changes entered the target branch, not proof every feature passed manual acceptance testing.',
        'An open pull request is proposed work and must not be described as implemented in production.',
        'Commit titles alone are not proof of runtime behavior; report tests and release evidence separately.',
      ],
    });
  } catch (error: any) {
    const detail = String(error?.message || 'Unknown GitHub API error').slice(0, 500);
    return responseJson(
      {
        success: false,
        error: 'Could not load live Hub-Mind repository status.',
        detail,
      },
      502
    );
  }
};

export const config = {
  path: [
    '/api/repository-context',
    '/api/github/releases',
    '/api/github/commits',
    '/api/github/codebase',
    '/api/web-search',
  ],
};
