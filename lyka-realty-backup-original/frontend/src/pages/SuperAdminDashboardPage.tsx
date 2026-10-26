import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Settings,
  Users,
  KeyRound,
  Lock,
  Activity,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  UserPlus,
} from 'lucide-react';
import { api } from '../services/api';
import { AuditLog, User, UserRole } from '../types';

export const SuperAdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'config' | 'admins' | 'roles'>('audit');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Admin account creation state
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  // Platform config update state
  const [provider, setProvider] = useState('ollama');
  const [mockCalling, setMockCalling] = useState(true);
  const [rateLimit, setRateLimit] = useState(60);
  const [configLoading, setConfigLoading] = useState(false);

  const fetchSuperAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const [logsRes, configRes, usersRes] = await Promise.all([
        api.getSuperAdminAuditTrail(),
        api.getPlatformConfig(),
        api.getAdminUsers(),
      ]);
      setAuditLogs(logsRes);
      setConfig(configRes);
      setUsers(usersRes);
      if (configRes) {
        setProvider(configRes.ai_provider || 'ollama');
        setMockCalling(configRes.mock_calling_enabled ?? true);
        setRateLimit(configRes.rate_limit_per_minute || 60);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load super admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const newAdmin = await api.createAdminAccount({
        full_name: adminName,
        email: adminEmail,
        password: adminPassword,
        phone: adminPhone || undefined,
      });
      setUsers((prev) => [...prev, newAdmin]);
      setSuccessMsg(`Admin account for ${newAdmin.email} created successfully.`);
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminPhone('');
      await fetchSuperAdminData();
    } catch (err: any) {
      setError(err.message || 'Failed to create admin account.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const updated = await api.updatePlatformConfig({
        ai_provider: provider,
        mock_calling_enabled: mockCalling,
        rate_limit_per_minute: Number(rateLimit),
      });
      setConfig(updated);
      setSuccessMsg('Platform configuration updated and applied.');
    } catch (err: any) {
      setError(err.message || 'Failed to update configuration.');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleChangeRole = async (userId: number, role: UserRole) => {
    setError('');
    try {
      const updated = await api.setUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      setSuccessMsg(`Role for ${updated.email} updated to ${role}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update user role.');
    }
  };

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', padding: '2.5rem 1rem' }}>
      <div className="app-container" style={{ maxWidth: '1400px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={26} color="var(--gold)" />
              <h1 style={{ color: '#fff', fontSize: '1.85rem', margin: 0, fontWeight: 700 }}>
                Super Admin Security Console
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
              Platform Master Configuration, Administrative Provisioning & Security Audit Trail
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchSuperAdminData} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} />
              <span>Refresh Trail</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            {successMsg}
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'audit' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'audit' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Security Audit Trail ({auditLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('config')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'config' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'config' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Platform Configuration
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'admins' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'admins' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Provision Admin Accounts
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'roles' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'roles' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Manage User Roles ({users.length})
          </button>
        </div>

        {/* Tab 1: Security Audit Trail */}
        {activeTab === 'audit' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--gold)" />
              <span>Immutable Security Event Trail</span>
            </h3>

            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading security logs...</p>
            ) : auditLogs.length === 0 ? (
              <p style={{ color: 'var(--text-dim)' }}>No security events recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Timestamp</th>
                      <th style={{ padding: '8px' }}>Event Type</th>
                      <th style={{ padding: '8px' }}>User ID</th>
                      <th style={{ padding: '8px' }}>IP Address</th>
                      <th style={{ padding: '8px' }}>Event Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => {
                      const eventType = log.event_type || log.action || 'EVENT';
                      return (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 8px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'Recent'}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span
                            style={{
                              backgroundColor:
                                eventType.includes('FAIL') || eventType.includes('LOCK')
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : eventType.includes('BOOTSTRAP')
                                  ? 'rgba(197, 160, 89, 0.2)'
                                  : 'rgba(56, 189, 248, 0.15)',
                              color:
                                eventType.includes('FAIL') || eventType.includes('LOCK')
                                  ? '#f87171'
                                  : eventType.includes('BOOTSTRAP')
                                  ? 'var(--gold)'
                                  : '#38bdf8',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                            }}
                          >
                            {eventType}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{log.user_id || 'System'}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                          {log.ip_address || 'Internal'}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#fff' }}>{log.details || '—'}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Platform Configuration */}
        {activeTab === 'config' && (
          <div className="card-luxury" style={{ padding: '2rem', maxWidth: '640px' }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={20} color="var(--gold)" />
              <span>Platform Core Settings</span>
            </h3>

            <form onSubmit={handleUpdateConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Primary AI Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="input-luxury"
                  style={{ width: '100%' }}
                >
                  <option value="ollama">Ollama (Local AI - No external API key required)</option>
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Telephony Calling Mode
                </label>
                <select
                  value={mockCalling ? 'demo' : 'live'}
                  onChange={(e) => setMockCalling(e.target.value === 'demo')}
                  className="input-luxury"
                  style={{ width: '100%' }}
                >
                  <option value="demo">High-Fidelity Demo/Mock Mode (Safe testing, no carrier charges)</option>
                  <option value="live">Live Telephony Provider (Twilio)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  API Rate Limit per Minute
                </label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>

              <button type="submit" disabled={configLoading} className="btn btn-gold" style={{ marginTop: '0.5rem' }}>
                {configLoading ? 'Saving...' : 'Save & Apply Configuration'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Provision Admin Accounts */}
        {activeTab === 'admins' && (
          <div className="card-luxury" style={{ padding: '2rem', maxWidth: '640px' }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={20} color="var(--gold)" />
              <span>Provision Administrative Staff Account</span>
            </h3>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Public registration for privileged administrator accounts is strictly forbidden. Use this authorized super admin form to provision vetted administrators.
            </p>

            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Khalid Al Mansoori"
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Work Email Address
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@lykarealty.ae"
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Minimum 8 characters with symbols"
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="+971 50 000 0000"
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>

              <button type="submit" disabled={adminLoading} className="btn btn-gold" style={{ marginTop: '0.5rem' }}>
                {adminLoading ? 'Provisioning...' : 'Provision Administrator Account'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 4: Manage User Roles */}
        {activeTab === 'roles' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="var(--gold)" />
              <span>Platform Role Assignments & Permissions</span>
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>User Name</th>
                    <th style={{ padding: '8px' }}>Email</th>
                    <th style={{ padding: '8px' }}>Current Role</th>
                    <th style={{ padding: '8px' }}>Change Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '10px 8px', color: '#fff', fontWeight: 600 }}>{u.full_name}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{u.email}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ backgroundColor: 'rgba(197, 160, 89, 0.2)', color: 'var(--gold)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u.id, e.target.value as UserRole)}
                          className="input-luxury"
                          style={{ fontSize: '0.8rem', padding: '3px 8px' }}
                        >
                          <option value="customer">customer</option>
                          <option value="sales_agent">sales_agent</option>
                          <option value="employee">employee</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                          <option value="super_admin">super_admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
