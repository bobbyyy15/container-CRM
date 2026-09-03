// Vercel serverless entry point.
//
// Vercel's Node runtime accepts an Express app directly as a request handler. The app in
// src/index.ts only calls listen() when run as the main module, so importing it here starts
// no server -- Vercel invokes it per request instead.
//
// This is only possible because live updates moved to Supabase Realtime; the previous
// Socket.IO server could not survive in a request-scoped function. See docs/DEPLOYMENT.md.
import { app } from '../src/index';

export default app;
