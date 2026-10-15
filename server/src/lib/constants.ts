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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_DEFAULT_PERMISSIONS: Permission[] = [
  'students.view',
  'students.edit',
  'forms.view',
  'forms.share',
  'batches.view',
  'batches.assign',
  'schedules.manage',
  'communications.send',
  'reports.view',
];

export function hasPermission(role: string, permissions: string[], required: Permission): boolean {
  if (role === 'admin') return true;
  return permissions.includes(required);
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
] as const;

export const BATCH_STATUSES = [
  'Draft',
  'Upcoming',
  'Enrollment Open',
  'Starting Soon',
  'Active',
  'Completed',
  'Cancelled',
] as const;

export const REVIEW_STATUSES = ['New Registration', 'Contact Required', 'Enrollment Pending'] as const;

export const DUPLICATE_POLICIES = ['flag', 'skip', 'update_empty'] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

export const MEETING_PROVIDERS = ['Google Meet', 'Zoom', 'Microsoft Teams', 'Other'] as const;

export const COURSE_CATEGORIES = [
  'Financial Market Fundamentals',
  'Technical Analysis',
  'Price Action',
  'Futures and Options Education',
  'Algorithmic Trading',
  'AI-Assisted Trading Education',
  'Risk Management',
  'Other',
] as const;
