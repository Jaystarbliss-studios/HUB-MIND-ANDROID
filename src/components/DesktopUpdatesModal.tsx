import React, { useState, useEffect } from 'react';
import {
  Download,
  ExternalLink,
  RefreshCw,
  X,
  Tag,
  GitCommit,
  FolderGit2,
  CheckCircle2,
  Zap,
  FileCode2,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  ArrowDownCircle,
  AlertCircle
} from 'lucide-react';

interface RepoReleaseAsset {
  id: number;
  name: string;
  sizeFormatted: string;
  downloadUrl: string;
}

interface RepoRelease {
  id: number;
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  isLatest: boolean;
  installerAsset?: RepoReleaseAsset;
  extensionAsset?: RepoReleaseAsset;
}

interface RepoCommit {
  sha: string;
  fullSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

interface RepoOverview {
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

export function DesktopUpdatesModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalOpen;

  const [activeTab, setActiveTab] = useState<'releases' | 'commits' | 'codebase'>('releases');
  const [loading, setLoading] = useState(false);
  const [releases, setReleases] = useState<RepoRelease[]>([]);
  const [commits, setCommits] = useState<RepoCommit[]>([]);
  const [overview, setOverview] = useState<RepoOverview | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.0');
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Codebase inspection state
  const [codePath, setCodePath] = useState<string>('package.json');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const handleClose = () => {
    setInternalOpen(false);
    if (propOnClose) propOnClose();
  };

  // Listen for global custom event
  useEffect(() => {
    const handleOpenEvent = () => setInternalOpen(true);
    window.addEventListener('hubmind:open-updates-panel', handleOpenEvent);
    return () => window.removeEventListener('hubmind:open-updates-panel', handleOpenEvent);
  }, []);

  const formatAssetBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const BUNDLED_FALLBACK_RELEASES: RepoRelease[] = [
    {
      id: 636,
      tag: 'desktop-v636',
      name: 'Hub-Mind Desktop v636',
      publishedAt: '2026-03-28T18:00:00Z',
      htmlUrl: 'https://github.com/jaystarbliss-dynamic-hub/HUB-MIND/releases/tag/desktop-v636',
      body: 'Performance and smoothness release:\n• Ultra-fast snap-of-a-finger voice connection to Jess\n• Throttled low-power rendering pipeline for mouse freeze prevention\n• Non-blocking MCP tool execution\n• Document editor table extensions and enhancements',
      isLatest: true,
      installerAsset: {
        id: 63601,
        name: 'Hub-Mind-Setup-x64.exe',
        sizeFormatted: '89.4 MB',
        downloadUrl: 'https://github.com/jaystarbliss-dynamic-hub/HUB-MIND/releases/download/desktop-v636/Hub-Mind-Setup-x64.exe',
      },
    },
    {
      id: 488,
      tag: 'desktop-v488',
      name: 'Hub-Mind Desktop v488',
      publishedAt: '2026-03-24T12:00:00Z',
      htmlUrl: 'https://github.com/jaystarbliss-dynamic-hub/HUB-MIND/releases/tag/desktop-v488',
      body: 'Desktop operations release with native Windows bridge, local speech recognition, and system management.',
      isLatest: false,
      installerAsset: {
        id: 48801,
        name: 'Hub-Mind-Setup-x64.exe',
        sizeFormatted: '88.2 MB',
        downloadUrl: 'https://github.com/jaystarbliss-dynamic-hub/HUB-MIND/releases/download/desktop-v488/Hub-Mind-Setup-x64.exe',
      },
    },
  ];

  const fetchDirectFromGitHub = async () => {
    const repoSlug = 'jaystarbliss-dynamic-hub/HUB-MIND';
    const ghHeaders = { Accept: 'application/vnd.github+json' };
    try {
      const [relRes, comRes, repoRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repoSlug}/releases?per_page=30`, { headers: ghHeaders }).catch(() => null),
        fetch(`https://api.github.com/repos/${repoSlug}/commits?per_page=15`, { headers: ghHeaders }).catch(() => null),
        fetch(`https://api.github.com/repos/${repoSlug}`, { headers: ghHeaders }).catch(() => null),
      ]);

      const rawReleases = relRes && relRes.ok ? await relRes.json().catch(() => []) : [];
      const rawCommits = comRes && comRes.ok ? await comRes.json().catch(() => []) : [];
      const rawRepo = repoRes && repoRes.ok ? await repoRes.json().catch(() => null) : null;

