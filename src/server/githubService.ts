import fs from 'fs';
import path from 'path';

interface RepoReleaseAsset {
  id: number;
  name: string;
  size: number;
  sizeFormatted: string;
  downloadUrl: string;
  downloadCount: number;
}

export interface RepoRelease {
  id: number;
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  isLatest: boolean;
  assets: RepoReleaseAsset[];
  installerAsset?: RepoReleaseAsset;
  extensionAsset?: RepoReleaseAsset;
}

export interface RepoCommit {
  sha: string;
  fullSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface RepoOverview {
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  updatedAt: string;
}

const GITHUB_REPO = 'jaystarbliss-dynamic-hub/HUB-MIND';
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;

// In-memory cache with 60s TTL
const cache = {
  releases: { data: [] as RepoRelease[], timestamp: 0 },
  commits: { data: [] as RepoCommit[], timestamp: 0 },
  overview: { data: null as RepoOverview | null, timestamp: 0 },
  pulls: { data: [] as any[], timestamp: 0 },
};

const CACHE_TTL_MS = 60 * 1000;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Hub-Mind-Jess-Assistant',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    // Supports classic PATs and fine-grained GitHub tokens without exposing the token client-side.
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchHubMindReleases(forceFresh = false): Promise<RepoRelease[]> {
  const now = Date.now();
  if (!forceFresh && cache.releases.data.length > 0 && now - cache.releases.timestamp < CACHE_TTL_MS) {
    return cache.releases.data;
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}/releases?per_page=30`, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (cache.releases.data.length > 0) return cache.releases.data;
      throw new Error(`GitHub releases API error: HTTP ${res.status}`);
    }

    const rawReleases = (await res.json()) as any[];
    if (!Array.isArray(rawReleases)) return cache.releases.data;

    const mapped: RepoRelease[] = rawReleases.map((rel, index) => {
      const rawAssets = Array.isArray(rel.assets) ? rel.assets : [];
      const assets: RepoReleaseAsset[] = rawAssets.map((a: any) => ({
        id: a.id,
        name: a.name || 'unnamed-asset',
        size: a.size || 0,
        sizeFormatted: formatBytes(a.size || 0),
        downloadUrl: a.browser_download_url || '',
        downloadCount: a.download_count || 0,
      }));

      const installerAsset = assets.find(a => /\.exe$/i.test(a.name));
      const extensionAsset = assets.find(a => /extension\.zip$/i.test(a.name) || /Jess-Chrome-Extension/i.test(a.name));

      return {
        id: rel.id,
        tag: rel.tag_name || `release-${rel.id}`,
        name: rel.name || rel.tag_name || 'Hub-Mind Desktop Release',
        publishedAt: rel.published_at || rel.created_at || new Date().toISOString(),
        htmlUrl: rel.html_url || `https://github.com/${GITHUB_REPO}/releases`,
        body: rel.body || 'No release notes provided for this version.',
        isLatest: index === 0,
        assets,
        installerAsset,
        extensionAsset,
      };
    });

    cache.releases = { data: mapped, timestamp: now };
    return mapped;
  } catch (err: any) {
    console.warn('[GitHubService] Failed to fetch releases:', err?.message || err);
    return cache.releases.data;
  }
}

