import React, { useMemo, useState } from 'react';
import { X, Search, FileText, FilePlus2, FileSignature, FileArchive, FileCheck, FileCog, Briefcase, Calculator, Building, BookOpen, GraduationCap, BarChart3, ClipboardList, Mail, CalendarDays } from 'lucide-react';
import { getOfficialLetterheadHTML } from './OfficialLetterhead';

type Template = { id: string; name: string; description: string; icon: React.ElementType; category: string; content: string };

const FIELD = (name: string) => `{{${name}}}`;
const letterhead = getOfficialLetterheadHTML();

const templates: Template[] = [
  {
    id: 'blank', name: 'Blank Document', description: 'Start from a completely blank A4 page.', icon: FilePlus2, category: 'General', content: ''
  },
  {
    id: 'contract', name: 'Contract Agreement', description: 'Professional service or business agreement with reusable clauses.', icon: FileSignature, category: 'Business',
    content: letterhead + `<h1 style="text-align:center">CONTRACT AGREEMENT</h1>
<p><strong>Effective Date:</strong> ${FIELD('Effective Date')}</p>
<p>This Agreement is made between <strong>${FIELD('First Party')}</strong> and <strong>${FIELD('Second Party')}</strong>.</p>
<h2>1. Purpose and Scope</h2><p>The parties agree to the following services, deliverables and responsibilities: ${FIELD('Scope of Work')}</p>
<h2>2. Fees and Payment</h2><p>Total consideration: <strong>${FIELD('Amount')}</strong>. Payment terms: ${FIELD('Payment Terms')}.</p>
<h2>3. Responsibilities</h2><p>Each party shall perform the responsibilities stated in this Agreement and provide information reasonably required for delivery.</p>
<h2>4. Duration and Termination</h2><p>This Agreement begins on ${FIELD('Start Date')} and continues until ${FIELD('End Date')}. Either party may terminate in accordance with the agreed notice and outstanding obligations.</p>
<h2>5. Confidentiality</h2><p>Confidential information received in connection with this Agreement shall be treated as confidential except where disclosure is required by law or expressly authorised.</p>
<h2>6. Revisions, Changes and Approval</h2><p>Changes to the agreed scope or deliverables should be recorded and approved by both parties before implementation.</p>
<h2>7. Dispute Resolution</h2><p>The parties will first seek to resolve disputes through good-faith discussion before pursuing other remedies available under applicable law.</p>
<h2>8. Entire Agreement</h2><p>This document represents the agreement between the parties concerning the stated scope and supersedes prior understandings relating to it.</p>
<h2>9. Signatures</h2>
<table><tr><td><strong>FIRST PARTY</strong><br>Name: ${FIELD('First Party Name')}<br>Signature: ____________________<br>Date: ${FIELD('Signature Date')}</td><td><strong>SECOND PARTY</strong><br>Name: ${FIELD('Second Party Name')}<br>Signature: ____________________<br>Date: ${FIELD('Signature Date')}</td></tr></table>`
  },
  {
    id: 'report', name: 'Report', description: 'Professional report with findings, recommendations and action points.', icon: FileText, category: 'Management',
    content: letterhead + `<h1 style="text-align:center">REPORT</h1>
<p><strong>Report Title:</strong> ${FIELD('Report Title')}<br><strong>Prepared for:</strong> ${FIELD('Prepared For')}<br><strong>Prepared by:</strong> ${FIELD('Prepared By')}<br><strong>Date:</strong> ${FIELD('Date')}</p>
<h2>1. Executive Summary</h2><p>${FIELD('Executive Summary')}</p>
<h2>2. Background / Context</h2><p>${FIELD('Background')}</p>
<h2>3. Findings</h2><ol><li>${FIELD('Finding 1')}</li><li>${FIELD('Finding 2')}</li><li>${FIELD('Finding 3')}</li></ol>
<h2>4. Analysis</h2><p>${FIELD('Analysis')}</p>
<h2>5. Recommendations</h2><ol><li>${FIELD('Recommendation 1')}</li><li>${FIELD('Recommendation 2')}</li><li>${FIELD('Recommendation 3')}</li></ol>
<h2>6. Action Items</h2><table><tr><th>Action</th><th>Responsible Person</th><th>Due Date</th></tr><tr><td>${FIELD('Action')}</td><td>${FIELD('Responsible Person')}</td><td>${FIELD('Due Date')}</td></tr></table>
<h2>7. Conclusion</h2><p>${FIELD('Conclusion')}</p>`
  },
  {
    id: 'certificate', name: 'Certificate', description: 'Formal certificate layout for recognition, completion or achievement.', icon: GraduationCap, category: 'Education',
    content: letterhead + `<div style="text-align:center">
<h1>CERTIFICATE</h1><p><strong>OF ${FIELD('Certificate Type')}</strong></p>
<p>This is to certify that</p><h2>${FIELD('Recipient Name')}</h2>
<p>has successfully ${FIELD('Achievement Statement')}</p>
<p><strong>Programme / Course:</strong> ${FIELD('Programme')}<br><strong>Duration:</strong> ${FIELD('Duration')}<br><strong>Date Issued:</strong> ${FIELD('Date Issued')}</p>
<table style="width:100%"><tr><td style="text-align:center">________________________<br>${FIELD('Authorized Signatory')}<br>${FIELD('Signatory Role')}</td><td style="text-align:center">________________________<br>Official Stamp</td></tr></table>
</div>`
  },
  {
    id: 'performance', name: 'Performance Analysis', description: 'Structured staff, student, project or business performance review.', icon: BarChart3, category: 'Management',
    content: letterhead + `<h1 style="text-align:center">PERFORMANCE ANALYSIS</h1>
<p><strong>Subject:</strong> ${FIELD('Subject')} &nbsp; <strong>Period:</strong> ${FIELD('Review Period')}</p>
<h2>1. Overview</h2><p>${FIELD('Overview')}</p><h2>2. Key Responsibilities / Objectives</h2><ul><li>${FIELD('Objective 1')}</li><li>${FIELD('Objective 2')}</li><li>${FIELD('Objective 3')}</li></ul>
<h2>3. Performance Assessment</h2><table><tr><th>Area</th><th>Assessment</th><th>Notes</th></tr><tr><td>Quality</td><td>${FIELD('Quality Rating')}</td><td>${FIELD('Quality Notes')}</td></tr><tr><td>Timeliness</td><td>${FIELD('Timeliness Rating')}</td><td>${FIELD('Timeliness Notes')}</td></tr><tr><td>Communication</td><td>${FIELD('Communication Rating')}</td><td>${FIELD('Communication Notes')}</td></tr></table>
<h2>4. Strengths</h2><p>${FIELD('Strengths')}</p><h2>5. Areas for Improvement</h2><p>${FIELD('Improvements')}</p><h2>6. Action Plan</h2><ol><li>${FIELD('Action 1')}</li><li>${FIELD('Action 2')}</li></ol><h2>7. Overall Assessment</h2><p>${FIELD('Overall Assessment')}</p><p><strong>Prepared by:</strong> ${FIELD('Prepared By')} &nbsp; <strong>Date:</strong> ${FIELD('Date')}</p>`
  },
  {
    id: 'communique', name: 'Communiqué', description: 'Formal institutional announcement or post-meeting communiqué.', icon: FileCog, category: 'Communication',
    content: letterhead + `<h1 style="text-align:center">OFFICIAL COMMUNIQUÉ</h1><p><strong>Date:</strong> ${FIELD('Date')}<br><strong>Subject:</strong> ${FIELD('Subject')}</p><p>To: ${FIELD('Audience')}</p><h2>Purpose</h2><p>${FIELD('Purpose')}</p><h2>Key Matters / Decisions</h2><ol><li>${FIELD('Decision 1')}</li><li>${FIELD('Decision 2')}</li><li>${FIELD('Decision 3')}</li></ol><h2>Required Actions</h2><p>${FIELD('Required Actions')}</p><p>For further information, please contact the appropriate office.</p><p><strong>Issued by:</strong> ${FIELD('Issued By')}</p>`
  },
  {
    id: 'proposal', name: 'Project Proposal', description: 'Client-ready proposal with scope, deliverables, timeline and pricing.', icon: Briefcase, category: 'Business',
    content: letterhead + `<h1 style="text-align:center">PROJECT PROPOSAL</h1><p><strong>Prepared for:</strong> ${FIELD('Client')}<br><strong>Prepared by:</strong> ${FIELD('Prepared By')}<br><strong>Date:</strong> ${FIELD('Date')}</p><h2>1. Executive Summary</h2><p>${FIELD('Executive Summary')}</p><h2>2. Objectives</h2><p>${FIELD('Objectives')}</p><h2>3. Scope & Deliverables</h2><ul><li>${FIELD('Deliverable 1')}</li><li>${FIELD('Deliverable 2')}</li><li>${FIELD('Deliverable 3')}</li></ul><h2>4. Timeline</h2><p>${FIELD('Timeline')}</p><h2>5. Fees & Payment Terms</h2><p>${FIELD('Fees and Payment Terms')}</p><h2>6. Acceptance</h2><p>${FIELD('Acceptance Terms')}</p>`
  },
  {
    id: 'meeting', name: 'Meeting Minutes', description: 'Clean record of attendees, agenda, decisions and action items.', icon: CalendarDays, category: 'Management',
    content: letterhead + `<h1 style="text-align:center">MEETING MINUTES</h1><p><strong>Date:</strong> ${FIELD('Date')} &nbsp; <strong>Time:</strong> ${FIELD('Time')}<br><strong>Venue:</strong> ${FIELD('Venue')}<br><strong>Chair:</strong> ${FIELD('Chair')}<br><strong>Secretary:</strong> ${FIELD('Secretary')}</p><h2>Attendees</h2><p>${FIELD('Attendees')}</p><h2>Agenda</h2><ol><li>${FIELD('Agenda 1')}</li><li>${FIELD('Agenda 2')}</li></ol><h2>Discussions & Decisions</h2><p>${FIELD('Discussion Summary')}</p><h2>Action Items</h2><table><tr><th>Action</th><th>Owner</th><th>Due Date</th></tr><tr><td>${FIELD('Action')}</td><td>${FIELD('Owner')}</td><td>${FIELD('Due Date')}</td></tr></table><p><strong>Next Meeting:</strong> ${FIELD('Next Meeting')}</p>`
  },
  {
    id: 'invoice', name: 'Invoice', description: 'Professional invoice ready for line items and payment details.', icon: Calculator, category: 'Finance',
    content: letterhead + `<h1 style="text-align:center">INVOICE</h1><p><strong>Invoice No.:</strong> ${FIELD('Invoice Number')}<br><strong>Date:</strong> ${FIELD('Date')}<br><strong>Bill To:</strong> ${FIELD('Client')}</p><table><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr><tr><td>${FIELD('Description')}</td><td>${FIELD('Quantity')}</td><td>${FIELD('Unit Price')}</td><td>${FIELD('Line Total')}</td></tr></table><p><strong>Subtotal:</strong> ${FIELD('Subtotal')}<br><strong>Total Due:</strong> ${FIELD('Total Due')}<br><strong>Payment Terms:</strong> ${FIELD('Payment Terms')}</p><p>Thank you for your business.</p>`
  },
  {
    id: 'letter', name: 'Official Letter', description: 'Formal business letter using the institute letterhead.', icon: Mail, category: 'Communication',
    content: letterhead + `<p>${FIELD('Date')}</p><p><strong>To:</strong> ${FIELD('Recipient')}<br>${FIELD('Recipient Address')}</p><p><strong>Subject: ${FIELD('Subject')}</strong></p><p>Dear ${FIELD('Recipient Name')},</p><p>${FIELD('Opening')}</p><p>${FIELD('Body')}</p><p>${FIELD('Closing')}</p><p>Yours faithfully,<br><strong>${FIELD('Sender Name')}</strong><br>${FIELD('Sender Role')}</p>`
  },
  {
    id: 'school-circular', name: 'School Circular', description: 'Parent/staff-facing school notice with clear action points.', icon: BookOpen, category: 'Education',
    content: letterhead + `<h1 style="text-align:center">SCHOOL CIRCULAR</h1><p><strong>Date:</strong> ${FIELD('Date')}<br><strong>To:</strong> ${FIELD('Audience')}<br><strong>Subject:</strong> ${FIELD('Subject')}</p><p>Dear Parents, Guardians and Staff,</p><p>${FIELD('Message')}</p><h2>Important Information</h2><ul><li>${FIELD('Information 1')}</li><li>${FIELD('Information 2')}</li></ul><p><strong>Action Required:</strong> ${FIELD('Action Required')}</p><p>Thank you for your cooperation.</p><p><strong>Management</strong><br>Jaystarbliss Dynamic Institute</p>`
  },
  {
    id: 'lesson', name: 'Lesson Note', description: 'Reusable teaching note with objectives, activities and assessment.', icon: BookOpen, category: 'Education',
    content: letterhead + `<h1 style="text-align:center">LESSON NOTE</h1><table><tr><td><strong>Subject</strong><br>${FIELD('Subject')}</td><td><strong>Class / Age</strong><br>${FIELD('Class')}</td><td><strong>Week / Date</strong><br>${FIELD('Week and Date')}</td></tr></table><h2>Topic</h2><p>${FIELD('Topic')}</p><h2>Learning Objectives</h2><ul><li>${FIELD('Objective 1')}</li><li>${FIELD('Objective 2')}</li><li>${FIELD('Objective 3')}</li></ul><h2>Materials</h2><p>${FIELD('Materials')}</p><h2>Lesson Procedure</h2><ol><li>${FIELD('Introduction')}</li><li>${FIELD('Main Activity')}</li><li>${FIELD('Practice')}</li></ol><h2>Assessment</h2><p>${FIELD('Assessment')}</p><h2>Homework / Follow-up</h2><p>${FIELD('Homework')}</p>`
  },
  {
    id: 'exam', name: 'Exam Paper', description: 'Structured examination paper with candidate details and sections.', icon: GraduationCap, category: 'Education',
    content: letterhead + `<h1 style="text-align:center">EXAMINATION</h1><p><strong>Subject/Course:</strong> ${FIELD('Course')}<br><strong>Class:</strong> ${FIELD('Class')}<br><strong>Time Allowed:</strong> ${FIELD('Time')}<br><strong>Total Marks:</strong> ${FIELD('Total Marks')}</p><hr><p><strong>Candidate Name:</strong> ______________________________</p><h2>Instructions</h2><ol><li>Answer all questions unless otherwise stated.</li><li>Read each question carefully.</li><li>Write clearly and manage your time.</li></ol><h2>Section A — Objective</h2><ol><li>${FIELD('Question 1')}</li><li>${FIELD('Question 2')}</li><li>${FIELD('Question 3')}</li></ol><h2>Section B — Theory / Practical</h2><ol><li>${FIELD('Theory Question 1')}</li><li>${FIELD('Theory Question 2')}</li></ol>`
  },
  {
    id: 'performance-review', name: 'Staff Performance Review', description: 'Formal employee review with ratings, feedback and next steps.', icon: ClipboardList, category: 'Management',
    content: letterhead + `<h1 style="text-align:center">STAFF PERFORMANCE REVIEW</h1><p><strong>Staff Member:</strong> ${FIELD('Staff Name')}<br><strong>Role:</strong> ${FIELD('Role')}<br><strong>Review Period:</strong> ${FIELD('Review Period')}</p><h2>Performance Summary</h2><p>${FIELD('Summary')}</p><h2>Performance Areas</h2><table><tr><th>Area</th><th>Rating</th><th>Comments</th></tr><tr><td>Reliability</td><td>${FIELD('Reliability')}</td><td>${FIELD('Reliability Comments')}</td></tr><tr><td>Quality</td><td>${FIELD('Quality')}</td><td>${FIELD('Quality Comments')}</td></tr><tr><td>Communication</td><td>${FIELD('Communication')}</td><td>${FIELD('Communication Comments')}</td></tr><tr><td>Initiative</td><td>${FIELD('Initiative')}</td><td>${FIELD('Initiative Comments')}</td></tr></table><h2>Development Plan</h2><p>${FIELD('Development Plan')}</p><p><strong>Reviewer:</strong> ${FIELD('Reviewer')}<br><strong>Date:</strong> ${FIELD('Date')}</p>`
  },
  {
    id: 'school-director-update',
    name: 'School Director Update',
    description: 'Formal director-facing update covering schedules, fees, curriculum, examinations, certificates and performance information.',
    icon: Building,
    category: 'Education',
    content: letterhead + `<h1 style="text-align:center">SCHOOL DIRECTOR UPDATE</h1>
<p><strong>Date:</strong> ${FIELD('Date')}<br><strong>School:</strong> ${FIELD('School Name')}<br><strong>Period:</strong> ${FIELD('Period')}</p>
<p>Dear School Director,</p>
<p>${FIELD('Opening Message')}</p>
<h2>1. Schedule & Attendance</h2><p>${FIELD('Schedule Information')}</p>
<h2>2. Fees & Administrative Updates</h2><p>${FIELD('Fees and Administrative Updates')}</p>
<h2>3. Academic Calendar & Curriculum</h2><p>${FIELD('Calendar and Curriculum')}</p>
<h2>4. Lesson Plans & Learning Materials</h2><p>${FIELD('Lesson Plans and Materials')}</p>
<h2>5. Examinations</h2><p>${FIELD('Examination Information')}</p>
<h2>6. Results, Certificates & Performance Analysis</h2><p>${FIELD('Results and Performance Information')}</p>
<h2>7. Next Steps</h2><ol><li>${FIELD('Next Step 1')}</li><li>${FIELD('Next Step 2')}</li><li>${FIELD('Next Step 3')}</li></ol>
<p><strong>Contact / Support:</strong> ${FIELD('Contact Details')}</p>
<p>Yours faithfully,<br><strong>${FIELD('Sender Name')}</strong><br>${FIELD('Sender Role')}<br>Jaystarbliss Dynamic Institute</p>`
  },
  {
    id: 'school-admin-support',
    name: 'School Administrator Support Notice',
    description: 'Practical admin-facing notice for exam links, results, spreadsheets, PDFs and document requests.',
    icon: ClipboardList,
    category: 'Education',
    content: letterhead + `<h1 style="text-align:center">SCHOOL ADMINISTRATOR SUPPORT NOTICE</h1>
<p><strong>Date:</strong> ${FIELD('Date')}<br><strong>School:</strong> ${FIELD('School Name')}<br><strong>Subject:</strong> ${FIELD('Subject')}</p>
<p>Hello ${FIELD('Administrator Name')},</p>
<p>${FIELD('Opening Message')}</p>
<h2>Available Support</h2>
<ul><li>Examination links and access information</li><li>Examination results and result spreadsheets</li><li>PDF reports and official documents</li><li>Certificates and performance analysis</li><li>Schedule, lesson and calendar information</li></ul>
<h2>Request / Action Required</h2><p>${FIELD('Request or Action')}</p>
<h2>Important Dates</h2><p>${FIELD('Important Dates')}</p>
<p>If you need anything else, please contact the Hub-Mind support channel.</p>
<p>Kind regards,<br><strong>${FIELD('Sender Name')}</strong><br>${FIELD('Sender Role')}<br>Jaystarbliss Dynamic Institute</p>`
  },
  {
    id: 'parent-programme-update',
    name: 'Parent Programme Update',
    description: 'Clear parent-facing update for class schedules, programme details and student performance information.',
    icon: GraduationCap,
    category: 'Education',
    content: letterhead + `<h1 style="text-align:center">PARENT PROGRAMME UPDATE</h1>
<p><strong>Date:</strong> ${FIELD('Date')}<br><strong>Student:</strong> ${FIELD('Student Name')}<br><strong>Programme:</strong> ${FIELD('Programme')}</p>
<p>Dear Parent / Guardian,</p>
<p>${FIELD('Opening Message')}</p>
<h2>Class Schedule</h2><p>${FIELD('Schedule')}</p>
<h2>Current Programme</h2><p>${FIELD('Programme Details')}</p>
<h2>Performance & Progress</h2><p>${FIELD('Performance Information')}</p>
<h2>Upcoming Activities</h2><ul><li>${FIELD('Upcoming Activity 1')}</li><li>${FIELD('Upcoming Activity 2')}</li></ul>
<h2>What You Need to Know</h2><p>${FIELD('Important Information')}</p>
<p>For additional information or assistance, please contact our support channel.</p>
<p>Kind regards,<br><strong>${FIELD('Sender Name')}</strong><br>${FIELD('Sender Role')}<br>Jaystarbliss Dynamic Institute</p>`
  },
  {
    id: 'daily-assistant-report',
    name: 'Daily Assistant Report',
    description: 'End-of-day operational report with completed work, pending items, follow-ups, decisions and tomorrow’s priorities.',
    icon: ClipboardList,
    category: 'Management',
    content: `<h1 style="text-align:center">JAYSTARBLISS DAILY REPORT</h1>
<p><strong>Date:</strong> ${FIELD('Date')}<br><strong>Prepared by:</strong> ${FIELD('Prepared By')}</p>
<h2>COMPLETED</h2><ul><li>${FIELD('Completed 1')}</li><li>${FIELD('Completed 2')}</li><li>${FIELD('Completed 3')}</li></ul>
<h2>PENDING</h2><ul><li>${FIELD('Pending 1')}</li><li>${FIELD('Pending 2')}</li></ul>
<h2>FOLLOW-UPS</h2><ul><li>${FIELD('Follow-up 1')}</li><li>${FIELD('Follow-up 2')}</li></ul>
<h2>NEEDS YOUR DECISION</h2><ul><li>${FIELD('Decision 1')}</li><li>${FIELD('Decision 2')}</li></ul>
<h2>TOMORROW</h2><ul><li>${FIELD('Tomorrow 1')}</li><li>${FIELD('Tomorrow 2')}</li><li>${FIELD('Tomorrow 3')}</li></ul>
<p><strong>Additional Notes:</strong> ${FIELD('Additional Notes')}</p>`
  },
];

interface TemplateSelectorProps {
  onSelect: (title: string, content: string, category: string, templateId: string) => void;
  onClose: () => void;
}

export function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const categories = useMemo(() => ['All', ...Array.from(new Set(templates.map(t => t.category)))], []);
  const filtered = templates.filter(t => (category === 'All' || t.category === category) && (t.name + t.description).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl">
        <header className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="flex-1"><h2 className="text-lg sm:text-xl font-bold">Create a new document</h2><p className="text-xs sm:text-sm text-slate-500">Choose a ready-to-edit professional template.</p></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </header>
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search templates..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500/30" /></div>
          <div className="flex gap-1 overflow-x-auto">{categories.map(c=><button key={c} onClick={()=>setCategory(c)} className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap ${category===c?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}>{c}</button>)}</div>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-150px)]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(
                    t.id === 'blank' ? 'Untitled Document' : t.name,
                    t.content,
                    t.category,
                    t.id
                  )}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                ><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3"><Icon className="w-5 h-5 text-teal-700"/></div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs text-slate-500 mt-1 leading-relaxed">{t.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
