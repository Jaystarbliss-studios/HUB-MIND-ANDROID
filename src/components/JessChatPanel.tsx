import React, { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { addDoc, collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowUp, Copy, Download, History, LoaderCircle, MessageCircle, Monitor, MonitorOff, Plus, X } from 'lucide-react';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { formatMemoriesForPrompt, getUserMemories, saveUserMemory } from '../services/memoryService';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; at: number };
type SavedConversation = { id: string; userId: string; title?: string; updatedAt?: string; messages?: ChatMessage[] };
const welcome: ChatMessage = { id: 'welcome', role: 'assistant', text: 'Hi, I’m Jess. We can work through an idea, write something together, or plan your next steps. What’s on your mind?', at: Date.now() };
const starterPrompts = [
  { label: 'Help me write', text: 'Help me draft a clear, professional message.' },
  { label: 'Think it through', text: 'Help me think through a decision step by step.' },
  { label: 'Plan my work', text: 'Help me turn my priorities into a practical plan.' },
];

export function JessChatPanel({ onClose }: { onClose: () => void }) {
  const { profile, user: firebaseUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenError, setScreenError] = useState('');
  const [screenSharingAllowed, setScreenSharingAllowed] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const stop = onSnapshot(query(collection(db, 'conversations'), where('userId', '==', profile.id)), snapshot => {
      const list = snapshot.docs.map(item => ({ id: item.id, ...(item.data() as any) } as SavedConversation));
      list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      setConversations(list);
    }, err => console.warn('[JessChat] Conversation list unavailable:', err?.message || err));
    return () => stop();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !activeConversationId) return;
    return onSnapshot(doc(db, 'conversations', activeConversationId), snapshot => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as SavedConversation;
      if (data.userId !== profile.id) return;
      const saved = Array.isArray(data.messages) ? data.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')) : [];
      if (!sending) setMessages(saved.length ? saved : [welcome]);
    }, err => console.warn('[JessChat] Conversation could not be restored:', err?.message || err));
  }, [profile?.id, activeConversationId, sending]);

  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
      void videoRef.current.play().catch(() => {});
    }
  }, [screenStream]);

  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    return onSnapshot(doc(db, 'systemSettings', 'jessPublic'), snapshot => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setScreenSharingAllowed(data.screenSharingEnabled !== false);
      setMemoryEnabled(data.memoryEnabled !== false);
    }, () => { setScreenSharingAllowed(true); setMemoryEnabled(true); });
  }, [profile?.id]);

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([{ ...welcome, id: 'welcome-' + Date.now(), text: 'Fresh page. What would you like us to work on?' }]);
    setDraft('');
    setError('');
    setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const selectConversation = (conversation: SavedConversation) => {
    setActiveConversationId(conversation.id);
    const saved = Array.isArray(conversation.messages) ? conversation.messages : [];
    setMessages(saved.length ? saved : [welcome]);
    setHistoryOpen(false);
    setError('');
  };

  const toggleScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenError('');
      return;
    }
    if (!screenSharingAllowed) { setScreenError('Screen sharing has been disabled by your administrator.'); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setScreenError('Screen sharing is not supported in this browser. Try the installed desktop app or a current desktop browser.'); return; }
    try {
      setScreenError('');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (screenStreamRef.current === stream) {
          screenStreamRef.current = null;
          setScreenStream(null);
        }
      }, { once: true });
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') setScreenError(err?.message || 'Could not start screen sharing.');
    }
  };

  const captureScreenSnapshot = async () => {
    const video = videoRef.current;
    if (!screenStreamRef.current || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1280 / video.videoWidth, 900 / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65).split(',')[1] || null;
  };

  const sendMessage = async (rawText = draft, retry = false) => {
    const text = rawText.trim();
    if ((!text && !retry) || sending || !profile?.id) return;
    const lastExisting = messages[messages.length - 1];
    const userMessage: ChatMessage = retry && lastExisting?.role === 'user'
      ? lastExisting
      : { id: crypto.randomUUID(), role: 'user', text, at: Date.now() };
    const next = retry ? messages : [...messages.filter(m => !m.id.startsWith('welcome')), userMessage];
    setMessages(next);
    setDraft('');
    setError('');
    setSending(true);
    let conversationId = activeConversationId;
    const timestamp = new Date().toISOString();

    try {
      if (!firebaseUser) throw new Error('Sign in again to save and continue your Jess conversations.');
      if (!conversationId) {
        const conversationRef = doc(collection(db, 'conversations'));
        conversationId = conversationRef.id;
        await setDoc(conversationRef, {
          userId: profile.id,
          title: userMessage.text.slice(0, 90) || 'New conversation',
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: next.slice(-40),
        });
        setActiveConversationId(conversationId);
      } else {
        await updateDoc(doc(db, 'conversations', conversationId), {
          title: conversations.find(item => item.id === conversationId)?.title || userMessage.text.slice(0, 90),
          updatedAt: timestamp,
          messages: next.slice(-40),
        });
      }

      const memories = memoryEnabled ? await getUserMemories(profile.id) : [];
      const memoryContext = memoryEnabled ? formatMemoriesForPrompt(memories) : 'Personal memory is disabled by the workspace administrator.';
      const systemText = 'You are Jess, the thoughtful, capable AI assistant inside Hub-Mind by Jaystarbliss Studios. Be warm, sharp, practical, and honest. Write naturally, not generically. You have live global web search enabled and full live access to your public GitHub repository Jaystarbliss-studios/HUB-MIND. You know about all released desktop versions (such as desktop-v488, desktop-v14, etc.), installers, recent commits, and the codebase. When the user asks about version history, releases, code, or current facts, provide accurate details and note that they can open the visual Desktop Releases & Version History panel. Do not claim to have performed actions in the user’s workspace unless a connected tool has actually done so.\n\nUser memory available to personalise this conversation:\n' + memoryContext;
      const requestMessages = next.filter(m => !m.id.startsWith('welcome')).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
      let imageAttached = false;
      if (screenStreamRef.current && requestMessages.length) {
        const image = await captureScreenSnapshot();
        if (image) {
          requestMessages[requestMessages.length - 1].parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } } as any);
          imageAttached = true;
        }
      }
      const token = await firebaseUser.getIdToken();
      const textQuery = userMessage.text.toLowerCase();
      const needsSearch = /search|browse|web|lookup|look up|who is|what is|news|latest|release|version|installer|desktop|github|repo|commit/i.test(textQuery) || /^https?:\/\//i.test(userMessage.text);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          messages: requestMessages,
          useSearch: needsSearch,
          systemInstruction: { parts: [{ text: systemText + (imageAttached ? '\n\nThe user deliberately shared a current screen snapshot. Describe only what is visible, acknowledge uncertainty, and ask before taking any consequential action.' : '') }] }
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Jess could not reply just now. Please try again.');
      const reply = String(data?.text || data?.message?.parts?.find((part: any) => part.text)?.text || '').trim();
      if (!reply) throw new Error('Jess returned an empty reply. Please try again.');
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: reply, at: Date.now() };
      const completed = [...next, assistantMessage].slice(-40);
      setMessages(completed);
      await updateDoc(doc(db, 'conversations', conversationId), { messages: completed, updatedAt: new Date().toISOString() });

      if (/^(please\s+)?(remember|keep in mind)\b/i.test(userMessage.text)) {
        const memoryText = userMessage.text.replace(/^(please\s+)?(remember|keep in mind)\s*(that\s*)?/i, '').trim();
        if (memoryText) await saveUserMemory(profile.id, { key: memoryText.slice(0, 48).toLowerCase().replace(/[^a-z0-9]+/g, '_'), content: memoryText, source: 'chat', importance: 'high', category: 'preference' }).catch(err => console.warn('[JessChat] Explicit memory save failed:', err?.message || err));
      }
    } catch (err: any) {
      setError(err?.name === 'TimeoutError' ? 'That took too long. Check your connection and try again.' : (err?.message || 'Could not reach Jess. Check your connection and try again.'));
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); void sendMessage(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  };
  const copyMessage = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch {} };

  return (
    <section className="jess-chat-panel" role="dialog" aria-modal="false" aria-label="Chat with Jess">
      <header className="jess-chat-header">
        <div className="jess-chat-identity">
          <div className="jess-chat-avatar overflow-hidden"><img src="/assets/jess-avatar.png" alt="Jess" className="w-full h-full object-cover rounded-xl" /></div>
          <div className="jess-chat-heading"><strong>Jess</strong><span><i/> Hub-Mind thought partner</span></div>
        </div>
        <div className="jess-chat-header-actions">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('hubmind:open-updates-panel'))} title="Desktop Releases & Version History" aria-label="Desktop Releases & Version History"><Download size={16}/></button>
          <button type="button" onClick={() => setHistoryOpen(open => !open)} title="Saved conversations" aria-label="Saved conversations"><History size={16}/></button>
          <button type="button" onClick={startNewChat} title="Start a fresh chat" aria-label="Start a fresh chat"><Plus size={17}/></button>
          <button type="button" onClick={onClose} title="Close chat" aria-label="Close chat"><X size={18}/></button>
        </div>
      </header>

      <div className="jess-chat-context"><span className="jess-chat-context-dot"/> PRIVATE CHAT <span>·</span> Conversations save to your Hub-Mind account.</div>

      {historyOpen && <div className="jess-chat-history" aria-label="Saved conversations">
        <div className="jess-chat-history-title">RECENT CONVERSATIONS</div>
        {conversations.length ? conversations.slice(0, 12).map(conversation => <button type="button" key={conversation.id} onClick={() => selectConversation(conversation)} className={conversation.id === activeConversationId ? 'is-active' : ''}><span>{conversation.title || 'Conversation'}</span><small>{conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString() : ''}</small></button>) : <p>No saved conversations yet.</p>}
      </div>}

      {screenStream && <div className="jess-chat-screen-share">
        <video ref={videoRef} muted playsInline aria-label="Shared screen preview"/>
        <div><strong>Screen sharing is on</strong><span>Jess receives a snapshot when you send a message, not a continuous recording.</span></div>
        <button type="button" onClick={() => void toggleScreenShare()} aria-label="Stop screen sharing" title="Stop sharing"><MonitorOff size={15}/></button>
      </div>}
      {!screenStream && <video ref={videoRef} className="jess-chat-video-hidden" muted playsInline aria-hidden="true"/>}

      <div className="jess-chat-messages" ref={listRef} aria-live="polite">
        {messages.map((message, index) => (
          <article key={message.id} className={'jess-chat-message ' + (message.role === 'user' ? 'is-user' : 'is-jess')}>
            {message.role === 'assistant' && <div className="jess-chat-message-avatar overflow-hidden p-0"><img src="/assets/jess-avatar.png" alt="Jess" className="w-full h-full object-cover rounded-lg" /></div>}
            <div className="jess-chat-message-body">
              <div className="jess-chat-message-label">{message.role === 'user' ? 'You' : 'Jess'}</div>
              <div className="jess-chat-bubble">{message.text}</div>
              {message.role === 'assistant' && index > 0 && <button type="button" className="jess-chat-copy" onClick={() => void copyMessage(message.text)}><Copy size={12}/> Copy reply</button>}
            </div>
          </article>
        ))}
        {sending && <div className="jess-chat-typing"><span className="jess-chat-message-avatar overflow-hidden p-0"><img src="/assets/jess-avatar.png" alt="Jess" className="w-full h-full object-cover rounded-lg" /></span><span className="jess-chat-typing-dots"><i/><i/><i/></span><span>Jess is thinking</span><LoaderCircle className="jess-chat-spinner" size={13}/></div>}
        {error && <div className="jess-chat-error" role="alert">{error}<button type="button" onClick={() => void sendMessage(messages[messages.length - 1]?.text || draft, true)}>Try again</button></div>}
      </div>

      {messages.filter(m => !m.id.startsWith('welcome')).length === 0 && <div className="jess-chat-starters">{starterPrompts.map(prompt => <button type="button" key={prompt.label} onClick={() => void sendMessage(prompt.text)}>{prompt.label}<span>↗</span></button>)}</div>}
      {screenError && <div className="jess-chat-screen-error" role="status">{screenError}</div>}

      <form className="jess-chat-composer" onSubmit={onSubmit}>
        <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Message Jess…" rows={1} aria-label="Message Jess" maxLength={12000}/>
        <div className="jess-chat-composer-footer">
          <span>Enter to send <i>·</i> Shift + Enter for a new line</span>
          <div className="jess-chat-composer-actions">
            <button type="button" className={screenStream ? 'is-sharing' : ''} onClick={() => void toggleScreenShare()} aria-label={screenStream ? 'Stop screen sharing' : 'Share screen with Jess'} title={screenStream ? 'Stop screen sharing' : 'Share screen with Jess'} disabled={!screenSharingAllowed && !screenStream}><Monitor size={15}/></button>
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><ArrowUp size={17}/></button>
          </div>
        </div>
      </form>
      <p className="jess-chat-disclaimer">Jess can make mistakes. Review important details before acting.</p>
    </section>
  );
}

export function JessChatLauncher({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="jess-chat-launcher" onClick={onClick} aria-label="Open chat with Jess" title="Chat with Jess">
      <span className="jess-chat-launcher-avatar"><img src="/assets/jess-avatar.png" alt="" /></span>
      <span>Chat with Jess</span>
    </button>
  );
}
