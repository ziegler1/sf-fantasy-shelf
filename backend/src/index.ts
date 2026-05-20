import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import booksRouter   from './routes/books';
import authorsRouter from './routes/authors';
import seriesRouter  from './routes/series';
import uploadsRouter from './routes/uploads';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/books',   booksRouter);
app.use('/api/authors', authorsRouter);
app.use('/api/series',  seriesRouter);
app.use('/api/uploads', uploadsRouter);

app.use(errorHandler);

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
