import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { 
  X, 
  User as UserIcon, 
  AtSign, 
  Phone, 
  Image as ImageIcon, 
  Shield, 
  Check, 
  AlertCircle, 
  Loader2, 
  Lock, 
  Globe, 
  Users,
  Camera,
  RefreshCw,
  Calendar as CalendarIcon,
  Link2,
  Unlink,
  Brain,
  Trash2,
  Plus
} from 'lucide-react';
import { isUsernameAvailable, normalizeUsername, extractHandleFromEmail } from '../services/userService';
import { ResourceVisibility, UserMemory } from '../types';
import { 
  connectGoogleCalendarOnce, 
  disconnectGoogleCalendar, 
  getGoogleCalendarConnectionInfo 
} from '../lib/googleCalendar';
import { 
  subscribeToUserMemories, 
  saveUserMemory, 
  deleteUserMemory 
} from '../services/memoryService';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { user, profile, updateProfileData } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'memory'>('profile');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [defaultVisibility, setDefaultVisibility] = useState<ResourceVisibility>('private');

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // User Memories state
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<'preference' | 'workflow' | 'fact' | 'instruction'>('preference');
  const [addingMemory, setAddingMemory] = useState(false);

  // Initialize values when modal opens or profile changes
  useEffect(() => {
    if (profile && isOpen) {
      setDisplayName(profile.displayName || profile.name || '');
      setUsername(profile.username || extractHandleFromEmail(profile.email, profile.displayName));
      setPhotoUrl(profile.photoUrl || user?.photoURL || '');
      setPhone(profile.phone || '');
      setPreferredName(profile.preferredName || '');
      setDefaultVisibility(profile.defaultVisibility || 'private');
      setUsernameAvailable(true);
      setUsernameFeedback('');
      setSaveSuccess(false);
      setSaveError(null);
    }
  }, [profile, isOpen, user?.photoURL]);

  // Subscribe to user memories in real-time
  useEffect(() => {
    if (!profile?.id || !isOpen) return;
    const unsub = subscribeToUserMemories(profile.id, setMemories);
    return () => unsub();
  }, [profile?.id, isOpen]);

  // Real-time username availability check (debounced)
  useEffect(() => {
    if (!profile || !username) return;

    const normalized = normalizeUsername(username);
    if (normalized === profile.username) {
      setUsernameAvailable(true);
      setUsernameFeedback('Current username');
      setCheckingUsername(false);
      return;
    }

    if (normalized.length < 3) {
      setUsernameAvailable(false);
      setUsernameFeedback('Must be at least 3 characters');
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    const timeout = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(normalized, profile.id);
        setUsernameAvailable(available);
        setUsernameFeedback(available ? `@${normalized} is available!` : `@${normalized} is already taken`);
      } catch (err) {
        console.warn('Username check error:', err);
      } finally {
        setCheckingUsername(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [username, profile]);

  if (!isOpen || !profile) return null;

  const handleUseGooglePhoto = () => {
    if (user?.photoURL) {
      setPhotoUrl(user.photoURL);
    }
  };

  const handleResetToInitials = () => {
    setPhotoUrl('');
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim() || !profile) return;
    setAddingMemory(true);
    try {
      await saveUserMemory(profile.id, {
        content: newMemoryContent.trim(),
        category: newMemoryCategory,
        source: 'explicit',
        importance: 'high',
      });
      setNewMemoryContent('');
    } catch (err) {
      console.warn('Failed to save memory:', err);
    } finally {
      setAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!profile) return;
    await deleteUserMemory(profile.id, id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanDisplayName = displayName.trim();
    const cleanUsername = normalizeUsername(username);

    if (!cleanDisplayName) {
      setSaveError('Display name is required.');
      return;
    }

    if (cleanUsername.length < 3) {
      setSaveError('Username must be at least 3 characters long.');
      return;
    }

    if (usernameAvailable === false && cleanUsername !== profile.username) {
      setSaveError(`@${cleanUsername} is already taken. Please choose another.`);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateProfileData({
        displayName: cleanDisplayName,
        username: cleanUsername,
        photoUrl: photoUrl.trim() || undefined,
        phone: phone.trim() || undefined,
        preferredName: preferredName.trim() || undefined,
        defaultVisibility,
      });

      // Also persist preferredName to AI memory
      if (preferredName.trim()) {
        await saveUserMemory(profile.id, {
          key: 'preferred_name',
          content: `User prefers to be addressed as "${preferredName.trim()}".`,
          category: 'preference',
          importance: 'high',
          source: 'explicit',
        }).catch(() => {});
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setSaveError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || profile.displayName || profile.username || '?').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Account & Settings
                {profile.role === 'admin' && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Admin
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Manage your identity, Google sync, and private AI memories.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 bg-slate-950/30 border-b border-slate-800/80 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Profile & Security
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'memory'
                ? 'border-purple-400 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            AI Memory & Preferences
            <span className="text-[10px] px-1.5 py-0.2 bg-purple-950 text-purple-300 border border-purple-800/60 rounded-full">
              {memories.length}
            </span>
          </button>
        </div>

        {/* Status Alerts */}
        {saveSuccess && (
          <div className="m-5 mb-0 p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center gap-2.5 text-teal-300 text-xs font-semibold">
            <Check className="w-4 h-4 text-teal-400 shrink-0" />
            Profile updated successfully!
          </div>
        )}

        {saveError && (
          <div className="m-5 mb-0 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            {saveError}
          </div>
        )}

        {activeTab === 'profile' ? (
          /* Profile Tab */
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
            
            {/* Preferred Name for Jess */}
            <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                <img src="/assets/jess-avatar.png" alt="Jess" className="w-4 h-4 rounded-full object-cover shrink-0 border border-amber-400/40" />
                Preferred Name for Jess (AI Assistant)
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Jess will address you by this name in all voice conversations and briefings.
              </p>
              <input
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder={displayName || 'How should Jess call you?'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400/80 transition-colors"
              />
            </div>

            {/* Avatar Preview & Source */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Profile Photo
              </label>
              
              <div className="flex items-center gap-4">
                <div className="relative">
                  {photoUrl ? (
                    <img 
                      src={photoUrl} 
                      alt={displayName} 
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-teal-400/40 shadow-lg shadow-teal-500/10"
                      onError={() => setPhotoUrl('')}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-slate-950 font-black text-xl flex items-center justify-center border-2 border-teal-400/40 shadow-lg">
                      {initials}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {user?.photoURL && (
                      <button
                        type="button"
                        onClick={handleUseGooglePhoto}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3 text-teal-400" /> Use Google Photo
                      </button>
                    )}
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={handleResetToInitials}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-700 transition-colors cursor-pointer"
                      >
                        Use Initials Avatar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Full Display Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., John Rufai"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-400 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Username (@handle) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Username / Handle
                </label>
                <span className="text-[11px] text-slate-500">
                  Used for tagging & sharing (e.g. <span className="text-teal-400 font-mono">@{normalizeUsername(username) || 'handle'}</span>)
                </span>
              </div>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold text-sm">
                  @
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="john"
                  className={`w-full bg-slate-950 border rounded-xl pl-9 pr-10 py-2.5 text-sm text-white font-mono focus:outline-none transition-colors ${
                    usernameAvailable === true 
                      ? 'border-teal-500/60 focus:border-teal-400' 
                      : usernameAvailable === false 
                      ? 'border-rose-500/60 focus:border-rose-400' 
                      : 'border-slate-800 focus:border-teal-400'
                  }`}
                  required
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {checkingUsername ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : usernameAvailable === true ? (
                    <Check className="w-4 h-4 text-teal-400" />
                  ) : usernameAvailable === false ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : null}
                </div>
              </div>

              {usernameFeedback && (
                <p className={`text-[11px] mt-1.5 font-medium ${
                  usernameAvailable ? 'text-teal-400' : 'text-rose-400'
                }`}>
                  {usernameFeedback}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Phone / WhatsApp (Optional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 ... or 080..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-400 transition-colors"
                />
              </div>
            </div>

            {/* Default Resource Visibility */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Default Privacy for New Documents & Tasks
              </label>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultVisibility('private')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    defaultVisibility === 'private'
                      ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Private Only</div>
                    <div className="text-[10px] text-slate-400 leading-snug">Visible only to you and admins</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDefaultVisibility('workspace')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    defaultVisibility === 'workspace'
                      ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Globe className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Workspace Team</div>
                    <div className="text-[10px] text-slate-400 leading-snug">Visible to all active team members</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Google Calendar One-Time Sync */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <CalendarIcon className="w-4 h-4 text-teal-400" />
                  Google Calendar Integration
                </div>
                {getGoogleCalendarConnectionInfo().connected ? (
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> Connected
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Connect once to allow Jess and Hub-Mind to synchronize meetings and recurring schedules directly to your Google Calendar.
              </p>
              <div className="pt-1 flex items-center justify-end">
                {getGoogleCalendarConnectionInfo().connected ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await disconnectGoogleCalendar();
                      setSaveSuccess(true);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Unlink className="w-3 h-3" /> Disconnect Google Calendar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await connectGoogleCalendarOnce();
                      if (res.success) setSaveSuccess(true);
                      else setSaveError(res.message);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5 text-teal-400" /> Connect Google Calendar
                  </button>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (usernameAvailable === false && normalizeUsername(username) !== profile.username)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 transition-colors flex items-center gap-2 cursor-pointer shadow-md shadow-teal-500/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>

          </form>
        ) : (
          /* AI Memory Tab */
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1.5">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                <Brain className="w-4 h-4 text-purple-400" />
                Private AI Memory for @{profile.username}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Jess automatically remembers your preferences, instructions, and choices across all logins. These memories are strictly private to your account.
              </p>
            </div>

            {/* Add Memory Form */}
            <form onSubmit={handleAddMemory} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-teal-400" />
                  Teach Jess a New Preference or Fact
                </label>
                <select
                  value={newMemoryCategory}
                  onChange={(e) => setNewMemoryCategory(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-slate-300 px-2 py-1 outline-none"
                >
                  <option value="preference">Preference</option>
                  <option value="workflow">Workflow</option>
                  <option value="instruction">Instruction</option>
                  <option value="fact">Fact</option>
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMemoryContent}
                  onChange={(e) => setNewMemoryContent(e.target.value)}
                  placeholder="e.g. Always generate document drafts with Executive summary first"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={addingMemory || !newMemoryContent.trim()}
                  className="px-3.5 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 rounded-xl text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                >
                  {addingMemory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Remember
                </button>
              </div>
            </form>

            {/* List of Stored Memories */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Stored Memories ({memories.length})</span>
              </div>

              {memories.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs space-y-1">
                  <Brain className="w-6 h-6 mx-auto text-purple-400/50" />
                  <p>No memories stored yet.</p>
                  <p className="text-[10px] text-slate-600">Tell Jess your habits or preferences during live voice or add one above.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {memories.map(m => (
                    <div 
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 flex items-start justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                            m.category === 'instruction' 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : m.category === 'workflow'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          }`}>
                            {m.category}
                          </span>
                          {m.key && (
                            <span className="text-[10px] font-mono text-slate-400">
                              #{m.key}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {m.content}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(m.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Forget this memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
