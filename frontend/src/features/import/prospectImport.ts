import { formatPhoneNumber } from '../../lib/formatters'
import { formatCountryAbbr, formatStateAbbr, formatCityTitleCase } from '../../lib/places'

export type ProspectImportRow = {
  date_added?: string
  pic?: string
  category?: string
  sms_deliverability?: string
  email_deliverability?: string
  industry?: string
  service_locations?: string
  country?: string
  state_province?: string
  city?: string
  company_name: string
  contact_person?: string
  contact_number_direct?: string
  contact_number_2?: string
  email_active?: string
  email_2?: string
  address?: string
}

// 'skipped' rows are normal for messy source data (e.g. a carrier census row with no company
// name attached) -- not a mistake worth alarming over. 'issue' is something actually worth a
// second look, like a duplicate identity within the same file or a header that couldn't be
// recognized at all.
export type ImportNote = { message: string; kind: 'skipped' | 'issue' }

export type ParsedProspectImport = {
  rows: ProspectImportRow[]
  // Every non-empty candidate row, including ones missing a company name or contact info.
  // These should still be submitted: the backend records them in import history with a
  // specific reason instead of silently discarding them (see process_prospect_import_batch).
  submitRows: ProspectImportRow[]
  errors: ImportNote[]
  sourceRows: number
}

const fields: (keyof ProspectImportRow)[] = [
  'date_added', 'pic', 'category', 'sms_deliverability', 'email_deliverability',
  'industry', 'service_locations', 'country', 'state_province', 'city',
  'company_name', 'contact_person', 'contact_number_direct', 'contact_number_2',
  'email_active', 'email_2', 'address',
]

const aliases: Record<string, keyof ProspectImportRow> = {
  dateadded: 'date_added', date: 'date_added', pic: 'pic', category: 'category',
  smsdeliverability: 'sms_deliverability', smsdeliv: 'sms_deliverability',
  emaildeliverability: 'email_deliverability', emaildeliv: 'email_deliverability',
  industry: 'industry', territory: 'service_locations', servicelocations: 'service_locations',
  country: 'country', state: 'state_province', province: 'state_province', stateprovince: 'state_province',
  city: 'city', company: 'company_name', companyname: 'company_name', businessname: 'company_name',
  companylegalname: 'company_name', organization: 'company_name', organisation: 'company_name', client: 'company_name',
  contact: 'contact_person', contactperson: 'contact_person', contactname: 'contact_person', fullname: 'contact_person',
  directline: 'contact_number_direct', phone: 'contact_number_direct', phonenumber: 'contact_number_direct',
  mobile: 'contact_number_direct', mobilenumber: 'contact_number_direct', cellphone: 'contact_number_direct',
  telephone: 'contact_number_direct', contactno: 'contact_number_direct', contactnumber: 'contact_number_direct',
  contactnumberdirect: 'contact_number_direct', phone2: 'contact_number_2', alternatephone: 'contact_number_2',
  contactnumber2: 'contact_number_2', email: 'email_active', emailaddress: 'email_active', workemail: 'email_active',
  emailactive: 'email_active', email1: 'email_active', email2: 'email_2', alternateemail: 'email_2',
  address: 'address', streetaddress: 'address', location: 'address',
  // Business and carrier registries name the company column after the registration, not
  // the word "company": FMCSA census exports ship LEGAL_NAME and DBA_NAME, and broker
  // lists use "Carrier Name" or "Trade Name". Unrecognized, every row in such a file
  // failed as "missing company name".
  legalname: 'company_name', legalbusinessname: 'company_name', dbaname: 'company_name',
  dba: 'company_name', carriername: 'company_name', carrier: 'company_name',
  entityname: 'company_name', tradename: 'company_name', operatingname: 'company_name',
  corporatename: 'company_name', accountname: 'company_name', customername: 'company_name',
}

