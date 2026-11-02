import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { User, UserConnection } from '../types';
import { subscribeToUsers } from '../services/userService';
import { 
  sendConnectionRequest, 
  respondToConnection, 
  subscribeToMyConnections 
} from '../services/connectionService';
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  Search, 
  AtSign, 
  Clock, 
  UserCheck, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Mail,
  ShieldCheck,
  Edit3,
  Send,
  Share2
} from 'lucide-react';
import { UserProfileModal } from '../components/UserProfileModal';
import { SendDirectInfoModal } from '../components/SendDirectInfoModal';

export function People() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTargetUsername, setNewTargetUsername] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [sendToUser, setSendToUser] = useState<User | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'connections' | 'requests' | 'directory'>('connections');

  useEffect(() => {
    let unsubConn = () => {};
    const unsubUsers = subscribeToUsers((uList) => {
      setUsers(uList);
      setLoadingInitial(false);
    });

    if (profile?.id) {
      unsubConn = subscribeToMyConnections(profile.id, (cList) => {
        setConnections(cList);
      });
    }

    return () => {
      unsubUsers();
      unsubConn();
    };
  }, [profile?.id]);

  const handleSendConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newTargetUsername.trim()) return;

    setLoadingAction(true);
    setMessage(null);
    try {
      const cleanUsername = newTargetUsername.trim().replace(/^@+/, '');
      await sendConnectionRequest(profile, cleanUsername);
      setMessage({ type: 'success', text: `Connection request sent to @${cleanUsername}!` });
      setNewTargetUsername('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to send connection request.' });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRespond = async (connectionId: string, status: 'accepted' | 'declined') => {
    setLoadingAction(true);
    try {
      await respondToConnection(connectionId, status);
      setMessage({ type: 'success', text: `Connection ${status === 'accepted' ? 'accepted' : 'declined'}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to update connection.' });
    } finally {
      setLoadingAction(false);
    }
  };

  const acceptedConnections = connections.filter(c => c.status === 'accepted');
  const pendingIncoming = connections.filter(c => c.status === 'pending' && c.recipientId === profile?.id);
  const pendingOutgoing = connections.filter(c => c.status === 'pending' && c.requesterId === profile?.id);

  const filteredUsers = users.filter(u => {
    if (u.id === profile?.id) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (u.displayName || u.name || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(q) || username.includes(q) || email.includes(q);
  });

  const getInitials = (name?: string, username?: string) => {
    const raw = (name || username || '?').trim();
    return raw.charAt(0).toUpperCase() || '?';
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-teal-400" />
            Colleagues & Directory
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Connect with colleagues and team members using their @username to collaborate and share tasks & documents.
          </p>
        </div>

        {profile && (
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            title="Click to edit your display name, Google picture, or @username"
            className="flex items-center gap-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 px-4 py-2.5 rounded-2xl shadow-sm shrink-0 text-left transition-all group cursor-pointer"
          >
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.displayName}
                className="w-9 h-9 rounded-full object-cover border border-teal-500/30 group-hover:border-teal-400 transition-colors shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center text-sm border border-teal-500/30 group-hover:border-teal-400 transition-colors shrink-0">
                {getInitials(profile.displayName || profile.name, profile.username)}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-slate-200 group-hover:text-teal-300 flex items-center gap-1.5 transition-colors">
                <span>{profile.displayName || profile.name || 'Workspace User'}</span>
                <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-[11px] text-teal-400 font-mono flex items-center gap-0.5">
                <AtSign className="w-3 h-3" />
                {profile.username || 'user'}
              </div>
            </div>
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2.5 border animate-in fade-in duration-150 ${
          message.type === 'success' 
            ? 'bg-teal-950/50 border-teal-800 text-teal-300' 
            : 'bg-rose-950/50 border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <Check className="w-4 h-4 text-teal-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Connect Form */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-teal-400" />
          Connect by @Username
        </h2>
        <form onSubmit={handleSendConnection} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <AtSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={newTargetUsername}
              onChange={(e) => setNewTargetUsername(e.target.value)}
              placeholder="Enter colleague's username (e.g. john or @mary)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 transition-all font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loadingAction || !newTargetUsername.trim()}
            className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-teal-500/10 text-xs disabled:opacity-50 cursor-pointer"
          >
            {loadingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Send Connection Request
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-sm">
        <button
          onClick={() => setActiveTab('connections')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative ${
            activeTab === 'connections' ? 'text-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          My Connections ({acceptedConnections.length})
          {activeTab === 'connections' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative ${
            activeTab === 'requests' ? 'text-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Requests ({pendingIncoming.length})
          {pendingIncoming.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-teal-500 text-slate-950 text-[10px] font-bold">
              {pendingIncoming.length}
            </span>
          )}
          {activeTab === 'requests' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative ${
            activeTab === 'directory' ? 'text-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Workspace Directory ({users.length})
          {activeTab === 'directory' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>
      </div>

      {loadingInitial ? (
        <div className="py-16 text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
          <span>Loading workspace directory...</span>
        </div>
      ) : (
        <>
          {/* Tab: Connections */}
          {activeTab === 'connections' && (
            <div className="space-y-4">
              {acceptedConnections.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
                  <Users className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-slate-300 font-medium text-sm">No connections yet</p>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto">
                    Add colleagues using their @username above or browse the Workspace Directory tab to connect.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {acceptedConnections.map(conn => {
                    const isRecipient = conn.recipientId === profile?.id;
                    const peerName = isRecipient ? (conn.requesterDisplayName || 'Colleague') : (conn.recipientDisplayName || 'Colleague');
                    const peerUsername = isRecipient ? conn.requesterUsername : conn.recipientUsername;

                    const peerId = isRecipient ? conn.requesterId : conn.recipientId;
                    const peerPhoto = isRecipient ? conn.requesterPhotoUrl : conn.recipientPhotoUrl;

                    return (
                      <div key={conn.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition-all shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 font-bold flex items-center justify-center border border-teal-500/20 text-sm overflow-hidden shrink-0">
                              {peerPhoto ? (
                                <img src={peerPhoto} alt={peerName} className="w-full h-full object-cover" />
                              ) : (
                                getInitials(peerName, peerUsername)
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-100">{peerName}</div>
                              <div className="text-xs text-teal-400 font-mono">@{peerUsername || 'user'}</div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-lg bg-teal-950/60 border border-teal-800/60 text-teal-400 text-[10px] flex items-center gap-1 font-medium">
                            <UserCheck className="w-3 h-3" />
                            Connected
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              setSendToUser({
                                id: peerId,
                                username: peerUsername,
                                name: peerName || peerUsername || 'Workspace User',
                                displayName: peerName,
                                photoUrl: peerPhoto,
                                email: '',
                                role: 'staff',
                                status: 'active',
                                createdAt: '',
                              });
                            }}
                            className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer w-full justify-center"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Send Information / Share
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab: Requests */}
          {activeTab === 'requests' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Incoming Connection Requests</h3>
                {pendingIncoming.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">No pending incoming requests.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingIncoming.map(conn => (
                      <div key={conn.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center border border-amber-500/20">
                            {getInitials(conn.requesterDisplayName, conn.requesterUsername)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{conn.requesterDisplayName || 'User'}</div>
                            <div className="text-xs text-teal-400 font-mono">@{conn.requesterUsername || 'user'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRespond(conn.id, 'accepted')}
                            disabled={loadingAction}
                            className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespond(conn.id, 'declined')}
                            disabled={loadingAction}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingOutgoing.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Outgoing Sent Requests</h3>
                  <div className="space-y-3">
                    {pendingOutgoing.map(conn => (
                      <div key={conn.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{conn.recipientDisplayName || 'User'}</div>
                          <div className="text-xs text-teal-400 font-mono">@{conn.recipientUsername || 'user'}</div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[11px] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Pending Approval
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Directory */}
          {activeTab === 'directory' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search directory by name, @username, or email..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUsers.map(user => {
                  const userName = user.displayName || user.name || user.username || 'Workspace User';
                  const isConnected = acceptedConnections.some(
                    c => c.requesterId === user.id || c.recipientId === user.id
                  );
                  const isPending = pendingOutgoing.some(c => c.recipientId === user.id);

                  return (
                    <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 font-bold flex items-center justify-center border border-slate-700 text-sm">
                            {getInitials(userName, user.username)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                              {userName}
                              {user.role === 'admin' && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-400 text-[9px] font-bold border border-teal-500/20">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-teal-400 font-mono">@{user.username || 'user'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                        <span className="text-slate-500 capitalize">{user.role || 'staff'} Member</span>
                        {isConnected ? (
                          <span className="text-teal-400 flex items-center gap-1 text-[11px] font-medium">
                            <UserCheck className="w-3.5 h-3.5" />
                            Connected
                          </span>
                        ) : isPending ? (
                          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={loadingAction}
                            onClick={async () => {
                              if (!profile) return;
                              setLoadingAction(true);
                              setMessage(null);
                              try {
                                await sendConnectionRequest(profile, user.id);
                                setMessage({ type: 'success', text: `Connection request sent to ${userName} (@${user.username || 'user'})!` });
                              } catch (err: any) {
                                setMessage({ type: 'error', text: err?.message || 'Failed to send request.' });
                              } finally {
                                setLoadingAction(false);
                              }
                            }}
                            className="text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Profile Edit Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      {/* Direct Information Sender Modal */}
      <SendDirectInfoModal
        isOpen={!!sendToUser}
        onClose={() => setSendToUser(null)}
        targetUser={sendToUser}
      />
    </div>
  );
}

export const Colleagues = People;
export default People;
