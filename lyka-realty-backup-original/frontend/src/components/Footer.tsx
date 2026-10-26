import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail, Sparkles, Shield, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        backgroundColor: '#0c0d12',
        borderTop: '1px solid var(--border-color)',
        paddingTop: '4rem',
        paddingBottom: '2.5rem',
        marginTop: 'auto',
      }}
    >
      <div className="app-container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '2.5rem',
            marginBottom: '3.5rem',
          }}
        >
          {/* Brand Col */}
          <div>
            <img
              src="/lyka-realty-logo.png"
              alt="Lyka Realty"
              style={{ display: 'block', width: '170px', height: '78px', objectFit: 'contain', marginBottom: '1.25rem' }}
            />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Dubai's premier real-estate agency powered by LYKA AI. Personalized property matching, off-plan investments, and luxury residences with clarity and care.
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.4rem 0.9rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(90, 22, 69, 0.25)',
                border: '1px solid rgba(90, 22, 69, 0.4)',
                fontSize: '0.8rem',
                color: 'var(--text-gold)',
              }}
            >
              <Sparkles size={14} color="var(--gold)" />
              <span>Multi-Lingual AI: English & தமிழ்</span>
            </div>
          </div>

          {/* Featured Communities */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '1.2rem', letterSpacing: '0.02em' }}>
              Prime Dubai Communities
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {[
                'Dubai Marina',
                'Downtown Dubai',
                'Palm Jumeirah',
                'Business Bay',
                'Dubai Hills Estate',
                'Dubai Creek Harbour',
                'Jumeirah Village (JVC)',
                'Jumeirah Lake Towers (JLT)',
              ].map((area) => (
                <Link
                  key={area}
                  to={`/properties?location=${encodeURIComponent(area)}`}
                  style={{
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--gold)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {area}
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Services */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '1.2rem', letterSpacing: '0.02em' }}>
              Services & Tools
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <li>
                <Link to="/ai" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.88rem' }}>
                  Voice AI Property Consultant
                </Link>
              </li>
              <li>
                <Link to="/properties?purpose=For+Sale" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.88rem' }}>
                  Buy Luxury Properties in Dubai
                </Link>
              </li>
              <li>
                <Link to="/properties?purpose=For+Rent" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.88rem' }}>
                  Dubai Rental Residences
                </Link>
              </li>
              <li>
                <Link to="/customer/compare" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.88rem' }}>
                  Property Comparison Matrix
                </Link>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Deterministic Mortgage & EMI Tool
                </span>
              </li>
            </ul>
          </div>

          {/* Contact & Office */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '1.2rem', letterSpacing: '0.02em' }}>
              Dubai Office & Advisory
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <MapPin size={18} color="var(--gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>1002, Damac Executive Heights, Barsha Heights – Tecom, Dubai, UAE</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Phone size={18} color="var(--gold)" style={{ flexShrink: 0 }} />
                <span>+971 52 348 5758 (Call / WhatsApp)</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Mail size={18} color="var(--gold)" style={{ flexShrink: 0 }} />
                <span>admin@lykarealty.ae</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '1.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
          }}
        >
          <div>
            © {new Date().getFullYear()} LYKA Realty Real Estate Brokers LLC. Registered with Dubai DLD / RERA. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>RERA Compliance</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
