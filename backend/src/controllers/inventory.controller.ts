import { Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';
import {
  CreateInventorySchema,
  UpdateInventorySchema,
  AdjustStockSchema,
  BulkInventorySchema,
} from '../schemas/inventory.schema';

export class InventoryController {

  // GET /api/v1/inventory
  static async list(req: Request, res: Response) {
    try {
      const data = await InventoryService.listInventory({
        search:              req.query.search              as string | undefined,
        container_size:      req.query.container_size      as string | undefined,
        container_condition: req.query.container_condition as string | undefined,
        depot_name:          req.query.depot_name          as string | undefined,
        vendor_supplier:     req.query.vendor_supplier     as string | undefined,
        status:              req.query.status              as string | undefined,
        limit:               req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  }

  // GET /api/v1/inventory/summary
  static async summary(req: Request, res: Response) {
    try {
      const data = await InventoryService.getSummary();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  }

  // GET /api/v1/inventory/stock-check?size=...&condition=...
  // Used by Procurement's Inquiry Validation cross-check widget.
  static async stockCheck(req: Request, res: Response) {
    try {
      const size      = req.query.size      as string;
      const condition = req.query.condition as string;
      if (!size || !condition) {
        return res.status(400).json({ success: false, error: { message: 'size and condition query params are required' } });
      }
      const data = await InventoryService.getStockForSpec(size, condition);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  }

  // POST /api/v1/inventory
  static async create(req: Request, res: Response) {
    try {
      const parsed = CreateInventorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }
      const actorId = req.auth!.profile.id;
      const data = await InventoryService.createInventory(parsed.data, actorId);
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message } });
    }
  }

  // POST /api/v1/inventory/bulk
  static async bulkImport(req: Request, res: Response) {
    try {
      const parsed = BulkInventorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }
      const actorId = req.auth!.profile.id;
      const data = await InventoryService.bulkImport(parsed.data, actorId);
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message } });
    }
  }

  // PATCH /api/v1/inventory/:id
  static async update(req: Request, res: Response) {
    try {
      const parsed = UpdateInventorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }
      const id        = String(req.params.id);
      const actorId   = req.auth!.profile.id;
      const actorRole = req.auth!.profile.role;
      const data = await InventoryService.updateInventory(id, parsed.data, actorId, actorRole);
      res.json({ success: true, data });
    } catch (err: any) {
      const status = err.message.includes('only edit') ? 403 : 400;
      res.status(status).json({ success: false, error: { message: err.message } });
    }
  }

  // PATCH /api/v1/inventory/:id/stock
  static async adjustStock(req: Request, res: Response) {
    try {
      const parsed = AdjustStockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { message: parsed.error.issues[0].message } });
      }
      const id        = String(req.params.id);
      const actorId   = req.auth!.profile.id;
      const actorRole = req.auth!.profile.role;
      const data = await InventoryService.adjustStock(id, parsed.data, actorId, actorRole);
      res.json({ success: true, data });
    } catch (err: any) {
      const status = err.message.includes('only adjust') ? 403 : 400;
      res.status(status).json({ success: false, error: { message: err.message } });
    }
  }

  // DELETE /api/v1/inventory/:id
  static async remove(req: Request, res: Response) {
    try {
      const actorRole = req.auth!.profile.role;
      await InventoryService.deleteInventory(String(req.params.id), actorRole);
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message.includes('Only admins') ? 403 : 400;
      res.status(status).json({ success: false, error: { message: err.message } });
    }
  }
}
