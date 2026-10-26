import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Heart } from 'lucide-react';
import { SiteVisit } from '../types';
import { api } from '../services/api';

export const CustomerVisitsPage: React.FC = () => {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const fetchVisits = async () => {
      try {
        const res = await api.getCustomerVisits();
        setVisits(res);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Site visits could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, []);

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Navigation tabs */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <Link
            to="/customer/shortlist"
            style={{
              padding: '0.75rem 1rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Heart size={16} />
            <span>Saved Properties</span>
          </Link>
          <Link
            to="/customer/visits"
            style={{
              padding: '0.75rem 1rem',
              color: 'var(--gold)',
              borderBottom: '2px solid var(--gold)',
              textDecoration: 'none',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Calendar size={16} />
            <span>My Site Visits ({visits.length})</span>
          </Link>
        </div>

        {loadError && <p role="alert" style={{ color: '#f87171' }}>{loadError}</p>}
        {loading ? (
          <p role="status" style={{ color: 'var(--text-muted)' }}>Loading your site visits…</p>
        ) : visits.length === 0 && !loadError ? (
          <div
            style={{
              textAlign: 'center',
              padding: '5rem 1rem',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <Calendar size={48} color="var(--text-dim)" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>No Scheduled Site Visits</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '450px', margin: '0 auto 1.5rem' }}>
              When you schedule a private site viewing with LYKA AI, your appointments will appear here with assigned broker details.
            </p>
            <Link to="/ai" className="btn btn-gold">
              Talk to LYKA AI
            </Link>
          </div>
        ) : visits.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {visits.map((visit) => (
              <div
                key={visit.id}
                className="card-luxury"
                style={{
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span
                      style={{
                        backgroundColor:
                          visit.status === 'SCHEDULED'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(255, 255, 255, 0.1)',
                        color: visit.status === 'SCHEDULED' ? 'var(--success)' : 'var(--text-muted)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {visit.status}
                    </span>
                    <span style={{ color: 'var(--gold-light)', fontSize: '0.85rem', fontWeight: 600 }}>
                      Request Recorded
                    </span>
                  </div>

                  <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '4px' }}>
                    {visit.property_title || `Property #${visit.property_id}`}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={14} color="var(--gold)" />
                      <span>{visit.preferred_date}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={14} color="var(--gold)" />
                      <span>{visit.preferred_time}</span>
                    </div>
                    {visit.property_location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <MapPin size={14} color="var(--gold)" />
                        <span>{visit.property_location}</span>
                      </div>
                    )}
                  </div>

                  {visit.notes && (
                    <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                      Note: "{visit.notes}"
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <Link to={`/properties/${visit.property_id}`} className="btn btn-outline btn-sm">
                    View Property
                  </Link>
                  <Link to="/ai" className="btn btn-gold btn-sm">
                    Ask AI about Visit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
