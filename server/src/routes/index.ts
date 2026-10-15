import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import studentRoutes from './students';
import courseRoutes from './courses';
import batchRoutes from './batches';
import classRoutes from './classes';
import registrationFormRoutes from './registrationForms';
import emailRoutes from './emails';
import whatsappRoutes from './whatsapp';
import platformRoutes, { publicRouter } from './platform';
import financeRoutes from './finance';
import { requireAuth, requireCsrf } from '../middleware/auth';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.use('/auth', authRoutes);
router.use('/public', publicRouter);
router.use(requireAuth, requireCsrf);
router.use('/users', userRoutes);
router.use('/students', studentRoutes);
router.use('/', financeRoutes);
router.use('/courses', courseRoutes);
router.use('/batches', batchRoutes);
router.use('/classes', classRoutes);
router.use('/registration-forms', registrationFormRoutes);
router.use('/', emailRoutes);
router.use('/whatsapp-communities', whatsappRoutes);
router.use('/', platformRoutes);

export default router;
