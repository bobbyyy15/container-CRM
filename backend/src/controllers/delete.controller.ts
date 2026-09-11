import { Request, Response } from 'express';
import { DeleteService, DeleteError, isDeletableStage, type Actor } from '../services/delete.service';

const actorFrom = (req: Request): Actor => ({
  role: req.auth?.profile.role,
  picId: req.auth?.profile.pic_id,
  userId: req.auth!.user.id,
});

/**
 * DeleteError already knows which status it wants (404 missing, 403 not yours,
 * 409 still linked to something). Anything else is an unexpected fault and gets
 * the 400 the rest of these controllers use.
 */
const send = async (res: Response, work: () => Promise<{ message: string }>) => {
  try {
    const result = await work();
    res.json({ success: true, ...result });
  } catch (error: any) {
    const status = error instanceof DeleteError ? error.status : 400;
    res.status(status).json({ success: false, error: { message: error.message } });
  }
};

export class DeleteController {
  static async deletePipelineEntry(req: Request, res: Response) {
    const stage = String(req.params.stage);
    if (!isDeletableStage(stage)) {
      return res.status(404).json({ success: false, error: { message: `Cannot delete "${stage}" records.` } });
    }
    await send(res, () => DeleteService.deletePipelineEntry(stage, String(req.params.entityId), actorFrom(req)));
  }

  static async deletePipelineEntries(req: Request, res: Response) {
    const stage = String(req.params.stage);
    if (!isDeletableStage(stage)) {
      return res.status(404).json({ success: false, error: { message: `Cannot delete "${stage}" records.` } });
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) {
      return res.status(400).json({ success: false, error: { message: 'No records were selected.' } });
    }
    if (ids.length > 5000) {
      return res.status(400).json({ success: false, error: { message: 'Delete at most 5000 records per request.' } });
    }
    await send(res, () => DeleteService.deletePipelineEntries(stage, ids, actorFrom(req)));
  }

  static async deleteQuotation(req: Request, res: Response) {
    await send(res, () => DeleteService.deleteQuotation(String(req.params.id), actorFrom(req)));
  }

  static async deleteContract(req: Request, res: Response) {
    await send(res, () => DeleteService.deleteContract(String(req.params.id), actorFrom(req)));
  }

  static async deleteCustomerAccount(req: Request, res: Response) {
    const picId = req.query.pic_id ? String(req.query.pic_id) : undefined;
    await send(res, () => DeleteService.deleteCustomerAccount(String(req.params.companyId), actorFrom(req), picId));
  }
}