// Carrier/business registry exports (e.g. FMCSA census data) commonly carry per-commodity
// Y/N flag columns instead of a single "industry" field. When no explicit Industry column
// is present, derive it from whichever of these are marked Y on the row -- otherwise that
// data is simply discarded even though it's the closest thing to an industry classification
// the source file has.
const CARGO_TYPE_LABELS: Record<string, string> = {
  generalfreight: 'General Freight', householdgoods: 'Household Goods',
  metalsheetscoilsrolls: 'Metal Sheets/Coils/Rolls', motorvehicles: 'Motor Vehicles',
  driveawaytowaway: 'Driveaway/Towaway', logspolesbeamslumber: 'Logs/Poles/Beams/Lumber',
  buildingmaterials: 'Building Materials', mobilehomes: 'Mobile Homes',
  machinerylargeobjects: 'Machinery/Large Objects', freshproduce: 'Fresh Produce',
  liquidsgases: 'Liquids/Gases', intermodalcontainers: 'Intermodal Containers',
  passengers: 'Passengers', oilfieldequipment: 'Oilfield Equipment', livestock: 'Livestock',
  grainfeedhay: 'Grain/Feed/Hay', coalcoke: 'Coal/Coke', meat: 'Meat',
  garbagerefusetrash: 'Garbage/Refuse/Trash', usmail: 'US Mail', chemicals: 'Chemicals',
  commoditiesdrybulk: 'Dry Bulk Commodities', refrigeratedfood: 'Refrigerated Food',
  beverages: 'Beverages', paperproducts: 'Paper Products', utility: 'Utility',
  farmsupplies: 'Farm Supplies', construction: 'Construction', waterwell: 'Water Well',
  cargoother: 'Other',
}

const clean = (value: unknown) => String(value ?? '').trim()
const key = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^\d+/, '')
const phone = (value: string | undefined) => clean(value).replace(/\D/g, '')
const email = (value: string | undefined) => clean(value).toLowerCase()

// Real-world spreadsheets rarely match the alias dictionary exactly (e.g. "Client Name",
// "PIC Contact", "Company Officer"). Once the exact-match alias lookup misses, fall back to
// keyword heuristics so an unfamiliar header still lands on the right field instead of
// silently dropping Company Name / Contact Person and failing every row with the same error.
// Person-role words are checked before the generic "company" pattern on purpose: a header
// like "company_officer" or "company_contact" names a PERSON, even though it contains the
// word "company".
const strongGuess = (k: string): keyof ProspectImportRow | undefined => {
  if (!k) return undefined
  if (k.includes('email')) return /2|alt|secondary/.test(k) ? 'email_2' : 'email_active'
  if (/phone|mobile|cell|tel|whatsapp|contactno|contactnum/.test(k)) {
    return /2|alt|secondary/.test(k) ? 'contact_number_2' : 'contact_number_direct'
  }
  if (/officer|owner|principal|manager|agent|representative|president|attn|attention|poc|contact|person/.test(k)) return 'contact_person'
  if (/company|business|client|organi[sz]ation|firm|account|vendor|customer/.test(k)) return 'company_name'
  // Registry wording for the same thing. Checked after the person-role patterns above, so
  // "legal contact" or "carrier rep" still resolves to a person.
  if (/carrier|legal|dba|entity|trade|operating|corporate|enterprise|establishment/.test(k)) return 'company_name'
  if (/industry|sector/.test(k)) return 'industry'
  if (/country/.test(k)) return 'country'
  if (/state|province/.test(k)) return 'state_province'
  if (/city|town/.test(k)) return 'city'
  // Exclude "...is_undeliverable" flags: they contain the substring "address" but are a
  // Y/N delivery-outcome indicator, not an actual street address.
  if (/address|location|street/.test(k) && !k.includes('undeliverable')) return 'address'
  // "status" alone is too common a substring to match loosely -- "operating_status" is an
  // unrelated FMCSA authority concept, not the CRM's Proceed/Removed outreach category, and
  // matching it here silently corrupted the category column (confirmed against a real file).
  // Only an exact, known category-ish header counts.
  if (['category', 'status', 'leadstatus', 'leadcategory', 'prospectstatus', 'prospectcategory'].includes(k)) return 'category'
  if (/date/.test(k)) return 'date_added'
  return undefined
}

// Single-cell resolution used for header detection, where a lone "Name" cell is treated as
// the (common) contact-person case by default.
const resolveField = (cell: unknown): keyof ProspectImportRow | undefined => {
  const k = key(cell)
  return aliases[k] ?? strongGuess(k) ?? (k === 'name' ? 'contact_person' : undefined)
}

