import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Mic,
  ArrowRight,
  MapPin,
  Building,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Search,
  ChevronRight,
  PhoneCall,
} from 'lucide-react';
import { PropertyCard } from '../components/PropertyCard';
import { Property } from '../types';
import { api } from '../services/api';

const POPULAR_AREAS = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Business Bay',
  'Dubai Hills Estate',
  'Al Reem Island',
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [heroPrompt, setHeroPrompt] = useState('');
  const [featuredProperties, setFeaturedProperties] = useState<Property[]>([]);
  const [featuredError, setFeaturedError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const props = await api.getFeaturedProperties();
        if (props && props.length > 0) {
          setFeaturedProperties(props.slice(0, 6));
        } else {
          const res = await api.searchProperties({ limit: 6 });
          setFeaturedProperties(res.properties);
        }
      } catch (error) {
        console.error('Unable to load featured properties:', error);
        setFeaturedError('Property inventory is currently unavailable. Please try again shortly.');
      } finally {
        setLoading(false);
      }
    };

    fetchFeatured();
  }, []);

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroPrompt.trim()) {
      navigate(`/ai?q=${encodeURIComponent(heroPrompt.trim())}`);
    } else {
      navigate('/ai');
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          paddingTop: '130px',
          paddingBottom: '100px',
          background: 'radial-gradient(ellipse at 50% 20%, rgba(90, 22, 69, 0.45) 0%, #0a0b0e 70%)',
          overflow: 'hidden',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div className="app-container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.45rem 1.25rem',
              borderRadius: '9999px',
              background: 'rgba(90, 22, 69, 0.3)',
              border: '1px solid rgba(197, 160, 89, 0.4)',
              color: 'var(--text-gold)',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '1.75rem',
              boxShadow: '0 0 20px rgba(90, 22, 69, 0.3)',
            }}
          >
            <Sparkles size={16} color="var(--gold)" />
            <span>Next-Gen Real Estate AI Consultant • Multilingual Support</span>
          </div>

          {/* Primary & Supporting Headings */}
          <h1
            style={{
              maxWidth: '850px',
              margin: '0 auto 1.25rem',
              color: '#fff',
              fontSize: 'clamp(2.5rem, 5.5vw, 4.2rem)',
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            Find Your Perfect Property with <span style={{ color: 'var(--gold-light)' }}>LYKA AI</span>
          </h1>

          <p
            style={{
              maxWidth: '680px',
              margin: '0 auto 2.5rem',
              color: 'var(--text-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.2rem)',
              lineHeight: 1.6,
            }}
          >
            Talk to our AI property consultant by voice or text and find properties matched to your needs.
            Speak in English, தமிழ், or Tanglish — experience clarity and care with zero pressure.
          </p>

          {/* Interactive AI Prompt & Voice Bar */}
          <form
            onSubmit={handleHeroSubmit}
            style={{
              maxWidth: '720px',
              margin: '0 auto 2rem',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(18, 20, 28, 0.9)',
              border: '1px solid rgba(197, 160, 89, 0.4)',
              borderRadius: '9999px',
              padding: '6px 8px 6px 20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 25px rgba(90, 22, 69, 0.35)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <Sparkles size={20} color="var(--gold)" style={{ flexShrink: 0, marginRight: '10px' }} />
            <input
              type="text"
              value={heroPrompt}
              onChange={(e) => setHeroPrompt(e.target.value)}
              placeholder="E.g. I need a 2 BHK in Dubai Marina under 2 million AED..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
            <Link
              to="/ai"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: 'rgba(90, 22, 69, 0.5)',
                border: '1px solid rgba(197, 160, 89, 0.3)',
                color: 'var(--gold)',
                marginRight: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="Speak with Voice"
            >
              <Mic size={18} />
            </Link>
            <button
              type="submit"
              className="btn btn-gold"
              style={{ padding: '0.65rem 1.4rem', fontSize: '0.92rem' }}
            >
              Consult AI
            </button>
          </form>

          {/* Quick Prompts */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px',
              maxWidth: '800px',
              margin: '0 auto 2.5rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', alignSelf: 'center' }}>Try asking:</span>
            {[
              '2 BHK in Dubai Marina under 2M',
              'எனக்கு ஒரு வீடு வேணும்',
              'Enakku Dubai Marina la 2 BHK venum',
              'Luxury Villa Palm Jumeirah',
              'High ROI Investment in Business Bay',
            ].map((promptText) => (
              <button
                key={promptText}
                type="button"
                onClick={() => navigate(`/ai?q=${encodeURIComponent(promptText)}`)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '9999px',
                  padding: '4px 12px',
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = 'var(--gold)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
              >
                "{promptText}"
              </button>
            ))}
          </div>

          {/* Primary & Secondary CTAs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link to="/ai" className="btn btn-primary btn-lg">
              <Sparkles size={18} />
              <span>Talk to LYKA AI</span>
            </Link>
            <Link to="/properties" className="btn btn-outline btn-lg">
              <span>Explore Properties</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Properties Grid */}
      <section style={{ padding: '5rem 0', backgroundColor: 'var(--bg-surface)' }}>
        <div className="app-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
            <div>
              <div style={{ fontSize: '0.82rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '6px' }}>
                Curated Inventory
              </div>
              <h2 style={{ color: '#fff' }}>Featured Real Estate in Dubai</h2>
            </div>
            <Link
              to="/properties"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--gold)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.92rem',
              }}
            >
              <span>View All Properties</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: '1.75rem',
            }}
          >
            {featuredProperties.map((prop) => (
              <PropertyCard key={prop.id} property={prop} />
            ))}
            {!loading && featuredProperties.length === 0 && (
              <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center' }}>
                {featuredError || 'No featured listings are available right now.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Explore Neighborhoods */}
      <section style={{ padding: '5rem 0' }}>
        <div className="app-container">
          <div style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 3rem' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '6px' }}>
              Dubai Prime Locations
            </div>
            <h2 style={{ color: '#fff', marginBottom: '0.75rem' }}>Explore Iconic Neighborhoods</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              From the vibrant waterfront towers of Dubai Marina to the pinnacle of luxury on Palm Jumeirah.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {POPULAR_AREAS.map((area) => (
              <Link
                key={area}
                to={`/properties?location=${encodeURIComponent(area)}`}
                style={{
                  position: 'relative',
                  height: '240px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '1.5rem',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.3s ease',
                }}
                className="neighborhood-card"
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'radial-gradient(circle at 50% 35%, rgba(197, 160, 89, 0.2), rgba(10, 11, 14, 0.96) 72%)',
                    zIndex: 1,
                  }}
                >
                  <Building size={54} color="rgba(197, 160, 89, 0.55)" />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(10, 11, 14, 0.9) 0%, rgba(10, 11, 14, 0.2) 60%)',
                    zIndex: 2,
                  }}
                />
                <div style={{ position: 'relative', zIndex: 3 }}>
                  <h3 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '4px' }}>{area}</h3>
                  <div style={{ color: 'var(--gold-light)', fontSize: '0.85rem' }}>Explore available listings</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why LYKA AI Feature Highlights */}
      <section style={{ padding: '5rem 0', backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)' }}>
        <div className="app-container">
          <div style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 3.5rem' }}>
            <h2 style={{ color: '#fff', marginBottom: '0.75rem' }}>Why Consult with LYKA AI?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Unlike generic chatbots or rigid forms, LYKA AI acts as an empathetic, deeply knowledgeable Dubai property broker.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '2rem',
            }}
          >
            <div className="card-luxury" style={{ padding: '2rem' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(90, 22, 69, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid rgba(197, 160, 89, 0.3)',
                }}
              >
                <Mic size={24} color="var(--gold)" />
              </div>
              <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.6rem' }}>Conversational Voice & Multilingual</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Speak naturally in English, Tamil (தமிழ்), or Tanglish. LYKA listens, remembers context, and asks one thoughtful question at a time.
              </p>
            </div>

            <div className="card-luxury" style={{ padding: '2rem' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(90, 22, 69, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid rgba(197, 160, 89, 0.3)',
                }}
              >
                <CheckCircle2 size={24} color="var(--success)" />
              </div>
              <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.6rem' }}>Explainable Match Scoring</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Every recommendation displays transparent mathematical match factors—budget, floor plan, community, and furnishing match reasons.
              </p>
            </div>

            <div className="card-luxury" style={{ padding: '2rem' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(90, 22, 69, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid rgba(197, 160, 89, 0.3)',
                }}
              >
                <TrendingUp size={24} color="var(--gold)" />
              </div>
              <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.6rem' }}>Deterministic Financials & ROI</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Accurate mathematical mortgage calculations, rental yield modeling, and payment plans calculated deterministically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section
        style={{
          padding: '5rem 0',
          background: 'linear-gradient(135deg, rgba(90, 22, 69, 0.6) 0%, rgba(10, 11, 14, 0.95) 100%)',
          textAlign: 'center',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <div className="app-container" style={{ maxWidth: '750px' }}>
          <h2 style={{ color: '#fff', fontSize: '2.5rem', marginBottom: '1rem' }}>Ready to Experience LYKA AI?</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            Speak or chat right now. Let LYKA discover real UAE properties tailored directly to your personal lifestyle and investment aspirations.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link to="/ai" className="btn btn-gold btn-lg">
              <Sparkles size={18} />
              <span>Start AI Consultation</span>
            </Link>
            <Link to="/properties" className="btn btn-outline btn-lg">
              Browse All Listings
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
