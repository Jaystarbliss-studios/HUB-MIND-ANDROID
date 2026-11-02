import { materializeRecurringTasksForDate } from './recurrenceEngine';

/** @deprecated Use recurrenceEngine.materializeRecurringTasksForDate directly. */
export async function processRecurringTasks(date = new Date()) {
  return materializeRecurringTasksForDate(date);
}
