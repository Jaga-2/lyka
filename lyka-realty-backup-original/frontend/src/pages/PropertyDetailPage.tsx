import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Bed,
  Bath,
  Maximize2,
  MapPin,
  Heart,
  Scale,
  Calendar,
  Sparkles,
  Calculator,
  ArrowLeft,
  CheckCircle2,
  Building2,
  ShieldCheck,
  TrendingUp,
  Share2,
} from 'lucide-react';
import { Property } from '../types';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const { isShortlisted, toggleShortlist, addToCompare, isComparing, openSiteVisitModal, openEMIModal } = useProperty();

  useEffect(() => {
    const fetchProp = async () => {
      setLoading(true);
      setLoadError('');
      try {
        if (id) {
          const res = await api.getPropertyById(Number(id));
          setProperty(res);
        }
      } catch (error) {
        console.error('Unable to load property details:', error);
        setProperty(null);
        setLoadError('Property details are currently unavailable. Please try again shortly.');
      } finally {
        setLoading(false);
      }
    };

    fetchProp();
  }, [id]);

  if (loading) {
    return (
      <div className="page-wrapper" style={{ textAlign: 'center', padding: '6rem 0' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading property details...</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="page-wrapper" style={{ textAlign: 'center', padding: '6rem 0' }}>
        <h2 style={{ color: '#fff' }}>{loadError ? 'Unable to Load Property' : 'Property Not Found'}</h2>
        {loadError && <p style={{ color: 'var(--text-muted)' }}>{loadError}</p>}
        <Link to="/properties" className="btn btn-outline" style={{ marginTop: '1rem' }}>
          Back to Properties
        </Link>
      </div>
    );
  }

  const images = property.images || [];
  const isRental = property.purpose === 'For Rent';
  const price = isRental ? property.rent_price : property.sale_price;
  const formattedPrice = price != null && price > 0 ? new Intl.NumberFormat('en-AE').format(price) : 'Price unavailable';

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="app-container">
        {/* Back link */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            to="/properties"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.88rem',
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to all properties</span>
          </Link>
        </div>

        {/* Gallery Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '2.5rem' }}>
          <div
            style={{
              position: 'relative',
              height: '460px',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
            }}
          >
            {images[activeImageIndex] ? (
              <img
                src={images[activeImageIndex]}
                alt={property.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                aria-label="No property image supplied"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'radial-gradient(circle at 50% 35%, rgba(197, 160, 89, 0.2), var(--bg-dark) 72%)',
                }}
              >
                <Building2 size={72} color="rgba(197, 160, 89, 0.55)" />
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                display: 'flex',
                gap: '8px',
              }}
            >
              <button
                onClick={() => toggleShortlist(property)}
                className="btn btn-sm"
                style={{
                  backgroundColor: isShortlisted(property.id) ? '#ef4444' : 'rgba(10, 11, 14, 0.75)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Heart size={16} fill={isShortlisted(property.id) ? '#fff' : 'none'} />
                <span>{isShortlisted(property.id) ? 'Saved' : 'Save'}</span>
              </button>

              <button
                onClick={() => addToCompare(property)}
                className="btn btn-sm btn-outline"
                style={{ backgroundColor: 'rgba(10, 11, 14, 0.75)', backdropFilter: 'blur(8px)' }}
              >
                <Scale size={16} />
                <span>{isComparing(property.id) ? 'Comparing' : 'Compare'}</span>
              </button>
            </div>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`Thumbnail ${i}`}
                  onClick={() => setActiveImageIndex(i)}
                  style={{
                    width: '100px',
                    height: '70px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '2px solid',
                    borderColor: activeImageIndex === i ? 'var(--gold)' : 'transparent',
                    opacity: activeImageIndex === i ? 1 : 0.6,
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>
          {/* Left Details Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Title & Price Header */}
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <span className="badge badge-plum">{property.property_type}</span>
                <span className="badge badge-gold">{property.purpose}</span>
                {property.furnishing && <span className="badge badge-outline">{property.furnishing}</span>}
              </div>

              <h1 style={{ color: '#fff', fontSize: '2rem', marginBottom: '0.5rem' }}>
                {property.title}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
                <MapPin size={16} color="var(--gold)" />
                <span>{property.address || property.location}</span>
              </div>

              <div
                style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '2.4rem',
                  fontWeight: 700,
                  color: 'var(--gold-light)',
                }}
              >
                AED {formattedPrice} {isRental && <span style={{ fontSize: '1.1rem', color: 'var(--text-dim)' }}>/ year</span>}
              </div>
            </div>

            {/* Specs Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Bedrooms</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 600, marginTop: '2px' }}>
                  <Bed size={16} color="var(--gold)" />
                  <span>{property.beds > 0 ? `${property.beds} BHK` : 'Studio'}</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Bathrooms</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 600, marginTop: '2px' }}>
                  <Bath size={16} color="var(--gold)" />
                  <span>{property.baths} Baths</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Built-up Area</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 600, marginTop: '2px' }}>
                  <Maximize2 size={16} color="var(--gold)" />
                  <span>{property.area_sqft} sqft</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Furnishing</div>
                <div style={{ color: '#fff', fontWeight: 600, marginTop: '2px' }}>
                  {property.furnishing || 'Not provided'}
                </div>
              </div>
            </div>

            {/* AI Match Analysis Box */}
            <div
              style={{
                backgroundColor: 'rgba(90, 22, 69, 0.18)',
                border: '1px solid rgba(197, 160, 89, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <Sparkles size={20} color="var(--gold)" />
                <h3 style={{ color: '#fff', fontSize: '1.2rem', margin: 0 }}>LYKA AI Match Analysis</h3>
                {property.match_score && (
                  <span className="badge badge-match" style={{ marginLeft: 'auto' }}>
                    {property.match_score}% Match
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {property.match_reasons?.map((reason, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                    <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <Link
                  to={`/ai?q=${encodeURIComponent(`Tell me more about ${property.title} in ${property.location}`)}`}
                  className="btn btn-outline btn-sm"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                >
                  <Sparkles size={14} />
                  <span>Ask LYKA AI about this property</span>
                </Link>
              </div>
            </div>

            {/* Amenities Checklist */}
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>Residence Amenities</h3>
              {property.amenities.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {property.amenities.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.88rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <CheckCircle2 size={14} color="var(--gold)" />
                    <span>{item}</span>
                  </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Amenity details were not provided in the source listing.</p>
              )}
            </div>
          </div>

          {/* Right Action Sidebar */}
          <div>
            <div
              className="card-luxury"
              style={{
                position: 'sticky',
                top: '90px',
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <h3 style={{ color: '#fff', fontSize: '1.2rem', margin: 0 }}>Interested in this Property?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Book an in-person site inspection or request a callback with LYKA Realty's authorized RERA broker.
              </p>

              <button
                onClick={() => openSiteVisitModal(property)}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.85rem' }}
              >
                <Calendar size={18} />
                <span>Schedule Private Site Visit</span>
              </button>

              {property.sale_price != null && property.sale_price > 0 && (
                <button
                  onClick={() => openEMIModal(property)}
                  className="btn btn-outline"
                  style={{ width: '100%', padding: '0.85rem' }}
                >
                  <Calculator size={18} />
                  <span>Mortgage & EMI Calculator</span>
                </button>
              )}

              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 600 }}>
                  <ShieldCheck size={16} color="var(--gold)" />
                  <span>Source Inventory Listing</span>
                </div>
                <div>Listing details are shown as provided by the source inventory.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