// Full-row header resolution: strong signals first, then let a lone generic "Name" column
// fill in whichever of Company Name / Contact Person a stronger column (like "Company
// Officer") didn't already claim, instead of defaulting it and colliding with that column.
const resolveHeaderFields = (header: unknown[]): (keyof ProspectImportRow | undefined)[] => {
  const strong = header.map(cell => {
    const k = key(cell)
    return aliases[k] ?? strongGuess(k)
  })
  const claimed = new Set(strong.filter(Boolean))
  return header.map((cell, index) => {
    if (strong[index]) return strong[index]
    if (key(cell) === 'name') return claimed.has('company_name') ? 'contact_person' : 'company_name'
    return undefined
  })
}

const validateCandidates = (
  candidates: { record: Record<string, string>; rowNumber: number }[],
  sourceRows = candidates.length,
): ParsedProspectImport => {
  const rows: ProspectImportRow[] = []
  // Every candidate becomes a submitRow regardless of validity -- the backend is the
  // authority on what's importable vs. recorded for review (see process_prospect_import_batch).
  const submitRows: ProspectImportRow[] = candidates.map(({ record }) => record as ProspectImportRow)
  const errors: ImportNote[] = []
  const seenEmails = new Map<string, number>()
  const seenPhones = new Map<string, number>()

  candidates.forEach(({ record, rowNumber }) => {
    // Company and Contact are separate entities: a company can exist before a named human
    // contact is known (common in raw data sources like carrier/business registries), so
    // only a missing company name blocks the row outright. A row with no company name and
    // no contact identity is normal for messy/mixed source data, not a mistake -- skip it
    // quietly rather than flagging it as something to fix.
    if (!record.company_name) {
      errors.push({ message: `Excel row ${rowNumber}: missing company name.`, kind: 'skipped' })
      return
    }
    const emails = [email(record.email_active), email(record.email_2)].filter(Boolean)
    const phones = [phone(record.contact_number_direct), phone(record.contact_number_2)].filter(Boolean)
    if (!emails.length && !phones.length) {
      errors.push({ message: `Excel row ${rowNumber}: no email or phone on file.`, kind: 'skipped' })
      return
    }
    if (record.email_active && !record.email_active.includes('@')) {
      errors.push({ message: `Excel row ${rowNumber}: Email "${record.email_active}" must contain an "@".`, kind: 'issue' })
      return
    }
    if (record.email_2 && !record.email_2.includes('@')) {
      errors.push({ message: `Excel row ${rowNumber}: Email 2 "${record.email_2}" must contain an "@".`, kind: 'issue' })
      return
    }

    const duplicateAt = emails.map(value => seenEmails.get(value)).find(value => value !== undefined)
      ?? phones.map(value => seenPhones.get(value)).find(value => value !== undefined)
    if (duplicateAt !== undefined) {
      errors.push({ message: `Excel row ${rowNumber}: duplicate contact identity already appears in row ${duplicateAt}.`, kind: 'issue' })
      return
    }
    emails.forEach(value => seenEmails.set(value, rowNumber))
    phones.forEach(value => seenPhones.set(value, rowNumber))
    rows.push(record as ProspectImportRow)
  })

  return { rows, submitRows, errors, sourceRows }
}

