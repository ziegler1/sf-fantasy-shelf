import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import booksRouter    from './routes/books';
import authorsRouter  from './routes/authors';
import seriesRouter   from './routes/series';
import uploadsRouter  from './routes/uploads';
import claudeRouter   from './routes/claude';
import searchRouter   from './routes/search';
import authRouter     from './routes/auth';
import upcomingRouter from './routes/upcoming';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth',     authRouter);
app.use('/api/books',    booksRouter);
app.use('/api/authors',  authorsRouter);
app.use('/api/series',   seriesRouter);
app.use('/api/uploads',  uploadsRouter);
app.use('/api/claude',   claudeRouter);
app.use('/api/search',   searchRouter);
app.use('/api/upcoming', upcomingRouter);

app.use(errorHandler);

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
