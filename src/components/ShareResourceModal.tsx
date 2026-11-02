import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { ResourceType, SharePermission, ResourceShare, UserConnection, User } from '../types';
import { 
  shareResourceWithUser, 
  revokeResourceShare, 
  subscribeToResourceShares 
} from '../services/sharingService';
import { subscribeToMyConnections } from '../services/connectionService';
import { subscribeToUsers } from '../services/userService';
import { 
  Share2, 
  AtSign, 
  Copy, 
  Check, 
  Trash2, 
  Shield, 
  Link as LinkIcon, 
  ExternalLink,
  MessageCircle,
  AlertCircle,
  Loader2,
  Users
} from 'lucide-react';

interface ShareResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceTitle: string;
}

export function ShareResourceModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
}: ShareResourceModalProps) {
  const { profile } = useAuth();
  const [shares, setShares] = useState<ResourceShare[]>([]);
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [permission, setPermission] = useState<SharePermission>('read');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen || !resourceId) return;
    const unsubShares = profile?.id ? subscribeToResourceShares(resourceId, profile.id, setShares) : () => {};
    const unsubUsers = subscribeToUsers(setAllUsers);
    let unsubConn: (() => void) | undefined;
    if (profile) {
      unsubConn = subscribeToMyConnections(profile.id, setConnections);
    }

    return () => {
      unsubShares();
      unsubUsers();
      if (unsubConn) unsubConn();
    };
  }, [isOpen, resourceId, profile]);

  if (!isOpen) return null;

  const getDirectLink = () => {
    const origin = window.location.origin;
    let path = `/${resourceType}s/${resourceId}`;
    if (resourceType === 'followup') path = `/follow-ups/${resourceId}`;
    return `${origin}${path}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getDirectLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareToWhatsApp = () => {
    const link = getDirectLink();
    const text = `*${resourceTitle}*\nReview here in Hub-Mind: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !targetUsername.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await shareResourceWithUser({
        resourceType,
        resourceId,
        resourceTitle,
        ownerId: profile.id,
        ownerName: profile.displayName || profile.name || `@${profile.username}`,
        recipientUsernameOrId: targetUsername.trim(),
        permission,
      });

      setSuccess(`Shared with @${targetUsername.replace(/^@/, '')} (${permission === 'write' ? 'Can Edit' : 'Read Only'})`);
      setTargetUsername('');
    } catch (err: any) {
      setError(err.message || 'Failed to share resource.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await revokeResourceShare(shareId);
    } catch (err: any) {
      alert(`Error revoking share: ${err.message}`);
    }
  };

  const acceptedConnections = connections.filter(c => c.status === 'accepted');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-teal-400" />
              Share Resource
            </h2>
            <p className="text-xs text-slate-400 line-clamp-1">
              {resourceTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 cursor-pointer text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-teal-950/40 border border-teal-800 text-teal-300 text-xs rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Share Form */}
        <form onSubmit={handleShare} className="space-y-3">
          <label className="block text-xs font-semibold text-slate-300">
            Share with Colleague (@username)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <AtSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="Username (e.g. john or mary)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-teal-500/60"
              />
            </div>

            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as SharePermission)}
              className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500/60 cursor-pointer"
            >
              <option value="read">Read Only</option>
              <option value="write">Can Edit</option>
            </select>

            <button
              type="submit"
              disabled={loading || !targetUsername.trim()}
              className="flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-teal-500/10 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              Share
            </button>
          </div>

          {/* Quick connection chips */}
          {acceptedConnections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500">Quick select:</span>
              {acceptedConnections.slice(0, 5).map(c => {
                const isRec = c.recipientId === profile?.id;
                const u = isRec ? c.requesterUsername : c.recipientUsername;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setTargetUsername(u)}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 font-mono text-[10px] transition-colors cursor-pointer border border-slate-700/60"
                  >
                    @{u}
                  </button>
                );
              })}
            </div>
          )}
        </form>

        {/* Existing Shares */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300">Active Collaborators</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {shares.map(s => (
              <div key={s.id} className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center text-[10px]">
                    {s.recipientUsername.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-mono text-teal-400 font-medium">@{s.recipientUsername}</span>
                  <span className="text-[11px] text-slate-500">
                    ({s.permission === 'write' ? 'Can Edit' : 'Read Only'})
                  </span>
                </div>

                <button
                  onClick={() => handleRevoke(s.id)}
                  className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/50 transition-colors cursor-pointer"
                  title="Revoke access"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {shares.length === 0 && (
              <p className="text-[11px] text-slate-500 text-center py-2">
                Only you currently have access to this resource.
              </p>
            )}
          </div>
        </div>

        {/* Direct Link & WhatsApp */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 px-3 rounded-xl text-xs transition-all border border-slate-700 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <LinkIcon className="w-3.5 h-3.5" />}
            {copiedLink ? 'Link Copied!' : 'Copy Direct Link'}
          </button>

          <button
            onClick={handleShareToWhatsApp}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-medium py-2 px-3 rounded-xl text-xs transition-all border border-emerald-500/30 cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Share to WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
