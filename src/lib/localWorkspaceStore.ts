import { Task, Project, Client, Meeting, FollowUp } from '../types';

const TASKS_KEY = 'hubmind_local_tasks_v1';
const PROJECTS_KEY = 'hubmind_local_projects_v1';
const CLIENTS_KEY = 'hubmind_local_clients_v1';
const MEETINGS_KEY = 'hubmind_local_meetings_v1';
const FOLLOWUPS_KEY = 'hubmind_local_followups_v1';
const MIGRATION_KEY = 'hubmind_local_seed_cleanup_v2';

/**
 * Local storage is a cache, never a source of truth.
 * Older Hub-Mind builds populated this cache with demo records when it was empty.
 * That made real records appear to disappear/reappear and could resurrect deleted
 * records after a refresh. We permanently stop generating demo business data.
 */
function runLegacySeedCleanup() {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return;

    const cleanCollection = (key: string, prefixes: string[]) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed.filter((item: any) => {
        const id = String(item?.id || '');
        return !prefixes.some(prefix => id.startsWith(prefix));
      });
      localStorage.setItem(key, JSON.stringify(cleaned));
    };

    cleanCollection(TASKS_KEY, ['task-seed-']);
    cleanCollection(PROJECTS_KEY, ['proj-seed-']);
    cleanCollection(CLIENTS_KEY, ['client-seed-']);
    cleanCollection(MEETINGS_KEY, ['meeting-seed-']);
    cleanCollection(FOLLOWUPS_KEY, ['followup-seed-', 'follow-up-seed-']);

    localStorage.setItem(MIGRATION_KEY, 'done');
  } catch (error) {
    console.warn('[HubMind] Legacy local-cache cleanup skipped:', error);
  }
}

function readArray<T>(key: string): T[] {
  runLegacySeedCleanup();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[HubMind] Failed to save local cache ${key}:`, error);
  }
}

/**
 * Online data must come from Firestore. Returning browser cache while online was
 * the root of a class of "deleted item came back after refresh" bugs: an empty
 * or delayed Firestore snapshot could fall back to an older local copy.
 *
 * When the device is genuinely offline, the cache remains useful for continuity.
 */
function readOfflineOnly<T>(key: string): T[] {
  if (typeof navigator !== 'undefined' && navigator.onLine) return [];
  return readArray<T>(key);
}

// Kept for compatibility with existing callers. It intentionally does not seed data.
export function initWorkspaceStorage(_userId = 'default_user') {
  runLegacySeedCleanup();
}

// The default helpers now return empty collections rather than fabricated business data.
// They are retained as compatibility exports for older imports.
export function getDefaultTasks(_userId = 'default_user'): Task[] { return []; }
export function getDefaultProjects(_userId = 'default_user'): Project[] { return []; }
export function getDefaultClients(_userId = 'default_user'): Client[] { return []; }
export function getDefaultMeetings(_userId = 'default_user'): Meeting[] { return []; }

export function getLocalTasks(): Task[] { return readOfflineOnly<Task>(TASKS_KEY); }
export function setLocalTasks(tasks: Task[]) { writeArray(TASKS_KEY, tasks); }
export function upsertLocalTask(task: Task) {
  const current = readArray<Task>(TASKS_KEY);
  const idx = current.findIndex(t => t.id === task.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...task };
  else current.unshift(task);
  setLocalTasks(current);
}
export function deleteLocalTask(taskId: string) {
  setLocalTasks(readArray<Task>(TASKS_KEY).filter(t => t.id !== taskId));
}

export function getLocalProjects(): Project[] { return readOfflineOnly<Project>(PROJECTS_KEY); }
export function setLocalProjects(projects: Project[]) { writeArray(PROJECTS_KEY, projects); }
export function upsertLocalProject(project: Project) {
  const current = readArray<Project>(PROJECTS_KEY);
  const idx = current.findIndex(p => p.id === project.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...project };
  else current.unshift(project);
  setLocalProjects(current);
}
export function deleteLocalProject(projectId: string) {
  setLocalProjects(readArray<Project>(PROJECTS_KEY).filter(p => p.id !== projectId));
}

export function getLocalClients(): Client[] { return readOfflineOnly<Client>(CLIENTS_KEY); }
export function setLocalClients(clients: Client[]) { writeArray(CLIENTS_KEY, clients); }
export function upsertLocalClient(client: Client) {
  const current = readArray<Client>(CLIENTS_KEY);
  const idx = current.findIndex(c => c.id === client.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...client };
  else current.unshift(client);
  setLocalClients(current);
}
export function deleteLocalClient(clientId: string) {
  setLocalClients(readArray<Client>(CLIENTS_KEY).filter(c => c.id !== clientId));
}

export function getLocalMeetings(): Meeting[] { return readOfflineOnly<Meeting>(MEETINGS_KEY); }
export function setLocalMeetings(meetings: Meeting[]) { writeArray(MEETINGS_KEY, meetings); }
export function upsertLocalMeeting(meeting: Meeting) {
  const current = readArray<Meeting>(MEETINGS_KEY);
  const idx = current.findIndex(m => m.id === meeting.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...meeting };
  else current.unshift(meeting);
  setLocalMeetings(current);
}
export function deleteLocalMeeting(meetingId: string) {
  setLocalMeetings(readArray<Meeting>(MEETINGS_KEY).filter(m => m.id !== meetingId));
}

export function getLocalFollowUps(): FollowUp[] { return readOfflineOnly<FollowUp>(FOLLOWUPS_KEY); }
export function setLocalFollowUps(followUps: FollowUp[]) { writeArray(FOLLOWUPS_KEY, followUps); }
export function upsertLocalFollowUp(followUp: FollowUp) {
  const current = readArray<FollowUp>(FOLLOWUPS_KEY);
  const idx = current.findIndex(f => f.id === followUp.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...followUp };
  else current.unshift(followUp);
  setLocalFollowUps(current);
}
export function deleteLocalFollowUp(followUpId: string) {
  setLocalFollowUps(readArray<FollowUp>(FOLLOWUPS_KEY).filter(f => f.id !== followUpId));
}
