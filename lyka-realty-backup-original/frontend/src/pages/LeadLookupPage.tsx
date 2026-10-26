import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Info,
  Sparkles,
  UserCheck,
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import { Lead } from '../types';

export const LeadLookupPage: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leadRecord, setLeadRecord] = useState<Lead | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');
    setHasSearched(true);
    setLeadRecord(null);

    try {
      const result = await api.trackLeadEnquiry(phone.trim());
      if (result.found && result.leads && result.leads.length > 0) {
        setLeadRecord(result.leads[0]);
      } else {
        setLeadRecord(null);
        setError(result.message || 'No active enquiry found for this phone number.');
      }
    } catch (err: any) {
      setError(err.message || 'No active enquiry found for this phone number.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="page-wrapper"
      style={{
        backgroundColor: 'var(--bg-dark)',
        minHeight: '100vh',
        padding: '3rem 1rem',
      }}
    >
      <div className="app-container" style={{ maxWidth: '820px' }}>
        {/* Clarification Banner */}
        <div
          style={{
            backgroundColor: 'rgba(90, 22, 69, 0.25)',
            border: '1px solid rgba(197, 160, 89, 0.5)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
          }}
        >
          <Info size={28} color="var(--gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: '0 0 0.4rem 0', fontWeight: 600 }}>
              Lead Records vs. User Accounts
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.55, margin: 0 }}>
              A <strong>Lead</strong> is a CRM record created from your real estate enquiries, property viewings, or conversations with LYKA AI.
              Leads are managed by our sales team and <strong>do not require login credentials</strong>.
              If you want to save favorites and track bookings with a password, you can{' '}
              <Link to="/register" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                register for a Customer Account
              </Link>.
            </p>
          </div>
        </div>

        {/* Enquiry Tracker Card */}
        <div className="card-luxury" style={{ padding: '2.5rem', marginBottom: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
              Track Your Property Enquiry
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Enter the phone number you used during your enquiry or conversation with LYKA AI to see your current qualification and sales handoff status.
            </p>
          </div>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Phone
                size={18}
                color="var(--text-dim)"
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 123 4567 or 0501234567"
                className="input-luxury"
                style={{ paddingLeft: '42px', width: '100%' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.75rem 1.75rem' }}
            >
              <Search size={16} />
              <span>{loading ? 'Searching...' : 'Track Enquiry'}</span>
            </button>
          </form>

          {error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <ShieldAlert size={16} />
                <strong>Enquiry Not Found</strong>
              </div>
              {error} Start a live consultation with{' '}
              <Link to="/ai" style={{ color: '#fff', textDecoration: 'underline' }}>
                LYKA AI
              </Link>{' '}
              to register your preferences.
            </div>
          )}

          {leadRecord && (
            <div
              style={{
                backgroundColor: 'rgba(24, 27, 38, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '1.75rem',
                animation: 'fadeIn 0.3s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '1rem',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <h2 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 4px 0' }}>
                    {leadRecord.customer_name || 'Enquiry Client'}
                  </h2>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Enquiry ID: #{leadRecord.id} • Registered via {leadRecord.lead_source || 'AI Assistant'}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(197, 160, 89, 0.15)',
                    border: '1px solid var(--gold)',
                    color: 'var(--gold)',
                    padding: '4px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                >
                  Status: {leadRecord.lead_status}
                </div>
              </div>

              {/* Attributes Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '4px' }}>
                    Contact Preference
                  </div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.92rem' }}>
                    {leadRecord.contact_preference?.toUpperCase() || 'WHATSAPP'}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '4px' }}>
                    Next Action / Handoff
                  </div>
                  <div style={{ color: 'var(--gold-light)', fontWeight: 600, fontSize: '0.92rem' }}>
                    {leadRecord.next_action || 'Broker review in progress'}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '4px' }}>
                    Follow-Up Scheduled
                  </div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.92rem' }}>
                    {leadRecord.follow_up_date
                      ? new Date(leadRecord.follow_up_date).toLocaleDateString()
                      : 'Pending agent assignment'}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '4px' }}>
                    Qualification Score
                  </div>
                  <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.92rem' }}>
                    {leadRecord.lead_score}/100
                  </div>
                </div>
              </div>

              {/* Requirement Summary */}
              {leadRecord.requirement_summary && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '6px' }}>
                    Captured Preferences:
                  </div>
                  <div
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      color: 'var(--text-main)',
                      lineHeight: 1.5,
                    }}
                  >
                    {leadRecord.requirement_summary}
                  </div>
                </div>
              )}

              {/* Next Steps Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <Link
                  to="/ai"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Sparkles size={16} />
                  <span>Continue Consultation in Chat</span>
                </Link>
                <Link
                  to="/register"
                  className="btn btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <UserCheck size={16} />
                  <span>Create Full Customer Account</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick Links Footer */}
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Are you a LYKA employee?{' '}
          <Link to="/login/sales" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            Sign into Sales Workspace
          </Link>{' '}
          •{' '}
          <Link to="/login/manager" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            Manager
          </Link>{' '}
          •{' '}
          <Link to="/login/admin" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            Admin
          </Link>
        </div>
      </div>
    </div>
  );
};