export async function fetchHubMindCommits(limit = 20, forceFresh = false): Promise<RepoCommit[]> {
  const now = Date.now();
  if (!forceFresh && cache.commits.data.length > 0 && now - cache.commits.timestamp < CACHE_TTL_MS) {
    return cache.commits.data.slice(0, limit);
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}/commits?per_page=${Math.min(limit, 50)}`, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (cache.commits.data.length > 0) return cache.commits.data.slice(0, limit);
      throw new Error(`GitHub commits API error: HTTP ${res.status}`);
    }

    const rawCommits = (await res.json()) as any[];
    if (!Array.isArray(rawCommits)) return cache.commits.data.slice(0, limit);

    const mapped: RepoCommit[] = rawCommits.map(c => ({
      sha: String(c.sha || '').slice(0, 7),
      fullSha: String(c.sha || ''),
      message: String(c.commit?.message || '').split('\n')[0].trim(),
      author: String(c.commit?.author?.name || c.author?.login || 'Jaystarbliss'),
      date: c.commit?.author?.date || new Date().toISOString(),
      htmlUrl: c.html_url || `https://github.com/${GITHUB_REPO}/commit/${c.sha}`,
    }));

    cache.commits = { data: mapped, timestamp: now };
    return mapped.slice(0, limit);
  } catch (err: any) {
    console.warn('[GitHubService] Failed to fetch commits:', err?.message || err);
    return cache.commits.data.slice(0, limit);
  }
}

export async function fetchHubMindOverview(): Promise<RepoOverview | null> {
  const now = Date.now();
  if (cache.overview.data && now - cache.overview.timestamp < CACHE_TTL_MS * 5) {
    return cache.overview.data;
  }

  try {
    const res = await fetch(GITHUB_API_BASE, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const overview: RepoOverview = {
        name: data.name || 'HUB-MIND',
        fullName: data.full_name || GITHUB_REPO,
        description: data.description || 'Internal business operations platform for Jaystarbliss Studios',
        htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}`,
        stars: data.stargazers_count || 0,
        forks: data.forks_count || 0,
        openIssues: data.open_issues_count || 0,
        defaultBranch: data.default_branch || 'main',
        updatedAt: data.updated_at || new Date().toISOString(),
      };
      cache.overview = { data: overview, timestamp: now };
      return overview;
    }
  } catch (err: any) {
    console.warn('[GitHubService] Failed to fetch repo overview:', err?.message || err);
  }

  return cache.overview.data;
}

export async function fetchHubMindPulls(limit = 10): Promise<any[]> {
  const now = Date.now();
  if (cache.pulls.data.length > 0 && now - cache.pulls.timestamp < CACHE_TTL_MS) {
    return cache.pulls.data.slice(0, limit);
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}/pulls?state=all&per_page=${Math.min(limit, 30)}`, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const pulls = data.map(p => ({
          number: p.number,
          title: p.title,
          state: p.state,
          merged: !!p.merged_at,
          mergedAt: p.merged_at,
          createdAt: p.created_at,
          htmlUrl: p.html_url,
          user: p.user?.login || 'unknown',
        }));
        cache.pulls = { data: pulls, timestamp: now };
        return pulls.slice(0, limit);
      }
    }
  } catch (err: any) {
    console.warn('[GitHubService] Failed to fetch pulls:', err?.message || err);
  }

  return cache.pulls.data.slice(0, limit);
}

