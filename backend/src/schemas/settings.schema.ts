import { z } from 'zod';

// Targets are org-wide configuration, edited on the Daily Targets screen and read
// back by the Outreach Dashboard and Daily Tasks to compute "X of Y completed".
export const UpdateTargetsSchema = z.object({
  monthly_gross_profit_target: z.number().min(0).optional(),
  working_days_per_month:      z.number().int().min(1).max(31).optional(),
  daily_email_target:          z.number().int().min(0).optional(),
  daily_call_target_min:       z.number().int().min(0).optional(),
  daily_call_target_preferred: z.number().int().min(0).optional(),
  daily_text_target:           z.number().int().min(0).optional(),
});

export const UpdateTerritoriesSchema = z.object({
  territories: z.array(z.object({
    id:      z.string().uuid(),
    enabled: z.boolean(),
  })).min(1, 'At least one territory is required'),
});

export const UpsertDailyActivitySchema = z.object({
  pic_id:           z.string().uuid('A PIC must be selected'),
  entry_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry date must be YYYY-MM-DD'),
  emails_completed: z.number().int().min(0).default(0),
  email_replies:    z.number().int().min(0).default(0),
  emails_bounced:   z.number().int().min(0).default(0),
  calls_completed:  z.number().int().min(0).default(0),
  calls_answered:   z.number().int().min(0).default(0),
  calls_unanswered: z.number().int().min(0).default(0),
  texts_completed:  z.number().int().min(0).default(0),
  text_replies:     z.number().int().min(0).default(0),
  texts_opted_out:  z.number().int().min(0).default(0),
  notes:            z.string().optional(),
});

export type UpdateTargetsInput       = z.infer<typeof UpdateTargetsSchema>;
export type UpdateTerritoriesInput   = z.infer<typeof UpdateTerritoriesSchema>;
export type UpsertDailyActivityInput = z.infer<typeof UpsertDailyActivitySchema>;
