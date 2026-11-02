export type Role = 'admin' | 'staff';
export type UserStatus = 'invited' | 'active' | 'suspended' | 'inactive';
export type Visibility = 'private' | 'shared' | 'workspace';
export type ResourceVisibility = Visibility;
export type ResourcePermission = 'read' | 'write';
export type SharePermission = ResourcePermission;
export type ShareStatus = 'pending' | 'active' | 'revoked';
export type ResourceType = 'document' | 'task' | 'project' | 'meeting' | 'client' | 'followUp' | 'followup' | 'knowledge' | 'report' | 'user' | 'share';

export interface DocumentVersion {
  id: string;
  documentId?: string;
  version?: number;
  versionNumber?: number;
  title?: string;
  content: string;
  createdAt?: string;
  createdBy?: string;
  createdByName?: string;
  savedBy?: string;
  savedByUsername?: string;
  savedAt?: string;
  changeSummary?: string;
}

export interface ResourceAccess {
  ownerId?: string;
  visibility?: Visibility;
  sharedWith?: Record<string, ResourcePermission> | string[];
  permissions?: Record<string, ResourcePermission>;
  collaboratorIds?: string[];
}

export interface User {
  id: string;
  username: string;
  name?: string;
  displayName?: string;
  preferredName?: string;
  email: string;
  role: Role;
  status: UserStatus;
  phone?: string;
  photoUrl?: string;
  defaultVisibility?: Visibility;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  lastSeenAt?: string;
  invitationId?: string;
}

export interface Invitation {
  id: string;
  username: string;
  displayName: string;
  email: string;
  phone?: string;
  role: 'staff';
  status: 'invited' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedUid?: string;
}
export type UserInvitation = Invitation;

export interface Connection {
  id: string;
  requesterId: string;
  requesterUsername?: string;
  requesterDisplayName?: string;
  requesterPhotoUrl?: string;
  recipientId: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
  recipientPhotoUrl?: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  createdAt: string;
  updatedAt: string;
}
export type UserConnection = Connection;