export async function inspectCodebase(targetPath = '', branch = 'main'): Promise<{
  success: boolean;
  path: string;
  type: 'file' | 'directory' | 'error';
  content?: string;
  entries?: Array<{ name: string; type: 'file' | 'dir'; size?: number; path: string }>;
  error?: string;
}> {
  const normalizedPath = targetPath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');

  // 1. Check local filesystem within workspace root
  const workspaceRoot = process.cwd();
  const localTarget = path.join(workspaceRoot, normalizedPath);

  // Security check: must not escape workspace root or access sensitive credential files
  if (localTarget.startsWith(workspaceRoot) && !normalizedPath.startsWith('.env') && !normalizedPath.includes('private.key')) {
    try {
      if (fs.existsSync(localTarget)) {
        const stat = fs.statSync(localTarget);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(localTarget, { withFileTypes: true });
          const entries = files
            .filter(f => !f.name.startsWith('.git') && f.name !== 'node_modules' && !f.name.startsWith('.env'))
            .map(f => ({
              name: f.name,
              type: f.isDirectory() ? ('dir' as const) : ('file' as const),
              path: path.join(normalizedPath, f.name).replace(/\\/g, '/'),
              size: f.isFile() ? fs.statSync(path.join(localTarget, f.name)).size : undefined,
            }));
          return { success: true, path: normalizedPath || '/', type: 'directory', entries };
        } else if (stat.isFile()) {
          if (stat.size > 500 * 1024) {
            return {
              success: true,
              path: normalizedPath,
              type: 'file',
              content: `[File size: ${formatBytes(stat.size)}. Truncated preview below]\n\n` + fs.readFileSync(localTarget, 'utf-8').slice(0, 10000),
            };
          }
          const content = fs.readFileSync(localTarget, 'utf-8');
          return { success: true, path: normalizedPath, type: 'file', content };
        }
      }
    } catch (err: any) {
      console.warn('[GitHubService] Local read failed, falling back to GitHub API:', err?.message || err);
    }
  }

  // 2. Query GitHub contents API
  try {
    const url = `${GITHUB_API_BASE}/contents/${encodeURIComponent(normalizedPath)}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        success: false,
        path: normalizedPath,
        type: 'error',
        error: `Could not find "${normalizedPath}" in ${GITHUB_REPO} (HTTP ${res.status}).`,
      };
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      return {
        success: true,
        path: normalizedPath || '/',
        type: 'directory',
        entries: data.map(item => ({
          name: item.name,
          type: item.type === 'dir' ? 'dir' : 'file',
          size: item.size,
          path: item.path,
        })),
      };
    } else if (data.type === 'file') {
      const decoded = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
      return {
        success: true,
        path: normalizedPath,
        type: 'file',
        content: decoded.length > 25000 ? decoded.slice(0, 25000) + '\n...[truncated]' : decoded,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      path: normalizedPath,
      type: 'error',
      error: `Network error inspecting ${normalizedPath}: ${err?.message || err}`,
    };
  }

  return { success: false, path: normalizedPath, type: 'error', error: 'Unknown file type.' };
}

/** Server-side repository snapshot: release notes, recent commits and repository metadata. */
export async function getFullRepositoryStatus(forceFresh = false) {
  const [releases, commits, overview, pulls] = await Promise.all([
    fetchHubMindReleases(forceFresh),
    fetchHubMindCommits(10, forceFresh),
    fetchHubMindOverview(),
    fetchHubMindPulls(5),
  ]);

  let packageVersion = '0.1.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    if (pkg.version) packageVersion = pkg.version;
  } catch {}

  const latestRelease = releases[0] || null;

  const versionHistorySummary = releases.slice(0, 8).map(rel => {
    const exe = rel.installerAsset ? `${rel.installerAsset.name} (${rel.installerAsset.sizeFormatted})` : 'Web only';
    const cleanNotes = rel.body.replace(/\r/g, '').split('\n').filter(l => l.trim() && !l.startsWith('**Full Changelog')).slice(0, 3).join('; ');
    return `• ${rel.tag} (${new Date(rel.publishedAt).toLocaleDateString()}): ${rel.name}. Installer: ${exe}. Notes: ${cleanNotes || 'General improvements'}`;
  }).join('\n');

  return {
    success: true,
    repository: GITHUB_REPO,
    overview,
    latestRelease,
    releasesCount: releases.length,
    releases,
    recentCommits: commits,
    recentPulls: pulls,
    currentBundledVersion: packageVersion,
    summary: latestRelease
      ? `The latest released desktop application is ${latestRelease.name} (${latestRelease.tag}), published ${new Date(latestRelease.publishedAt).toLocaleDateString()}.${latestRelease.installerAsset ? ` Windows installer: ${latestRelease.installerAsset.name} (${latestRelease.installerAsset.sizeFormatted}).` : ''}\n\nRecent version history:\n${versionHistorySummary}`
      : `Repository ${GITHUB_REPO} connected. Bundled version is v${packageVersion}.`,
  };
}
