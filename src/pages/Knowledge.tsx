import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { Knowledge as KnowledgeType } from '../types';
import { logActivity } from '../lib/activity';
import { Loader2, Plus, Book, Search, FileText, Bookmark, Trash2 } from 'lucide-react';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { format, parseISO } from 'date-fns';

export function Knowledge() {
  const { profile } = useAuth();
  const [items, setItems] = useState<KnowledgeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [articleToDelete, setArticleToDelete] = useState<{id: string, title: string} | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'sop' | 'template' | 'faq' | 'lesson'>('sop');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    const q = query(collection(db, 'knowledge'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeType)));
      setLoading(false);
    }, (error) => {
      console.warn("Real-time knowledge listener warning:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'knowledge'), {
        title: newTitle,
        content: newContent,
        category: newCategory,
        tags: [],
        createdBy: profile?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await logActivity(docRef.id, 'knowledge', 'added knowledge article', newTitle, profile?.displayName || profile?.name || 'User');
      setNewTitle('');
      setNewContent('');
      setShowCreate(false);
    } catch (error) {
      console.error("Error creating knowledge", error);
    }
  };

  
  const confirmDelete = (id: string, title: string) => { setArticleToDelete({id, title}); };
  const handleDelete = async (id: string, title: string) => {
    setArticleToDelete(null);
    try {
      await deleteDoc(doc(db, 'knowledge', id));
      await logActivity(id, 'knowledge', 'deleted knowledge article', title, profile?.displayName || profile?.name || 'User');
      setItems(items.filter(item => item.id !== id));
    } catch (error) {
      console.error("Error deleting knowledge", error);
    }
  };
  
  const filtered = items.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) || 
    i.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Book className="w-6 h-6 text-accent" />
            Knowledge Base
          </h1>
          <p className="text-sm text-slate-400 mt-1">SOPs, templates, and institutional knowledge.</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-accent text-slate-950 px-4 py-2 rounded-lg font-bold text-sm hover:bg-white transition-colors flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      <div className="mb-6 relative">
        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input 
          type="text"
          placeholder="Search knowledge base..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-bold text-white mb-4">Create Knowledge Article</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
              <input 
                type="text" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              >
                <option value="sop">SOP</option>
                <option value="template">Template</option>
                <option value="faq">FAQ</option>
                <option value="lesson">Lesson Learned</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Content</label>
              <textarea 
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent h-48 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white">Cancel</button>
              <button type="submit" className="bg-accent text-slate-950 px-4 py-2 rounded-lg text-sm font-bold hover:bg-white">Save Article</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(item => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                  <Bookmark className="w-3 h-3" />
                  {item.category}
                </span>
                <span className="text-xs text-slate-500">{safeFormat(item.createdAt, 'MMM d, yyyy')}</span>
                
                {profile?.role === 'admin' && (
                  <button
                    onClick={() => confirmDelete(item.id, item.title)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
  
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 line-clamp-3 mb-4 flex-1 whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 text-sm">
              No articles found.
            </div>
          )}
        </div>
      )}

      {articleToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete Article</h3>
            <p className="text-sm text-slate-300 mb-6">Are you sure you want to delete this article? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setArticleToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => { if(articleToDelete) handleDelete(articleToDelete.id, articleToDelete.title); }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
