import bcrypt from 'bcryptjs';
import { getConfig } from '../config';
import { EmailTemplate, GoogleIntegration, User } from '../models';
import { getSettings } from './settings';
import { SYSTEM_TEMPLATES } from './systemTemplates';

export async function ensureSeed(): Promise<void> {
  const settings = await getSettings();
  if (!settings.organizationName || settings.organizationName === 'MARKEX TRADING ACADEMY') {
    settings.organizationName = 'BITVION CRM';
    settings.tagline = 'BUILDING BUSINESSES. CREATING GROWTH.';
    await settings.save();
  }
  await GoogleIntegration.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default', syncMethod: 'apps_script' } }, { upsert: true });
  for (const template of SYSTEM_TEMPLATES) {
    if (template.slug === 'payment-receipt') {
      await EmailTemplate.updateOne({ slug: template.slug }, { $set: { ...template, isSystem: true } }, { upsert: true });
      continue;
    }
    if (template.slug === 'registration-confirmation') {
      await EmailTemplate.updateOne({ slug: template.slug }, { $set: { subject: template.subject, isSystem: true } });
    }
    const exists = await EmailTemplate.findOne({ slug: template.slug });
    if (!exists) await EmailTemplate.create({ ...template, isSystem: true });
  }
  const config = getConfig();
  let settingsChanged = false;
  if (!settings.supportEmail && config.smtpUser) {
    settings.supportEmail = config.smtpUser;
    settingsChanged = true;
  }
  if (!settings.website) {
    settings.website = 'https://markex-academy.com';
    settingsChanged = true;
  }
  if (settingsChanged) await settings.save();
  await User.updateOne({ name: 'MARKEX Admin' }, { $set: { name: 'Bitvion Admin' } });
  if (!config.adminEmail || !config.adminPassword) {
    if ((await User.countDocuments()) === 0) {
      console.warn('No CRM users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD before the first sign-in.');
    }
    return;
  }
  if (config.adminPassword.length < 4) throw new Error('ADMIN_PASSWORD must be at least 4 characters.');
  const email = config.adminEmail.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const existing = await User.findOne({ email }).select('+passwordHash');
  if (!existing) {
    if ((await User.countDocuments()) > 0) return;
    await User.create({
      email,
      passwordHash,
      name: config.adminName,
      role: 'admin',
      permissions: [],
      isActive: true,
    });
    console.log(`Created administrator account for ${email}`);
    return;
  }
  const matches = await bcrypt.compare(config.adminPassword, existing.passwordHash || '');
  if (!matches || existing.name !== config.adminName || existing.role !== 'admin' || !existing.isActive) {
    existing.passwordHash = passwordHash;
    existing.name = config.adminName || existing.name;
    existing.role = 'admin';
    existing.isActive = true;
    await existing.save();
    console.log(`Updated administrator account for ${email}`);
  }
}
