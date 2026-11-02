import { resolveJessContext } from '../lib/jessContext';

export interface ContextActionSuggestion {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: 'document' | 'client' | 'task' | 'calendar' | 'general';
  icon: string;
}

/**
 * Scans the current active page, DOM content, and route parameters to generate highly relevant AI actions.
 */
export function scanCurrentPageContext(pathname: string): ContextActionSuggestion[] {
  const context = resolveJessContext(pathname);
  const path = pathname.toLowerCase();

  // 1. Document Editor or View Page
  if (context.documentId || path.includes('/documents/') || path === '/documents') {
    return [
      {
        id: 'doc_summarize',
        title: 'Summarize Document',
        description: 'Extract key takeaways and an executive summary',
        prompt: 'Summarize the document on screen into clear, high-impact bullet points and an executive overview.',
        category: 'document',
        icon: 'FileText',
      },
      {
        id: 'doc_action_items',
        title: 'Extract Action Items',
        description: 'Turn document decisions into task list',
        prompt: 'Analyze this document, extract all key action points, and create organized task items for each.',
        category: 'document',
        icon: 'CheckSquare',
      },
      {
        id: 'doc_polish_tone',
        title: 'Polish & Refine Style',
        description: 'Improve tone, formatting, and grammar',
        prompt: 'Review the document text on screen, polish the grammar, refine the professional tone, and enhance readability.',
        category: 'document',
        icon: 'Wand2',
      },
      {
        id: 'doc_share_team',
        title: 'Share with Teammates',
        description: 'Send direct link or briefing note',
        prompt: 'Generate a direct share link for this document and help me share it with team members.',
        category: 'document',
        icon: 'Share2',
      },
    ];
  }

  // 2. Client Profile or Client List
  if (context.clientId || path.includes('/clients/') || path === '/clients') {
    return [
      {
        id: 'client_draft_email',
        title: 'Draft Follow-Up Email',
        description: 'Compose a tailored follow-up or proposal email',
        prompt: 'Draft a warm, professional follow-up email for this client referencing our latest discussion points.',
        category: 'client',
        icon: 'Mail',
      },
      {
        id: 'client_meeting',
        title: 'Schedule Client Meeting',
        description: 'Book a calendar slot and agenda',
        prompt: 'Help me schedule an upcoming review meeting with this client on the calendar with a structured agenda.',
        category: 'client',
        icon: 'Calendar',
      },
      {
        id: 'client_proposal',
        title: 'Draft Client Proposal',
        description: 'Create a new project proposal document',
        prompt: 'Draft a complete institutional proposal document tailored for this client using our official Letterhead template.',
        category: 'client',
        icon: 'FileText',
      },
      {
        id: 'client_history',
        title: 'Summarize Relationship History',
        description: 'Review communications and milestones',
        prompt: 'Summarize the status, milestones, and pending follow-ups for this client.',
        category: 'client',
        icon: 'Users',
      },
    ];
  }

  // 3. Task Management Page
  if (context.taskId || path.includes('/tasks/') || path === '/tasks') {
    return [
      {
        id: 'task_breakdown',
        title: 'Break Down into Steps',
        description: 'Generate sub-tasks and checklist milestones',
        prompt: 'Break down this active task into a sequential, highly executable step-by-step checklist.',
        category: 'task',
        icon: 'CheckSquare',
      },
      {
        id: 'task_reassign',
        title: 'Reassign / Delegate',
        description: 'Assign to a teammate and notify them',
        prompt: 'Help me reassign this task to an appropriate team member and send them a direct briefing note.',
        category: 'task',
        icon: 'Users',
      },
      {
        id: 'task_solution',
        title: 'Draft Task Solution',
        description: 'Propose direct answers or drafting',
        prompt: 'Review the task details on screen and propose a complete solution or draft the required deliverables.',
        category: 'task',
        icon: 'Bot',
      },
      {
        id: 'task_due_reminder',
        title: 'Set Calendar Reminder',
        description: 'Add deadline reminder to Google Calendar',
        prompt: 'Create a Google Calendar reminder for this task deadline.',
        category: 'task',
        icon: 'Calendar',
      },
    ];
  }

  // 4. Calendar & Schedule Page
  if (path.includes('/calendar') || path.includes('/schedules')) {
    return [
      {
        id: 'cal_recurring_routine',
        title: 'Create Repeating Schedule',
        description: 'Add weekly classes, lessons or standups',
        prompt: 'Help me set up a recurring weekly routine for my classes and team meetings.',
        category: 'calendar',
        icon: 'Calendar',
      },
      {
        id: 'cal_share_schedule',
        title: 'Share Weekly Schedule',
        description: 'Send schedule summary to team or WhatsApp',
        prompt: 'Format and share my upcoming weekly schedule with my teammates.',
        category: 'calendar',
        icon: 'Share2',
      },
      {
        id: 'cal_sync_google',
        title: 'Sync with Google Calendar',
        description: 'Verify one-time Google Calendar connection',
        prompt: 'Check my Google Calendar connection status and sync upcoming events.',
        category: 'calendar',
        icon: 'Calendar',
      },
      {
        id: 'cal_meeting_agenda',
        title: 'Prepare Meeting Agenda',
        description: 'Draft discussion points for today’s meetings',
        prompt: 'Review today’s scheduled meetings and generate a concise discussion agenda for each.',
        category: 'calendar',
        icon: 'FileText',
      },
    ];
  }

  // 5. Colleagues & Team Directory Page
  if (path.includes('/colleagues') || path.includes('/people')) {
    return [
      {
        id: 'colleagues_list_team',
        title: 'List Team Members',
        description: 'Review active colleagues and usernames',
        prompt: 'List the active colleagues and team members in our workspace directory.',
        category: 'general',
        icon: 'Users',
      },
      {
        id: 'colleagues_send_info',
        title: 'Send Teammate Briefing',
        description: 'Directly share a note or update',
        prompt: 'Help me compose and send a direct briefing note to a colleague.',
        category: 'general',
        icon: 'Mail',
      },
      {
        id: 'colleagues_share_schedule',
        title: 'Share Weekly Schedule',
        description: 'Send calendar & routine overview',
        prompt: 'Format and share my upcoming weekly schedule with my colleagues.',
        category: 'general',
        icon: 'Share2',
      },
    ];
  }

  // 6. Dashboard / General View
  return [
    {
      id: 'gen_morning_briefing',
      title: 'Daily Operations Briefing',
      description: 'Review urgent tasks, meetings & follow-ups',
      prompt: 'Give me a fast, comprehensive daily briefing on my upcoming tasks, scheduled meetings, and pending follow-ups.',
      category: 'general',
      icon: 'Bot',
    },
    {
      id: 'gen_check_overdue',
      title: 'Check Overdue & Urgent Items',
      description: 'Surface pressing deadlines',
      prompt: 'Check for any overdue tasks or pressing client follow-ups that need my attention right now.',
      category: 'general',
      icon: 'CheckSquare',
    },
    {
      id: 'gen_background_status',
      title: 'Check Background Tasks Status',
      description: 'Review async operations progress',
      prompt: 'Check the status and percentage completion of any active background operations.',
      category: 'general',
      icon: 'Activity',
    },
    {
      id: 'gen_desktop_releases',
      title: 'Desktop Releases & History',
      description: 'Check latest release, installers & updates',
      prompt: 'Check the live GitHub repository Jaystarbliss-studios/HUB-MIND, give me the latest desktop version history, and open the visual updates panel.',
      category: 'general',
      icon: 'Download',
    },
    {
      id: 'gen_search_web',
      title: 'Global Web Search',
      description: 'Search online facts, news & research',
      prompt: 'Search the web globally for current news and updates on Jaystarbliss Studios Hub-Mind.',
      category: 'general',
      icon: 'Globe',
    },
    {
      id: 'gen_draft_document',
      title: 'Draft New Workspace Document',
      description: 'Create memo, report, or lesson plan',
      prompt: 'Help me draft a new workspace document using our official institution templates.',
      category: 'general',
      icon: 'FileText',
    },
  ];
}
