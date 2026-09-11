/**
 * Whose numbers is this screen showing?
 *
 * Every analytics query is already scoped by the backend: an admin sees the whole company,
 * anyone else sees only their own PIC's records (see listActiveLeads and
 * getDashboardMetrics). The screens did not say so, so a sales manager read "Monthly
 * Revenue" as the company's revenue when it was only ever theirs.
 *
 * These helpers keep that wording identical everywhere rather than each dashboard
 * inventing its own phrasing.
 */

export const isAdminRole = (role?: string) => role === 'admin'

/**
 * "Revenue" for an admin, "Your revenue" for everyone else.
 *
 * Pass the label as it should read company-wide. Only the first word is lowercased, so
 * "Gross profit - this month" becomes "Your gross profit - this month" while an acronym
 * like "PIC performance" is left alone.
 */
export const scopedLabel = (label: string, role?: string) => {
  if (isAdminRole(role)) return label
  const [first, ...rest] = label.split(' ')
  const lead = first === first.toUpperCase() && first.length > 1 ? first : first.toLowerCase()
  return ['Your', lead, ...rest].join(' ')
}

/** "company-wide" / "yours only", for a caption that needs to name the scope outright. */
export const scopeNote = (role?: string) => (isAdminRole(role) ? 'company-wide' : 'your records only')
