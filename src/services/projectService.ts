import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Project, User, ResourceVisibility } from '../types';
import { logActivity } from './activityService';
import { isSharedWith } from '../lib/rbac';
import { deleteLocalProject, upsertLocalProject } from '../lib/localWorkspaceStore';
import { enqueueOfflineAction } from '../lib/offlineQueue';

export async function createProject(params: {
  name: string;
  description?: string;
  status?: 'active' | 'completed' | 'on_hold';
  currentUser: User;
  visibility?: ResourceVisibility;
}): Promise<Project> {
  const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const project: Project = {
    id,
    name: params.name.trim(),
    description: params.description?.trim() || '',
    status: params.status || 'active',
    ownerId: params.currentUser.id,
    createdBy: params.currentUser.id,
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: [],
    permissions: {},
    collaboratorIds: [params.currentUser.id],
    createdAt: now,
    updatedAt: now,
  };

  upsertLocalProject(project);

  try {
    if (navigator.onLine) {
      await setDoc(doc(db, 'projects', id), project);
    } else {
      enqueueOfflineAction('project:create', project, id);
    }
  } catch (err) {
    console.warn('[projectService] Failed to setDoc, queuing offline:', err);
    enqueueOfflineAction('project:create', project, id);
  }

  if (navigator.onLine) {
    try {
      await logActivity({
        entityId: id,
        entityType: 'project',
        action: 'created',
        userId: params.currentUser.id,
        username: params.currentUser.username,
        userDisplayName: params.currentUser.displayName,
        details: `Created project "${project.name}"`,
      });
    } catch {}
  }

  return project;
}

export async function updateProject(
  projectId: string,
  data: Partial<Project>,
  currentUser: User
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId);
  try {
    if (navigator.onLine) {
      await updateDoc(projectRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    } else {
      enqueueOfflineAction('project:update', data, projectId);
    }
  } catch (err) {
    console.warn('[projectService] Update failed, queuing offline:', err);
    enqueueOfflineAction('project:update', data, projectId);
  }
}

export async function deleteProject(projectId: string, currentUser: User): Promise<void> {
  const projectRef = doc(db, 'projects', projectId);
  let name = 'Project';
  try {
    const snap = await getDoc(projectRef);
    if (snap.exists()) name = snap.data().name;
  } catch {}

  deleteLocalProject(projectId);

  try {
    if (navigator.onLine) {
      await deleteDoc(projectRef);
    } else {
      enqueueOfflineAction('project:delete', { id: projectId }, projectId);
    }
  } catch (err) {
    console.warn('[projectService] Delete failed, queuing offline:', err);
    enqueueOfflineAction('project:delete', { id: projectId }, projectId);
  }

  if (navigator.onLine) {
    try {
      await logActivity({
        entityId: projectId,
        entityType: 'project',
        action: 'deleted',
        userId: currentUser.id,
        username: currentUser.username,
        userDisplayName: currentUser.displayName,
        details: `Deleted project "${name}"`,
      });
    } catch {}
  }
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, 'projects', projectId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Project;
}

export function subscribeToProject(projectId: string, callback: (proj: Project | null) => void): () => void {
  return onSnapshot(doc(db, 'projects', projectId), (snap) => {
    if (!snap.exists()) callback(null);
    else callback({ id: snap.id, ...snap.data() } as Project);
  });
}

export function subscribeToProjects(
  currentUser: User,
  callback: (projects: Project[]) => void
): () => void {
  const q = query(collection(db, 'projects'), orderBy('updatedAt', 'desc'));

  return onSnapshot(q, (snap) => {
    let projects = snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));

    if (currentUser.role !== 'admin') {
      projects = projects.filter(p => {
        if (p.ownerId === currentUser.id || p.createdBy === currentUser.id) return true;
        if (p.visibility === 'workspace') return true;
        if (p.visibility === 'shared' && isSharedWith(p.sharedWith, currentUser.id)) return true;
        return false;
      });
    }

    callback(projects);
  }, (err) => {
    console.warn('Projects subscription warning:', err);
  });
}
