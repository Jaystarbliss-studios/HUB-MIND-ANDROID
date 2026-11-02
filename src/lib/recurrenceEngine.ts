import { addDoc, collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { RecurringMeetingTemplate, RecurringTaskTemplate } from '../types';
import { shouldGenerate, occurrenceKey } from './recurrenceRules';

export { shouldGenerate, occurrenceKey } from './recurrenceRules';

export async function materializeRecurringTasksForDate(date = new Date()) {
  const snap = await getDocs(query(collection(db, 'recurringTaskTemplates'), where('active', '==', true)));
  const created: string[] = [];
  for (const templateDoc of snap.docs) {
    const template = templateDoc.data() as RecurringTaskTemplate;
    if (!shouldGenerate(date, template)) continue;
    const key = occurrenceKey(templateDoc.id, date);
    const occurrenceRef = doc(db, 'tasks', `recurring-task-${key}`);
    const wasCreated = await runTransaction(db, async transaction => {
      const existing = await transaction.get(occurrenceRef);
      if (existing.exists()) return false;
      const now = date.toISOString();
      transaction.set(occurrenceRef, { title: template.title, description: template.description, priority: template.priority, status: 'assigned', assignedTo: template.assignedTo, createdBy: template.ownerId, ownerId: template.ownerId, visibility: 'private', checklist: [], comments: [], createdAt: now, updatedAt: now, recurringTemplateId: templateDoc.id, recurrenceKey: key, recurringOccurrenceDate: date.toISOString().slice(0, 10), recurringInstance: true });
      return true;
    });
    if (wasCreated) created.push(occurrenceRef.id);
  }
  return created;
}

export function getMeetingOccurrence(template: RecurringMeetingTemplate, date = new Date()) {
  if (!shouldGenerate(date, template)) return null;
  return { templateId: template.id, occurrenceKey: occurrenceKey(template.id, date), title: template.title, date: date.toISOString(), startTime: template.startTime, endTime: template.endTime, projectId: template.projectId, clientId: template.clientId, ownerId: template.ownerId, attendees: template.attendees || [] };
}
