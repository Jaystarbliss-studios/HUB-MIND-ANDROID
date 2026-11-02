import { getFullRepositoryStatus } from './githubService.ts';

interface WebSource {
  title: string;
  url: string;
}

export interface WebSearchResult {
  success: boolean;
  query: string;
  answer: string;
  sources: WebSource[];
  grounded: boolean;
  model?: string | null;
  error?: string;
  isUrlInspection?: boolean;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi);
  return matches ? Array.from(new Set(matches)) : [];
}

async function fetchPageText(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return { title, content: cleanText.slice(0, 8000) };
  } catch (err) {
    console.warn(`[WebSearch] Page fetch failed for ${url}:`, err);
    return null;
  }
}

async function searchWikipedia(query: string): Promise<{ answer: string; sources: WebSource[] } | null> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const firstHit = data?.query?.search?.[0];
    if (!firstHit?.title) return null;

    // Get page summary
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstHit.title)}`;
    const sumRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
    if (sumRes.ok) {
      const sumData = await sumRes.json();
      if (sumData.extract) {
        return {
          answer: sumData.extract,
          sources: [
            {
              title: sumData.title || firstHit.title,
              url: sumData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(firstHit.title)}`,
            },
          ],
        };
      }
    }
  } catch (e) {
    console.warn('[WebSearch] Wikipedia query failed:', e);
  }
  return null;
}

export async function performGlobalWebSearch(query: string): Promise<WebSearchResult> {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return {
      success: false,
      query: '',
      answer: 'Please supply a query or webpage URL to search.',
      sources: [],
      grounded: false,
    };
  }

  // 1. Check if the user is asking about Hub-Mind, Jaystarbliss Studios, desktop apps, or releases
  const isHubMindQuery = /hub-?mind|jaystarbliss|desktop\s*(app|installer|version)|releases?/i.test(trimmed);
  if (isHubMindQuery) {
    try {
      const repoStatus = await getFullRepositoryStatus();
      if (repoStatus?.success) {
        const latest = repoStatus.latestRelease;
        const answer = `Jaystarbliss Studios Hub-Mind is an internal business operations platform with a dedicated Windows desktop client and persistent Jess AI assistant.\n\n` +
          `• Repository: https://github.com/Jaystarbliss-studios/HUB-MIND\n` +
          (latest
            ? `• Latest Desktop Release: ${latest.name} (${latest.tag}), released on ${new Date(latest.publishedAt).toLocaleDateString()}.\n` +
              (latest.installerAsset ? `• Windows Installer: ${latest.installerAsset.name} (${latest.installerAsset.sizeFormatted})\n• Download: ${latest.installerAsset.downloadUrl}\n` : '') +
              `• Changelog: ${latest.body.slice(0, 300)}...`
            : `• Bundled version: v${repoStatus.currentBundledVersion}`);

        return {
          success: true,
          query: trimmed,
          answer,
          sources: [
            { title: 'Jaystarbliss-studios/HUB-MIND on GitHub', url: 'https://github.com/Jaystarbliss-studios/HUB-MIND' },
            ...(latest?.installerAsset ? [{ title: `Download ${latest.tag}`, url: latest.installerAsset.downloadUrl }] : []),
          ],
          grounded: true,
          model: 'github-live-api',
        };
      }
    } catch (e) {
      console.warn('[WebSearch] HubMind direct lookup error:', e);
    }
  }

  const detectedUrls = extractUrls(trimmed);
  const isDirectUrl = /^https?:\/\//i.test(trimmed);

  // 2. If user provided a specific URL, fetch and synthesize it directly
  if (isDirectUrl && detectedUrls.length > 0) {
    const targetUrl = detectedUrls[0];
    const pageData = await fetchPageText(targetUrl);
    if (pageData && pageData.content) {
      return {
        success: true,
        query: trimmed,
        answer: `Content from ${pageData.title}:\n\n${pageData.content.slice(0, 1500)}`,
        sources: [{ title: pageData.title || targetUrl, url: targetUrl }],
        grounded: true,
        isUrlInspection: true,
      };
    }
  }

  // 3. Try live Google Search grounding via Gemini API
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are Jess's global web search engine. Search the live web to find current, authoritative facts and answer the following search request accurately:\n\n"${trimmed}"\n\nProvide a direct, informative, synthesised answer with key facts, dates, and names. Base your response strictly on live web search findings.`,
              },
            ],
          },
        ],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources: WebSource[] = (groundingMetadata?.groundingChunks || [])
        .map((chunk: any) =>
          chunk?.web?.uri
            ? {
                title: String(chunk.web.title || chunk.web.uri).slice(0, 200),
                url: String(chunk.web.uri).slice(0, 2000),
              }
            : null
        )
        .filter(Boolean) as WebSource[];

      const text =
        response.text ||
        response.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n') ||
        '';

      if (text) {
        return {
          success: true,
          query: trimmed,
          answer: text,
          sources,
          grounded: sources.length > 0 || (groundingMetadata?.webSearchQueries || []).length > 0,
          model: response.modelVersion || 'gemini-3.8-flash',
        };
      }
    } catch (err: any) {
      console.warn('[WebSearch] Gemini search grounding error, using fast web fallbacks:', err?.message || err);
    }
  }

  // 4. Fallback A: DuckDuckGo Instant Answer
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, { signal: AbortSignal.timeout(6000) });
    if (ddgRes.ok) {
      const ddgData = (await ddgRes.json()) as any;
      const abstract = ddgData.AbstractText || ddgData.Abstract || '';
      const sourceUrl = ddgData.AbstractURL || '';
      const sourceTitle = ddgData.Heading || trimmed;

      if (abstract) {
        return {
          success: true,
          query: trimmed,
          answer: abstract,
          sources: sourceUrl ? [{ title: sourceTitle, url: sourceUrl }] : [],
          grounded: false,
        };
      }

      // Check related topics
      if (Array.isArray(ddgData.RelatedTopics) && ddgData.RelatedTopics.length > 0) {
        const validTopics = ddgData.RelatedTopics.filter((t: any) => t.Text);
        if (validTopics.length > 0) {
          const topTopics = validTopics.slice(0, 3).map((t: any) => t.Text).join('\n• ');
          return {
            success: true,
            query: trimmed,
            answer: `Here is what was found on the web:\n• ${topTopics}`,
            sources: validTopics.slice(0, 3).filter((t: any) => t.FirstURL).map((t: any) => ({ title: t.Text?.slice(0, 60) || 'Web topic', url: t.FirstURL })),
            grounded: false,
          };
        }
      }
    }
  } catch (fallbackErr) {
    console.warn('[WebSearch] DuckDuckGo fallback error:', fallbackErr);
  }

  // 5. Fallback B: Wikipedia Encyclopedia Search
  const wikiResult = await searchWikipedia(trimmed);
  if (wikiResult && wikiResult.answer) {
    return {
      success: true,
      query: trimmed,
      answer: wikiResult.answer,
      sources: wikiResult.sources,
      grounded: true,
      model: 'wikipedia-knowledge-base',
    };
  }

  // 6. Final clean response
  return {
    success: true,
    query: trimmed,
    answer: `Web search for "${trimmed}" did not return an immediate summary article. You can browse specific URLs directly or verify with relevant documentation.`,
    sources: [
      { title: `Search for "${trimmed}" on Google`, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` },
    ],
    grounded: false,
  };
}
