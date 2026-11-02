const TYPE_MAP: Record<string, string> = { tasks: 'task', meetings: 'meeting', documents: 'document', clients: 'client', projects: 'project', 'follow-ups': 'followup' };

export function getShareUrl(path: string): string {
  const absolute = new URL(path, window.location.origin);
  const match = absolute.pathname.match(/^\/(tasks|meetings|documents|clients|projects|follow-ups)\/([^/]+)$/);
  if (match) {
    const [, collection, id] = match;
    return new URL(`/share/${TYPE_MAP[collection]}/${encodeURIComponent(id)}`, window.location.origin).toString();
  }
  return absolute.toString();
}

export async function shareHubMindItem(path: string, label: string): Promise<void> {
  const url = getShareUrl(path);
  const text = `Hub-Mind: ${label}\n${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `Hub-Mind — ${label}`, text: `Open this in Hub-Mind: ${label}`, url });
      return;
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

export async function copyShareUrl(path: string): Promise<void> {
  const url = getShareUrl(path);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement('textarea');
  input.value = url;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}
