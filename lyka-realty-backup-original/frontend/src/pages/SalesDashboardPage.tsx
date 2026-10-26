import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Sparkles,
  Phone,
  PhoneCall,
  Mail,
  MessageSquare,
  FileText,
  Clock,
  Calendar,
  AlertTriangle,
  Send,
  Sliders,
  Copy,
  Check,
  UserCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Lead, LeadStatus, SiteVisit, SiteVisitStatus } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

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

const VISIT_STATUS_COLORS: Record<SiteVisitStatus, { bg: string; text: string }> = {
  REQUESTED: { bg: 'rgba(234, 179, 8, 0.2)', text: '#facc15' },
  ASSIGNED: { bg: 'rgba(56, 189, 248, 0.2)', text: '#38bdf8' },
  SCHEDULED: { bg: 'rgba(168, 85, 247, 0.2)', text: '#c084fc' },
  CONFIRMED: { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
  COMPLETED: { bg: 'rgba(52, 211, 153, 0.25)', text: '#6ee7b7' },
  CANCELLED: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
  RESCHEDULED: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
};

export const SalesDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'leads' | 'visits' | 'calls'>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Note form
  const [newNote, setNewNote] = useState('');

  // Score override modal
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [overrideScore, setOverrideScore] = useState<number>(75);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);

  // AI Follow-up Draft
  const [draftChannel, setDraftChannel] = useState<'whatsapp' | 'email' | 'call_script'>('whatsapp');
  const [draftResult, setDraftResult] = useState<any>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Calling Agent Modal & State
  const [showCallModal, setShowCallModal] = useState(false);
  const [callingLead, setCallingLead] = useState<Lead | null>(null);
  const [callPurpose, setCallPurpose] = useState('qualification');
  const [callLoading, setCallLoading] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);

  // Selected visit for status update
  const [updatingVisitId, setUpdatingVisitId] = useState<number | null>(null);
  const [newVisitStatus, setNewVisitStatus] = useState<SiteVisitStatus>('CONFIRMED');
  const [visitNotes, setVisitNotes] = useState('');

  const fetchCRMData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [leadsRes, visitsRes] = await Promise.all([
        api.getLeads(statusFilter === 'ALL' ? undefined : statusFilter),
        api.getAllVisits(),
      ]);
      setLeads(leadsRes);
      setSiteVisits(visitsRes);
      if (!selectedLead && leadsRes.length > 0) {
        setSelectedLead(leadsRes[0]);
      } else if (selectedLead) {
        const refreshed = leadsRes.find((l) => l.id === selectedLead.id);
        if (refreshed) setSelectedLead(refreshed);
      }
    } catch (error: any) {
      setLoadError(error.message || 'CRM data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, [statusFilter]);

  const handleUpdateStatus = async (leadId: number, newStatus: LeadStatus) => {
    try {
      const updated = await api.updateLeadStatus(leadId, newStatus);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      if (selectedLead?.id === leadId) setSelectedLead(updated);
    } catch (error: any) {
      setLoadError(error.message || 'Failed to update lead status');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newNote.trim()) return;
    try {
      const updated = await api.addLeadNote(selectedLead.id, newNote.trim());
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setNewNote('');
    } catch (error: any) {
      setLoadError(error.message || 'Failed to add note');
    }
  };

  const handleScoreOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !overrideReason.trim()) return;
    setOverrideLoading(true);
    try {
      const updated = await api.overrideLeadScore(selectedLead.id, Number(overrideScore), overrideReason.trim());
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setShowScoreModal(false);
      setOverrideReason('');
    } catch (error: any) {
      setLoadError(error.message || 'Failed to override score');
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleGenerateAIDraft = async (channel: 'whatsapp' | 'email' | 'call_script') => {
    if (!selectedLead) return;
    setDraftChannel(channel);
    setDraftLoading(true);
    setCopiedDraft(false);
    try {
      const result = await api.generateLeadAIDraft(selectedLead.id, channel);
      setDraftResult(result);
    } catch (error: any) {
      setLoadError(error.message || 'Failed to generate AI follow-up draft');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopyDraft = () => {
    if (!draftResult?.draft) return;
    navigator.clipboard.writeText(draftResult.draft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2500);
  };

  const handleOpenCallModal = (lead: Lead) => {
    setCallingLead(lead);
    setCallResult(null);
    setShowCallModal(true);
  };

  const handleTriggerCall = async () => {
    if (!callingLead) return;
    setCallLoading(true);
    setCallResult(null);
    try {
      const result = await api.initiateCall({
        lead_id: callingLead.id,
        phone_number: callingLead.customer_phone || '+971501234567',
        customer_name: callingLead.customer_name || 'Valued Client',
        purpose: callPurpose,
      });
      setCallResult(result);
      // Refresh lead to show updated call logs/notes
      await fetchCRMData();
    } catch (error: any) {
      setLoadError(error.message || 'Failed to initiate calling agent.');
    } finally {
      setCallLoading(false);
    }
  };

  const handleUpdateVisitStatus = async (visitId: number) => {
    try {
      const updated = await api.updateVisitStatus(visitId, newVisitStatus, visitNotes);
      setSiteVisits((prev) => prev.map((v) => (v.id === visitId ? updated : v)));
      setUpdatingVisitId(null);
      setVisitNotes('');
    } catch (error: any) {
      setLoadError(error.message || 'Failed to update site visit status');
    }
  };

  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.customer_name?.toLowerCase().includes(q) ||
      lead.customer_email?.toLowerCase().includes(q) ||
      lead.customer_phone?.toLowerCase().includes(q) ||
      lead.requirement_summary?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', padding: '2rem 1rem' }}>
      <div className="app-container" style={{ maxWidth: '1400px' }}>
        {/* Workspace Top Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Briefcase size={22} color="var(--gold)" />
              <h1 style={{ color: '#fff', fontSize: '1.75rem', margin: 0, fontWeight: 700 }}>
                Sales Agent Workspace
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
              Logged in as <strong>{user?.full_name}</strong> • Real-time CRM Leads, AI Follow-up Drafter & Telephony Calling Agent
            </p>
          </div>

          {/* Quick Metrics Chips */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px 14px', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
              Hot Leads: {leads.filter((l) => l.lead_score >= 60).length}
            </div>
            <div style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '6px 14px', borderRadius: '8px', color: '#facc15', fontSize: '0.85rem', fontWeight: 600 }}>
              Viewing Requests: {siteVisits.filter((v) => v.status === 'REQUESTED').length}
            </div>
          </div>
        </div>

        {loadError && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {loadError}
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setActiveTab('leads')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'leads' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'leads' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Leads & Follow-Ups ({leads.length})
          </button>
          <button
            onClick={() => setActiveTab('visits')}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'visits' ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === 'visits' ? 'var(--gold)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
            }}
          >
            Viewing Appointments ({siteVisits.length})
          </button>
        </div>

        {activeTab === 'leads' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Left: Leads List & Filters */}
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Search leads by name, email, phone, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-luxury"
                  style={{ flex: 1 }}
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-luxury"
                  style={{ width: '140px' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="HOT">Hot</option>
                  <option value="WARM">Warm</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="SITE_VISIT">Site Visit</option>
                  <option value="CONVERTED">Converted</option>
                </select>
              </div>

              {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading leads...</p>
              ) : filteredLeads.length === 0 ? (
                <div className="card-luxury" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  No leads found matching your criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '700px', overflowY: 'auto' }}>
                  {filteredLeads.map((lead) => {
                    const statusColor = STATUS_COLORS[lead.lead_status] || STATUS_COLORS.NEW;
                    const isSelected = selectedLead?.id === lead.id;
                    return (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="card-luxury"
                        style={{
                          padding: '1rem 1.25rem',
                          cursor: 'pointer',
                          borderColor: isSelected ? 'var(--gold)' : 'var(--border-color)',
                          backgroundColor: isSelected ? 'rgba(90, 22, 69, 0.25)' : 'var(--bg-surface)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div>
                            <strong style={{ color: '#fff', fontSize: '1rem' }}>{lead.customer_name || 'Enquiry Client'}</strong>
                            <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                              {lead.customer_phone || lead.customer_email || 'No contact provided'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span
                              style={{
                                backgroundColor: statusColor.bg,
                                color: statusColor.text,
                                border: `1px solid ${statusColor.border}`,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '9999px',
                              }}
                            >
                              {lead.lead_status}
                            </span>
                            <span
                              style={{
                                backgroundColor: lead.lead_score >= 60 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                color: lead.lead_score >= 60 ? '#f87171' : 'var(--text-main)',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '9999px',
                              }}
                            >
                              {lead.lead_score} pts
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.4 }}>
                          {lead.requirement_summary || 'General inquiry captured from AI consultant.'}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          <span>Pref: <strong>{lead.contact_preference || 'WHATSAPP'}</strong></span>
                          <span>Follow-up: <strong>{lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : 'Not set'}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Selected Lead Details & AI Assistant Drafter & Calling */}
            <div>
              {selectedLead ? (
                <div className="card-luxury" style={{ padding: '1.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: '1.35rem', margin: '0 0 4px 0' }}>{selectedLead.customer_name}</h2>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        ID #{selectedLead.id} • Source: {selectedLead.lead_source || 'AI Consultation'}
                      </div>
                    </div>

                    {/* Calling Agent Action Button */}
                    <button
                      onClick={() => handleOpenCallModal(selectedLead)}
                      className="btn btn-gold btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <PhoneCall size={15} />
                      <span>AI Calling Agent</span>
                    </button>
                  </div>

                  {/* Status & Score Control Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Status:</span>
                      <select
                        value={selectedLead.lead_status}
                        onChange={(e) => handleUpdateStatus(selectedLead.id, e.target.value as LeadStatus)}
                        className="input-luxury"
                        style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                      >
                        {Object.keys(STATUS_COLORS).map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Score: <strong>{selectedLead.lead_score}/100</strong>
                        {selectedLead.score_override !== null && (
                          <span style={{ color: 'var(--gold)', marginLeft: '4px' }}>(Overridden)</span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setOverrideScore(selectedLead.lead_score);
                          setShowScoreModal(true);
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      >
                        <Sliders size={12} style={{ marginRight: '4px' }} />
                        Override
                      </button>
                    </div>
                  </div>

                  {/* Lead Score Explanation Factors */}
                  {selectedLead.score_factors && selectedLead.score_factors.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>
                        Explainable Scoring Breakdown:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {selectedLead.score_factors.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      {selectedLead.score_override_reason && (
                        <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                          <strong>Override Note:</strong> {selectedLead.score_override_reason}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Follow-Up Draft Generator */}
                  <div style={{ border: '1px solid rgba(197, 160, 89, 0.3)', borderRadius: '10px', padding: '1rem', backgroundColor: 'rgba(18, 20, 28, 0.6)', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--gold)', fontSize: '0.88rem', fontWeight: 600 }}>
                        <Sparkles size={16} />
                        <span>AI Assistant Follow-Up Generator</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleGenerateAIDraft('whatsapp')}
                          disabled={draftLoading}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.75rem', color: draftChannel === 'whatsapp' ? 'var(--gold)' : 'var(--text-muted)' }}
                        >
                          WhatsApp
                        </button>
                        <button
                          onClick={() => handleGenerateAIDraft('email')}
                          disabled={draftLoading}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.75rem', color: draftChannel === 'email' ? 'var(--gold)' : 'var(--text-muted)' }}
                        >
                          Email
                        </button>
                        <button
                          onClick={() => handleGenerateAIDraft('call_script')}
                          disabled={draftLoading}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.75rem', color: draftChannel === 'call_script' ? 'var(--gold)' : 'var(--text-muted)' }}
                        >
                          Call Script
                        </button>
                      </div>
                    </div>

                    {draftLoading ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating personalized follow-up draft...</p>
                    ) : draftResult ? (
                      <div>
                        <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', color: '#fff', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: '180px', overflowY: 'auto' }}>
                          {draftResult.draft}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button
                            onClick={handleCopyDraft}
                            className="btn btn-outline btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                          >
                            {copiedDraft ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                            <span>{copiedDraft ? 'Copied!' : 'Copy to Clipboard'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', margin: 0 }}>
                        Click a channel button above (WhatsApp, Email, or Call Script) to draft a high-conversion follow-up using LYKA AI.
                      </p>
                    )}
                  </div>

                  {/* Notes & Actions History */}
                  <div>
                    <h4 style={{ color: '#fff', fontSize: '0.92rem', marginBottom: '8px' }}>CRM Agent Notes</h4>
                    <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Log customer response, next steps, or viewing date..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="input-luxury"
                        style={{ flex: 1, fontSize: '0.85rem' }}
                      />
                      <button type="submit" className="btn btn-gold btn-sm">
                        <Send size={14} />
                      </button>
                    </form>

                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(selectedLead.notes || (selectedLead.follow_up_notes ? selectedLead.follow_up_notes.split('\n').filter(Boolean) : [])).map((n: string, i: number) => (
                        <div key={i} style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card-luxury" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Select a lead from the list to view requirements, AI drafting, and calling controls.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Viewing Appointments Tab */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {siteVisits.map((visit) => {
                const statusStyle = VISIT_STATUS_COLORS[visit.status] || { bg: 'rgba(255, 255, 255, 0.1)', text: '#fff' };
                const isEditing = updatingVisitId === visit.id;
                return (
                  <div key={visit.id} className="card-luxury" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <strong style={{ color: '#fff', fontSize: '1.05rem' }}>{visit.customer_name}</strong>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                          Phone: {visit.customer_phone || 'None'} • Email: {visit.customer_email || 'None'}
                        </div>
                      </div>
                      <span style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, padding: '3px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {visit.status}
                      </span>
                    </div>

                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem' }}>
                      <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: '2px' }}>
                        {visit.property_title || `Property #${visit.property_id}`}
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Requested Time: <strong>{visit.preferred_date} at {visit.preferred_time}</strong>
                      </div>
                      {visit.notes && <div style={{ color: 'var(--text-dim)', marginTop: '4px', fontStyle: 'italic' }}>Notes: "{visit.notes}"</div>}
                    </div>

                    {isEditing ? (
                      <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: '0.75rem', borderRadius: '8px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Update Status:
                        </label>
                        <select
                          value={newVisitStatus}
                          onChange={(e) => setNewVisitStatus(e.target.value as SiteVisitStatus)}
                          className="input-luxury"
                          style={{ width: '100%', marginBottom: '8px', fontSize: '0.85rem' }}
                        >
                          <option value="REQUESTED">REQUESTED</option>
                          <option value="ASSIGNED">ASSIGNED</option>
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="CANCELLED">CANCELLED</option>
                          <option value="RESCHEDULED">RESCHEDULED</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Agent confirmation note..."
                          value={visitNotes}
                          onChange={(e) => setVisitNotes(e.target.value)}
                          className="input-luxury"
                          style={{ width: '100%', marginBottom: '8px', fontSize: '0.82rem' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setUpdatingVisitId(null)} className="btn btn-ghost btn-sm">Cancel</button>
                          <button onClick={() => handleUpdateVisitStatus(visit.id)} className="btn btn-gold btn-sm">Save Status</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setUpdatingVisitId(visit.id);
                          setNewVisitStatus(visit.status);
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ width: '100%' }}
                      >
                        Manage Viewing Status
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Score Override Modal */}
        {showScoreModal && selectedLead && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card-luxury" style={{ maxWidth: '420px', width: '100%', padding: '2rem' }}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem 0' }}>Override Lead Score</h3>
              <form onSubmit={handleScoreOverrideSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '6px' }}>
                    New Score (0 - 100): {overrideScore}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '6px' }}>
                    Reason for Override (Audited):
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="E.g., Client verbally confirmed pre-approved mortgage for 3.5M..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="input-luxury"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowScoreModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
                  <button type="submit" disabled={overrideLoading} className="btn btn-gold btn-sm">
                    {overrideLoading ? 'Saving...' : 'Confirm Override'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AI Calling Agent Modal */}
        {showCallModal && callingLead && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card-luxury" style={{ maxWidth: '580px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <PhoneCall size={22} color="var(--gold)" />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.3rem' }}>LYKA AI Calling Agent</h3>
              </div>

              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem' }}>
                <div>Client: <strong style={{ color: '#fff' }}>{callingLead.customer_name}</strong></div>
                <div>Destination Phone: <strong style={{ color: 'var(--gold)' }}>{callingLead.customer_phone || '+971501234567'}</strong></div>
                <div>Status: <span style={{ color: '#38bdf8' }}>Telephony Ready (Mock / Twilio Integration)</span></div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '6px' }}>
                  Call Objective:
                </label>
                <select
                  value={callPurpose}
                  onChange={(e) => setCallPurpose(e.target.value)}
                  className="input-luxury"
                  style={{ width: '100%' }}
                >
                  <option value="qualification">Enquiry Qualification & Bedroom Preference</option>
                  <option value="callback_confirmation">Confirm Preferred Callback Date & Time</option>
                  <option value="site_visit_followup">Viewing Appointment Readiness Check</option>
                </select>
              </div>

              {callResult ? (
                <div style={{ backgroundColor: 'rgba(24, 27, 38, 0.95)', border: '1px solid var(--gold)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.88rem' }}>
                      Call Completed • Outcome: {callResult.outcome}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      Duration: {callResult.duration_seconds}s
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#fff', marginBottom: '8px' }}>
                    <strong>Summary:</strong> {callResult.summary}
                  </div>

                  {callResult.transcript && (
                    <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', maxHeight: '140px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {callResult.transcript}
                    </div>
                  )}

                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#34d399' }}>
                    ✓ Call record #{callResult.call_id} saved to database and CRM lead updated.
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
                  The AI Calling Agent will introduce itself warmly as LYKA Realty's AI Assistant, verify customer consent, qualify preferences against verified database listings, and update this CRM record with the conversation transcript and outcome.
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCallModal(false)} className="btn btn-ghost btn-sm">Close</button>
                <button
                  type="button"
                  onClick={handleTriggerCall}
                  disabled={callLoading}
                  className="btn btn-gold btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <PhoneCall size={14} />
                  <span>{callLoading ? 'Connecting Call...' : 'Place Call Now'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
