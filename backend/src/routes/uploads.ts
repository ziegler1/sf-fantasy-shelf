import { Router } from 'express';
import multer from 'multer';
import { uploadCover } from '../lib/r2';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── POST /api/uploads/cover ───────────────────────────────────────────────────

router.post(
  '/cover',
  upload.single('cover'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { key, url } = await uploadCover(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );

    res.status(201).json({ key, url });
  }),
);

export default router;
