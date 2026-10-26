import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Scale, Calendar, ArrowRight } from 'lucide-react';
import { useProperty } from '../context/PropertyContext';
import { PropertyCard } from '../components/PropertyCard';

export const CustomerShortlistPage: React.FC = () => {
  const { shortlist } = useProperty();

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Navigation tabs */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <Link
            to="/customer/shortlist"
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
            <Heart size={16} fill="var(--gold)" />
            <span>Saved Properties ({shortlist.length})</span>
          </Link>
          <Link
            to="/customer/visits"
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
            <Calendar size={16} />
            <span>My Site Visits</span>
          </Link>
        </div>

        {/* Content */}
        {shortlist.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '5rem 1rem',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <Heart size={48} color="var(--text-dim)" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>No Saved Properties Yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '450px', margin: '0 auto 1.5rem' }}>
              Save listings as you chat with LYKA AI or browse the Dubai property catalog to view them here later.
            </p>
            <Link to="/properties" className="btn btn-gold">
              Explore Properties
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                You have saved {shortlist.length} properties
              </div>
              {shortlist.length >= 2 && (
                <Link to="/customer/compare" className="btn btn-outline btn-sm">
                  <Scale size={15} />
                  <span>Compare Saved Properties</span>
                </Link>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.75rem',
              }}
            >
              {shortlist.map((prop) => (
                <PropertyCard key={prop.id} property={prop} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
