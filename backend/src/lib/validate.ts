import { z, ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ── Shared field types ────────────────────────────────────────────────────────

export const nullableStr  = (max: number) => z.string().max(max).nullable().optional();
export const requiredStr  = (max: number) => z.string().min(1).max(max).trim();
export const readingStatus = z.enum(['want-to-read', 'reading', 'read', 'dnf']);
