import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  TrendingUp,
  Database,
  CheckCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { Property, User } from '../types';

type AdminStats = {
  total_users: number;
  total_properties: number;
  total_leads: number;
  total_site_visits: number;
  users_by_role: Record<string, number>;
};

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [databaseType, setDatabaseType] = useState('');
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTotal, setPropertyTotal] = useState(0);
  const [propertyOffset, setPropertyOffset] = useState(0);
  const [userError, setUserError] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'properties' | 'settings' | 'telephony' | 'audit'>('overview');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [telephonySettings, setTelephonySettings] = useState<any>(null);
  const [dncList, setDncList] = useState<any[]>([]);
  const [newDncPhone, setNewDncPhone] = useState('');
  const [newDncReason, setNewDncReason] = useState('Customer opt-out');
  const [telephonyMsg, setTelephonyMsg] = useState('');

  useEffect(() => {
    let isMounted = true;

    Promise.all([api.getAdminStats(), api.getHealth(), api.getAdminUsers(), api.getAdminProperties(50, propertyOffset)])
      .then(([adminStats, health, adminUsers, adminPropertyPage]) => {
        if (!isMounted) return;
        setStats(adminStats);
        setDatabaseType(health.database_type);
        setUsers(adminUsers);
        setProperties(adminPropertyPage.properties);
        setPropertyTotal(adminPropertyPage.total);
      })
      .catch((error: Error) => {
        if (!isMounted) return;
        console.error('Unable to load admin database status:', error);
        setLoadError('Database statistics are currently unavailable.');
      });

    return () => {
      isMounted = false;
    };
  }, [propertyOffset]);

  useEffect(() => {
    if (activeTab === 'telephony') {
      Promise.all([api.getTelephonySettings(), api.getDNCList()])
        .then(([settings, dnc]) => {
          setTelephonySettings(settings);
          setDncList(dnc);
        })
        .catch(console.error);
    } else if (activeTab === 'audit') {
      api.getAdminAuditLogs().then(setAuditLogs).catch(console.error);
    }
  }, [activeTab]);

  const handleAddDNC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDncPhone.trim()) return;
    try {
      await api.addToDNC(newDncPhone.trim(), newDncReason);
      setTelephonyMsg(`Added ${newDncPhone} to Do-Not-Call registry.`);
      setNewDncPhone('');
      const updated = await api.getDNCList();
      setDncList(updated);
    } catch (err: any) {
      setTelephonyMsg(err.message || 'Failed to add to DNC.');
    }
  };

  const handleRemoveDNC = async (phone: string) => {
    try {
      await api.removeFromDNC(phone);
      setDncList((prev) => prev.filter((item) => item.phone_number !== phone));
      setTelephonyMsg(`Removed ${phone} from Do-Not-Call registry.`);
    } catch (err: any) {
      setTelephonyMsg(err.message || 'Failed to remove from DNC.');
    }
  };

  const createEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setUserError('');
    setIsCreatingEmployee(true);
    try {
      const created = await api.createEmployee({
        full_name: employeeName,
        email: employeeEmail,
        password: employeePassword,
        phone: employeePhone || undefined,
      });
      setUsers((current) => [...current, created]);
      setEmployeeName('');
      setEmployeeEmail('');
      setEmployeePassword('');
      setEmployeePhone('');
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Unable to create employee account.');
    } finally {
      setIsCreatingEmployee(false);
    }
  };

  const toggleUserActive = async (user: User) => {
    setUserError('');
    try {
      const updated = await api.setUserActive(user.id, !(user.is_active ?? true));
      setUsers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Unable to update account status.');
    }
  };

  const changeUserRole = async (user: User, role: 'customer' | 'employee') => {
    setUserError('');
    try {
      const updated = await api.setUserRole(user.id, role);
      setUsers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Unable to update account role.');
    }
  };

  const updateProperty = async (property: Property, changes: Partial<Property>) => {
    setLoadError('');
    try {
      const updated = await api.updateAdminProperty(property.id, changes);
      setProperties((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to update property.');
    }
  };

  const togglePropertyActive = async (property: Property) => {
    setLoadError('');
    try {
      const updated = await api.setPropertyActive(property.id, !(property.is_active ?? true));
      setProperties((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to change property availability.');
    }
  };

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={24} color="#ef4444" />
            <h1 style={{ color: '#fff', fontSize: '2rem', margin: 0 }}>
              LYKA Executive Admin Console
            </h1>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            System supervision, database inventory management, role governance, and API health
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', flexWrap: 'wrap' }}>
          {(['overview', 'users', 'properties', 'telephony', 'audit', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--gold)' : 'var(--text-muted)',
                padding: '0.75rem 1rem',
                fontSize: '0.92rem',
                fontWeight: activeTab === tab ? 600 : 400,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div>
            {/* KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
                marginBottom: '2.5rem',
              }}
            >
              <div className="card-luxury" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Database Inventory</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--gold-light)', marginTop: '4px' }}>
                  {stats ? new Intl.NumberFormat('en-AE').format(stats.total_properties) : '—'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: '4px' }}>
                  Records in the active database
                </div>
              </div>

              <div className="card-luxury" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Active Registered Users</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{stats?.total_users ?? '—'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>All account roles</div>
              </div>

              <div className="card-luxury" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Generated Leads</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>{stats?.total_leads ?? '—'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Records in the CRM</div>
              </div>

              <div className="card-luxury" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total Site Visits</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--gold)', marginTop: '4px' }}>{stats?.total_site_visits ?? '—'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Recorded site visits</div>
              </div>
            </div>

            {/* System Status Table */}
            <div className="card-luxury" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
              <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1rem' }}>Infrastructure & Engine Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Database size={20} color={databaseType ? 'var(--success)' : 'var(--text-muted)'} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>Active Database</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      {databaseType ? `${databaseType} connected` : 'Connection unavailable'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <TrendingUp size={20} color="var(--gold)" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>AI Integration</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Not configured in this phase</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={20} color="var(--success)" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>Database Health</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      {loadError || (stats ? 'Statistics loaded from backend' : 'Checking connection')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>User Governance</h3>
            {userError && <p role="alert" style={{ color: '#f87171' }}>{userError}</p>}
            <form onSubmit={createEmployee} style={{ display: 'grid', gap: '0.75rem', maxWidth: '680px', marginBottom: '1.5rem' }}>
              <h4 style={{ color: 'var(--gold)', margin: 0 }}>Create employee account</h4>
              <input required value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Full name" className="input-luxury" />
              <input required type="email" value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} placeholder="Email address" className="input-luxury" />
              <input required type="password" minLength={8} value={employeePassword} onChange={(event) => setEmployeePassword(event.target.value)} placeholder="Temporary password (8+ characters)" className="input-luxury" />
              <input value={employeePhone} onChange={(event) => setEmployeePhone(event.target.value)} placeholder="Phone (optional)" className="input-luxury" />
              <button type="submit" disabled={isCreatingEmployee} className="btn btn-gold" style={{ justifySelf: 'start' }}>
                {isCreatingEmployee ? 'Creating…' : 'Create employee'}
              </button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(stats?.users_by_role ?? {}).map(([role, count]) => (
                <div
                  key={role}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.92rem' }}>{role}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{count} registered</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <h4 style={{ color: '#fff', margin: '1.75rem 0 0.75rem' }}>Accounts</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              {users.map((account) => (
                <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>{account.full_name} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({account.role})</span></div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{account.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {account.role !== 'admin' && (
                      <select
                        aria-label={`Role for ${account.full_name}`}
                        value={account.role}
                        onChange={(event) => changeUserRole(account, event.target.value as 'customer' | 'employee')}
                        className="input-luxury"
                        style={{ width: '130px' }}
                      >
                        <option value="customer">Customer</option>
                        <option value="employee">Employee</option>
                      </select>
                    )}
                    <button type="button" onClick={() => toggleUserActive(account)} className="btn btn-outline btn-sm">
                      {account.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Property Inventory Governance</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
              {stats
                ? `The active database contains ${new Intl.NumberFormat('en-AE').format(stats.total_properties)} property records.`
                : loadError || 'Loading the property count from the active database.'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <a href="/properties" className="btn btn-outline btn-sm">
                View Public Catalog
              </a>
              <a href="/ai" className="btn btn-gold btn-sm">
                Test AI Search
              </a>
            </div>
            {loadError && <p role="alert" style={{ color: '#f87171', marginTop: '1rem' }}>{loadError}</p>}
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
              {properties.map((property) => (
                <PropertyAdminRow
                  key={property.id}
                  property={property}
                  onSave={updateProperty}
                  onToggleActive={togglePropertyActive}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Showing {properties.length ? propertyOffset + 1 : 0}–{propertyOffset + properties.length} of {propertyTotal}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={propertyOffset === 0} onClick={() => setPropertyOffset(Math.max(0, propertyOffset - 50))}>Previous</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={propertyOffset + 50 >= propertyTotal} onClick={() => setPropertyOffset(propertyOffset + 50)}>Next</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>System Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Agency Name
                </label>
                <input type="text" readOnly value="LYKA Realty LLC — Dubai" className="input-luxury" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Default Currency
                </label>
                <input type="text" readOnly value="AED (United Arab Emirates Dirham)" className="input-luxury" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  RERA Compliance Registration
                </label>
                <input type="text" readOnly value="Office 1002, Damac Executive Heights, Barsha Heights" className="input-luxury" />
              </div>
            </div>
          </div>
        )}
        {activeTab === 'telephony' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>AI Calling & Telephony Governance</h3>
            {telephonyMsg && (
              <div style={{ backgroundColor: 'rgba(197, 160, 89, 0.15)', color: 'var(--gold)', padding: '0.6rem 1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {telephonyMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '8px' }}>
                <h4 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.75rem 0' }}>Telephony Integration Status</h4>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <div>Active Provider: <strong style={{ color: 'var(--gold)' }}>{telephonySettings?.provider?.toUpperCase() || 'DEMO_MOCK'}</strong></div>
                  <div>Outbound Caller ID: <strong style={{ color: '#fff' }}>{telephonySettings?.twilio_from_number || '+971 4 000 0000'}</strong></div>
                  <div>Max Concurrency: <strong style={{ color: '#fff' }}>{telephonySettings?.max_concurrent_calls || 5} concurrent channels</strong></div>
                  <div>Daily Budget Cap: <strong style={{ color: '#fff' }}>AED {telephonySettings?.daily_spend_limit_usd || 100}</strong></div>
                  <div>Recording Mode: <strong style={{ color: '#38bdf8' }}>Consent-enforced only</strong></div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '8px' }}>
                <h4 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.75rem 0' }}>Add to Do-Not-Call (DNC) Registry</h4>
                <form onSubmit={handleAddDNC} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input
                    type="tel"
                    required
                    placeholder="+971501234567"
                    value={newDncPhone}
                    onChange={(e) => setNewDncPhone(e.target.value)}
                    className="input-luxury"
                    style={{ fontSize: '0.85rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Reason (e.g. Customer requested opt-out)"
                    value={newDncReason}
                    onChange={(e) => setNewDncReason(e.target.value)}
                    className="input-luxury"
                    style={{ fontSize: '0.85rem' }}
                  />
                  <button type="submit" className="btn btn-gold btn-sm" style={{ alignSelf: 'flex-start' }}>
                    Register DNC Phone
                  </button>
                </form>
              </div>
            </div>

            <h4 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.75rem 0' }}>
              Active Do-Not-Call Registry ({dncList.length})
            </h4>
            {dncList.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No numbers currently on the DNC list.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Phone Number</th>
                      <th style={{ padding: '8px' }}>Reason</th>
                      <th style={{ padding: '8px' }}>Added At</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dncList.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px', color: '#fff', fontWeight: 600 }}>{item.phone_number}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.reason}</td>
                        <td style={{ padding: '8px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Active'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveDNC(item.phone_number)}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Operational & Security Audit Logs</h3>
            {auditLogs.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No audit logs retrieved.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Timestamp</th>
                      <th style={{ padding: '8px' }}>Event</th>
                      <th style={{ padding: '8px' }}>User ID</th>
                      <th style={{ padding: '8px' }}>IP</th>
                      <th style={{ padding: '8px' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'Recent'}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--gold)', fontWeight: 600 }}>{log.event_type}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{log.user_id || 'System'}</td>
                        <td style={{ padding: '8px', color: 'var(--text-dim)' }}>{log.ip_address || '—'}</td>
                        <td style={{ padding: '8px', color: '#fff' }}>{log.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PropertyAdminRow: React.FC<{
  property: Property;
  onSave: (property: Property, changes: Partial<Property>) => Promise<void>;
  onToggleActive: (property: Property) => Promise<void>;
}> = ({ property, onSave, onToggleActive }) => {
  const [title, setTitle] = useState(property.title);
  const [location, setLocation] = useState(property.location);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) minmax(130px, 1fr) auto auto', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
      <input aria-label={`Title for property ${property.id}`} value={title} onChange={(event) => setTitle(event.target.value)} className="input-luxury" />
      <input aria-label={`Location for property ${property.id}`} value={location} onChange={(event) => setLocation(event.target.value)} className="input-luxury" />
      <button
        type="button"
        onClick={() => onSave(property, { title, location })}
        disabled={title === property.title && location === property.location}
        className="btn btn-outline btn-sm"
      >
        Save
      </button>
      <button type="button" onClick={() => onToggleActive(property)} className="btn btn-outline btn-sm">
        {property.is_active ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
};