export interface ShareRecord {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceTitle?: string;
  ownerId: string;
  ownerName?: string;
  recipientUserId: string;
  recipientName?: string;
  recipientUsername?: string;
  permission: ResourcePermission;
  status: ShareStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
export type ResourceShare = ShareRecord;

export type PaperSizeOption = 'a4' | 'letter' | 'legal';
export type OrientationOption = 'portrait' | 'landscape';
export type MarginOption = 'normal' | 'narrow' | 'moderate' | 'wide' | 'custom';
export type ClientType = 'school' | 'parent' | 'partner';
export type ClientStatus = 'active' | 'lead' | 'inactive';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'draft' | 'assigned' | 'accepted' | 'in_progress' | 'submitted' | 'under_review' | 'completed' | 'rejected' | 'archived' | 'pending';

export interface Client extends ResourceAccess {
  projectId?: string;
  id: string;
  name: string;
  type: ClientType;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status: ClientStatus;
  createdAt: string;
  photoUrl?: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Task extends ResourceAccess {
  projectId?: string;
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: string;
  assignedToUsername?: string;
  createdBy: string;
  clientId?: string;
  deadline?: string;
  checklist: { item: string; done: boolean }[];
  comments: { userId: string; username?: string; text: string; timestamp: string }[];
  images?: string[];
  createdAt: string;
  updatedAt: string;
  rejectedReason?: string;
  rejectionReason?: string;
  recurrenceKey?: string;
  recurringTemplateId?: string;
}

export type MeetingStatus = 'scheduled' | 'in_session' | 'completed' | 'canceled' | 'rescheduled';

export interface Meeting extends ResourceAccess {
  id: string;
  title?: string;
  status?: MeetingStatus;
  projectId?: string;
  taskId?: string;
  documentId?: string;
  decisions?: string[];
  openQuestions?: string[];
  clientId?: string;
  attendees: string[];
  date: string;
  endDate?: string;
  location?: string;
  meetingLink?: string;
  notesRaw: string;
  aiSummary?: string;
  actionPoints: { text: string; assignedTo: string; deadline: string }[];
  generatedDocs: { type: string; fileRef: string; createdAt: string }[];
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  externalProvider?: string;
  externalEventId?: string;
}

export interface DocumentInfo extends ResourceAccess {
  projectId?: string;
  id: string;
  title: string;
  category: string;
  templateId?: string;
  type?: 'internal' | 'external';
  clientId?: string;
  fileRef?: string;
  version?: number;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
  lastSavedAt?: string;
  lastModifiedBy?: string;
  content?: string;
  pageSize?: PaperSizeOption;
  orientation?: OrientationOption;
  marginOption?: MarginOption;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title?: string;
  message: string;
  read: boolean;
  createdAt: string;
  resourceType?: ResourceType;
  resourceId?: string;
  actionUrl?: string;
}

export interface InboxItem {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  status: 'unprocessed' | 'processed';
  convertedTo: { type: 'task' | 'meeting' | 'client' | 'reminder' | 'archived' | 'knowledge'; id: string } | null;
}

export type FollowUpStatus = 'scheduled' | 'due' | 'contacted' | 'waiting' | 'resolved' | 'cancelled';

export interface FollowUp extends ResourceAccess {
  id: string;
  title: string;
  person?: string;
  clientId?: string;
  relatedTaskId?: string;
  relatedProjectId?: string;
  reason?: string;
  dueAt: string;
  status: FollowUpStatus;
  priority: TaskPriority;
  lastContactAt?: string;
  nextContactAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringMeetingTemplate {
  id: string;
  title: string;
  type: 'class' | 'meeting' | 'appointment' | 'school_event' | 'other';
  description?: string;
  daysOfWeek: number[];
  frequency: 'daily' | 'weekly' | 'monthly';
  startTime: string;
  endTime?: string;
  startDate: string;
  endDate?: string;
  dayOfMonth?: number;
  location?: string;
  meetingLink?: string;
  clientId?: string;
  projectId?: string;
  attendees?: string[];
  ownerId: string;
  visibility?: Visibility;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTaskTemplate {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  assignedTo: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[];
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate?: string;
  endDate?: string;
  lastGeneratedDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  ownerId: string;
}

export interface Project extends ResourceAccess {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'on_hold';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface Knowledge extends ResourceAccess {
  id: string;
  title: string;
  content: string;
  category: 'sop' | 'template' | 'faq' | 'lesson';
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id?: string;
  entityId: string;
  entityType: ResourceType | string;
  action: string;
  userId: string;
  username?: string;
  userDisplayName?: string;
  details: string;
  createdAt: string;
}

export type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type JessState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'muted' | 'error';

export interface MessageActionPayload {
  type: 'delete_document' | 'share_document' | 'set_preferred_name';
  documentId?: string;
  documentTitle?: string;
  confirmed?: boolean;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'executed';
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri?: string; title?: string; placeAnswerSources?: { reviewSnippets?: { snippet?: string; reviewUri?: string }[] } };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'jess';
  text: string;
  timestamp: string;
  parentMessageId?: string | null;
  isStreaming?: boolean;
  audioBase64?: string;
  imageUrl?: string;
  tag?: string;
  actionPayload?: MessageActionPayload;
  groundingChunks?: GroundingChunk[];
}

export type MemoryCategory = 'preference' | 'workflow' | 'fact' | 'instruction' | 'habit' | 'interaction' | 'personal' | 'business';

export interface UserMemory {
  id: string;
  userId: string;
  key?: string;
  content: string;
  category: MemoryCategory;
  source?: 'voice' | 'chat' | 'system' | 'explicit';
  importance?: number | 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
  lastReferencedAt?: string;
}

export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system';
  preferredTone?: string;
  defaultDocumentFormat?: string;
  voiceAutoPlay?: boolean;
  transcriptAlwaysVisible?: boolean;
  notifyOnShare?: boolean;
  [key: string]: any;
}

export interface MemoryItem {
  id: string;
  category: 'personal' | 'business' | 'health' | 'reminder' | 'confidential';
  content: string;
  timestamp: string;
  importance: 'high' | 'medium' | 'low';
}

export interface WorldPulseItem {
  region: string;
  title: string;
  summary: string;
  jessNote: string;
  id: string;
}

export interface AudioSettings {
  voice: string;
  micGain: number;
  outputVolume: number;
  pushToTalk: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

export interface StoredConversation {
  id: string;
  userId?: string;
  title: string;
  summary?: string;
  messageCount: number;
  messages: ChatMessage[];
  rootMessageId?: string | null;
  activeLeafId?: string | null;
  createdAt: string;
  updatedAt: string;
  isLiveSession?: boolean;
}

export interface ScenarioPrompt {
  id: string;
  title: string;
  badge: string;
  description: string;
  prompt: string;
  category: 'strategy' | 'negotiation' | 'wellness' | 'culture' | 'humor';
}
