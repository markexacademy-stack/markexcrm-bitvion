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
    const exists = await EmailTemplate.findOne({ slug: template.slug });
    if (!exists) await EmailTemplate.create({ ...template, isSystem: true });
  }
  const config = getConfig();
  await User.updateOne({ name: 'MARKEX Admin' }, { $set: { name: 'Bitvion Admin' } });
  if ((await User.countDocuments()) > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('No CRM users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD before the first sign-in.');
    return;
  }
  if (config.adminPassword.length < 4) throw new Error('ADMIN_PASSWORD must be at least 4 characters.');
  await User.create({
    email: config.adminEmail.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(config.adminPassword, 12),
    name: config.adminName,
    role: 'admin',
    permissions: [],
    isActive: true,
  });
  console.log(`Created administrator account for ${config.adminEmail}`);
}
