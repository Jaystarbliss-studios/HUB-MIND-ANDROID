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
import { 
  Meeting, 
  RecurringMeetingTemplate, 
  RecurringTaskTemplate, 
  User, 
  ResourceVisibility 
} from '../types';
import { logActivity } from './activityService';
import { isSharedWith } from '../lib/rbac';

export async function createMeeting(params: {
  title: string;
  date: string;
  endDate?: string;
  location?: string;
  meetingLink?: string;
  projectId?: string;
  clientId?: string;
  taskId?: string;
  documentId?: string;
  attendees?: string[];
  notesRaw?: string;
  currentUser: User;
  visibility?: ResourceVisibility;
  externalProvider?: 'google';
  externalEventId?: string;
}): Promise<Meeting> {
  // Check for deduplication if externalEventId provided
  if (params.externalEventId) {
    const existingQ = query(
      collection(db, 'meetings'),
      where('externalEventId', '==', params.externalEventId)
    );
    const snap = await getDocs(existingQ);
    if (!snap.empty) {
      const existingId = snap.docs[0].id;
      const meetingRef = doc(db, 'meetings', existingId);
      await updateDoc(meetingRef, {
        title: params.title.trim(),
        date: params.date,
        endDate: params.endDate,
        location: params.location,
        updatedAt: new Date().toISOString(),
      });
      return { id: existingId, ...snap.docs[0].data(), title: params.title.trim(), date: params.date } as Meeting;
    }
  }

  const id = `meet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const meeting: Meeting = {
    id,
    title: params.title.trim(),
    status: 'scheduled',
    date: params.date,
    endDate: params.endDate,
    location: params.location,
    meetingLink: params.meetingLink,
    projectId: params.projectId,
    clientId: params.clientId,
    taskId: params.taskId,
    documentId: params.documentId,
    attendees: params.attendees || [params.currentUser.displayName || params.currentUser.username],
    notesRaw: params.notesRaw || '',
    decisions: [],
    openQuestions: [],
    actionPoints: [],
    generatedDocs: [],
    ownerId: params.currentUser.id,
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: [],
    permissions: {},
    externalProvider: params.externalProvider,
    externalEventId: params.externalEventId,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'meetings', id), meeting);

  await logActivity({
    entityId: id,
    entityType: 'meeting',
    action: 'created',
    userId: params.currentUser.id,
    username: params.currentUser.username,
    userDisplayName: params.currentUser.displayName,
    details: `Scheduled meeting "${meeting.title}" for ${new Date(meeting.date).toLocaleString()}`,
  });

  return meeting;
}

export async function updateMeeting(
  meetingId: string,
  data: Partial<Meeting>,
  currentUser: User
): Promise<void> {
  const docRef = doc(db, 'meetings', meetingId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteMeeting(meetingId: string, currentUser: User): Promise<void> {
  const docRef = doc(db, 'meetings', meetingId);
  const snap = await getDoc(docRef);
  const title = snap.exists() ? snap.data().title : 'Meeting';

  await deleteDoc(docRef);

  await logActivity({
    entityId: meetingId,
    entityType: 'meeting',
    action: 'deleted',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Deleted meeting "${title}"`,
  });
}

export function subscribeToMeetings(
  currentUser: User,
  callback: (meetings: Meeting[]) => void,
  projectId?: string
): () => void {
  const q = query(collection(db, 'meetings'), orderBy('date', 'asc'));

  return onSnapshot(q, (snap) => {
    let meetings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Meeting));

    if (currentUser.role !== 'admin') {
      meetings = meetings.filter(m => {
        if (m.ownerId === currentUser.id) return true;
        if (m.visibility === 'workspace') return true;
        if (m.visibility === 'shared' && isSharedWith(m.sharedWith, currentUser.id)) return true;
        return false;
      });
    }

    if (projectId) {
      meetings = meetings.filter(m => m.projectId === projectId);
    }

    callback(meetings);
  }, (err) => {
    console.warn('Meetings subscription warning:', err);
  });
}

// Recurring Meeting Templates Engine
export async function createRecurringMeetingTemplate(
  template: Omit<RecurringMeetingTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  currentUser: User
): Promise<RecurringMeetingTemplate> {
  const id = `rm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const data: RecurringMeetingTemplate = {
    ...template,
    id,
    ownerId: currentUser.id,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'recurringMeetingTemplates', id), data);
  return data;
}

export function subscribeToRecurringMeetingTemplates(
  currentUser: User,
  callback: (templates: RecurringMeetingTemplate[]) => void
): () => void {
  const q = query(collection(db, 'recurringMeetingTemplates'), orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snap) => {
    let templates = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringMeetingTemplate));
    if (currentUser.role !== 'admin') {
      templates = templates.filter(t => t.ownerId === currentUser.id || t.visibility === 'workspace');
    }
    callback(templates);
  }, (err) => {
    console.warn('Recurring templates subscription warning:', err);
  });
}

// Generate virtual instances for recurring meetings on a target date range
export function generateOccurrencesForDate(
  template: RecurringMeetingTemplate,
  targetDate: Date
): Meeting | null {
  if (!template.active) return null;
  const targetDay = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

  if (!template.daysOfWeek.includes(targetDay)) return null;

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  if (template.startDate && dateStr < template.startDate) return null;
  if (template.endDate && dateStr > template.endDate) return null;

  const startIso = `${dateStr}T${template.startTime || '09:00'}:00.000Z`;
  const endIso = template.endTime ? `${dateStr}T${template.endTime}:00.000Z` : undefined;

  return {
    id: `rec_${template.id}_${dateStr}`,
    title: template.title,
    status: 'scheduled',
    date: startIso,
    endDate: endIso,
    location: template.location,
    meetingLink: template.meetingLink,
    projectId: template.projectId,
    clientId: template.clientId,
    attendees: template.attendees || [],
    notesRaw: template.description || '',
    decisions: [],
    openQuestions: [],
    actionPoints: [],
    generatedDocs: [],
    ownerId: template.ownerId,
    visibility: template.visibility || 'workspace',
    createdAt: template.createdAt,
  };
}
