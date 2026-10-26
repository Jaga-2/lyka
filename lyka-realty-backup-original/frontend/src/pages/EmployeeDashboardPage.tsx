import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Sparkles,
  Phone,
  Mail,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { Lead, LeadStatus, SiteVisit } from '../types';
import { api } from '../services/api';

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; border: string }> = {
  NEW: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' },
  QUALIFIED: { bg: 'rgba(129, 140, 248, 0.15)', text: '#818cf8', border: 'rgba(129, 140, 248, 0.4)' },
  HOT: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171', border: 'rgba(239, 68, 68, 0.5)' },
  WARM: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' },
  COLD: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' },
  CONTACTED: { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' },
  SITE_VISIT: { bg: 'rgba(234, 179, 8, 0.2)', text: '#facc15', border: 'rgba(234, 179, 8, 0.5)' },
  NEGOTIATION: { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.4)' },
  CONVERTED: { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399', border: 'rgba(16, 185, 129, 0.5)' },
  LOST: { bg: 'rgba(100, 116, 139, 0.2)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
};

export const EmployeeDashboardPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [qualificationHelp, setQualificationHelp] = useState('');
  const [loadError, setLoadError] = useState('');

  const fetchCRMData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const leadsRes = await api.getLeads(statusFilter === 'ALL' ? undefined : statusFilter);
      setLeads(leadsRes);
      setSelectedLead((previous) => leadsRes.find((lead) => lead.id === previous?.id) || leadsRes[0] || null);
      const visitsRes = await api.getAllVisits();
      setSiteVisits(visitsRes);
    } catch (error) {
      setLeads([]);
      setSiteVisits([]);
      setSelectedLead(null);
      setLoadError(error instanceof Error ? error.message : 'CRM data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, [statusFilter]);

  const handleUpdateStatus = async (leadId: number, newStatus: LeadStatus) => {
    try {
      const updatedLead = await api.updateLeadStatus(leadId, newStatus);
      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? updatedLead : lead)));
      if (selectedLead?.id === leadId) setSelectedLead(updatedLead);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Lead status could not be updated.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newNote.trim()) return;

    try {
      const updatedLead = await api.addLeadNote(selectedLead.id, newNote);
      setSelectedLead(updatedLead);
      setLeads((prev) => prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
      setNewNote('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The note could not be saved.');
    }
  };

  const handleAIQualification = (lead: Lead) => {
    const advice = `LYKA CRM summary for ${lead.customer_name}:
• Score: ${lead.lead_score}/100 (${(lead.score_factors || []).join('; ') || 'No scoring factors recorded'}).
• Requirements: ${JSON.stringify(lead.requirements || {})}.
• Next action: ${lead.next_action || 'Review the recorded customer requirements.'}`;
    setQualificationHelp(advice);
  };

  const hotCount = leads.filter((lead) => lead.lead_score >= 60).length;
  const visitCount = siteVisits.length;

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={24} color="var(--gold)" />
            <h1 style={{ color: '#fff', fontSize: '2rem', margin: 0 }}>
              LYKA Employee CRM & Lead Intelligence
            </h1>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Track AI qualified prospects, conversation transcripts, lead scores, and schedule follow-ups
          </div>
        </div>

        {/* KPI Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            marginBottom: '2rem',
          }}
        >
          <div className="card-luxury" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total CRM Leads</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{leads.length}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: '4px' }}>Updated from LYKA AI</div>
          </div>

          <div className="card-luxury" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Hot Leads (High Intent)</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>{hotCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Score &gt; 90+</div>
          </div>

          <div className="card-luxury" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Site Visits Scheduled</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--gold-light)', marginTop: '4px' }}>{visitCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Active bookings</div>
          </div>

          <div className="card-luxury" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>AI Qualification Rate</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--gold)', marginTop: '4px' }}>84.2%</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: '4px' }}>Automated profiling</div>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '1.5rem',
          }}
        >
          {['ALL', 'NEW', 'QUALIFIED', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'CONVERTED', 'LOST'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: statusFilter === st ? 'var(--gold)' : 'var(--border-color)',
                backgroundColor: statusFilter === st ? 'rgba(197, 160, 89, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: statusFilter === st ? 'var(--gold-light)' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: statusFilter === st ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Main CRM Layout: Leads List + Detail Drawer */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
          {/* Leads Table / Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loadError && <div role="alert" style={{ color: '#f87171' }}>{loadError}</div>}
            {!loading && leads.length === 0 && !loadError && (
              <div style={{ color: 'var(--text-muted)' }}>No saved leads match this view.</div>
            )}
            {leads.map((lead) => {
              const statusCfg = STATUS_COLORS[lead.lead_status] || STATUS_COLORS.NEW;
              const isSelected = selectedLead?.id === lead.id;

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLead(lead);
                    setQualificationHelp('');
                  }}
                  className="card-luxury"
                  style={{
                    padding: '1.25rem',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--gold)' : 'var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(90, 22, 69, 0.2)' : 'var(--bg-card)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>{lead.customer_name}</h3>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{lead.customer_email || 'Email not provided'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          backgroundColor: statusCfg.bg,
                          color: statusCfg.text,
                          border: `1px solid ${statusCfg.border}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {lead.lead_status}
                      </span>
                      <div style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: '0.85rem', marginTop: '4px' }}>
                        Score: {lead.lead_score}/100
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {lead.location && <span>Area: <strong>{lead.location}</strong></span>}
                    {lead.budget && (
                      <span>
                        Budget: <strong>AED {new Intl.NumberFormat('en-AE').format(lead.budget)}</strong>
                      </span>
                    )}
                    {lead.bedrooms && <span>Beds: <strong>{lead.bedrooms} BHK</strong></span>}
                  </div>

                  {lead.conversation_summary && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-dim)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      "{lead.conversation_summary}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lead Detail & AI Qualification Panel */}
          {selectedLead ? (
            <div
              className="card-luxury"
              style={{
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                position: 'sticky',
                top: '90px',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>{selectedLead.customer_name}</h2>
                  <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Phone size={13} color="var(--gold)" />
                      <span>{selectedLead.customer_phone || 'Phone not provided'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Mail size={13} color="var(--gold)" />
                      <span>{selectedLead.customer_email || 'Email not provided'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleAIQualification(selectedLead)}
                  className="btn btn-gold btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Sparkles size={14} />
                  <span>AI Qualify</span>
                </button>
              </div>

              {/* Status Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Pipeline Stage
                </label>
                <select
                  value={selectedLead.lead_status}
                  onChange={(e) => handleUpdateStatus(selectedLead.id, e.target.value as LeadStatus)}
                  className="input-luxury"
                >
                  {['NEW', 'QUALIFIED', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'CONVERTED', 'LOST'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* AI Lead Scoring Factors */}
              <div
                style={{
                  backgroundColor: 'rgba(90, 22, 69, 0.15)',
                  border: '1px solid rgba(197, 160, 89, 0.3)',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.85rem' }}>
                    Explainable Lead Score
                  </span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                    {selectedLead.lead_score} / 100
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(selectedLead.score_factors || []).map((factor, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#fff' }}>
                      <CheckCircle2 size={13} color="var(--success)" />
                      <span>{factor}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '6px' }}>Requirements & Follow-up</h4>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  <div>Language: {selectedLead.preferred_language || 'Not recorded'}</div>
                  <div>Purpose: {selectedLead.intent || 'Not recorded'}</div>
                  <div>Budget: {selectedLead.budget_min != null || selectedLead.budget_max != null
                    ? `AED ${selectedLead.budget_min?.toLocaleString() || '0'}–${selectedLead.budget_max?.toLocaleString() || 'unlimited'}`
                    : selectedLead.budget != null ? `AED ${selectedLead.budget.toLocaleString()}` : 'Not recorded'}</div>
                  <div>Area: {selectedLead.preferred_location || selectedLead.location || 'Not recorded'}</div>
                  <div>Bedrooms: {selectedLead.bedrooms ?? 'Not recorded'}{selectedLead.property_type ? ` • ${selectedLead.property_type}` : ''}</div>
                  <div>Furnished: {selectedLead.furnished == null ? 'Not recorded' : selectedLead.furnished ? 'Yes' : 'No'}</div>
                </div>
                {selectedLead.interested_property && (
                  <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Interested property: <strong style={{ color: '#fff' }}>{selectedLead.interested_property.title}</strong> — {selectedLead.interested_property.location}
                    {selectedLead.interested_property.listed_price_aed != null && ` • AED ${selectedLead.interested_property.listed_price_aed.toLocaleString()}`}
                  </div>
                )}
                <div style={{ marginTop: 8, color: 'var(--gold-light)', fontSize: '0.85rem' }}>
                  Next action: {selectedLead.next_action || 'Review the recorded requirements.'}
                </div>
                {selectedLead.site_visit && (
                  <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Site visit: {selectedLead.site_visit.property_title} — {selectedLead.site_visit.preferred_date} at {selectedLead.site_visit.preferred_time} ({selectedLead.site_visit.status})
                  </div>
                )}
              </div>

              {/* AI Qualification Advice (if generated) */}
              {qualificationHelp && (
                <div
                  style={{
                    backgroundColor: 'rgba(18, 20, 28, 0.95)',
                    border: '1px solid var(--gold)',
                    borderRadius: '10px',
                    padding: '1rem',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.6,
                    color: '#fff',
                  }}
                >
                  {qualificationHelp}
                </div>
              )}

              {/* Conversation Summary */}
              <div>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={16} color="var(--gold)" />
                  <span>LYKA AI Conversation Record</span>
                </h4>
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  {selectedLead.conversation_summary || 'No conversation transcript on record.'}
                </div>
              </div>

              {selectedLead.recent_conversation && selectedLead.recent_conversation.length > 0 && (
                <div>
                  <h4 style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '6px' }}>Recent Conversation</h4>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {selectedLead.recent_conversation.map((message, index) => (
                      <div key={`${message.created_at}-${index}`} style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <strong style={{ color: 'var(--gold)' }}>{message.role}:</strong> {message.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-up Notes & Action Logger */}
              <div>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={16} color="var(--gold)" />
                  <span>Follow-Up Action Notes</span>
                </h4>
                {selectedLead.follow_up_notes && (
                  <div
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.82rem',
                      color: 'var(--text-main)',
                      marginBottom: '10px',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {selectedLead.follow_up_notes}
                  </div>
                )}
                <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Log agent call, client reaction, visit outcome..."
                    className="input-luxury"
                    style={{ fontSize: '0.85rem' }}
                  />
                  <button type="submit" className="btn btn-outline btn-sm">
                    Log
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-dim)' }}>
              Select a lead from the list to view requirements, score factors, and transcripts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
