import { collection, doc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface JessQueuedTask {
  id: string;
  title: string;
  description: string;
  taskType: 'document_generation' | 'workspace_audit' | 'batch_schedule' | 'research_report' | 'data_cleanup' | 'custom';
  progress: number;
  stage: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  resultSummary?: string;
  lastError?: string;
  targetId?: string;
  targetType?: string;
  currentStep?: number;
  totalSteps?: number;
  attempt?: number;
  executionLog?: string[];
  payload?: Record<string, any>;
  userId?: string;
}

export type JessTaskStatusEventType =
  | 'hubmind:jess-task-queued'
  | 'hubmind:jess-task-progress'
  | 'hubmind:jess-task-completed'
  | 'hubmind:jess-task-failed'
  | 'hubmind:jess-task-cancelled';

const QUEUE_STORAGE_KEY = 'hubmind_jess_task_queue_v4';
const MAX_TASKS = 50;

class JessBackgroundProcessingQueue {
  private queue = new Map<string, JessQueuedTask>();
  private subscribers = new Set<(tasks: JessQueuedTask[]) => void>();
  private running = new Set<string>();

  constructor() { this.loadQueue(); }

  private loadQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || '[]') as JessQueuedTask[];
      if (Array.isArray(parsed)) parsed.forEach(t => this.queue.set(t.id, t));
    } catch {}
  }

  private persistRemote(task: JessQueuedTask) {
    if (!task.userId) return;
    void setDoc(doc(db, 'users', task.userId, 'jessTasks', task.id), task, { merge: true }).catch(() => {});
  }

  private persistQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.getAllTasks().slice(0, MAX_TASKS)));
    } catch {}
    this.notifySubscribers();
    for (const task of this.queue.values()) this.persistRemote(task);
  }

  private emit(eventType: JessTaskStatusEventType, task: JessQueuedTask) {
    if (typeof window !== 'undefined') {
      const detail = { task, queue: this.getAllTasks() };
      window.dispatchEvent(new CustomEvent(eventType, { detail }));
      window.dispatchEvent(new CustomEvent('hubmind:jess-queue-updated', { detail }));
    }
  }

  private notifySubscribers() {
    const tasks = this.getAllTasks();
    this.subscribers.forEach(fn => fn(tasks));
  }

  public subscribe(fn: (tasks: JessQueuedTask[]) => void) {
    this.subscribers.add(fn);
    fn(this.getAllTasks());
    return () => this.subscribers.delete(fn);
  }

  public async hydrateUserTasks(userId: string) {
    try {
      const snap = await getDocs(query(collection(db, 'users', userId, 'jessTasks'), limit(100)));
      snap.docs.forEach(d => {
        const remote = d.data() as JessQueuedTask;
        const local = this.queue.get(remote.id);
        if (!local || new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
          this.queue.set(remote.id, remote);
        }
      });
      this.persistQueue();
    } catch {}
    return this.getAllTasks();
  }

  public async resumePersistedTasks(
    userId: string,
    executor: (task: JessQueuedTask, step: any, index: number, total: number) => Promise<void>
  ) {
    const tasks = await this.hydrateUserTasks(userId);
    for (const task of tasks.filter(t =>
      t.userId === userId &&
      t.status === 'in_progress' &&
      Array.isArray(t.payload?.steps) &&
      !this.running.has(t.id)
    )) {
      void this.runPersistedTask(task, executor);
    }
  }

  private async runPersistedTask(
    task: JessQueuedTask,
    executor: (task: JessQueuedTask, step: any, index: number, total: number) => Promise<void>
  ) {
    if (this.running.has(task.id)) return;
    this.running.add(task.id);
    const steps = task.payload?.steps as any[];
    const completed = Math.min(steps.length, Math.max(0, Number(task.currentStep || 0)));
    try {
      for (let i = completed; i < steps.length; i++) {
        if (this.queue.get(task.id)?.status === 'cancelled') return;
        await this.executeWithRetries(task, steps[i], i, steps.length, executor);
        this.updateTaskProgress(task.id, Math.round(((i + 1) / steps.length) * 95), `Completed: ${String(steps[i].label || steps[i].tool)} (${i + 1}/${steps.length})`, undefined, i + 1, 0);
      }
      this.updateTaskProgress(task.id, 100, 'Completed successfully.', 'All executable background steps completed.', steps.length, 0);
    } catch (err: any) {
      this.failTask(task.id, err?.message || 'Background task failed during execution.');
    } finally {
      this.running.delete(task.id);
    }
  }

  private async executeWithRetries(
    task: JessQueuedTask,
    step: any,
    index: number,
    total: number,
    executor: (task: JessQueuedTask, step: any, index: number, total: number) => Promise<void>
  ) {
    const maxAttempts = Math.max(1, Math.min(7, Number(step.maxAttempts || task.payload?.maxAttempts || 4)));
    let lastError = 'Unknown background step failure.';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const current = this.queue.get(task.id);
      if (!current || current.status === 'cancelled') return;
      this.updateTaskProgress(
        task.id,
        Math.max(1, Math.round((index / total) * 95)),
        attempt === 1 ? `Working: ${String(step.label || step.tool)} (${index + 1}/${total})` : `Retrying ${String(step.label || step.tool)} (attempt ${attempt}/${maxAttempts})`,
        undefined,
        index,
        attempt
      );
      try {
        await executor(task, step, index, total);
        return;
      } catch (err: any) {
        lastError = err?.message || 'Background step failed.';
        this.updateTaskProgress(task.id, Math.max(1, Math.round((index / total) * 95)), `Step failed; retrying: ${String(step.label || step.tool)}`, undefined, index, attempt, lastError);
        if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
      }
    }
    throw new Error(`${String(step.label || step.tool)} failed after ${maxAttempts} attempts: ${lastError}`);
  }

  public getAllTasks() {
    return Array.from(this.queue.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getActiveTasks() {
    return this.getAllTasks().filter(t => t.status === 'in_progress' || t.status === 'queued');
  }

  public getTask(id: string, userId?: string) {
    const task = this.queue.get(id);
    if (!task || (userId && task.userId !== userId)) return undefined;
    return task;
  }

  public getTasksForUser(userId: string) { return this.getAllTasks().filter(t => t.userId === userId); }
  public getActiveTasksForUser(userId: string) { return this.getTasksForUser(userId).filter(t => t.status === 'in_progress' || t.status === 'queued'); }

  public enqueueTask(params: {
    title: string;
    description?: string;
    taskType?: JessQueuedTask['taskType'];
    priority?: JessQueuedTask['priority'];
    payload?: Record<string, any>;
    onComplete?: (task: JessQueuedTask) => Promise<{ summary: string; targetId?: string; targetType?: string }>;
    userId?: string;
  }): JessQueuedTask {
    const now = new Date().toISOString();
    const id = `jtask_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: JessQueuedTask = {
      id,
      title: params.title,
      description: params.description || '',
      taskType: params.taskType || 'custom',
      progress: 0,
      stage: 'Queued for background execution.',
      status: 'queued',
      priority: params.priority || 'normal',
      startedAt: now,
      updatedAt: now,
      totalSteps: Array.isArray(params.payload?.steps) ? params.payload!.steps.length : undefined,
      currentStep: 0,
      attempt: 0,
      executionLog: [],
      payload: params.payload,
      userId: params.userId,
    };
    this.queue.set(id, task);
    this.persistQueue();
    this.emit('hubmind:jess-task-queued', task);

    if (params.onComplete) {
      void this.runTask(task, params.onComplete);
    }
    return task;
  }

  private async runTask(task: JessQueuedTask, onComplete: (task: JessQueuedTask) => Promise<{ summary: string; targetId?: string; targetType?: string }>) {
    if (this.running.has(task.id)) return;
    this.running.add(task.id);
    this.updateTaskProgress(task.id, 1, 'Background task accepted; starting execution.', undefined, 0, 1);
    try {
      const result = await onComplete(task);
      const current = this.queue.get(task.id);
      if (!current || current.status === 'cancelled' || current.status === 'failed') return;
      current.targetId = result.targetId;
      current.targetType = result.targetType;
      this.updateTaskProgress(task.id, 100, 'Completed successfully.', result.summary, current.totalSteps, 0);
    } catch (err: any) {
      this.failTask(task.id, err?.message || 'Task failed during execution.');
    } finally {
      this.running.delete(task.id);
    }
  }

  public updateTaskProgress(
    id: string,
    progress: number,
    stage?: string,
    resultSummary?: string,
    currentStep?: number,
    attempt?: number,
    lastError?: string
  ) {
    const task = this.queue.get(id);
    if (!task) return;
    const now = new Date().toISOString();
    task.progress = Math.min(100, Math.max(0, Math.round(progress)));
    task.status = task.progress >= 100 ? 'completed' : 'in_progress';
    task.stage = stage || task.stage;
    task.resultSummary = resultSummary || task.resultSummary;
    if (currentStep !== undefined) task.currentStep = currentStep;
    if (attempt !== undefined) task.attempt = attempt;
    if (lastError) task.lastError = lastError;
    task.updatedAt = now;
    task.executionLog = [...(task.executionLog || []), `${now} — ${task.stage}`].slice(-20);
    if (task.status === 'completed') task.completedAt = now;
    this.persistQueue();
    this.emit(task.status === 'completed' ? 'hubmind:jess-task-completed' : 'hubmind:jess-task-progress', task);
  }

  public failTask(id: string, errorMessage: string) {
    const task = this.queue.get(id);
    if (!task) return;
    task.status = 'failed';
    task.lastError = errorMessage;
    task.stage = `Failed: ${errorMessage}`;
    task.failedAt = new Date().toISOString();
    task.updatedAt = task.failedAt;
    task.executionLog = [...(task.executionLog || []), `${task.failedAt} — ${task.stage}`].slice(-20);
    this.persistQueue();
    this.emit('hubmind:jess-task-failed', task);
  }

  public cancelTask(id: string) {
    const task = this.queue.get(id);
    if (!task) return;
    task.status = 'cancelled';
    task.stage = 'Cancelled by user or system.';
    task.updatedAt = new Date().toISOString();
    this.persistQueue();
    this.emit('hubmind:jess-task-cancelled', task);
  }

  public getActiveTasksSummary(userId?: string) { return this.getQueueSummaryForPrompt(userId); }

  public getQueueSummaryForPrompt(userId?: string) {
    const scoped = userId ? this.getTasksForUser(userId) : this.getAllTasks();
    const active = scoped.filter(t => t.status === 'in_progress' || t.status === 'queued');
    const recent = scoped.filter(t => t.status === 'completed').slice(0, 5);
    if (!active.length && !recent.length) return 'Background processing queue is currently idle (0 active jobs).';
    const lines: string[] = [];
    if (active.length) {
      lines.push('ACTIVE BACKGROUND QUEUE JOBS:');
      active.forEach(t => lines.push(`• [${t.progress}% complete | step ${t.currentStep || 0}/${t.totalSteps || '?'}] "${t.title}" — ${t.stage}`));
    }
    if (recent.length) {
      lines.push('RECENTLY COMPLETED QUEUE JOBS:');
      recent.forEach(t => lines.push(`• [100% complete] "${t.title}" — ${t.resultSummary || 'Completed'}`));
    }
    return lines.join('\n');
  }
}
export const jessBackgroundTasks = new JessBackgroundProcessingQueue();
export type JessBackgroundTask = JessQueuedTask;
