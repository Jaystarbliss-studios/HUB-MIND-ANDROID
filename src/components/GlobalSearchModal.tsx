import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Search, CheckSquare, FileText, Briefcase, Building, X, ArrowRight, CornerDownLeft } from 'lucide-react';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'task' | 'document' | 'project' | 'client';
  url: string;
  status?: string;
  date?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [queryText, setQueryText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'task' | 'document' | 'project' | 'client'>('all');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchAllItems();
    } else {
      setQueryText('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const fetchAllItems = async () => {
    setLoading(true);
    try {
      const [tasksSnap, docsSnap, projSnap, clientsSnap] = await Promise.all([
        getDocs(collection(db, 'tasks')),
        getDocs(collection(db, 'documents')),
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'clients')),
      ]);

      const allResults: SearchResultItem[] = [];

      tasksSnap.docs.forEach((doc) => {
        const d = doc.data();
        allResults.push({
          id: doc.id,
          title: d.title || 'Untitled Task',
          subtitle: d.description || 'Task',
          category: 'task',
          url: `/tasks/${doc.id}`,
          status: d.status,
          date: d.deadline,
        });
      });

      docsSnap.docs.forEach((doc) => {
        const d = doc.data();
        allResults.push({
          id: doc.id,
          title: d.title || 'Untitled Document',
          subtitle: d.category || 'Document',
          category: 'document',
          url: `/documents`,
          status: d.type,
          date: d.createdAt,
        });
      });

      projSnap.docs.forEach((doc) => {
        const d = doc.data();
        allResults.push({
          id: doc.id,
          title: d.name || 'Untitled Project',
          subtitle: d.description || 'Project',
          category: 'project',
          url: `/projects`,
          status: d.status,
          date: d.createdAt,
        });
      });

      clientsSnap.docs.forEach((doc) => {
        const d = doc.data();
        allResults.push({
          id: doc.id,
          title: d.name || 'Untitled Client',
          subtitle: d.email || d.type || 'Client',
          category: 'client',
          url: `/clients`,
          status: d.status,
          date: d.createdAt,
        });
      });

      setItems(allResults);
    } catch (e) {
      console.warn('Error fetching workspace items for global search', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) {
      return false;
    }
    if (!queryText.trim()) return true;
    const q = queryText.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );
  });

  const handleSelect = (item: SearchResultItem) => {
    onClose();
    navigate(item.url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={queryText}
            onChange={(e) => {
              setQueryText(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, documents, projects, clients..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-base font-normal"
          />
          {queryText && (
            <button
              onClick={() => setQueryText('')}
              className="p-1 text-slate-500 hover:text-slate-300 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-2 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded bg-slate-800/80 border border-slate-700"
          >
            ESC
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              categoryFilter === 'all'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Results
          </button>
          <button
            onClick={() => setCategoryFilter('task')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
              categoryFilter === 'task'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-3 h-3" /> Tasks
          </button>
          <button
            onClick={() => setCategoryFilter('document')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
              categoryFilter === 'document'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3 h-3" /> Documents
          </button>
          <button
            onClick={() => setCategoryFilter('project')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
              categoryFilter === 'project'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-3 h-3" /> Projects
          </button>
          <button
            onClick={() => setCategoryFilter('client')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
              categoryFilter === 'client'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="w-3 h-3" /> Clients
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/40">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No results found for "{queryText}"
            </div>
          ) : (
            filteredItems.slice(0, 40).map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={`${item.category}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-teal-500/10 border border-teal-500/20' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        item.category === 'task'
                          ? 'bg-amber-500/10 text-amber-400'
                          : item.category === 'document'
                          ? 'bg-blue-500/10 text-blue-400'
                          : item.category === 'project'
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {item.category === 'task' && <CheckSquare className="w-4 h-4" />}
                      {item.category === 'document' && <FileText className="w-4 h-4" />}
                      {item.category === 'project' && <Briefcase className="w-4 h-4" />}
                      {item.category === 'client' && <Building className="w-4 h-4" />}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-100 truncate">
                          {item.title}
                        </span>
                        {item.status && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                            {item.status}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[11px] text-slate-500 capitalize">{item.category}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-teal-400' : 'text-slate-600'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">↵</kbd> Select
            </span>
          </div>
          <span>{filteredItems.length} items found</span>
        </div>
      </div>
    </div>
  );
};
