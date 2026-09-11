import { z } from 'zod';

export const CreateInventorySchema = z.object({
  container_size:      z.string().min(1, 'Container size is required'),
  container_condition: z.string().min(1, 'Container condition is required'),
  container_category:  z.string().default('Dry'),
  vendor_supplier:     z.string().optional(),
  depot_name:          z.string().min(1, 'Depot name is required'),
  city:                z.string().optional(),
  state_province:      z.string().optional(),
  country:             z.string().default('USA'),
  quantity_available:  z.number().int().min(0).default(0),
  quantity_reserved:   z.number().int().min(0).default(0),
  unit_cost:           z.number().min(0).default(0),
  target_sell_price:   z.number().min(0).optional(),
  unit_serial_numbers: z.array(z.string()).optional().default([]),
  notes:               z.string().optional(),
});

export const UpdateInventorySchema = z.object({
  container_size:      z.string().min(1).optional(),
  container_condition: z.string().min(1).optional(),
  container_category:  z.string().optional(),
  vendor_supplier:     z.string().optional().nullable(),
  depot_name:          z.string().min(1).optional(),
  city:                z.string().optional().nullable(),
  state_province:      z.string().optional().nullable(),
  country:             z.string().optional(),
  quantity_available:  z.number().int().min(0).optional(),
  quantity_reserved:   z.number().int().min(0).optional(),
  unit_cost:           z.number().min(0).optional(),
  target_sell_price:   z.number().min(0).optional().nullable(),
  unit_serial_numbers: z.array(z.string()).optional(),
  notes:               z.string().optional().nullable(),
});

// Quick +/- stock counter endpoint
export const AdjustStockSchema = z.object({
  delta_available: z.number().int().optional().default(0),
  delta_reserved:  z.number().int().optional().default(0),
});

const optInt = z.preprocess(v => {
  if (v === null || v === undefined || v === '') return undefined;
  const clean = String(v).replace(/[^0-9-]/g, '');
  return clean === '' ? undefined : parseInt(clean, 10);
}, z.number().int().min(0).optional());

const optNum = z.preprocess(v => {
  if (v === null || v === undefined || v === '') return undefined;
  const clean = String(v).replace(/[^0-9.-]/g, '');
  return clean === '' ? undefined : Number(clean);
}, z.number().min(0).optional());

// Bulk import: array of rows (same shape as create, all fields optional except the 3 required)
export const BulkInventoryRowSchema = z.object({
  container_size:      z.string().min(1),
  container_condition: z.string().min(1),
  container_category:  z.string().optional(),
  vendor_supplier:     z.string().optional(),
  depot_name:          z.string().min(1),
  city:                z.string().optional(),
  state_province:      z.string().optional(),
  country:             z.string().optional(),
  quantity_available:  optInt,
  quantity_reserved:   optInt,
  unit_cost:           optNum,
  target_sell_price:   optNum,
  unit_serial_numbers: z.array(z.string()).optional(),
  notes:               z.string().optional(),
});

export const BulkInventorySchema = z.object({
  rows: z.array(BulkInventoryRowSchema).min(1).max(5000),
});

export type CreateInventoryPayload = z.infer<typeof CreateInventorySchema>;
export type UpdateInventoryPayload = z.infer<typeof UpdateInventorySchema>;
export type AdjustStockPayload     = z.infer<typeof AdjustStockSchema>;
export type BulkInventoryPayload   = z.infer<typeof BulkInventorySchema>;