      let mappedReleases: RepoRelease[] = (Array.isArray(rawReleases) ? rawReleases : []).map((rel: any, idx: number) => {
        const rawAssets = Array.isArray(rel.assets) ? rel.assets : [];
        const assets: RepoReleaseAsset[] = rawAssets.map((a: any) => ({
          id: a.id,
          name: a.name || 'unnamed-asset',
          sizeFormatted: formatAssetBytes(a.size || 0),
          downloadUrl: a.browser_download_url || '',
        }));
        const installerAsset = assets.find((a) => /\.exe$/i.test(a.name));
        const extensionAsset = assets.find((a) => /extension\.zip$/i.test(a.name) || /Jess-Chrome-Extension/i.test(a.name));
        return {
          id: rel.id,
          tag: rel.tag_name || `release-${rel.id}`,
          name: rel.name || rel.tag_name || 'Hub-Mind Desktop Release',
          publishedAt: rel.published_at || rel.created_at || new Date().toISOString(),
          htmlUrl: rel.html_url || `https://github.com/${repoSlug}/releases`,
          body: rel.body || 'No release notes provided for this version.',
          isLatest: idx === 0,
          installerAsset,
          extensionAsset,
        };
      });

      if (mappedReleases.length === 0) {
        mappedReleases = BUNDLED_FALLBACK_RELEASES;
      }

      const mappedCommits: RepoCommit[] = (Array.isArray(rawCommits) ? rawCommits : []).map((c: any) => ({
        sha: String(c.sha || '').slice(0, 7),
        fullSha: String(c.sha || ''),
        message: String(c.commit?.message || '').split('\n')[0].trim(),
        author: String(c.commit?.author?.name || c.author?.login || 'Jaystarbliss'),
        date: c.commit?.author?.date || new Date().toISOString(),
        htmlUrl: c.html_url || `https://github.com/${repoSlug}/commit/${c.sha}`,
      }));

