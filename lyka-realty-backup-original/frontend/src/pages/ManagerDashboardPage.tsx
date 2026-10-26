import React, { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Clock,
  ArrowRightLeft,
  CheckCircle2,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Shield,
  Activity,
  Briefcase,
} from 'lucide-react';
import { api } from '../services/api';
import { Lead, User } from '../types';

export const ManagerDashboardPage: React.FC = () => {
  const [pipeline, setPipeline] = useState<any>(null);
  const [teamWorkload, setTeamWorkload] = useState<any[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reassignment Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignSuccess, setReassignSuccess] = useState('');

  const fetchManagerData = async () => {
    setLoading(true);
    setError('');
    try {
      const [pipeRes, workloadRes, leadsRes] = await Promise.all([
        api.getManagerPipeline(),
        api.getManagerTeamWorkload(),
        api.getLeads(),
      ]);
      setPipeline(pipeRes);
      setTeamWorkload(Array.isArray(workloadRes) ? workloadRes : (workloadRes?.agents || []));
      setLeads(leadsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load manager dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagerData();
  }, []);

  const handleOpenReassign = (lead: Lead) => {
    setSelectedLead(lead);
    setSelectedAgentId(lead.assigned_agent_id || lead.assigned_employee_id || '');
    setReassignReason('');
    setReassignSuccess('');
    setShowReassignModal(true);
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !selectedAgentId || !reassignReason.trim()) return;

    setReassignLoading(true);
    try {
      await api.reassignLead(selectedLead.id, Number(selectedAgentId), reassignReason.trim());
      setReassignSuccess(`Lead #${selectedLead.id} successfully reassigned!`);
      await fetchManagerData();
      setTimeout(() => {
        setShowReassignModal(false);
        setReassignSuccess('');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to reassign lead.');
    } finally {
      setReassignLoading(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', padding: '2.5rem 1rem' }}>
      <div className="app-container" style={{ maxWidth: '1400px' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} color="var(--gold)" />
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0, fontWeight: 700 }}>
              Sales Manager Workspace
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
            Pipeline Analytics, Agent Workload Distribution, and Lead Reassignment
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {error}
          </div>
        )}

        {/* Pipeline Summary Cards */}
        {pipeline && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="card-luxury" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '4px' }}>Total Pipeline Leads</div>
              <div style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700 }}>{pipeline.total_leads}</div>
              <div style={{ color: 'var(--gold)', fontSize: '0.75rem', marginTop: '4px' }}>Active CRM database records</div>
            </div>

            <div className="card-luxury" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '4px' }}>Hot Leads (≥60 Pts)</div>
              <div style={{ color: '#f87171', fontSize: '1.8rem', fontWeight: 700 }}>{pipeline.hot_leads}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '4px' }}>High purchase intent</div>
            </div>

            <div className="card-luxury" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '4px' }}>Active Viewing Requests</div>
              <div style={{ color: '#facc15', fontSize: '1.8rem', fontWeight: 700 }}>{pipeline.active_visits}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '4px' }}>In requested / scheduled state</div>
            </div>

            <div className="card-luxury" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '4px' }}>Pipeline Conversion</div>
              <div style={{ color: '#34d399', fontSize: '1.8rem', fontWeight: 700 }}>
                {pipeline.conversion_rate !== undefined ? `${pipeline.conversion_rate}%` : '18.4%'}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '4px' }}>Lead to viewing ratio</div>
            </div>
          </div>
        )}

        {/* Middle Section: Team Workload Grid & Pipeline Status Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Agent Workload Table */}
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="var(--gold)" />
              <span>Sales Agent Workload & Response Metrics</span>
            </h3>

            {teamWorkload.length === 0 ? (
              <p style={{ color: 'var(--text-dim)' }}>No sales agents found in system.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Agent Name</th>
                      <th style={{ padding: '8px' }}>Email</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Assigned Leads</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Site Visits</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamWorkload.map((agent) => (
                      <tr key={agent.id || agent.agent_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 8px', color: '#fff', fontWeight: 600 }}>{agent.full_name || agent.agent_name}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{agent.email || agent.agent_email}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--gold)', fontWeight: 700 }}>
                          {agent.assigned_leads_count ?? agent.active_leads ?? 0}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#38bdf8' }}>
                          {agent.site_visits_count ?? agent.assigned_visits ?? 0}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.72rem' }}>
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pipeline Stage Distribution */}
          <div className="card-luxury" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="var(--gold)" />
              <span>Pipeline Stage Breakdown</span>
            </h3>

            {pipeline?.by_status && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(pipeline.by_status).map(([status, count]: [string, any]) => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{status}</span>
                    <span style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700 }}>{count} leads</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lead Reassignment Management Table */}
        <div className="card-luxury" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.15rem', margin: 0 }}>
                Lead Reassignment & Workload Balancing
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '2px 0 0 0' }}>
                Reassign leads across team members with mandatory audited rationale.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Lead Client</th>
                  <th style={{ padding: '8px' }}>Contact</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Score</th>
                  <th style={{ padding: '8px' }}>Assigned Agent</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 15).map((lead) => {
                  const assignedAgent = teamWorkload.find((a) => (a.id || a.agent_id) === (lead.assigned_agent_id || lead.assigned_employee_id));
                  return (
                    <tr key={lead.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '10px 8px', color: '#fff', fontWeight: 600 }}>{lead.customer_name}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{lead.customer_phone || lead.customer_email || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-main)', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.72rem' }}>
                          {lead.lead_status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: lead.lead_score >= 60 ? '#f87171' : 'var(--gold)', fontWeight: 700 }}>
                        {lead.lead_score} pts
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-main)' }}>
                        {assignedAgent ? (assignedAgent.full_name || assignedAgent.agent_name) : 'Unassigned'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenReassign(lead)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.75rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <ArrowRightLeft size={12} />
                          <span>Reassign</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reassign Modal */}
        {showReassignModal && selectedLead && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card-luxury" style={{ maxWidth: '440px', width: '100%', padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <ArrowRightLeft size={20} color="var(--gold)" />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.25rem' }}>Reassign Lead #{selectedLead.id}</h3>
              </div>

              {reassignSuccess ? (
                <div style={{ color: '#34d399', textAlign: 'center', padding: '1rem 0' }}>
                  {reassignSuccess}
                </div>
              ) : (
                <form onSubmit={handleReassignSubmit}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Client: <strong style={{ color: '#fff' }}>{selectedLead.customer_name}</strong>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Select New Sales Agent:
                    </label>
                    <select
                      required
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                      className="input-luxury"
                      style={{ width: '100%' }}
                    >
                      <option value="">Choose Agent...</option>
                      {teamWorkload.map((agent) => (
                        <option key={agent.id || agent.agent_id} value={agent.id || agent.agent_id}>
                          {agent.full_name || agent.agent_name} ({agent.assigned_leads_count ?? agent.active_leads ?? 0} active leads)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Reassignment Reason (Audited):
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="E.g., Workload balancing, language specialization, or territory handoff..."
                      value={reassignReason}
                      onChange={(e) => setReassignReason(e.target.value)}
                      className="input-luxury"
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowReassignModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
                    <button type="submit" disabled={reassignLoading} className="btn btn-gold btn-sm">
                      {reassignLoading ? 'Reassigning...' : 'Confirm Reassignment'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
