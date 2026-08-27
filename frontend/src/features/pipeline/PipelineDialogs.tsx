import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../../lib/api'

type CatalogOption = { id: string; name: string }

const useCatalog = (path: string) => {
  const [options, setOptions] = useState<CatalogOption[]>([])
  useEffect(() => {
    let cancelled = false
    api.get(path).then(response => { if (!cancelled) setOptions(response.data.data ?? []) }).catch(() => {})
    return () => { cancelled = true }
  }, [path])
  return options
}

type PicOption = { id: string; name: string }

const usePics = () => {
  const [options, setOptions] = useState<PicOption[]>([])
  useEffect(() => {
    let cancelled = false
    api.get('/pics').then(response => { if (!cancelled) setOptions(response.data.data ?? []) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  return options
}

export type WarmLeadOption = { id: string; company: string; contact: string }
export type InquiryOption = { id: string; ref: string; company: string; contact: string }
export type QuotationOption = { id: string; ref: string; co: string; status: string; qty: number; sellTotal: number }

const Modal = ({ title, description, onClose, children }: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) => (
  <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="modal" style={{ width: 520 }} onClick={event => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <div className="modal-title">{title}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{description}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      {children}
    </div>
  </div>
)

const ErrorMessage = ({ message }: { message: string }) => message
  ? <div style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{message}</div>
  : null

const apiError = (error: any) => error.response?.data?.error?.message ?? error.message ?? 'The operation failed.'

export const NewInquiryDialog = ({ warmLeads, initialId, onClose, onSaved }: {
  warmLeads: WarmLeadOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const sizes = useCatalog('/catalog/sizes')
  const conditions = useCatalog('/catalog/conditions')
  const pics = usePics()
  // A Warm Lead usually starts the chain, but an existing customer/contact can get a fresh
  // inquiry with no Warm Lead in between at all.
  const [source, setSource] = useState<'warmLead' | 'manual'>('warmLead')
  const [warmLeadId, setWarmLeadId] = useState(initialId ?? warmLeads[0]?.id ?? '')
  const [companyName, setCompanyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [country, setCountry] = useState('')
  const [picId, setPicId] = useState('')
  const [containerSizeId, setContainerSizeId] = useState('')
  const [containerConditionId, setContainerConditionId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [neededByDate, setNeededByDate] = useState('')
  const [askingPrice, setAskingPrice] = useState('')
  const [requirements, setRequirements] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [remarks, setRemarks] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!containerSizeId && sizes.length) setContainerSizeId(sizes[0].id) }, [sizes, containerSizeId])
  useEffect(() => { if (!containerConditionId && conditions.length) setContainerConditionId(conditions[0].id) }, [conditions, containerConditionId])

  const canSubmit = containerSizeId && containerConditionId
    && (source === 'warmLead' ? Boolean(warmLeadId) : Boolean(companyName.trim()))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setWorking(true)
    setError('')
    try {
      const shared = {
        containerSizeId,
        containerConditionId,
        quantity,
        neededByDate: neededByDate || undefined,
        askingPrice: askingPrice ? Number(askingPrice) : undefined,
        requirements: requirements.trim() || undefined,
        specialRequirements: specialRequirements.trim() || undefined,
        remarks: remarks.trim() || undefined,
        followUpDate: followUpDate || undefined,
      }
      if (source === 'warmLead') {
        await api.post(`/leads/warm-leads/${warmLeadId}/create-inquiry`, {
          ...shared,
          stateProvince: stateProvince.trim() || undefined,
          country: country.trim() || undefined,
        })
      } else {
        await api.post('/leads/inquiries', {
          ...shared,
          companyName: companyName.trim(),
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          stateProvince: stateProvince.trim() || undefined,
          country: country.trim() || undefined,
          picId: picId || undefined,
        })
      }
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Create inquiry" description="From a Warm Lead, or directly for an existing contact/customer." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="tabs" style={{ gridColumn: '1 / -1', padding: 0 }}>
            <button type="button" className={`tab${source === 'warmLead' ? ' active' : ''}`} onClick={() => setSource('warmLead')}>From Warm Lead</button>
            <button type="button" className={`tab${source === 'manual' ? ' active' : ''}`} onClick={() => setSource('manual')}>Manual / Existing Customer</button>
          </div>

          {source === 'warmLead' ? (
            warmLeads.length ? (
              <>
                <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Warm lead</label>
                <select className="inp" style={{ gridColumn: '1 / -1' }} value={warmLeadId} onChange={event => setWarmLeadId(event.target.value)} required>
                  {warmLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.company} — {lead.contact}</option>)}
                </select>
              </>
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>
                There are no active warm leads. Convert a Prospect, add a Warm Lead manually, or switch to "Manual / Existing Customer".
              </div>
            )
          ) : (
            <>
              <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Company</label><input className="inp" value={companyName} onChange={event => setCompanyName(event.target.value)} required /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Contact person</label><input className="inp" value={contactPerson} onChange={event => setContactPerson(event.target.value)} /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>PIC</label>
                <select className="inp" value={picId} onChange={event => setPicId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {pics.map(pic => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
                </select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Phone</label><input className="inp" value={phone} onChange={event => setPhone(event.target.value)} /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email</label><input className="inp" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
            </>
          )}

          {(source === 'warmLead' ? warmLeads.length > 0 : true) && <>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>State/Province</label>
              <input className="inp" value={stateProvince} onChange={event => setStateProvince(event.target.value)} placeholder="e.g. CO, ON" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Country</label>
              <input className="inp" value={country} onChange={event => setCountry(event.target.value)} placeholder="US or CA" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Container size</label>
              <select className="inp" value={containerSizeId} onChange={event => setContainerSizeId(event.target.value)} required>
                {sizes.map(size => <option key={size.id} value={size.id}>{size.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Condition</label>
              <select className="inp" value={containerConditionId} onChange={event => setContainerConditionId(event.target.value)} required>
                {conditions.map(condition => <option key={condition.id} value={condition.id}>{condition.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Quantity</label>
              <input className="inp" type="number" min="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Asking price</label>
              <input className="inp" type="number" min="0" step="0.01" value={askingPrice} onChange={event => setAskingPrice(event.target.value)} placeholder="If available" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Needed by</label>
              <input className="inp" type="date" value={neededByDate} onChange={event => setNeededByDate(event.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Follow-up date</label>
              <input className="inp" type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} />
            </div>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Inquiry details</label>
            <textarea className="inp" style={{ gridColumn: '1 / -1' }} rows={3} value={requirements} onChange={event => setRequirements(event.target.value)} placeholder="What the customer is asking for…" />
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Special requirements</label>
            <textarea className="inp" style={{ gridColumn: '1 / -1' }} rows={2} value={specialRequirements} onChange={event => setSpecialRequirements(event.target.value)} placeholder="Liftgate delivery, modification, timing constraints…" />
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Remarks</label>
            <textarea className="inp" style={{ gridColumn: '1 / -1' }} rows={2} value={remarks} onChange={event => setRemarks(event.target.value)} />
          </>}
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !canSubmit}>{working ? 'Creating…' : 'Create Inquiry'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const NewWarmLeadDialog = ({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) => {
  const pics = usePics()
  const [companyName, setCompanyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [country, setCountry] = useState('')
  const [picId, setPicId] = useState('')
  const [notes, setNotes] = useState('')
  const [previousInquiryIndicator, setPreviousInquiryIndicator] = useState(false)
  const [source, setSource] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyName.trim()) return
    setWorking(true)
    setError('')
    try {
      await api.post('/leads/warm-leads', {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        stateProvince: stateProvince.trim() || undefined,
        country: country.trim() || undefined,
        picId: picId || undefined,
        notes: notes.trim() || undefined,
        previousInquiryIndicator,
        source: source.trim() || undefined,
        followUpDate: followUpDate || undefined,
        followUpNotes: followUpNotes.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="New warm lead" description="For contacts already known to be interested, with or without a Prospect record on file." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Company</label><input className="inp" value={companyName} onChange={event => setCompanyName(event.target.value)} required /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Contact person</label><input className="inp" value={contactPerson} onChange={event => setContactPerson(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>PIC</label>
            <select className="inp" value={picId} onChange={event => setPicId(event.target.value)}>
              <option value="">Unassigned</option>
              {pics.map(pic => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Phone</label><input className="inp" value={phone} onChange={event => setPhone(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email</label><input className="inp" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>State/Province</label><input className="inp" value={stateProvince} onChange={event => setStateProvince(event.target.value)} placeholder="e.g. CO, ON" /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Country</label><input className="inp" value={country} onChange={event => setCountry(event.target.value)} placeholder="US or CA" /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Source</label><input className="inp" value={source} onChange={event => setSource(event.target.value)} placeholder="Referral, cold call, trade show…" /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginTop: 20 }}>
            <input type="checkbox" checked={previousInquiryIndicator} onChange={event => setPreviousInquiryIndicator(event.target.checked)} />
            Made a previous inquiry (details not on file)
          </label>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Follow-up date</label><input className="inp" type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} /></div>
          <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Notes</label>
          <textarea className="inp" style={{ gridColumn: '1 / -1' }} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Whatever is still known about this contact…" />
          <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Follow-up notes</label>
          <textarea className="inp" style={{ gridColumn: '1 / -1' }} rows={2} value={followUpNotes} onChange={event => setFollowUpNotes(event.target.value)} />
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !companyName.trim()}>{working ? 'Creating…' : 'Create Warm Lead'}</button>
        </div>
      </form>
    </Modal>
  )
}

const INDUSTRY_OPTIONS = ['Containers', 'Farms', 'Construction', 'Trucking', 'Logistics', 'Storage', 'Others']

export const NewProspectDialog = ({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) => {
  const pics = usePics()
  const [companyName, setCompanyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [picId, setPicId] = useState('')
  const [category, setCategory] = useState<'Proceed' | 'Removed'>('Proceed')
  const [smsDeliverability, setSmsDeliverability] = useState<'Call/Text' | 'Calls Only' | 'Text Only' | ''>('')
  const [industry, setIndustry] = useState('')
  const [industryOther, setIndustryOther] = useState('')
  const [serviceLocation, setServiceLocation] = useState('')
  const [country, setCountry] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [city, setCity] = useState('')
  const [dateAdded, setDateAdded] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyName.trim()) return
    setWorking(true)
    setError('')
    try {
      await api.post('/leads/prospects', {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        picId: picId || undefined,
        category,
        smsDeliverability: smsDeliverability || undefined,
        industry: (industry === 'Others' ? industryOther.trim() : industry) || undefined,
        serviceLocation: serviceLocation.trim() || undefined,
        country: country.trim() || undefined,
        stateProvince: stateProvince.trim() || undefined,
        city: city.trim() || undefined,
        dateAdded: dateAdded || undefined,
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="New prospect" description="Manually add a prospect that isn't from a spreadsheet import." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Company</label><input className="inp" value={companyName} onChange={event => setCompanyName(event.target.value)} required /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Contact person</label><input className="inp" value={contactPerson} onChange={event => setContactPerson(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Date added</label><input className="inp" type="date" value={dateAdded} onChange={event => setDateAdded(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Phone</label><input className="inp" value={phone} onChange={event => setPhone(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email</label><input className="inp" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>PIC</label>
            <select className="inp" value={picId} onChange={event => setPicId(event.target.value)}>
              <option value="">Unassigned</option>
              {pics.map(pic => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Category</label>
            <select className="inp" value={category} onChange={event => setCategory(event.target.value as typeof category)}>
              <option value="Proceed">Proceed</option>
              <option value="Removed">Removed</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>SMS Deliverability</label>
            <select className="inp" value={smsDeliverability} onChange={event => setSmsDeliverability(event.target.value as typeof smsDeliverability)}>
              <option value="">Unknown</option>
              <option value="Call/Text">Call/Text</option>
              <option value="Calls Only">Calls Only</option>
              <option value="Text Only">Text Only</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Industry</label>
            <select className="inp" value={industry} onChange={event => setIndustry(event.target.value)}>
              <option value="">Not specified</option>
              {INDUSTRY_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          {industry === 'Others' && (
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Specify industry</label><input className="inp" value={industryOther} onChange={event => setIndustryOther(event.target.value)} /></div>
          )}
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Service location</label><input className="inp" value={serviceLocation} onChange={event => setServiceLocation(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Country</label><input className="inp" value={country} onChange={event => setCountry(event.target.value)} placeholder="US or CA" /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>State/Province</label><input className="inp" value={stateProvince} onChange={event => setStateProvince(event.target.value)} placeholder="e.g. CO, ON" /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>City</label><input className="inp" value={city} onChange={event => setCity(event.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !companyName.trim()}>{working ? 'Creating…' : 'Create Prospect'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const NewManualSaleDialog = ({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) => {
  const pics = usePics()
  const [companyName, setCompanyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [picId, setPicId] = useState('')
  const [totalUnits, setTotalUnits] = useState(1)
  const [buyingCost, setBuyingCost] = useState(0)
  const [revenue, setRevenue] = useState(0)
  const [stateProvince, setStateProvince] = useState('')
  const [country, setCountry] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyName.trim()) return
    setWorking(true)
    setError('')
    try {
      await api.post('/deals/sales', {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        picId: picId || undefined,
        totalUnits,
        buyingCost,
        revenue,
        stateProvince: stateProvince.trim() || undefined,
        country: country.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Record sale manually" description="For a sale that didn't go through a Quotation." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Company</label><input className="inp" value={companyName} onChange={event => setCompanyName(event.target.value)} required /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Contact person</label><input className="inp" value={contactPerson} onChange={event => setContactPerson(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>PIC</label>
            <select className="inp" value={picId} onChange={event => setPicId(event.target.value)}>
              <option value="">Unassigned</option>
              {pics.map(pic => <option key={pic.id} value={pic.id}>{pic.name}</option>)}
            </select>
          </div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Phone</label><input className="inp" value={phone} onChange={event => setPhone(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Email</label><input className="inp" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>State/Province</label><input className="inp" value={stateProvince} onChange={event => setStateProvince(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Country</label><input className="inp" value={country} onChange={event => setCountry(event.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Units</label><input className="inp" type="number" min="1" value={totalUnits} onChange={event => setTotalUnits(Number(event.target.value))} required /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Buying cost total</label><input className="inp" type="number" min="0" step="0.01" value={buyingCost} onChange={event => setBuyingCost(Number(event.target.value))} required /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Revenue total</label><input className="inp" type="number" min="0" step="0.01" value={revenue} onChange={event => setRevenue(Number(event.target.value))} required /></div>
          <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: 'var(--s2)', color: revenue - buyingCost >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>Gross profit: ${(revenue - buyingCost).toLocaleString()}</div>
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !companyName.trim()}>{working ? 'Recording…' : 'Record Sale'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const QuotationDialog = ({ inquiries, initialId, onClose, onSaved }: {
  inquiries: InquiryOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const [inquiryId, setInquiryId] = useState(initialId ?? inquiries[0]?.id ?? '')
  const [description, setDescription] = useState('Shipping container')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [validUntil, setValidUntil] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!inquiryId) return
    setWorking(true)
    setError('')
    try {
      await api.post('/deals/quotations', {
        inquiry_id: inquiryId,
        valid_until: validUntil || undefined,
        items: [{ description: description.trim(), quantity, unit_price: unitPrice }],
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Create quotation" description="The company and contact are taken from the selected inquiry." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inquiries.length ? <>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Inquiry</label>
            <select className="inp" style={{ gridColumn: '1 / -1' }} value={inquiryId} onChange={event => setInquiryId(event.target.value)} required>
              {inquiries.map(inquiry => <option key={inquiry.id} value={inquiry.id}>{inquiry.ref} — {inquiry.company} — {inquiry.contact}</option>)}
            </select>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Item description</label>
            <input className="inp" style={{ gridColumn: '1 / -1' }} value={description} onChange={event => setDescription(event.target.value)} required />
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Quantity</label><input className="inp" type="number" min="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Unit price</label><input className="inp" type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Valid until</label><input className="inp" type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: 'var(--s2)', fontWeight: 700 }}>Quotation total: ${(quantity * unitPrice).toLocaleString()}</div>
          </> : <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>There are no active inquiries available for quotation.</div>}
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !inquiryId || !description.trim()}>{working ? 'Creating…' : 'Create Quotation'}</button>
        </div>
      </form>
    </Modal>
  )
}

export const SaleDialog = ({ quotations, initialId, onClose, onSaved }: {
  quotations: QuotationOption[]
  initialId?: string
  onClose: () => void
  onSaved: () => void
}) => {
  const accepted = quotations.filter(quote => quote.status === 'Accepted')
  const initial = accepted.find(quote => quote.id === initialId) ?? accepted[0]
  const [quotationId, setQuotationId] = useState(initial?.id ?? '')
  const [units, setUnits] = useState(initial?.qty || 1)
  const [buyingCost, setBuyingCost] = useState(0)
  const [revenue, setRevenue] = useState(initial?.sellTotal || 0)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const selectQuote = (id: string) => {
    setQuotationId(id)
    const quote = accepted.find(item => item.id === id)
    if (quote) {
      setUnits(quote.qty || 1)
      setRevenue(quote.sellTotal)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!quotationId) return
    setWorking(true)
    setError('')
    try {
      await api.post(`/deals/quotations/${quotationId}/convert-to-sale`, {
        total_units: units,
        buying_cost: buyingCost,
        revenue,
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(apiError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal title="Record sale" description="Only accepted quotations can become sales." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {accepted.length ? <>
            <label style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600 }}>Accepted quotation</label>
            <select className="inp" style={{ gridColumn: '1 / -1' }} value={quotationId} onChange={event => selectQuote(event.target.value)} required>
              {accepted.map(quote => <option key={quote.id} value={quote.id}>{quote.ref} — {quote.co}</option>)}
            </select>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Units</label><input className="inp" type="number" min="1" value={units} onChange={event => setUnits(Number(event.target.value))} required /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Buying cost total</label><input className="inp" type="number" min="0" step="0.01" value={buyingCost} onChange={event => setBuyingCost(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Revenue total</label><input className="inp" type="number" min="0" step="0.01" value={revenue} onChange={event => setRevenue(Number(event.target.value))} required /></div>
            <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: 'var(--s2)', color: revenue - buyingCost >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>Gross profit: ${(revenue - buyingCost).toLocaleString()}</div>
          </> : <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--brand-bg)', borderRadius: 8, fontSize: 12 }}>No accepted quotations are available. Open Quotations and accept one first.</div>}
          <div style={{ gridColumn: '1 / -1' }}><ErrorMessage message={error} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={working || !quotationId}>{working ? 'Recording…' : 'Record Sale'}</button>
        </div>
      </form>
    </Modal>
  )
}


export const NewContractDialog = ({ sales, onClose, onSaved }: {
  sales: any[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [saleId, setSaleId] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleId) return setError('Please select a source sale');
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/contracts', { 
        sale_id: saleId, 
        pickup_date: pickupDate ? new Date(pickupDate).toISOString() : undefined 
      });
      if (res.data.success) {
        onSaved();
      } else {
        setError(res.data.error?.message || 'Failed to create contract');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
        <div className="dialog-header">
          <div className="dialog-title">Generate Contract</div>
          <button className="close-btn" onClick={onClose}><Ic n={I.close} size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="dialog-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
          
          <div className="form-group">
            <label className="form-label">Source Sale</label>
            <select className="form-input" value={saleId} onChange={e => setSaleId(e.target.value)} disabled={submitting}>
              <option value="">-- Select a Sale --</option>
              {sales.map(s => (
                <option key={s.id} value={s.id}>
                  {s.companies?.name || 'Unknown Company'} (Total: ${(s.revenue || 0).toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Target Pickup Date (Optional)</label>
            <input 
              type="date" 
              className="form-input" 
              value={pickupDate}
              onChange={e => setPickupDate(e.target.value)}
              disabled={submitting} 
            />
          </div>

          <div className="dialog-footer">
            <Btn variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Btn>
            <Btn variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Generating...' : 'Generate Contract'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
};
