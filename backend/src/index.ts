import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import booksRouter    from './routes/books';
import authorsRouter  from './routes/authors';
import seriesRouter   from './routes/series';
import uploadsRouter  from './routes/uploads';
import claudeRouter   from './routes/claude';
import searchRouter   from './routes/search';
import authRouter     from './routes/auth';
import upcomingRouter from './routes/upcoming';
import newsRouter     from './routes/news';
import toppicksRouter from './routes/toppicks';
import logsRouter     from './routes/logs';
import internalRouter from './routes/internal';
import { errorHandler } from './middleware/errorHandler';
import { fetchNewsFeeds } from './lib/fetchNewsFeeds';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => { req.url = req.url.replace(/\/+/g, '/'); next(); });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/internal', internalRouter);
app.use('/api/auth',     authRouter);
app.use('/api/books',    booksRouter);
app.use('/api/authors',  authorsRouter);
app.use('/api/series',   seriesRouter);
app.use('/api/uploads',  uploadsRouter);
app.use('/api/claude',   claudeRouter);
app.use('/api/search',   searchRouter);
app.use('/api/upcoming', upcomingRouter);
app.use('/api/news',     newsRouter);
app.use('/api/toppicks', toppicksRouter);
app.use('/api/logs',     logsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);

  // Fetch news on startup, then every 4 hours
  fetchNewsFeeds().catch(err => console.error('[news] initial fetch failed:', err));
  cron.schedule('0 */4 * * *', () => {
    fetchNewsFeeds().catch(err => console.error('[news] scheduled fetch failed:', err));
  });
});