const isEmailCell = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || (v.includes('@') && v.includes('.') && !v.includes(' '))
const isPhoneCell = (v: string) => {
  const digits = v.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 && /^[\d\s\-+().ext#/]+$/i.test(v)
}

const isNumericCell = (v: string) => /^[\d\s.,%$-]+$/.test(v)
const isDateCell = (v: string) => /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(v)
const isFlagCell = (v: string) => /^(y|n|yes|no|true|false|0|1)$/i.test(v)

type ColumnStats = {
  c: number
  total: number
  emailCount: number
  phoneCount: number
  /** Cells that could plausibly be an organization name: words, not codes or flags. */
  nameLikeCount: number
  distinct: number
}

const columnStats = (rows: { row: unknown[] }[], maxCols: number): ColumnStats[] =>
  Array.from({ length: maxCols }, (_, c) => {
    const values = rows.map(r => clean(r.row[c])).filter(Boolean)
    return {
      c,
      total: values.length,
      emailCount: values.filter(isEmailCell).length,
      phoneCount: values.filter(isPhoneCell).length,
      nameLikeCount: values.filter(v =>
        v.length > 2 && /[a-z]/i.test(v)
        && !isEmailCell(v) && !isPhoneCell(v) && !isNumericCell(v) && !isDateCell(v) && !isFlagCell(v)
      ).length,
      distinct: new Set(values.map(v => v.toLowerCase())).size,
    }
  })

const US_STATES = new Set(('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc pr').split(' '))
const COUNTRY_CODES = new Set(['us', 'usa', 'united states', 'ca', 'can', 'canada', 'mx', 'mexico', 'ph', 'phl', 'philippines'])
const STREET_WORDS = /\b(rd|road|st|street|ave|avenue|blvd|hwy|highway|ln|lane|dr|drive|ct|court|way|pkwy|circle|cir|county|cr|mcr|route|rt|box|suite|ste|apt|unit|floor|fl)\b/i

const COMPANY_SUFFIX = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|gmbh|pte|bv|sa|srl|llp|lp|group|holdings|enterprises?|industries|logistics|freight|lines|shipping|trucking|transport|trading|services|solutions|supply|systems)\b\.?$/i
const CODE_LIKE = /^[a-z]{0,4}[-_ ]?\d+[a-z]?$/i

const isStateCell = (v: string) => US_STATES.has(v.toLowerCase()) || (v.length <= 3 && /^[a-z]{2,3}$/i.test(v))
const isCountryCell = (v: string) => COUNTRY_CODES.has(v.toLowerCase())
// A street address starts with a house number or names a street type. Merely holding a
// digit and three words is not enough: "RAW HAULERS 1 LLC" cleared that bar and got
// claimed as the address column, pushing the company name out of its own field.
const isAddressCell = (v: string) =>
  /\d/.test(v) && !COMPANY_SUFFIX.test(v) && (STREET_WORDS.test(v) || /^\d+\s+\S/.test(v))
