import mongoose, { Schema, Types } from 'mongoose';
import { BATCH_STATUSES, MEETING_PROVIDERS, PERMISSIONS, STUDENT_STATUSES } from '../lib/constants';

const { ObjectId } = Schema.Types;

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash?: string;
  name: string;
  role: 'admin' | 'staff';
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'staff'], required: true },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export interface INote {
  _id?: Types.ObjectId;
  body: string;
  authorId?: Types.ObjectId;
  createdAt: Date;
}

export interface IStudent {
  _id: Types.ObjectId;
  studentId: string;
  fullName: string;
  email: string;
  phone?: string;
  courseId?: Types.ObjectId;
  courseInterest?: string;
  batchId?: Types.ObjectId;
  registrationDate: Date;
  registrationSource: 'google_form' | 'manual' | 'import';
  registrationFormId?: Types.ObjectId;
  enrollmentStatus: (typeof STUDENT_STATUSES)[number];
  consentStatus: 'unknown' | 'granted' | 'denied';
  marketingConsent: boolean;
  unsubscribedAll: boolean;
  welcomeQueuedAt?: Date;
  lastCommunicationAt?: Date;
  reviewFlags: string[];
  notes: INote[];
  gender: 'Male' | 'Female' | 'Other';
  place: string;
  amountCollected: number;
  pendingAmount: number;
  collectedDate?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const studentSchema = new Schema<IStudent>(
  {
    studentId: { type: String, required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    courseId: { type: ObjectId, ref: 'Course', index: true },
    courseInterest: String,
    batchId: { type: ObjectId, ref: 'Batch', index: true },
    registrationDate: { type: Date, required: true, index: true },
    registrationSource: { type: String, enum: ['google_form', 'manual', 'import'], required: true },
    registrationFormId: { type: ObjectId, ref: 'RegistrationForm' },
    enrollmentStatus: { type: String, enum: STUDENT_STATUSES, default: 'New Registration', index: true },
    consentStatus: { type: String, enum: ['unknown', 'granted', 'denied'], default: 'unknown' },
    marketingConsent: { type: Boolean, default: false },
    unsubscribedAll: { type: Boolean, default: false },
    welcomeQueuedAt: Date,
    lastCommunicationAt: Date,
    reviewFlags: { type: [String], default: [] },
    notes: [
      {
        body: { type: String, required: true },
        authorId: { type: ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Other' },
    place: { type: String, trim: true, default: '' },
    amountCollected: { type: Number, default: 0, min: 0 },
    pendingAmount: { type: Number, default: 0, min: 0 },
    collectedDate: Date,
    archivedAt: Date,
  },
  { timestamps: true },
);
studentSchema.index({ email: 1, archivedAt: 1 });
studentSchema.index({ archivedAt: 1, enrollmentStatus: 1 });

export interface IFieldMapping {
  fullName?: string[];
  email?: string[];
  phone?: string[];
  course?: string[];
  consent?: string[];
}

export interface IRegistrationForm {
  _id: Types.ObjectId;
  formName: string;
  googleFormId: string;
  publishedFormId: string;
  publicFormUrl: string;
  responseSpreadsheetId?: string;
  associatedCourseId?: Types.ObjectId;
  optionalBatchId?: Types.ObjectId;
  formStatus: 'draft' | 'active' | 'archived';
  sharingEnabled: boolean;
  integrationStatus: 'not_configured' | 'not_tested' | 'verified' | 'error';
  lastTestedAt?: Date;
  lastTestError?: string;
  lastTestDetail?: string;
  lastSyncAt?: Date;
  lastSyncError?: string;
  lastSubmissionAt?: Date;
  submissionCount: number;
  duplicatePolicy?: 'flag' | 'skip' | 'update_empty';
  fieldMapping: IFieldMapping;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const registrationFormSchema = new Schema<IRegistrationForm>(
  {
    formName: { type: String, required: true, trim: true },
    googleFormId: { type: String, required: true, trim: true, index: true },
    publishedFormId: { type: String, required: true, trim: true, index: true },
    publicFormUrl: { type: String, required: true, trim: true },
    responseSpreadsheetId: { type: String, trim: true },
    associatedCourseId: { type: ObjectId, ref: 'Course' },
    optionalBatchId: { type: ObjectId, ref: 'Batch' },
    formStatus: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
    sharingEnabled: { type: Boolean, default: false },
    integrationStatus: { type: String, enum: ['not_configured', 'not_tested', 'verified', 'error'], default: 'not_tested' },
    lastTestedAt: Date,
    lastTestError: String,
    lastTestDetail: String,
    lastSyncAt: Date,
    lastSyncError: String,
    lastSubmissionAt: Date,
    submissionCount: { type: Number, default: 0 },
    duplicatePolicy: { type: String, enum: ['flag', 'skip', 'update_empty'] },
    fieldMapping: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export interface IGoogleIntegration {
  _id: Types.ObjectId;
  key: string;
  syncMethod: 'apps_script' | 'sheets_api';
  lastWebhookAt?: Date;
  setupNotes?: string;
  updatedAt: Date;
}

const googleIntegrationSchema = new Schema<IGoogleIntegration>(
  {
    key: { type: String, required: true, unique: true },
    syncMethod: { type: String, enum: ['apps_script', 'sheets_api'], default: 'apps_script' },
    lastWebhookAt: Date,
    setupNotes: String,
  },
  { timestamps: true },
);

export interface IGoogleSubmissionEvent {
  _id: Types.ObjectId;
  eventId: string;
  registrationFormId?: Types.ObjectId;
  googleFormId: string;
  responseTimestamp?: Date;
  answers: Record<string, string>;
  studentRef?: Types.ObjectId;
  processingStatus: 'processing' | 'processed' | 'duplicate' | 'failed';
  error?: string;
  source: 'webhook' | 'sheet_sync';
  emailQueued: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const googleSubmissionEventSchema = new Schema<IGoogleSubmissionEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    registrationFormId: { type: ObjectId, ref: 'RegistrationForm', index: true },
    googleFormId: { type: String, required: true },
    responseTimestamp: Date,
    answers: { type: Schema.Types.Mixed, default: {} },
    studentRef: { type: ObjectId, ref: 'Student' },
    processingStatus: { type: String, enum: ['processing', 'processed', 'duplicate', 'failed'], required: true },
    error: String,
    source: { type: String, enum: ['webhook', 'sheet_sync'], required: true },
    emailQueued: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export interface ICourse {
  _id: Types.ObjectId;
  name: string;
  category: string;
  description: string;
  duration: string;
  enrollmentAvailable: boolean;
  status: 'active' | 'archived';
  emailTemplateId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    duration: { type: String, default: '' },
    enrollmentAvailable: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    emailTemplateId: { type: ObjectId, ref: 'EmailTemplate' },
  },
  { timestamps: true },
);

export interface IBatch {
  _id: Types.ObjectId;
  name: string;
  batchCode: string;
  courseId: Types.ObjectId;
  startDate?: Date;
  endDate?: Date;
  timeZone: string;
  instructor: string;
  capacity: number;
  status: (typeof BATCH_STATUSES)[number];
  whatsappCommunityId?: Types.ObjectId;
  emailTemplateId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<IBatch>(
  {
    name: { type: String, required: true, trim: true },
    batchCode: { type: String, required: true, unique: true, trim: true },
    courseId: { type: ObjectId, ref: 'Course', required: true, index: true },
    startDate: Date,
    endDate: Date,
    timeZone: { type: String, default: 'UTC' },
    instructor: { type: String, default: '' },
    capacity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: BATCH_STATUSES, default: 'Draft', index: true },
    whatsappCommunityId: { type: ObjectId, ref: 'WhatsAppCommunity' },
    emailTemplateId: { type: ObjectId, ref: 'EmailTemplate' },
  },
  { timestamps: true },
);

export interface IBatchEnrollment {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: 'assigned' | 'removed';
  assignedBy?: Types.ObjectId;
  assignedAt: Date;
  notificationSentAt?: Date;
}

const batchEnrollmentSchema = new Schema<IBatchEnrollment>(
  {
    batchId: { type: ObjectId, ref: 'Batch', required: true, index: true },
    studentId: { type: ObjectId, ref: 'Student', required: true, index: true },
    status: { type: String, enum: ['assigned', 'removed'], default: 'assigned' },
    assignedBy: { type: ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    notificationSentAt: Date,
  },
  { timestamps: true },
);
batchEnrollmentSchema.index({ batchId: 1, studentId: 1 }, { unique: true });

export interface IClassReminderState {
  announcementAt?: Date;
  h24At?: Date;
  h1At?: Date;
  cancellationAt?: Date;
  rescheduleAt?: Date;
}

export interface IClassSchedule {
  _id: Types.ObjectId;
  title: string;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  instructor: string;
  meetingProvider: (typeof MEETING_PROVIDERS)[number];
  meetingUrl?: string;
  description: string;
  status: 'scheduled' | 'cancelled' | 'completed' | 'rescheduled';
  notifyAnnouncement: boolean;
  notify24h: boolean;
  notify1h: boolean;
  reminders: IClassReminderState;
  createdAt: Date;
  updatedAt: Date;
}

const classScheduleSchema = new Schema<IClassSchedule>(
  {
    title: { type: String, required: true, trim: true },
    courseId: { type: ObjectId, ref: 'Course' },
    batchId: { type: ObjectId, ref: 'Batch', index: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    timeZone: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    instructor: { type: String, default: '' },
    meetingProvider: { type: String, enum: MEETING_PROVIDERS, default: 'Other' },
    meetingUrl: String,
    description: { type: String, default: '' },
    status: { type: String, enum: ['scheduled', 'cancelled', 'completed', 'rescheduled'], default: 'scheduled', index: true },
    notifyAnnouncement: { type: Boolean, default: false },
    notify24h: { type: Boolean, default: false },
    notify1h: { type: Boolean, default: false },
    reminders: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export interface IEmailTemplate {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  category: 'operational' | 'marketing';
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    subject: { type: String, required: true },
    htmlBody: { type: String, required: true },
    textBody: { type: String, required: true },
    category: { type: String, enum: ['operational', 'marketing'], default: 'operational' },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export interface IEmailCampaign {
  _id: Types.ObjectId;
  name: string;
  templateId: Types.ObjectId;
  registrationFormId?: Types.ObjectId;
  category: 'operational' | 'marketing';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  filters: Record<string, unknown>;
  recipientCount: number;
  excludedCount: number;
  scheduledAt?: Date;
  sentAt?: Date;
  createdBy?: Types.ObjectId;
  confirmPermittedImports: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emailCampaignSchema = new Schema<IEmailCampaign>(
  {
    name: { type: String, required: true, trim: true },
    templateId: { type: ObjectId, ref: 'EmailTemplate', required: true },
    registrationFormId: { type: ObjectId, ref: 'RegistrationForm' },
    category: { type: String, enum: ['operational', 'marketing'], required: true },
    status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'], default: 'draft', index: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    recipientCount: { type: Number, default: 0 },
    excludedCount: { type: Number, default: 0 },
    scheduledAt: Date,
    sentAt: Date,
    createdBy: { type: ObjectId, ref: 'User' },
    confirmPermittedImports: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export interface IEmailJob {
  _id: Types.ObjectId;
  idempotencyKey: string;
  campaignId?: Types.ObjectId;
  studentId?: Types.ObjectId;
  to: string;
  subject: string;
  html: string;
  text: string;
  category: 'operational' | 'marketing';
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'suppressed' | 'cancelled';
  providerMessageId?: string;
  attempts: number;
  lastError?: string;
  scheduledFor: Date;
  sentAt?: Date;
  lockedAt?: Date;
  test: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emailJobSchema = new Schema<IEmailJob>(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    campaignId: { type: ObjectId, ref: 'EmailCampaign', index: true },
    studentId: { type: ObjectId, ref: 'Student', index: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String, required: true },
    category: { type: String, enum: ['operational', 'marketing'], required: true },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'failed', 'suppressed', 'cancelled'], default: 'queued', index: true },
    providerMessageId: { type: String, index: true },
    attempts: { type: Number, default: 0 },
    lastError: String,
    scheduledFor: { type: Date, default: Date.now, index: true },
    sentAt: Date,
    lockedAt: Date,
    test: { type: Boolean, default: false },
  },
  { timestamps: true },
);
emailJobSchema.index({ status: 1, scheduledFor: 1 });

export interface IEmailEvent {
  _id: Types.ObjectId;
  jobId?: Types.ObjectId;
  providerEventId?: string;
  type: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'delayed';
  payload: Record<string, unknown>;
  createdAt: Date;
}

const emailEventSchema = new Schema<IEmailEvent>(
  {
    jobId: { type: ObjectId, ref: 'EmailJob', index: true },
    providerEventId: { type: String, unique: true, sparse: true },
    type: { type: String, enum: ['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'delayed'], required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export interface IWhatsAppCommunity {
  _id: Types.ObjectId;
  name: string;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  invitationUrl: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: Date;
  instructions: string;
  createdAt: Date;
  updatedAt: Date;
}

const whatsAppCommunitySchema = new Schema<IWhatsAppCommunity>(
  {
    name: { type: String, required: true, trim: true },
    courseId: { type: ObjectId, ref: 'Course' },
    batchId: { type: ObjectId, ref: 'Batch' },
    invitationUrl: { type: String, required: true },
    status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
    expiresAt: Date,
    instructions: { type: String, default: '' },
  },
  { timestamps: true },
);

export interface ICommunicationConsent {
  _id: Types.ObjectId;
  studentId?: Types.ObjectId;
  email: string;
  operational: boolean;
  marketing: boolean;
  unsubscribedAll: boolean;
  suppressed: boolean;
  suppressedReason?: string;
  unsubscribeToken: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const communicationConsentSchema = new Schema<ICommunicationConsent>(
  {
    studentId: { type: ObjectId, ref: 'Student' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    operational: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false },
    unsubscribedAll: { type: Boolean, default: false },
    suppressed: { type: Boolean, default: false },
    suppressedReason: String,
    unsubscribeToken: { type: String, required: true, unique: true },
    source: { type: String, default: 'registration' },
  },
  { timestamps: true },
);

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId;
  action: string;
  category: 'communication' | 'admin' | 'security';
  entityType: string;
  entityId?: string;
  studentId?: Types.ObjectId;
  metadata: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: ObjectId, ref: 'User' },
    action: { type: String, required: true, index: true },
    category: { type: String, enum: ['communication', 'admin', 'security'], required: true, index: true },
    entityType: { type: String, required: true },
    entityId: String,
    studentId: { type: ObjectId, ref: 'Student', index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 });

export interface IApplicationSettings {
  _id: Types.ObjectId;
  key: string;
  supportEmail: string;
  organizationName: string;
  website: string;
  tagline: string;
  timeZone: string;
  duplicatePolicy: 'flag' | 'skip' | 'update_empty';
  communicationPolicy: 'operational_allowed' | 'require_consent';
  sequences: Map<string, number>;
  totalAssets: number;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSettingsSchema = new Schema<IApplicationSettings>(
  {
    key: { type: String, required: true, unique: true },
    supportEmail: { type: String, default: '' },
    organizationName: { type: String, default: 'BITVION CRM' },
    website: { type: String, default: '' },
    tagline: { type: String, default: 'BUILDING BUSINESSES. CREATING GROWTH.' },
    timeZone: { type: String, default: 'UTC' },
    duplicatePolicy: { type: String, enum: ['flag', 'skip', 'update_empty'], default: 'flag' },
    communicationPolicy: { type: String, enum: ['operational_allowed', 'require_consent'], default: 'operational_allowed' },
    sequences: { type: Map, of: Number, default: {} },
    totalAssets: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export interface IExpense {
  _id: Types.ObjectId;
  purpose: string;
  amount: number;
  spentOn: Date;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    purpose: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    spentOn: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>('User', userSchema);
export const Student = mongoose.model<IStudent>('Student', studentSchema);
export const RegistrationForm = mongoose.model<IRegistrationForm>('RegistrationForm', registrationFormSchema);
export const GoogleIntegration = mongoose.model<IGoogleIntegration>('GoogleIntegration', googleIntegrationSchema);
export const GoogleSubmissionEvent = mongoose.model<IGoogleSubmissionEvent>('GoogleSubmissionEvent', googleSubmissionEventSchema);
export const Course = mongoose.model<ICourse>('Course', courseSchema);
export const Batch = mongoose.model<IBatch>('Batch', batchSchema);
export const BatchEnrollment = mongoose.model<IBatchEnrollment>('BatchEnrollment', batchEnrollmentSchema);
export const ClassSchedule = mongoose.model<IClassSchedule>('ClassSchedule', classScheduleSchema);
export const EmailTemplate = mongoose.model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);
export const EmailCampaign = mongoose.model<IEmailCampaign>('EmailCampaign', emailCampaignSchema);
export const EmailJob = mongoose.model<IEmailJob>('EmailJob', emailJobSchema);
export const EmailEvent = mongoose.model<IEmailEvent>('EmailEvent', emailEventSchema);
export const WhatsAppCommunity = mongoose.model<IWhatsAppCommunity>('WhatsAppCommunity', whatsAppCommunitySchema);
export const CommunicationConsent = mongoose.model<ICommunicationConsent>('CommunicationConsent', communicationConsentSchema);
export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
export const ApplicationSettings = mongoose.model<IApplicationSettings>('ApplicationSettings', applicationSettingsSchema);
export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
