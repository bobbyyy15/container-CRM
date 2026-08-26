import React, { useState } from 'react';
import { api } from '../../lib/api';

const Modal = ({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title">{title}</div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  </div>
);

export const ManualWarmLeadDialog = ({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ companyName: '', contactName: '', email: '', phone: '' });
  
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leads/warm-leads/manual', data);
      onSuccess();
    } catch (e: any) {
      alert(e.response?.data?.error?.message ?? 'Failed to add');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Manually Add Warm Lead" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Company Name</label><input className="inp" required value={data.companyName} onChange={e => setData({...data, companyName: e.target.value})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Contact Person</label><input className="inp" value={data.contactName} onChange={e => setData({...data, contactName: e.target.value})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Email</label><input type="email" className="inp" value={data.email} onChange={e => setData({...data, email: e.target.value})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Phone</label><input className="inp" value={data.phone} onChange={e => setData({...data, phone: e.target.value})} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading}>Save</button>
        </div>
      </form>
    </Modal>
  );
};

export const ManualInquiryDialog = ({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [sizes, setSizes] = useState<any[]>([]);
  const [conditions, setConditions] = useState<any[]>([]);
  const [data, setData] = useState({ companyName: '', contactName: '', email: '', phone: '', containerSizeId: '', containerConditionId: '', quantity: 1, askingPrice: '', stateProvince: '', neededByDate: '', requirements: '' });
  
  React.useEffect(() => {
    api.get('/catalog/sizes').then(res => setSizes(res.data.data)).catch(() => {});
    api.get('/catalog/conditions').then(res => setConditions(res.data.data)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...data,
        askingPrice: data.askingPrice ? Number(data.askingPrice) : undefined,
        neededByDate: data.neededByDate || undefined
      };
      await api.post('/leads/inquiries/manual', payload);
      onSuccess();
    } catch (e: any) {
      alert(e.response?.data?.error?.message ?? 'Failed to add');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Manually Add Inquiry" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Company Name</label><input className="inp" required value={data.companyName} onChange={e => setData({...data, companyName: e.target.value})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Contact Person</label><input className="inp" value={data.contactName} onChange={e => setData({...data, contactName: e.target.value})} /></div>
          
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Size</label><select className="inp" required value={data.containerSizeId} onChange={e => setData({...data, containerSizeId: e.target.value})}><option value="">Select...</option>{sizes.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Condition</label><select className="inp" required value={data.containerConditionId} onChange={e => setData({...data, containerConditionId: e.target.value})}><option value="">Select...</option>{conditions.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Quantity</label><input type="number" min="1" className="inp" required value={data.quantity} onChange={e => setData({...data, quantity: Number(e.target.value)})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Asking Price ($)</label><input type="number" className="inp" value={data.askingPrice} onChange={e => setData({...data, askingPrice: e.target.value})} /></div>
          
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>State / Province</label><input className="inp" value={data.stateProvince} onChange={e => setData({...data, stateProvince: e.target.value})} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Needed By</label><input type="date" className="inp" value={data.neededByDate} onChange={e => setData({...data, neededByDate: e.target.value})} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !data.containerSizeId || !data.containerConditionId}>Save</button>
        </div>
      </form>
    </Modal>
  );
};
