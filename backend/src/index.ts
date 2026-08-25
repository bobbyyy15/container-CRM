import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import leadRoutes from './routes/lead.routes';
import companyRoutes from './routes/company.routes';
import contactRoutes from './routes/contact.routes';
import importRoutes from './routes/import.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:5173'
}));
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/data/imports', importRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
