import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
  ChevronDown,
  ChevronUp,
  Armchair,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { Property } from '../types';
import { useProperty } from '../context/PropertyContext';

interface PropertyCardProps {
  property: Property;
  showMatchDetails?: boolean;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, showMatchDetails = false }) => {
  const { isShortlisted, toggleShortlist, addToCompare, isComparing, openSiteVisitModal, openEMIModal } = useProperty();
  const [expandMatch, setExpandMatch] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);

  const shortlisted = isShortlisted(property.id);
  const comparing = isComparing(property.id);

  const displayImage = property.images?.[0];

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-AE').format(val);
  };

  const isRental = property.purpose === 'For Rent';
  const priceDisplay = isRental
    ? `AED ${formatPrice(property.rent_price)} / yr`
    : property.sale_price != null && property.sale_price > 0
      ? `AED ${formatPrice(property.sale_price)}`
      : 'Price unavailable';

  return (
    <div
      className="card-luxury"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
      }}
    >
      {/* Image Container with Badges */}
      <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
        {displayImage && !imageUnavailable ? (
          <img
            src={displayImage}
            alt={property.title || property.address}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.4s ease',
            }}
            loading="lazy"
            onError={() => setImageUnavailable(true)}
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
            <Building2 size={54} color="rgba(197, 160, 89, 0.55)" />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(10, 11, 14, 0.8) 0%, transparent 60%)',
          }}
        />

        {/* Top Badges */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <span
              style={{
                backgroundColor: 'rgba(90, 22, 69, 0.9)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 600,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              {property.property_type}
            </span>
            <span
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                color: 'var(--gold)',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 600,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(197, 160, 89, 0.3)',
              }}
            >
              {property.purpose}
            </span>
          </div>

          {/* Shortlist Action */}
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleShortlist(property);
            }}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: shortlisted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(10, 11, 14, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.2s',
            }}
            title={shortlisted ? 'Remove from saved' : 'Save property'}
          >
            <Heart size={16} fill={shortlisted ? '#fff' : 'none'} color="#fff" />
          </button>
        </div>

        {/* AI Match Badge (if provided) */}
        {property.match_score && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
              zIndex: 2,
            }}
          >
            <Sparkles size={13} />
            <span>{property.match_score}% AI Match</span>
          </div>
        )}
      </div>

      {/* Property Info Content */}
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Price & Location */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div
            style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'var(--gold-light)',
              letterSpacing: '-0.02em',
              marginBottom: '4px',
            }}
          >
            {priceDisplay}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            <MapPin size={14} color="var(--gold)" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {property.location || property.address || 'Dubai, UAE'}
            </span>
          </div>
        </div>

        {/* Property Title / Address */}
        <Link
          to={`/properties/${property.id}`}
          style={{
            color: '#fff',
            textDecoration: 'none',
            fontSize: '1rem',
            fontWeight: 600,
            marginBottom: '0.85rem',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {property.title || property.address}
        </Link>

        {/* Specs Badges */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            padding: '0.75rem 0',
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Bed size={15} color="var(--gold)" />
            <span>{property.beds > 0 ? `${property.beds} Beds` : 'Studio'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Bath size={15} color="var(--gold)" />
            <span>{property.baths} Baths</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Maximize2 size={15} color="var(--gold)" />
            <span>{property.area_sqft} sqft</span>
          </div>
        </div>

        {/* Furnishing & Amenities line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: 'var(--text-dim)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Armchair size={13} color="var(--text-muted)" />
            <span>            {property.furnishing || 'Not provided'}</span>
          </div>
          {property.investment_yield && (
            <div style={{ color: 'var(--success)', fontWeight: 600 }}>
              Yield: ~{property.investment_yield}%
            </div>
          )}
        </div>

        {/* Explainable Match Reason Drawer */}
        {property.match_reasons && property.match_reasons.length > 0 && (
          <div
            style={{
              backgroundColor: 'rgba(90, 22, 69, 0.15)',
              border: '1px solid rgba(90, 22, 69, 0.35)',
              borderRadius: '8px',
              padding: '8px 10px',
              marginBottom: '1rem',
            }}
          >
            <button
              onClick={() => setExpandMatch(!expandMatch)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-gold)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={12} color="var(--gold)" />
                <span>Why this matches your criteria</span>
              </div>
              {expandMatch ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {expandMatch && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {property.match_reasons.map((reason, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '5px',
                      fontSize: '0.76rem',
                      color: 'var(--text-main)',
                    }}
                  >
                    <CheckCircle2 size={12} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => openSiteVisitModal(property)}
              className="btn btn-primary btn-sm"
              style={{ flex: 1, padding: '0.5rem 0.6rem', fontSize: '0.82rem' }}
            >
              <Calendar size={14} />
              <span>Schedule Visit</span>
            </button>

            <Link
              to={`/properties/${property.id}`}
              className="btn btn-outline btn-sm"
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem' }}
            >
              Details
            </Link>
          </div>

          {/* Secondary Actions: Compare & EMI */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            <button
              onClick={() => addToCompare(property)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                color: comparing ? 'var(--gold)' : 'var(--text-dim)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <Scale size={13} />
              <span>{comparing ? 'In Comparison' : 'Compare'}</span>
            </button>

            {property.sale_price != null && property.sale_price > 0 && (
              <button
                onClick={() => openEMIModal(property)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <Calculator size={13} />
                <span>EMI Calculator</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