const isPersonCell = (v: string) => {
  const words = v.split(/\s+/).filter(Boolean)
  return words.length >= 2 && words.length <= 4 && words.every(w => /^[a-z.'-]+$/i.test(w)) && !COMPANY_SUFFIX.test(v)
}

/**
 * Work out what each column holds when the sheet has no header row at all -- a plain paste
 * out of Excel, which is how most of this data arrives.
 *
 * Columns are claimed by what their cells actually look like, strongest signal first, and
 * only then by position. The previous version recognized one email and one phone and then
 * handed the leftover columns to company / contact / city / state in order, which quietly
 * mangled the common export shape: a second phone column became the city, and the street
 * address became the state. Those wrong values then decide company identity on import (the
 * match is on name plus country/state/city), so every row after the first collided with the
 * company it had just created and came back as a conflict.
 */
const inferHeaderlessColumns = (rows: { row: unknown[]; rowNumber: number }[]): (keyof ProspectImportRow | undefined)[] => {
  if (!rows.length) return []
  const maxCols = Math.max(...rows.map(r => r.row.length))
  if (maxCols === 0) return []

  const mapping: (keyof ProspectImportRow | undefined)[] = new Array(maxCols).fill(undefined)
  const columns = Array.from({ length: maxCols }, (_, c) => {
    const values = rows.map(r => clean(r.row[c])).filter(Boolean)
    const share = (predicate: (v: string) => boolean) =>
      values.length ? values.filter(predicate).length / values.length : 0
    return {
      c,
      values,
      total: values.length,
      email: share(isEmailCell),
      phone: share(isPhoneCell),
      state: share(isStateCell),
      country: share(isCountryCell),
      address: share(v => isAddressCell(v) && !isPhoneCell(v)),
      person: share(v => isPersonCell(v) && !isEmailCell(v)),
      company: share(v => COMPANY_SUFFIX.test(v)),
      word: share(v => /[a-z]/i.test(v) && !isEmailCell(v) && !isPhoneCell(v) && !isNumericCell(v) && !isDateCell(v) && !isFlagCell(v)),
    }
  }).filter(column => column.total > 0)

  const free = () => columns.filter(column => !mapping[column.c])
  /** Claim the column that scores highest on `of`, if it clears `floor`. */
  const claim = (field: keyof ProspectImportRow, of: (column: typeof columns[number]) => number, floor = 0.5) => {
    const best = free().sort((a, b) => of(b) - of(a))[0]
    if (best && of(best) >= floor) {
      mapping[best.c] = field
      return best
    }
    return undefined
  }

  // Unambiguous shapes first: an email is an email wherever it sits.
  claim('email_active', column => column.email, 0.3)
  claim('email_2', column => column.email, 0.3)
  claim('contact_number_direct', column => column.phone, 0.3)
  claim('contact_number_2', column => column.phone, 0.3)
  // Country and state before company: "CO" is Colorado here, not the suffix of "& Co".
  claim('country', column => column.country, 0.7)
  claim('state_province', column => column.state, 0.7)
  claim('address', column => column.address, 0.5)
  // Then the two that carry the record: a legal suffix marks the company, and a plain
  // two-or-three-word all-letters cell marks the person.
  claim('company_name', column => column.company, 0.4)
  claim('contact_person', column => column.person, 0.5)
  // Whatever is still unclaimed falls back to position, left to right, for the fields a
  // prospect cannot do without.
  const remaining = free().filter(column => column.word >= 0.5)
  const missing = (['company_name', 'contact_person', 'city'] as const).filter(field => !mapping.includes(field))
  missing.forEach((field, index) => {
    const column = remaining[index]
    if (column) mapping[column.c] = field
  })

  return mapping
}

/**
 * A header row that names every column except the company one used to fail the whole
 * sheet: without company_name mapped, every row came back "missing company name" and
 * nothing could be imported, however complete the data actually was.
 *
 * So when the header leaves it unmapped, pick the column out of the data instead. The test
 * is whether a column reads like a list of organization names rather than a list of codes:
 * several words per cell, a legal suffix like LLC or Inc, real length. A reference column
 * ("A-1", "DOT123") clears every generic "is this text?" check, so those signals are what
 * separate it from a company column -- and when nothing scores, nothing is guessed, which
 * keeps a sheet of IDs and flags from being imported as companies.
 */

const inferCompanyColumn = (
  mapped: (keyof ProspectImportRow | undefined)[],
  rows: { row: unknown[] }[],
): number | undefined => {
  if (!rows.length) return undefined
  const maxCols = Math.max(mapped.length, ...rows.map(r => r.row.length))

  const scored = columnStats(rows, maxCols)
    .filter(stat => !mapped[stat.c] && stat.total >= Math.max(1, rows.length * 0.5))
    .filter(stat => stat.nameLikeCount >= stat.total * 0.7 && stat.distinct > 1)
    .map(stat => {
      const values = rows.map(r => clean(r.row[stat.c])).filter(Boolean)
      const share = (predicate: (v: string) => boolean) => values.filter(predicate).length / values.length
      const multiWord = share(v => v.includes(' '))
      const suffixed = share(v => COMPANY_SUFFIX.test(v))
      const codeLike = share(v => CODE_LIKE.test(v))
      const averageLength = values.reduce((total, v) => total + v.length, 0) / values.length
      return {
        c: stat.c,
        // A company column earns its place on at least one of these, not on merely being
        // text: multi-word values, a legal suffix, or names long enough not to be codes.
        qualifies: codeLike < 0.5 && (multiWord >= 0.5 || suffixed >= 0.3 || averageLength >= 8),
        score: multiWord * 3 + suffixed * 4 + averageLength / 10 - codeLike * 5,
      }
    })
    .filter(entry => entry.qualifies)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.c
}

/**
 * A transposed sheet runs field labels DOWN a column, with each prospect in a column of
 * its own -- the shape of a filled-in form rather than a table.
 *
 * The catch is that an ordinary sheet's header row is also made of field labels, so a
 * naive reading turns "Date Added | PIC | Category | ..." into a record per header and
 * rotates the whole file. Hence the gate: the labels must run down a column, at least
 * three of them, at the same column index and naming different fields. One header row can
 * never satisfy that, and a real vertical form always does.
 */
const parseTransposed = (nonEmpty: { row: unknown[]; rowNumber: number }[]): ParsedProspectImport | null => {
  const labelled = nonEmpty
    .map(({ row }) => {
      const labelIndex = row.findIndex(cell => Boolean(resolveField(cell)))
      return labelIndex < 0 ? null : { row, labelIndex, field: resolveField(row[labelIndex])! }
    })
    .filter((entry): entry is { row: unknown[]; labelIndex: number; field: keyof ProspectImportRow } => entry !== null)

  const byColumn = new Map<number, typeof labelled>()
  labelled.forEach(entry => byColumn.set(entry.labelIndex, [...(byColumn.get(entry.labelIndex) ?? []), entry]))
  const labelColumn = [...byColumn.entries()]
    .map(([index, entries]) => ({ index, entries, fields: new Set(entries.map(e => e.field)).size }))
    .sort((a, b) => b.fields - a.fields)[0]

  if (!labelColumn || labelColumn.fields < 3) return null

  const transposed = new Map<number, Record<string, string>>()
  labelColumn.entries.forEach(({ row, labelIndex, field }) => {
    row.slice(labelIndex + 1).forEach((cell, offset) => {
      const value = clean(cell)
      if (!value) return
      const column = labelIndex + offset + 1
      const record = transposed.get(column) ?? {}
      record[field] = value
      transposed.set(column, record)
    })
  })

  const candidates = [...transposed.entries()]
    .sort(([a], [b]) => a - b)
    .map(([column, record]) => ({ record, rowNumber: column + 1 }))
  return candidates.length ? validateCandidates(candidates) : null
}

export const parseProspectMatrix = (matrix: unknown[][]): ParsedProspectImport => {
  const nonEmpty = matrix
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(item => item.row.some(cell => clean(cell)))
  if (nonEmpty.length === 0) return { rows: [], submitRows: [], errors: [{ message: 'The sheet must contain prospect data.', kind: 'issue' }], sourceRows: 0 }

  const transposedResult = parseTransposed(nonEmpty)

  const headerCandidate = nonEmpty
    .slice(0, 25)
    .map(item => {
      const filled = item.row.map(clean).filter(Boolean)
      // A row holding an email or a phone number is a record, not a description of one.
      // That alone separates them: requiring most cells to be labels as well rejected
      // real headers whose columns are mostly unfamiliar (e.g. "Ref | Count | Flag | Email").
      const carriesData = filled.some(value => isEmailCell(value) || isPhoneCell(value))
      const recognized = item.row.filter(cell => resolveField(cell)).length
      return { ...item, recognized: carriesData ? 0 : recognized }
    })
    .sort((a, b) => b.recognized - a.recognized)[0]
  
  const hasMultiHeader = headerCandidate && headerCandidate.recognized >= 2 && nonEmpty.length > 1
  const hasSingleHeader = headerCandidate && headerCandidate.recognized === 1 && headerCandidate.rowNumber === 1 && nonEmpty.length > 1
  const hasHeader = Boolean(hasMultiHeader || hasSingleHeader)

  let mapped: (keyof ProspectImportRow | undefined)[]
  let dataRows: { row: unknown[]; rowNumber: number }[]

  let inferredCompanyLabel: string | undefined

  if (hasHeader) {
    mapped = resolveHeaderFields(headerCandidate.row)
    dataRows = nonEmpty.filter(item => item.rowNumber > headerCandidate.rowNumber)
    if (!mapped.includes('company_name')) {
      const column = inferCompanyColumn(mapped, dataRows)
      if (column !== undefined) {
        mapped[column] = 'company_name'
        inferredCompanyLabel = clean(headerCandidate.row[column]) || `column ${column + 1}`
      }
    }
  } else {
    mapped = inferHeaderlessColumns(nonEmpty)
    dataRows = nonEmpty
  }

  const cargoColumns = hasHeader
    ? headerCandidate.row
      .map((cell, index) => ({ index, label: CARGO_TYPE_LABELS[key(cell)] }))
      .filter((entry): entry is { index: number; label: string } => Boolean(entry.label))
    : []
  const cargoOtherDescriptionIndex = hasHeader
    ? headerCandidate.row.findIndex(cell => key(cell) === 'cargootherdescription')
    : -1

  const candidates = dataRows.map(({ row: source, rowNumber }) => {
    const record: Record<string, string> = {}
    // First non-empty match for a field wins, so a duplicate/overlapping column mapping
    // (e.g. two phone-like headers) can't blank out an already-populated field.
    mapped.forEach((field, index) => {
      if (!field || record[field]) return
      let value = clean(source[index])
      if (value) {
        if (field === 'contact_number_direct' || field === 'contact_number_2') {
          value = formatPhoneNumber(value)
        } else if (field === 'country') {
          value = formatCountryAbbr(value)
        } else if (field === 'state_province') {
          value = formatStateAbbr(value)
        } else if (field === 'city') {
          value = formatCityTitleCase(value)
        }
        record[field] = value
      }
    })
    if (!record.industry && cargoColumns.length) {
      const active = cargoColumns
        .filter(({ index }) => /^y(es)?$/i.test(clean(source[index])))
        .map(({ label }) => {
          if (label !== 'Other' || cargoOtherDescriptionIndex < 0) return label
          const description = clean(source[cargoOtherDescriptionIndex])
          return description ? `Other (${description})` : label
        })
      if (active.length) record.industry = active.join(', ')
    }
    return { record, rowNumber }
  })

  const result = validateCandidates(candidates, dataRows.length)

  // Both readings are now on the table: take the one that found more prospects, and on a
  // tie the ordinary row-wise one, which is what nearly every sheet is.
  if (transposedResult && transposedResult.rows.length > result.rows.length) return transposedResult

  if (inferredCompanyLabel && result.rows.length) {
    result.errors.unshift({
      message: `No column was named like a company, so "${inferredCompanyLabel}" was read as the Company Name. `
        + 'Check the preview below before importing.',
      kind: 'issue',
    })
  }
  if (!result.rows.length && result.sourceRows > 0 && !mapped.includes('company_name')) {
    const headerText = (hasHeader ? headerCandidate.row : nonEmpty[0].row).map(clean).filter(Boolean).join(', ')
    result.errors.unshift({
      message: `Couldn't find a Company Name column in this sheet (${headerText || 'no recognizable columns detected'}). `
        + `Rename that column to something like "Company", or use the CRM template below, then re-import.`,
      kind: 'issue',
    })
  }
  return result
}

export const parseProspectFile = async (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !['xls', 'xlsx', 'csv'].includes(extension)) {
    throw new Error('Choose an .xls, .xlsx, or .csv file.')
  }
  const { read, utils } = await import('xlsx')
  const workbook = read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const results = workbook.SheetNames.map(name => parseProspectMatrix(
    utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' }),
  ))
  return results.find(result => result.rows.length > 0)
    ?? results.sort((a, b) => b.sourceRows - a.sourceRows)[0]
    ?? { rows: [], submitRows: [], errors: [{ message: 'The workbook does not contain any readable prospect data.', kind: 'issue' as const }], sourceRows: 0 }
}

export const parseProspectPaste = async (value: string) => {
  if (!value.trim()) return { rows: [], submitRows: [], errors: [{ message: 'Paste copied spreadsheet cells first.', kind: 'issue' as const }], sourceRows: 0 }
  const { read, utils } = await import('xlsx')
  const workbook = read(value, { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return parseProspectMatrix(sheet ? utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }) : [])
}

export const downloadProspectTemplate = async () => {
  const { utils, writeFile } = await import('xlsx')
  const headers = [
    'Date Added', 'PIC', 'Category', 'SMS Deliverability', 'Email Deliverability',
    'Industry', 'Service Locations', 'Country', 'State/Province', 'City',
    'Company Name', 'Contact Person', 'Direct Line', 'Phone 2',
    'Email Active', 'Email 2', 'Address',
  ]
  const worksheet = utils.aoa_to_sheet([headers])
  worksheet['!cols'] = headers.map(header => ({ wch: Math.max(14, header.length + 2) }))
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'Prospects')
  writeFile(workbook, 'Container_CRM_Prospect_Import_Template.xlsx')
}
