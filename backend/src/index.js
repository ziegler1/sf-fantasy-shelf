require('dotenv').config();

const express = require('express');
const cors = require('cors');
const booksRouter = require('./routes/books');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/books', booksRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
