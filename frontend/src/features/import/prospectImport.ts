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
  if (/industry|sector/.test(k)) return 'industry'
  if (/country/.test(k)) return 'country'
  if (/state|province/.test(k)) return 'state_province'
  if (/city|town/.test(k)) return 'city'
  if (/address|location|street/.test(k)) return 'address'
  if (/category|status/.test(k)) return 'category'
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

  return { rows, errors, sourceRows }
}

export const parseProspectMatrix = (matrix: unknown[][]): ParsedProspectImport => {
  const nonEmpty = matrix
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(item => item.row.some(cell => clean(cell)))
  if (nonEmpty.length < 2) return { rows: [], errors: [{ message: 'The sheet must contain prospect data.', kind: 'issue' }], sourceRows: 0 }

  // Accept transposed sheets too: field labels run downward while prospects run
  // across columns. A two-column key/value form is the one-record version of this.
  const transposed = new Map<number, Record<string, string>>()
  nonEmpty.forEach(({ row }) => {
    const labelIndex = row.findIndex(cell => Boolean(resolveField(cell)))
    if (labelIndex < 0) return
    const field = resolveField(row[labelIndex])!
    row.slice(labelIndex + 1).forEach((cell, offset) => {
      const value = clean(cell)
      if (!value) return
      const column = labelIndex + offset + 1
      const record = transposed.get(column) ?? {}
      record[field] = value
      transposed.set(column, record)
    })
  })
  const transposedCandidates = [...transposed.entries()]
    .sort(([a], [b]) => a - b)
    .map(([column, record]) => ({ record, rowNumber: column + 1 }))
  const transposedResult = validateCandidates(transposedCandidates)
  if (transposedResult.rows.length) return transposedResult

  const headerCandidate = nonEmpty
    .slice(0, 25)
    .map(item => ({ ...item, recognized: item.row.filter(cell => resolveField(cell)).length }))
    .sort((a, b) => b.recognized - a.recognized)[0]
  const hasHeader = headerCandidate.recognized >= 2
  const positional = !hasHeader && nonEmpty[0].row.length >= 11
  if (!hasHeader && !positional) {
    const detected = [...new Set(nonEmpty.slice(0, 10).flatMap(item => item.row.map(clean).filter(Boolean)))].slice(0, 6)
    const detail = detected.length ? ` Found: ${detected.join(', ')}.` : ''
    return {
      rows: [],
      errors: [{
        message: `Recognizable CRM prospect fields were not found.${detail} The importer needs a Company Name and at least one email or phone (Contact Person is optional); records may run across rows or columns. This file appears to describe a different kind of data, so it was not converted into false prospects.`,
        kind: 'issue',
      }],
      sourceRows: 0,
    }
  }
  const header = hasHeader ? headerCandidate.row : nonEmpty[0].row
  const mapped = hasHeader
    ? resolveHeaderFields(header)
    : header.map((_, index) => fields[index])
  const dataRows = hasHeader
    ? nonEmpty.filter(item => item.rowNumber > headerCandidate.rowNumber)
    : nonEmpty
  const cargoColumns = hasHeader
    ? header
      .map((cell, index) => ({ index, label: CARGO_TYPE_LABELS[key(cell)] }))
      .filter((entry): entry is { index: number; label: string } => Boolean(entry.label))
    : []
  const cargoOtherDescriptionIndex = hasHeader
    ? header.findIndex(cell => key(cell) === 'cargootherdescription')
    : -1

  const candidates = dataRows.map(({ row: source, rowNumber }) => {
    const record: Record<string, string> = {}
    // First non-empty match for a field wins, so a duplicate/overlapping column mapping
    // (e.g. two phone-like headers) can't blank out an already-populated field.
    mapped.forEach((field, index) => {
      if (!field || record[field]) return
      const value = clean(source[index])
      if (value) record[field] = value
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
  if (!result.rows.length && result.sourceRows > 0 && !mapped.includes('company_name')) {
    const headerText = header.map(clean).filter(Boolean).join(', ')
    result.errors.unshift({
      message: `Couldn't find a Company Name column in this sheet's header row (${headerText || 'no header text detected'}). `
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
    ?? { rows: [], errors: [{ message: 'The workbook does not contain any readable prospect data.', kind: 'issue' as const }], sourceRows: 0 }
}

export const parseProspectPaste = async (value: string) => {
  if (!value.trim()) return { rows: [], errors: [{ message: 'Paste copied spreadsheet cells first.', kind: 'issue' as const }], sourceRows: 0 }
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
