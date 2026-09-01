import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import leadRoutes from './routes/lead.routes';
import companyRoutes from './routes/company.routes';
import contactRoutes from './routes/contact.routes';
import importRoutes from './routes/import.routes';
import dealRoutes from './routes/deal.routes';
import analyticsRoutes from './routes/analytics.routes';
import outreachRoutes from './routes/outreach.routes';
import authRoutes from './routes/auth.routes';
import catalogRoutes from './routes/catalog.routes';
import picRoutes from './routes/pic.routes';
import adminRoutes from './routes/admin.routes';
import customerRoutes from './routes/customer.routes';
import contractRoutes from './routes/contract.routes';
import notificationRoutes from './routes/notification.routes';
import { requireAuth } from './middleware/auth.middleware';
import { requestContext } from './middleware/request-context.middleware';
import { env } from './config/env';

const app = express();

// Middleware
app.use(requestContext);
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running', requestId: req.requestId });
});

// Auth Routes (some don't require JWT, like the Google callback)
app.use('/api/v1/auth', authRoutes);

app.use('/api/v1', requireAuth);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/contracts', contractRoutes);
app.use('/api/v1/data/imports', importRoutes);
app.use('/api/v1/deals', dealRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/outreach', outreachRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/pics', picRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Start Server
app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});