      setReleases(mappedReleases);
      setCommits(mappedCommits);
      if (rawRepo) {
        setOverview({
          name: rawRepo.name || 'HUB-MIND',
          fullName: rawRepo.full_name || repoSlug,
          description: rawRepo.description || 'Internal business operations platform for Jaystarbliss Studios',
          htmlUrl: rawRepo.html_url || `https://github.com/${repoSlug}`,
          stars: rawRepo.stargazers_count || 0,
          forks: rawRepo.forks_count || 0,
          openIssues: rawRepo.open_issues_count || 0,
          defaultBranch: rawRepo.default_branch || 'main',
          updatedAt: rawRepo.updated_at || new Date().toISOString(),
        });
      }
      if (mappedReleases.length > 0) {
        setExpandedRelease(mappedReleases[0].tag);
      }
    } catch {
      setReleases(BUNDLED_FALLBACK_RELEASES);
      setExpandedRelease(BUNDLED_FALLBACK_RELEASES[0].tag);
    }
  };

  const loadRepositoryData = async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repository-context${forceFresh ? '?fresh=true' : ''}`, {
        headers: { Accept: 'application/json' },
      }).catch(() => null);
      
      if (res && res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const text = await res.text();
          if (text && !text.trim().startsWith('<')) {
            try {
              const data = JSON.parse(text);
              if (Array.isArray(data.releases) && data.releases.length > 0) {
                setReleases(data.releases);
                setCommits(data.recentCommits || []);
                setOverview(data.overview || null);
                if (data.currentBundledVersion) setCurrentVersion(data.currentBundledVersion);
                setExpandedRelease(data.releases[0].tag);
                return;
              }
            } catch {
              // Ignore parse error and proceed to GitHub fallback
            }
          }
        }
      }
      await fetchDirectFromGitHub();
    } catch {
      try {
        await fetchDirectFromGitHub();
      } catch {
        setReleases(BUNDLED_FALLBACK_RELEASES);
        setExpandedRelease(BUNDLED_FALLBACK_RELEASES[0].tag);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadRepositoryData();
    }
  }, [isOpen]);

  const loadCodeFile = async (filePath: string) => {
    setFileLoading(true);
    try {
      const res = await fetch(`/api/github/codebase?path=${encodeURIComponent(filePath)}`, {
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.content) {
          setFileContent(data.content);
          setCodePath(filePath);
          return;
        } else if (data.entries) {
          setFileContent(
            `Directory listing for /${data.path}:\n\n` +
              data.entries.map((e: any) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name} ${e.size ? `(${e.size} bytes)` : ''}`).join('\n')
          );
          setCodePath(filePath);
          return;
        }
      }

      // Direct GitHub Contents API fallback
      const ghRes = await fetch(
        `https://api.github.com/repos/jaystarbliss-dynamic-hub/HUB-MIND/contents/${encodeURIComponent(filePath)}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        if (Array.isArray(ghData)) {
          setFileContent(
            `Directory listing for /${filePath}:\n\n` +
              ghData.map((e: any) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name} ${e.size ? `(${e.size} bytes)` : ''}`).join('\n')
          );
          setCodePath(filePath);
          return;
        } else if (ghData?.content) {
          const decoded = atob(String(ghData.content).replace(/\s/g, ''));
          setFileContent(decoded);
          setCodePath(filePath);
          return;
        }
      }
      setFileContent(`[Unable to load file: ${filePath}]`);
    } catch (e: any) {
      setFileContent(`[Error reading file: ${e?.message || e}]`);
    } finally {
      setFileLoading(false);
    }
  };

  if (!isOpen) return null;

  const latestRelease = releases[0] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-updates-title"
      className="fixed inset-0 z-[10001] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-teal-500/30 shadow-2xl shadow-teal-950/60 overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-teal-500/20 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="desktop-updates-title" className="text-base sm:text-lg font-bold text-teal-300 tracking-wide">
                  Desktop Releases & Version History
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-teal-500/10 text-teal-300 rounded-full border border-teal-500/20">
                  Live GitHub
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official releases, Windows desktop installers, and changelogs for Hub-Mind
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRepositoryData(true)}
              disabled={loading}
              title="Refresh releases from GitHub"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
            <a
              href="https://github.com/Jaystarbliss-studios/HUB-MIND"
              target="_blank"
              rel="noreferrer"
              title="Open GitHub Repository"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs"
            >
              <FolderGit2 className="w-4 h-4 text-teal-400" />
              <span className="hidden sm:inline">GitHub</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <button
              type="button"
              onClick={handleClose}
              title="Close panel"
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Latest Version Hero Banner */}
        {latestRelease && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-950 border border-teal-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">Latest Release</span>
                  <span className="px-2 py-0.5 rounded-md bg-teal-400/10 text-teal-200 text-xs font-mono font-bold">
                    {latestRelease.tag}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(latestRelease.publishedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-100 mt-0.5">{latestRelease.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                  Current bundled version: v{currentVersion} • Total releases: {releases.length}
                </p>
              </div>
            </div>

            {latestRelease.installerAsset && (
              <a
                href={latestRelease.installerAsset.downloadUrl}
                download
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
              >
                <ArrowDownCircle className="w-4 h-4" />
                <span>Download Windows App ({latestRelease.installerAsset.sizeFormatted})</span>
              </a>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 mt-4 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('releases')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'releases'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Version Releases ({releases.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commits')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'commits'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Recent Commits ({commits.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('codebase');
              if (!fileContent) void loadCodeFile('package.json');
            }}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'codebase'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Codebase Explorer</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: RELEASES */}
          {activeTab === 'releases' && (
            <div className="space-y-3">
              {releases.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No public releases found yet. Check back soon!
                </div>
              )}

              {releases.map((release) => {
                const isExpanded = expandedRelease === release.tag;
                return (
                  <div
                    key={release.id}
                    className="rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-teal-500/30 transition-all overflow-hidden"
                  >
                    <div
                      onClick={() => setExpandedRelease(isExpanded ? null : release.tag)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-900/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-mono text-xs font-bold shrink-0">
                          <Tag className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100 truncate">{release.name}</span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-teal-300">
                              {release.tag}
                            </span>
                            {release.isLatest && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                LATEST
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>
                              {new Date(release.publishedAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            {release.installerAsset && (
                              <>
                                <span>•</span>
                                <span className="text-teal-400 font-medium">
                                  {release.installerAsset.name} ({release.installerAsset.sizeFormatted})
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {release.installerAsset && (
                          <a
                            href={release.installerAsset.downloadUrl}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download .exe</span>
                          </a>
                        )}
                        <button
                          type="button"
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Release Details */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-2 border-t border-slate-800/80 bg-slate-900/40 space-y-3">
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                          {release.body || 'No detailed changelog provided for this release.'}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                          <div className="flex items-center gap-2">
                            {release.installerAsset && (
                              <span className="text-slate-400">
                                Installer: <strong className="text-slate-200">{release.installerAsset.name}</strong> ({release.installerAsset.sizeFormatted})
                              </span>
                            )}
                            {release.extensionAsset && (
                              <a
                                href={release.extensionAsset.downloadUrl}
                                download
                                className="text-sky-400 hover:underline inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Chrome Extension
                              </a>
                            )}
                          </div>

                          <a
                            href={release.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
                          >
                            <span>View on GitHub</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: COMMITS */}
          {activeTab === 'commits' && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400 mb-2">
                Latest commits pushed to the <code className="text-teal-300">main</code> branch:
              </div>
              {commits.map((commit) => (
                <div
                  key={commit.fullSha}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <GitCommit className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200 leading-snug">
                        {commit.message}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                        <span>{commit.author}</span>
                        <span>•</span>
                        <span>{new Date(commit.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-mono text-[11px] shrink-0 transition-colors flex items-center gap-1"
                  >
                    <span>{commit.sha}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: CODEBASE EXPLORER */}
          {activeTab === 'codebase' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Quick inspect:</span>
                {['package.json', 'electron/main.cjs', 'README.md', 'src/App.tsx', 'src/lib/jessTools.ts'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void loadCodeFile(p)}
                    className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors cursor-pointer ${
                      codePath === p
                        ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 text-xs">
                  <div className="flex items-center gap-2 font-mono text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    <span>{codePath}</span>
                  </div>
                  {fileLoading && <span className="text-teal-400 text-[11px] animate-pulse">Loading...</span>}
                </div>
                <pre className="p-4 text-xs font-mono text-slate-300 max-h-[360px] overflow-auto whitespace-pre leading-relaxed select-text">
                  {fileContent || 'Select a file above to inspect its content.'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Jaystarbliss Studios • Hub-Mind Operations</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
