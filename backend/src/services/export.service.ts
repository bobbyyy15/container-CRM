import { google } from 'googleapis';
import { getGoogleOAuthConfig } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

// Google caps a single spreadsheet at 10M cells, but the practical limit here is the
// request payload -- keep exports to something a browser can post and Sheets can write
// in one call.
const MAX_ROWS = 20000;

export class ExportService {

  /**
   * Creates a new Google Sheet in the actor's own Drive and writes the exported rows
   * into it. Uses the drive.file scope, which grants access only to files this app
   * creates -- it cannot read anything else in the user's Drive.
   */
  static async createGoogleSheet(actorId: string, title: string, rows: Record<string, any>[]) {
    if (!rows.length) throw new Error('There is nothing to export.');
    if (rows.length > MAX_ROWS) {
      throw new Error(`This export has ${rows.length} rows, which is over the ${MAX_ROWS} row limit. Filter it down or use the CSV export instead.`);
    }

    const googleConfig = getGoogleOAuthConfig();

    const { data: credential, error: credentialError } = await supabaseAdmin
      .from('google_oauth_credentials')
      .select('refresh_token, google_email')
      .eq('user_id', actorId)
      .maybeSingle();

    if (credentialError || !credential) {
      throw new Error('Connect a Google account in System Settings before exporting to Google Sheets.');
    }

    const authClient = new google.auth.OAuth2(googleConfig.clientId, googleConfig.clientSecret, googleConfig.redirectUri);
    authClient.setCredentials({ refresh_token: credential.refresh_token });

    // Flatten to a header row plus value rows, stringifying so Sheets doesn't reinterpret
    // things like reference ids or phone numbers as numbers/dates.
    const headers = Object.keys(rows[0]);
    const values = [
      headers,
      ...rows.map(row => headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      })),
    ];

    const sheets = google.sheets({ version: 'v4', auth: authClient });

    try {
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [{ properties: { title: 'Export', gridProperties: { frozenRowCount: 1 } } }],
        },
      });

      const spreadsheetId = created.data.spreadsheetId!;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Export!A1',
        valueInputOption: 'RAW',
        requestBody: { values },
      });

      // Bold the header row so the sheet is readable on open.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId: created.data.sheets![0].properties!.sheetId!, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          }],
        },
      });

      return {
        spreadsheetId,
        url: created.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        rowCount: rows.length,
        googleEmail: credential.google_email,
      };
    } catch (err: any) {
      // Accounts connected before Sheets export existed only granted gmail.send, so the
      // token has no Drive access until they reconnect and approve the new scope.
      const reason = err?.response?.data?.error;
      const message = String(err?.message ?? '');
      if (
        err?.code === 403 || err?.code === 401 ||
        reason === 'invalid_scope' || reason === 'insufficient_scope' ||
        message.includes('insufficient authentication scopes') ||
        message.includes('invalid_grant')
      ) {
        throw new Error('Your Google connection does not include Sheets access yet. Go to System Settings, disconnect Google, and reconnect to grant it.');
      }
      throw new Error(`Google Sheets export failed: ${message || 'unknown error'}`);
    }
  }
}
