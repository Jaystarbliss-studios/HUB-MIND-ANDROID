import React, { Component, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { LoadingProvider } from './lib/loadingContext';
import { Layout } from './components/Layout';
import { PWAPrompt } from './components/PWAPrompt';
import { JessFloatingAssistant } from './components/JessFloatingAssistant';
import { JessDocumentBridge } from './components/JessDocumentBridge';
import { PublicHome } from './pages/PublicHome';
import './pages/public-home.css';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { isJessInstalledApp } from './services/jessWakeListener';
import { DesktopUpdatesModal } from './components/DesktopUpdatesModal';

function safeLazy<T extends React.ComponentType<any>>(importer: () => Promise<{ [key: string]: any }>, namedExport?: string): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const mod = await importer();
        const component = (namedExport && mod[namedExport]) || mod.default || Object.values(mod).find(v => typeof v === 'function');
        if (component) return { default: component as T };
        throw new Error(`Export ${namedExport || 'default'} not found`);
      } catch (err: any) {
        console.warn(`[HubMind] Dynamic import failed (attempt ${attempt + 1}/3):`, err);
        if (attempt < 2) await new Promise(res => setTimeout(res, 300 * Math.pow(2, attempt)));
        else {
          const isChunkError = /failed to fetch dynamically imported module|loading chunk|importing a module script/i.test(err?.message || String(err));
          if (isChunkError && typeof window !== 'undefined' && !sessionStorage.getItem('hubmind_chunk_recovered')) {
            sessionStorage.setItem('hubmind_chunk_recovered', 'true'); window.location.reload(); return new Promise(() => {});
          }
          throw err;
        }
      }
    }
    throw new Error('Failed to load page component');
  });
}

const Login = safeLazy(() => import('./pages/Login'), 'Login');
const Dashboard = safeLazy(() => import('./pages/Dashboard'), 'Dashboard');
const Inbox = safeLazy(() => import('./pages/Inbox'), 'Inbox');
const Tasks = safeLazy(() => import('./pages/Tasks'), 'Tasks');
const TaskDetail = safeLazy(() => import('./pages/TaskDetail'), 'TaskDetail');
const MeetingDetail = safeLazy(() => import('./pages/MeetingDetail'), 'MeetingDetail');
const Clients = safeLazy(() => import('./pages/Clients'), 'Clients');
const ClientDetail = safeLazy(() => import('./pages/ClientDetail'), 'ClientDetail');
const Documents = safeLazy(() => import('./pages/Documents'), 'Documents');
const DocumentEditor = safeLazy(() => import('./pages/DocumentEditor'), 'DocumentEditor');
const Calendar = safeLazy(() => import('./pages/Calendar'), 'Calendar');
const Colleagues = safeLazy(() => import('./pages/People'), 'Colleagues');
const AdminUsers = safeLazy(() => import('./pages/AdminUsers'), 'AdminUsers');
const Notifications = safeLazy(() => import('./pages/Notifications'), 'Notifications');
const Projects = safeLazy(() => import('./pages/Projects'), 'Projects');
const ProjectDetail = safeLazy(() => import('./pages/ProjectDetail'), 'ProjectDetail');
const Knowledge = safeLazy(() => import('./pages/Knowledge'), 'Knowledge');
const FollowUps = safeLazy(() => import('./pages/FollowUps'), 'FollowUps');
const SharedRecord = safeLazy(() => import('./pages/SharedRecord'), 'SharedRecord');
const CompanionPage = safeLazy(() => import('./pages/CompanionPage'), 'CompanionPage');
const JessTranscriptOverlayPage = safeLazy(() => import('./pages/JessTranscriptOverlayPage'), 'JessTranscriptOverlayPage');
const JessSettings = safeLazy(() => import('./pages/JessSettings'), 'JessSettings');
const JessOrbPage = safeLazy(() => import('./pages/JessOrbPage'), 'JessOrbPage');

const LoadingScreen = () => <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-slate-400"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[HubMind] Unhandled application error:', error, info);
    const isChunkError = /failed to fetch dynamically imported module|loading chunk|importing a module script/i.test(error?.message || '');
    if (isChunkError && typeof window !== 'undefined' && !sessionStorage.getItem('hubmind_chunk_recovered')) {
      sessionStorage.setItem('hubmind_chunk_recovered', 'true'); window.location.reload();
    }
  }
  handleReload = () => { if (typeof window !== 'undefined') { sessionStorage.removeItem('hubmind_chunk_recovered'); window.location.reload(); } };
  render() {
    if (this.state.error) return <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6"><div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-xl"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-400" /></div><div><h1 className="font-bold text-white">Hub-Mind recovered from an error</h1><p className="text-xs text-slate-500">Your saved cloud data has not been intentionally changed.</p></div></div><p className="text-sm text-slate-400 mb-5">This screen caught an unexpected UI failure instead of leaving you with a blank page. Reload and try the action again.</p><button onClick={this.handleReload} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-slate-950 font-bold text-sm"><RefreshCw className="w-4 h-4" /> Reload Hub-Mind</button></div></div>;
    return this.props.children;
  }
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  if (profile.status !== 'active') return <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6"><div className="max-w-md text-center bg-slate-900 border border-slate-800 rounded-2xl p-8"><h1 className="text-xl font-bold text-white mb-2">Account access unavailable</h1><p className="text-sm text-slate-400">Your Hub-Mind account is not currently active. Please contact an administrator.</p></div></div>;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <div className="p-8 text-center text-red-400">Access Denied</div>;
  return <>{children}</>;
}

