import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('MARKEX CRM API', () => {
  let mongod: MongoMemoryServer;
  let app: import('express').Express;
  let csrf = '';
  const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdTestFormId123456/viewform';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      binary: { version: '6.0.9' },
      instance: { launchTimeout: 60000 },
    });
    process.env.MONGODB_URI = mongod.getUri();
    const config = await import('../src/config');
    config.resetConfigForTests();
    const db = await import('../src/db');
    await db.connectDb();
    const { ensureSeed } = await import('../src/services/seed');
    await ensureSeed();
    const { createApp } = await import('../src/app');
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it('signs in an administrator and rejects a bad password', async () => {
    const failed = await request(app).post('/api/auth/login').send({ email: 'admin@markex-academy.test', password: 'wrong-password-1' });
    expect(failed.status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@markex-academy.test', password: 'ChangeMe-Admin-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');
    csrf = login.body.csrfToken;
  });

  async function admin() {
    return request(app).set('Cookie', await cookie()).set('x-csrf-token', csrf);
  }

  async function cookie() {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@markex-academy.test', password: 'ChangeMe-Admin-1' });
    csrf = login.body.csrfToken;
    return login.headers['set-cookie'];
  }

  it('stores a real Google Form URL and rejects an invalid one', async () => {
    const headers = await cookie();
    const course = await request(app).post('/api/courses').set('Cookie', headers).set('x-csrf-token', csrf).send({
      name: 'Price Action',
      category: 'Price Action',
      enrollmentAvailable: true,
    });
    expect(course.status).toBe(201);
    const invalid = await request(app).post('/api/registration-forms').set('Cookie', headers).set('x-csrf-token', csrf).send({
      formName: 'MARKEX TRADING ACADEMY — Student Registration Form',
      publicFormUrl: 'https://example.com/not-a-form',
      associatedCourseId: course.body._id,
      formStatus: 'active',
    });
    expect(invalid.status).toBe(400);
    const created = await request(app).post('/api/registration-forms').set('Cookie', headers).set('x-csrf-token', csrf).send({
      formName: 'MARKEX TRADING ACADEMY — Student Registration Form',
      publicFormUrl: formUrl,
      googleFormId: 'test-google-form-id',
      associatedCourseId: course.body._id,
      formStatus: 'active',
    });
    expect(created.status).toBe(201);
    expect(created.body.publicFormUrl).toBe(formUrl);
    expect(created.body.integrationStatus).toBe('not_tested');
    const links = await request(app).get(`/api/registration-forms/${created.body._id}/share-links`).set('Cookie', headers).set('x-csrf-token', csrf);
    expect(links.body.publicFormUrl).toBe(formUrl);
    expect(links.body.whatsappUrl).toContain('https://wa.me/?text=');
    expect(links.body.whatsappUrl).toContain(encodeURIComponent(formUrl));
    expect(JSON.stringify(links.body)).not.toContain('@');
  });

  it('creates a student from an authenticated webhook and ignores a duplicate delivery', async () => {
    const payload = {
      eventId: 'test-google-form-id:response-1',
      googleFormId: 'test-google-form-id',
      responseTimestamp: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      answers: { 'Full Name': 'Asha Menon', 'Email Address': 'asha@example.com', Phone: '9000000000' },
    };
    const rejected = await request(app).post('/api/webhooks/google-form').send(payload);
    expect(rejected.status).toBe(401);
    const accepted = await request(app).post('/api/webhooks/google-form').set('Authorization', `Bearer ${process.env.WEBHOOK_SECRET}`).send(payload);
    expect(accepted.status).toBe(200);
    expect(accepted.body.duplicate).toBe(false);
    const again = await request(app).post('/api/webhooks/google-form').set('Authorization', `Bearer ${process.env.WEBHOOK_SECRET}`).send(payload);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    const changed = await request(app).post('/api/webhooks/google-form').set('Authorization', `Bearer ${process.env.WEBHOOK_SECRET}`).send({
      ...payload,
      eventId: 'test-google-form-id:response-2',
      answers: { 'Full Name': 'Someone Else', 'Email Address': 'asha@example.com' },
    });
    expect(changed.status).toBe(200);
    const { Student, EmailJob } = await import('../src/models');
    const student = await Student.findOne({ email: 'asha@example.com' });
    expect(student?.fullName).toBe('Asha Menon');
    expect(student?.studentId.startsWith('MX-')).toBe(true);
    const welcomes = await EmailJob.find({ idempotencyKey: `welcome:${student?._id.toString()}` });
    expect(welcomes).toHaveLength(1);
    expect(welcomes[0].status).toBe('queued');
  });

  it('keeps a queued welcome email when the provider is not configured', async () => {
    const { processEmailQueue } = await import('../src/services/jobs');
    const { EmailJob } = await import('../src/models');
    await processEmailQueue();
    const job = await EmailJob.findOne({ to: 'asha@example.com' });
    expect(job?.status).toBe('queued');
    expect(job?.lastError).toMatch(/not configured/i);
  });

  it('enforces staff permissions and batch email content', async () => {
    const headers = await cookie();
    const { User } = await import('../src/models');
    await User.create({
      name: 'Front Desk',
      email: 'staff@markex-academy.test',
      passwordHash: await bcrypt.hash('Staff-Password-1', 4),
      role: 'staff',
      permissions: ['students.view', 'batches.view'],
      isActive: true,
    });
    const staffLogin = await request(app).post('/api/auth/login').send({ email: 'staff@markex-academy.test', password: 'Staff-Password-1' });
    const denied = await request(app).get('/api/export/students').set('Cookie', staffLogin.headers['set-cookie']).set('x-csrf-token', staffLogin.body.csrfToken);
    expect(denied.status).toBe(403);

    const course = await request(app).get('/api/courses').set('Cookie', headers);
    const batch = await request(app).post('/api/batches').set('Cookie', headers).set('x-csrf-token', csrf).send({
      name: 'April Batch',
      courseId: course.body.data[0]._id,
      capacity: 20,
      status: 'Upcoming',
      timeZone: 'UTC',
      instructor: 'Academy Instructor',
    });
    expect(batch.status).toBe(201);
    const students = await request(app).get('/api/students').set('Cookie', headers);
    const assigned = await request(app).post(`/api/batches/${batch.body._id}/assign-students`).set('Cookie', headers).set('x-csrf-token', csrf).send({ studentIds: [students.body.data[0]._id] });
    expect(assigned.status).toBe(200);
    const preview = await request(app).get(`/api/batches/${batch.body._id}/preview-email`).set('Cookie', headers);
    expect(preview.status).toBe(200);
    expect(preview.body.preview.text).not.toContain('meet.google.com');
    expect(preview.body.preview.text).not.toContain('chat.whatsapp.com');
    expect(preview.body.preview.text).toContain('April Batch');

    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const date = future.toISOString().slice(0, 10);
    const classResponse = await request(app).post('/api/classes').set('Cookie', headers).set('x-csrf-token', csrf).send({
      title: 'Opening session',
      batchId: batch.body._id,
      courseId: course.body.data[0]._id,
      date,
      startTime: '09:00',
      endTime: '10:00',
      timeZone: 'UTC',
      meetingProvider: 'Google Meet',
      notify24h: true,
    });
    expect(classResponse.status).toBe(201);
    const badLink = await request(app).post('/api/classes').set('Cookie', headers).set('x-csrf-token', csrf).send({
      title: 'Bad link',
      date,
      startTime: '11:00',
      endTime: '12:00',
      timeZone: 'UTC',
      meetingProvider: 'Zoom',
      meetingUrl: 'https://example.com/not-zoom',
    });
    expect(badLink.status).toBe(400);
    const { EmailJob } = await import('../src/models');
    const reminder = await EmailJob.findOne({ idempotencyKey: new RegExp(`class:${classResponse.body._id}:reminder24`) });
    expect(reminder).toBeTruthy();
    expect(reminder?.status).toBe('queued');
  });

  it('unsubscribes without revealing the student email', async () => {
    const { CommunicationConsent } = await import('../src/models');
    const consent = await CommunicationConsent.findOne({ email: 'asha@example.com' });
    const response = await request(app).post(`/api/public/unsubscribe/${consent?.unsubscribeToken}`).send({ scope: 'all' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('asha@example.com');
    const updated = await CommunicationConsent.findOne({ email: 'asha@example.com' });
    expect(updated?.unsubscribedAll).toBe(true);
  });
});
