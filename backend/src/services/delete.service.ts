import { supabaseAdmin } from '../config/supabase';
import {
  DeleteError,
  STAGES,
  QUOTATION_DEPENDENTS,
  blockedMessage,
  type DeletableStage,
  type Dependent,
} from './delete.rules';

/**
 * Hard deletion for pipeline records.
 *
 * Deleting is not the same as removing: `POST /leads/:stage/:id/remove` files an
 * entry on the Removed Sheet and suppresses the contact from future outreach, and
 * it is reversible. Delete is for records that should never have existed --
 * duplicates, test rows, typos -- and it leaves nothing behind.
 *
 * The table and foreign-key names this relies on live in delete.rules, which is
 * unit-tested; everything here is the Supabase plumbing around them.
 */

export { DeleteError, isDeletableStage } from './delete.rules';
export type { DeletableStage } from './delete.rules';

export type Actor = { role?: string; picId?: string | null; userId: string };

/**
 * Sales Managers own their silo and nothing else. Admins are unrestricted, which
 * matches how deleteSale and the rest of the pipeline already behave.
 */
const assertOwnership = (actor: Actor, rowPicId: string | null, label: string) => {
  if (actor.role !== 'sales_manager') return;
  if (!actor.picId || rowPicId !== actor.picId) {
    throw new DeleteError(`You can only delete ${label} records owned by your own PIC.`, 403);
  }
};

/** Counts rows pointing at `id`, so the caller can refuse with a useful message. */
const countDependents = async (dep: Dependent, id: string): Promise<number> => {
  const { count, error } = await supabaseAdmin
    .from(dep.table)
    .select('id', { count: 'exact', head: true })
    .eq(dep.column, id);
  if (error) throw error;
  return count ?? 0;
};

const blockIfLinked = async (dependents: Dependent[], id: string, label: string) => {
  for (const dep of dependents) {
    const count = await countDependents(dep, id);
    if (count > 0) {
      throw new DeleteError(blockedMessage(label, count, dep.label), 409);
    }
  }
};

export class DeleteService {
  /** Prospect Clients, Warm Leads and Inquiries -- structurally identical. */
  static async deletePipelineEntry(stage: DeletableStage, id: string, actor: Actor) {
    const { table, label, dependents } = STAGES[stage];

    const { data: existing, error } = await supabaseAdmin
      .from(table)
      .select('id, pic_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new DeleteError(`${label} not found.`, 404);

    assertOwnership(actor, (existing as { pic_id: string | null }).pic_id, label);
    await blockIfLinked(dependents, id, label);

    const { error: deleteError } = await supabaseAdmin.from(table).delete().eq('id', id);
    if (deleteError) throw deleteError;

    return { message: `${label} deleted successfully.` };
  }

  /**
   * The same rules as deletePipelineEntry, applied to a batch in one database call.
   *
   * Deleting a long selection one record at a time meant four queries and a round trip
   * each; a selection of thousands took longer than anyone would wait. The counts come
   * back so the caller can say what happened without asking again.
   */
  static async deletePipelineEntries(stage: DeletableStage, ids: string[], actor: Actor) {
    const { label } = STAGES[stage];
    const { data, error } = await supabaseAdmin.rpc('delete_pipeline_entries', {
      p_stage: stage,
      p_ids: ids,
      p_actor_pic_id: actor.picId ?? null,
      p_is_admin: actor.role === 'admin',
    });
    if (error) throw new DeleteError(error.message, error.code === 'P0001' ? 400 : 500);

    const result = (data ?? {}) as { requested: number; deleted: number; blocked: number; notOwned: number };
    const parts = [`${result.deleted} ${label}${result.deleted === 1 ? '' : 's'} deleted`];
    if (result.blocked) parts.push(`${result.blocked} protected by a later pipeline stage`);
    if (result.notOwned) parts.push(`${result.notOwned} not yours to delete`);
    return { message: `${parts.join(' · ')}.`, ...result };
  }

  /** Quotation items cascade; a Sale converted from the quotation does not. */
  static async deleteQuotation(id: string, actor: Actor) {
    const { data: existing, error } = await supabaseAdmin
      .from('quotations')
      .select('id, pic_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new DeleteError('Quotation not found.', 404);

    assertOwnership(actor, (existing as { pic_id: string | null }).pic_id, 'Quotation');
    await blockIfLinked(QUOTATION_DEPENDENTS, id, 'Quotation');

    const { error: deleteError } = await supabaseAdmin.from('quotations').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return { message: 'Quotation deleted successfully.' };
  }

  /**
   * Contracts go through delete_contract() (migration 053) rather than a plain
   * DELETE: the allocation rows cascade, but the inventory reservation counter
   * they feed is not a foreign key and would be stranded, leaving that stock
   * permanently unsellable.
   */
  static async deleteContract(id: string, actor: Actor) {
    const { data: existing, error } = await supabaseAdmin
      .from('contracts')
      .select('id, sale_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new DeleteError('Contract not found.', 404);

    // Contracts carry no pic_id of their own; ownership lives on the parent Sale.
    const { data: sale, error: saleError } = await supabaseAdmin
      .from('sales')
      .select('pic_id')
      .eq('id', (existing as { sale_id: string }).sale_id)
      .maybeSingle();
    if (saleError) throw saleError;
    assertOwnership(actor, (sale as { pic_id: string | null } | null)?.pic_id ?? null, 'Contract');

    const { error: rpcError } = await supabaseAdmin.rpc('delete_contract', {
      p_contract_id: id,
      p_actor_id: actor.userId,
    });
    if (rpcError) {
      // P0001 is the guard inside the function (fulfilled contracts); anything
      // else is a genuine fault and should not be reported as a user mistake.
      throw new DeleteError(rpcError.message, rpcError.code === 'P0001' ? 409 : 400);
    }

    return { message: 'Contract deleted successfully.' };
  }

  /**
   * A customer account is not a stored row -- customer_accounts_view rolls up a
   * company's Won sales. Deleting the account therefore means deleting those
   * sales, which is what makes the company appear on the list at all.
   *
   * Scoped by PIC for Sales Managers, so deleting from Active Clients removes only
   * that manager's own sales for the company, not a colleague's.
   */
  static async deleteCustomerAccount(companyId: string, actor: Actor, picId?: string) {
    const effectivePicId = actor.role === 'sales_manager' ? actor.picId : picId;
    if (actor.role === 'sales_manager' && !effectivePicId) {
      throw new DeleteError('You must be assigned a PIC identity by an admin before deleting records.', 403);
    }

    let query = supabaseAdmin
      .from('sales')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'Won');
    if (effectivePicId) query = query.eq('pic_id', effectivePicId);

    const { data: sales, error } = await query;
    if (error) throw error;

    const saleIds = (sales ?? []).map((s: { id: string }) => s.id);
    if (saleIds.length === 0) throw new DeleteError('Customer account not found.', 404);

    const { count: contractCount, error: contractError } = await supabaseAdmin
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .in('sale_id', saleIds);
    if (contractError) throw contractError;
    if ((contractCount ?? 0) > 0) {
      throw new DeleteError(
        `This customer has ${contractCount} Contract${contractCount === 1 ? '' : 's'} and cannot be deleted. ` +
        'Delete the contracts first.',
        409,
      );
    }

    const { error: deleteError } = await supabaseAdmin.from('sales').delete().in('id', saleIds);
    if (deleteError) throw deleteError;

    return {
      message: `Customer account deleted (${saleIds.length} sale${saleIds.length === 1 ? '' : 's'} removed).`,
    };
  }
}