function AuthenticatedAssistantWidgets() {
  const { user, profile, loading, authorizationError } = useAuth();
  const location = useLocation();
  const isDesktopShell = (window as any).hubMindDesktop?.isDesktopApp === true;

  // If the desktop character is clicked while the user is signed out, explain
  // why voice cannot start instead of leaving the pet stuck on "Connecting".
  React.useEffect(() => {
    if (!isDesktopShell) return;
    const bridge = (window as any).hubMindDesktop;
    if (typeof bridge?.onPetVoiceActivation !== 'function') return;

    const explainUnavailableAccount = (request: any) => {
      if (!request || typeof request.requestId !== 'string' || loading) return;
      // The authenticated assistant below owns requests when the profile is ready.
      if (user && profile?.status === 'active') return;

      const message = !user
        ? 'Please sign in to Hub-Mind first. Once you are signed in, click me again and we can talk.'
        : profile?.status && profile.status !== 'active'
          ? 'Your Hub-Mind account is not active yet. Please check your account access.'
          : authorizationError || 'I could not load your Hub-Mind account profile. Open Hub-Mind and sign in again.';

      void Promise.resolve(bridge.setJessPetSpeech?.(message, 'concerned')).catch(() => {});
      void Promise.resolve(bridge.setJessPetVisualState?.({
        connection: 'error', state: 'error', inputLevel: 0, outputLevel: 0,
      })).catch(() => {});
      void Promise.resolve(bridge.acknowledgePetVoiceActivation?.(request.requestId)).catch(() => {});
    };

    const unsubscribe = bridge.onPetVoiceActivation(explainUnavailableAccount);
    void Promise.resolve(bridge.getPendingPetVoiceActivation?.()).then(explainUnavailableAccount).catch(() => {});
    return () => { try { unsubscribe?.(); } catch {} };
  }, [isDesktopShell, loading, user?.uid, profile?.id, profile?.status, authorizationError]);

  // The native orb and caption run in dedicated Electron windows. Keep the actual
  // Jess session mounted across authenticated route changes so navigation never
  // disconnects the microphone/Live client or resets the transcript. The desktop
  // shell is allowed to mount Jess on / and /login once an authenticated profile
  // is available, because that is where a desktop click may arrive after launch.
  const desktopOverlayRoute = ['/companion', '/companion-transcript', '/orb'].includes(location.pathname);
  const publicOrLoginRoute = location.pathname === '/' || location.pathname === '/login';
  if (desktopOverlayRoute || (publicOrLoginRoute && !isDesktopShell)) return null;
  if (!user || !profile || profile.status !== 'active') return null;
  return <><JessDocumentBridge /><JessFloatingAssistant /></>;
}

function WorkspaceRoutes() {
  return <ProtectedRoute><Layout /></ProtectedRoute>;
}

export default function App() {
  return <AppErrorBoundary><AuthProvider><LoadingProvider><BrowserRouter>
    <PWAPrompt />
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<AppHomeRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/companion" element={<ProtectedRoute><CompanionPage /></ProtectedRoute>} />
        <Route path="/companion-transcript" element={<JessTranscriptOverlayPage />} />
        <Route path="/orb" element={<ProtectedRoute><JessOrbPage /></ProtectedRoute>} />
        <Route path="/share-target" element={<Navigate to="/workspace/inbox?shared=true" replace />} />
        <Route path="/share/:type/:id" element={<ProtectedRoute><SharedRecord /></ProtectedRoute>} />
        <Route path="/workspace" element={<WorkspaceRoutes />}>
          <Route index element={<Dashboard />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="meetings/:id" element={<MeetingDetail />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="colleagues" element={<Colleagues />} />
          <Route path="people" element={<Navigate to="/workspace/colleagues" replace />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<DocumentEditor />} />
          <Route path="settings" element={<JessSettings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Route>
        {/* Preserve bookmarks and older links while making the root a public landing page. */}
        <Route path="/inbox" element={<Navigate to="/workspace/inbox" replace />} />
        <Route path="/tasks/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/projects/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/knowledge" element={<Navigate to="/workspace/knowledge" replace />} />
        <Route path="/follow-ups" element={<Navigate to="/workspace/follow-ups" replace />} />
        <Route path="/clients/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/meetings/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/calendar" element={<Navigate to="/workspace/calendar" replace />} />
        <Route path="/colleagues" element={<Navigate to="/workspace/colleagues" replace />} />
        <Route path="/people" element={<Navigate to="/workspace/colleagues" replace />} />
        <Route path="/documents/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/notifications" element={<Navigate to="/workspace/notifications" replace />} />
        <Route path="/admin" element={<Navigate to="/workspace/admin" replace />} />
        <Route path="*" element={<FallbackCatchAllRoute />} />
      </Routes>
    </Suspense>
    <AuthenticatedAssistantWidgets />
    <DesktopUpdatesModal />
  </BrowserRouter></LoadingProvider></AuthProvider></AppErrorBoundary>;
}

function LegacyWorkspaceRedirect() {
  const location = window.location;
  return <Navigate to={'/workspace' + location.pathname + location.search + location.hash} replace />;
}

function FallbackCatchAllRoute() {
  const installed = isJessInstalledApp();
  const { user, profile } = useAuth();
  if (installed) {
    if (user && profile && profile.status === 'active') {
      return <Navigate to="/workspace" replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/" replace />;
}

function AppHomeRoute() {
  const installed = isJessInstalledApp();
  const { user, profile } = useAuth();
  if (installed) {
    if (user && profile && profile.status === 'active') {
      return <Navigate to="/workspace" replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <PublicHome />;
}
