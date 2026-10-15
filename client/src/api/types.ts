export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Course {
  _id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  enrollmentAvailable: boolean;
  status: 'active' | 'archived';
  batchCount?: number;
  formCount?: number;
}

export interface Student {
  _id: string;
  studentId: string;
  fullName: string;
  email: string;
  phone?: string;
  courseId?: { _id: string; name: string } | string | null;
  courseInterest?: string;
  batchId?: { _id: string; name: string; batchCode?: string } | string | null;
  registrationDate: string;
  registrationSource: string;
  enrollmentStatus: string;
  consentStatus: string;
  marketingConsent: boolean;
  unsubscribedAll: boolean;
  lastCommunicationAt?: string;
  reviewFlags: string[];
  notes: { _id?: string; body: string; createdAt: string }[];
  archivedAt?: string | null;
}

export interface RegistrationForm {
  _id: string;
  formName: string;
  googleFormId: string;
  publishedFormId: string;
  publicFormUrl: string;
  responseSpreadsheetId?: string;
  associatedCourseId?: { _id: string; name: string } | string | null;
  optionalBatchId?: { _id: string; name: string } | string | null;
  formStatus: 'draft' | 'active' | 'archived';
  sharingEnabled: boolean;
  integrationStatus: 'not_configured' | 'not_tested' | 'verified' | 'error';
  lastTestedAt?: string;
  lastTestError?: string;
  lastTestDetail?: string;
  lastSyncAt?: string;
  lastSyncError?: string;
  lastSubmissionAt?: string;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  _id: string;
  name: string;
  batchCode: string;
  courseId?: { _id: string; name: string } | string;
  startDate?: string;
  endDate?: string;
  timeZone: string;
  instructor: string;
  capacity: number;
  status: string;
  assignedCount?: number;
  students?: Student[];
  whatsappCommunityId?: { _id: string; name: string; invitationUrl?: string; status?: string } | string | null;
}

export interface ClassItem {
  _id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  instructor: string;
  meetingProvider: string;
  meetingUrl?: string;
  description: string;
  status: string;
  startsAt: string;
  notifyAnnouncement: boolean;
  notify24h: boolean;
  notify1h: boolean;
  courseId?: { _id: string; name: string } | string | null;
  batchId?: { _id: string; name: string } | string | null;
}

export interface EmailTemplate {
  _id: string;
  name: string;
  slug: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  category: 'operational' | 'marketing';
  isSystem: boolean;
}

export interface EmailJob {
  _id: string;
  to: string;
  subject: string;
  status: string;
  lastError?: string;
  scheduledFor: string;
  sentAt?: string;
  createdAt: string;
  category: string;
}

export interface Campaign {
  _id: string;
  name: string;
  status: string;
  category: string;
  recipientCount: number;
  excludedCount: number;
  scheduledAt?: string;
  createdAt: string;
  templateId?: { name?: string; subject?: string } | string;
}

export interface WhatsAppCommunity {
  _id: string;
  name: string;
  invitationUrl: string;
  status: string;
  expiresAt?: string;
  instructions: string;
  courseId?: { _id: string; name: string } | string | null;
  batchId?: { _id: string; name: string } | string | null;
}

export const STUDENT_STATUSES = [
  'New Registration',
  'Contact Required',
  'Enrollment Pending',
  'Enrolled',
  'Batch Assigned',
  'Active Student',
  'Completed',
  'On Hold',
  'Cancelled',
];

export const COURSE_CATEGORIES = [
  'Financial Market Fundamentals',
  'Technical Analysis',
  'Price Action',
  'Futures and Options Education',
  'Algorithmic Trading',
  'AI-Assisted Trading Education',
  'Risk Management',
  'Other',
];

export const BATCH_STATUSES = ['Draft', 'Upcoming', 'Enrollment Open', 'Starting Soon', 'Active', 'Completed', 'Cancelled'];

export const PERMISSIONS = [
  'students.view',
  'students.edit',
  'students.import',
  'forms.view',
  'forms.manage',
  'forms.share',
  'courses.manage',
  'batches.view',
  'batches.manage',
  'batches.assign',
  'schedules.manage',
  'templates.manage',
  'communications.send',
  'campaigns.send',
  'exports.sensitive',
  'integrations.manage',
  'users.manage',
  'settings.manage',
  'audit.view',
  'reports.view',
];
