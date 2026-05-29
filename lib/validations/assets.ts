import { z } from 'zod';

export const createAssetSchema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  asset_code: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  purchase_price: z.number().min(0).optional().nullable(),
  current_value: z.number().min(0).optional().nullable(),
  condition: z.enum(['excellent', 'good', 'fair', 'poor', 'written_off']).default('good'),
  location: z.string().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateAssetSchema = createAssetSchema.partial().extend({
  id: z.string().uuid('Asset ID is required'),
});

export const createMaintenanceSchema = z.object({
  asset_id: z.string().uuid('Select an asset'),
  maintenance_date: z.string().min(1, 'Maintenance date is required'),
  description: z.string().min(1, 'Description is required'),
  cost: z.number().min(0).optional().nullable(),
  next_service_date: z.string().optional().nullable(),
  performed_by: z.string().optional().nullable(),
});

export type CreateAssetFormData = z.infer<typeof createAssetSchema>;
export type UpdateAssetFormData = z.infer<typeof updateAssetSchema>;
export type CreateMaintenanceFormData = z.infer<typeof createMaintenanceSchema>;
