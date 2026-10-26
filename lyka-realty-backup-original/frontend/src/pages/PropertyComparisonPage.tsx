import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, X, Sparkles, Check, AlertCircle, ArrowLeft, Calendar, Trash2, Building2 } from 'lucide-react';
import { useProperty } from '../context/PropertyContext';
import { api } from '../services/api';

export const PropertyComparisonPage: React.FC = () => {
  const { compareList, removeFromCompare, clearCompare, openSiteVisitModal } = useProperty();
  const [aiSummary, setAiSummary] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);

  const handleAskAICompare = async () => {
    if (compareList.length < 2) return;
    setLoadingAi(true);
    try {
      const res = await api.compareProperties(compareList.map((p) => p.id));
      setAiSummary(res.comparison_summary || res.recommendation);
    } catch (error) {
      console.error('Unable to compare selected properties:', error);
      setAiSummary('Comparison is currently unavailable. Please try again shortly.');
    } finally {
      setLoadingAi(false);
    }
  };

  if (compareList.length === 0) {
    return (
      <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
        <div className="app-container" style={{ textAlign: 'center', padding: '5rem 1rem' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(90, 22, 69, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}
          >
            <Scale size={32} color="var(--gold)" />
          </div>
          <h2 style={{ color: '#fff', marginBottom: '0.75rem' }}>No Properties in Comparison</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 2rem' }}>
            Select up to 4 properties while browsing or chatting with LYKA AI to compare them side-by-side with explainable metrics.
          </p>
          <Link to="/properties" className="btn btn-gold">
            Browse Properties to Compare
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Scale size={24} color="var(--gold)" />
              <h1 style={{ color: '#fff', fontSize: '2rem', margin: 0 }}>Side-by-Side Property Matrix</h1>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
              Comparing {compareList.length} properties using source listing facts
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {compareList.length >= 2 && (
              <button
                onClick={handleAskAICompare}
                disabled={loadingAi}
                className="btn btn-gold btn-sm"
              >
                <Sparkles size={15} />
                <span>{loadingAi ? 'Comparing...' : 'Compare Selected Listings'}</span>
              </button>
            )}

            <button onClick={clearCompare} className="btn btn-outline btn-sm" style={{ color: '#ef4444' }}>
              <Trash2 size={15} />
              <span>Clear Matrix</span>
            </button>
          </div>
        </div>

        {/* AI Comparative Insights Box */}
        {aiSummary && (
          <div
            style={{
              backgroundColor: 'rgba(90, 22, 69, 0.2)',
              border: '1px solid var(--border-plum)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              marginBottom: '2rem',
              whiteSpace: 'pre-line',
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, marginBottom: '8px' }}>
              <Sparkles size={18} />
              <span>Listing Comparison Summary</span>
            </div>
            <p style={{ color: '#fff', margin: 0, fontSize: '0.95rem' }}>{aiSummary}</p>
          </div>
        )}

        {/* Comparison Table / Matrix */}
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1.25rem', width: '220px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  Property
                </th>
                {compareList.map((p) => (
                  <th key={p.id} style={{ padding: '1.25rem', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className="badge badge-plum">{p.property_type}</span>
                      <button
                        onClick={() => removeFromCompare(p.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        title="Remove"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        alt={p.title}
                        style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }}
                      />
                    ) : (
                      <div
                        aria-label="No property image supplied"
                        style={{
                          width: '100%',
                          height: '140px',
                          display: 'grid',
                          placeItems: 'center',
                          background: 'radial-gradient(circle at 50% 35%, rgba(197, 160, 89, 0.2), var(--bg-dark) 72%)',
                          borderRadius: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <Building2 size={40} color="rgba(197, 160, 89, 0.55)" />
                      </div>
                    )}
                    <Link to={`/properties/${p.id}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem' }}>
                      {p.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Price */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>Price</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem', color: 'var(--gold-light)', fontWeight: 700, fontSize: '1.1rem' }}>
                    {p.purpose === 'For Rent'
                      ? `AED ${new Intl.NumberFormat('en-AE').format(p.rent_price)} / year`
                      : p.sale_price != null && p.sale_price > 0
                        ? `AED ${new Intl.NumberFormat('en-AE').format(p.sale_price)}`
                        : 'Price unavailable'}
                  </td>
                ))}
              </tr>

              {/* Location */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>Location</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem', color: '#fff' }}>
                    {p.location}
                  </td>
                ))}
              </tr>

              {/* Bedrooms / Bathrooms */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>Beds / Baths</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem', color: '#fff' }}>
                    {p.beds > 0 ? `${p.beds} BHK` : 'Studio'} • {p.baths} Baths
                  </td>
                ))}
              </tr>

              {/* Area */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>Area</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem', color: '#fff' }}>
                    {p.area_sqft} sqft
                  </td>
                ))}
              </tr>

              {/* Furnishing */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>Furnishing</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem', color: '#fff' }}>
                    {p.furnishing || 'Not provided'}
                  </td>
                ))}
              </tr>

              {/* AI Match Score */}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontWeight: 600 }}>AI Match</td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1rem 1.25rem' }}>
                    {p.match_score != null ? (
                      <span className="badge badge-match">{p.match_score}% Match</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not scored</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Actions */}
              <tr>
                <td style={{ padding: '1.25rem' }}></td>
                {compareList.map((p) => (
                  <td key={p.id} style={{ padding: '1.25rem' }}>
                    <button
                      onClick={() => openSiteVisitModal(p)}
                      className="btn btn-primary btn-sm"
                      style={{ width: '100%' }}
                    >
                      <Calendar size={14} />
                      <span>Book Visit</span>
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
