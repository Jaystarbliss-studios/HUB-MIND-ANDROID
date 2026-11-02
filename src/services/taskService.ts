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
import { Task, TaskPriority, TaskStatus, User, ResourceVisibility } from '../types';
import { logActivity } from './activityService';
import { isSharedWith } from '../lib/rbac';
import { createNotification } from './notificationService';
import { getUserByUsername, getUserProfile } from './userService';
import { enqueueOfflineAction } from '../lib/offlineQueue';

export async function createTask(params: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignedToUsernameOrId?: string;
  projectId?: string;
  clientId?: string;
  deadline?: string;
  checklist?: { item: string; done: boolean }[];
  currentUser: User;
  visibility?: ResourceVisibility;
}): Promise<Task> {
  const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let assignedTo = params.currentUser.id;
  let assignedToUsername = params.currentUser.username;

  if (params.assignedToUsernameOrId) {
    let targetUser: User | null = null;
    if (params.assignedToUsernameOrId.includes('@') || !params.assignedToUsernameOrId.startsWith('user_')) {
      targetUser = await getUserByUsername(params.assignedToUsernameOrId);
    }
    if (!targetUser) {
      targetUser = await getUserProfile(params.assignedToUsernameOrId);
    }
    if (targetUser) {
      assignedTo = targetUser.id;
      assignedToUsername = targetUser.username;
    }
  }

  const initialStatus: TaskStatus = params.status || (assignedTo !== params.currentUser.id ? 'assigned' : 'in_progress');

  const task: Task = {
    id,
    title: params.title.trim(),
    description: params.description?.trim() || '',
    priority: params.priority || 'medium',
    status: initialStatus,
    assignedTo,
    assignedToUsername,
    createdBy: params.currentUser.id,
    ownerId: params.currentUser.id,
    projectId: params.projectId || undefined,
    clientId: params.clientId || undefined,
    deadline: params.deadline || undefined,
    checklist: params.checklist || [],
    comments: [],
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: assignedTo !== params.currentUser.id ? [assignedTo] : [],
    permissions: assignedTo !== params.currentUser.id ? { [assignedTo]: 'write' } : {},
    createdAt: now,
    updatedAt: now,
  };

  try {
    if (navigator.onLine) {
      await setDoc(doc(db, 'tasks', id), task);
    } else {
      enqueueOfflineAction('task:create', task, id);
    }
  } catch (err) {
    console.warn('[taskService] Failed to setDoc directly, queued offline:', err);
    enqueueOfflineAction('task:create', task, id);
  }

  if (assignedTo !== params.currentUser.id && navigator.onLine) {
    try {
      await createNotification({
        userId: assignedTo,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `@${params.currentUser.username} assigned you: "${task.title}"`,
        resourceType: 'task',
        resourceId: id,
        actionUrl: `/tasks/${id}`,
      });
    } catch {}
  }

  if (navigator.onLine) {
    try {
      await logActivity({
        entityId: id,
        entityType: 'task',
        action: 'created',
        userId: params.currentUser.id,
        username: params.currentUser.username,
        userDisplayName: params.currentUser.displayName,
        details: `Created task "${task.title}" (assigned to @${assignedToUsername})`,
      });
    } catch {}
  }

  return task;
}

export async function acceptTask(taskId: string, currentUser: User): Promise<void> {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found.');

  const task = snap.data() as Task;
  const now = new Date().toISOString();

  await updateDoc(taskRef, {
    status: 'in_progress',
    updatedAt: now,
  });

  if (task.createdBy && task.createdBy !== currentUser.id) {
    await createNotification({
      userId: task.createdBy,
      type: 'task_accepted',
      title: 'Task Accepted',
      message: `@${currentUser.username} accepted task: "${task.title}"`,
      resourceType: 'task',
      resourceId: taskId,
      actionUrl: `/tasks/${taskId}`,
    });
  }

  await logActivity({
    entityId: taskId,
    entityType: 'task',
    action: 'accepted',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Accepted task "${task.title}"`,
  });
}

export async function rejectTask(taskId: string, reason: string, currentUser: User): Promise<void> {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found.');

  const task = snap.data() as Task;
  const now = new Date().toISOString();
  const rejectionReason = reason.trim() || 'No reason provided';

  await updateDoc(taskRef, {
    status: 'rejected',
    rejectionReason,
    updatedAt: now,
  });

  if (task.createdBy && task.createdBy !== currentUser.id) {
    await createNotification({
      userId: task.createdBy,
      type: 'task_rejected',
      title: 'Task Declined',
      message: `@${currentUser.username} declined task "${task.title}". Reason: "${rejectionReason}"`,
      resourceType: 'task',
      resourceId: taskId,
      actionUrl: `/tasks/${taskId}`,
    });
  }

  await logActivity({
    entityId: taskId,
    entityType: 'task',
    action: 'rejected',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Declined task "${task.title}" (${rejectionReason})`,
  });
}

export async function updateTask(
  taskId: string,
  data: Partial<Task>,
  currentUser: User
): Promise<void> {
  const taskRef = doc(db, 'tasks', taskId);
  try {
    if (navigator.onLine) {
      await updateDoc(taskRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    } else {
      enqueueOfflineAction('task:update', data, taskId);
    }
  } catch (err) {
    console.warn('[taskService] Update failed, queuing offline:', err);
    enqueueOfflineAction('task:update', data, taskId);
  }
}

export async function deleteTask(taskId: string, currentUser: User): Promise<void> {
  const taskRef = doc(db, 'tasks', taskId);
  let title = 'Task';
  try {
    const snap = await getDoc(taskRef);
    if (snap.exists()) title = snap.data().title;
  } catch {}

  try {
    if (navigator.onLine) {
      await deleteDoc(taskRef);
    } else {
      enqueueOfflineAction('task:delete', { id: taskId }, taskId);
    }
  } catch (err) {
    console.warn('[taskService] Delete failed, queuing offline:', err);
    enqueueOfflineAction('task:delete', { id: taskId }, taskId);
  }

  if (navigator.onLine) {
    try {
      await logActivity({
        entityId: taskId,
        entityType: 'task',
        action: 'deleted',
        userId: currentUser.id,
        username: currentUser.username,
        userDisplayName: currentUser.displayName,
        details: `Deleted task "${title}"`,
      });
    } catch {}
  }
}

export async function getTaskById(taskId: string): Promise<Task | null> {
  const snap = await getDoc(doc(db, 'tasks', taskId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Task;
}

export function subscribeToTask(taskId: string, callback: (task: Task | null) => void): () => void {
  return onSnapshot(doc(db, 'tasks', taskId), (snap) => {
    if (!snap.exists()) callback(null);
    else callback({ id: snap.id, ...snap.data() } as Task);
  });
}

export function subscribeToTasks(
  currentUser: User,
  callback: (tasks: Task[]) => void,
  projectId?: string
): () => void {
  const q = query(collection(db, 'tasks'), orderBy('updatedAt', 'desc'));

  return onSnapshot(q, (snap) => {
    let tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

    if (currentUser.role !== 'admin') {
      tasks = tasks.filter(task => {
        if (task.ownerId === currentUser.id || task.createdBy === currentUser.id || task.assignedTo === currentUser.id) return true;
        if (task.visibility === 'workspace') return true;
        if (task.visibility === 'shared' && isSharedWith(task.sharedWith, currentUser.id)) return true;
        return false;
      });
    }

    if (projectId) {
      tasks = tasks.filter(t => t.projectId === projectId);
    }

    callback(tasks);
  }, (err) => {
    console.warn('Tasks subscription warning:', err);
  });
}
