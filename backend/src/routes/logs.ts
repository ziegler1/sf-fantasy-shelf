import { Router, Request } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../lib/validate';

const errorLogSchema = z.object({
  message: z.string().max(1000),
  level: z.enum(['error', 'warn', 'info']).default('error'),
  url: z.string().max(2048).optional(),
  stack: z.string().max(5000).optional(),
  context: z.record(z.any()).optional(),
});

const router = Router();

// Optional auth — allow logging from unauthenticated contexts (e.g., before login)
router.post('/errors', validate(errorLogSchema), asyncHandler(async (req, res) => {
  const { message, level, url, stack, context } = req.body as z.infer<typeof errorLogSchema>;
  const userId = (req as any).userId ?? null;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    userId,
    message,
    url,
    stack,
    context,
  };

  // Log to console — Railway captures all stdout/stderr
  if (level === 'error') {
    console.error(`[${level}] ${message}`, {
      userId,
      url,
      context,
      stack,
    });
  } else {
    console.log(`[${level}] ${message}`, {
      userId,
      url,
      context,
    });
  }

  res.status(201).json({ logged: true });
}));

export default router;
