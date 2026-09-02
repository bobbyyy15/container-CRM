import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { api } from '../../lib/api';
import { toast } from '../../lib/notify';

export const UserProfileSettings = ({ session }: { session: any }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; email?: string } | null>(null);

  const [formData, setFormData] = useState({
    full_name: ''
  });

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setProfile(data);
        setFormData({
          full_name: data.full_name || ''
        });
      }
      setLoading(false);
    };

    fetchProfile();

    // Username can't be blank in profiles' data model, but its own column has no UPDATE grant
    // (only full_name does -- see docs/ACCOUNT_MODULE.md §6) and it's also the login
    // credential for username-based sign-in, so it's shown read-only here rather than edited
    // through this form.
    api.get('/auth/google/status').then(res => setGoogleStatus(res.data.data)).catch(() => {});
  }, [session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: formData.full_name
      })
      .eq('id', session.user.id);

    if (error) {
      toast(`Error updating profile: ${error.message}`, 'error');
    } else {
      toast('Profile updated successfully.', 'success');
      setProfile({ ...profile, ...formData });
    }
    setSaving(false);
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading profile…</div>;

  const googleValue = !googleStatus
    ? 'Checking…'
    : !googleStatus.configured
      ? 'Gmail outreach is not configured for this environment'
      : googleStatus.connected
        ? googleStatus.email
        : 'Not connected';

  return (
    <div className="page-scroll">
      <div className="page-content" style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="page-title">Account Settings</div>
          <div className="page-desc">Manage your personal profile and display settings.</div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>Email Address (Login)</label>
              <input
                className="inp"
                value={session?.user?.email || ''}
                disabled
                style={{ background: 'var(--s2)', color: 'var(--t3)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>This is your primary login email. To change it, please contact your administrator.</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>Username (Login)</label>
              <input
                className="inp"
                value={profile?.username || ''}
                disabled
                style={{ background: 'var(--s2)', color: 'var(--t3)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>Also usable to sign in instead of your email. To change it, please contact your administrator.</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>Connected Google Account (Outreach)</label>
              <input
                className="inp"
                value={googleValue}
                disabled
                style={{ background: 'var(--s2)', color: 'var(--t3)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>To manage your connected Google account, go to System Settings {'>'} Integrations.</div>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--border-s)', margin: '8px 0' }} />

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>Full Legal Name</label>
              <input
                className="inp"
                required
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Johnathan Doe"
              />
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>Used on official quotes and contracts generated by the CRM.</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};
