import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';

type Profile = {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: 'admin' | 'sales_manager' | 'procurement';
  status: 'active' | 'inactive';
  created_at: string;
  pics?: { id: string; name: string }[];
};

const ROLES: Profile['role'][] = ['admin', 'sales_manager', 'procurement'];
const STATUSES: Profile['status'][] = ['active', 'inactive'];

export const UserManagement = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, meRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/auth/me'),
      ]);
      setUsers(usersRes.data.data);
      setSelfId(meRes.data.data.id);
    } catch (err: any) {
      alert(`Error loading users: ${err.response?.data?.error?.message ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, payload: { role?: Profile['role']; status?: Profile['status'] }) => {
    setSavingId(id);
    try {
      const res = await api.patch(`/admin/users/${id}`, payload);
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...res.data.data } : u)));
    } catch (err: any) {
      alert(`Error updating user: ${err.response?.data?.error?.message ?? err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  const assignPic = async (id: string, fullName: string | null) => {
    const picName = prompt("Enter the PIC Name to create and assign to this user:", fullName || '');
    if (!picName) return;
    setSavingId(id);
    try {
      await api.post(`/admin/users/${id}/pic`, { name: picName });
      load(); // Reload to fetch the join properly
    } catch (err: any) {
      alert(`Error assigning PIC: ${err.response?.data?.error?.message ?? err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--t3)' }}>Loading users...</div>;

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div style={{ marginBottom: 20 }}>
          <div className="page-title">User Management</div>
          <div className="page-desc">Manage roles and account status for everyone in the CRM. Assign PIC identities so users can own pipeline data.</div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="crm" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Email / Name</th>
                <th>PIC Identity (Data Ownership)</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === selfId;
                const isSaving = savingId === u.id;
                const hasPic = u.pics && u.pics.length > 0;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{u.full_name || u.username || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>{u.email}</div>
                    </td>
                    <td>
                      {hasPic ? (
                        <div className="badge badge-blue">✓ {u.pics![0].name}</div>
                      ) : (
                        <button 
                          className="btn" 
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => assignPic(u.id, u.full_name)}
                          disabled={isSaving}
                        >
                          + Assign PIC
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        className="inp"
                        value={u.role}
                        disabled={isSelf || isSaving}
                        title={isSelf ? 'Use a different admin account to change your own role.' : undefined}
                        onChange={e => update(u.id, { role: e.target.value as Profile['role'] })}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="inp"
                        value={u.status}
                        disabled={isSelf || isSaving}
                        title={isSelf ? 'Use a different admin account to change your own status.' : undefined}
                        onChange={e => update(u.id, { status: e.target.value as Profile['status'] })}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
