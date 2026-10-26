import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Heart,
  Scale,
  Menu,
  X,
  Briefcase,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { shortlist, compareList } = useProperty();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isActive = (path: string) => location.pathname === path;

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '74px',
        backgroundColor: 'rgba(10, 11, 14, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand Logo */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
          }}
        >
          <img
            src="/lyka-realty-logo.png"
            alt="Lyka Realty"
            style={{ display: 'block', width: '132px', height: '61px', objectFit: 'contain' }}
          />
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '1.75rem',
          }}
          className="desktop-nav"
        >
          <Link
            to="/"
            style={{
              color: isActive('/') ? 'var(--gold)' : 'var(--text-main)',
              textDecoration: 'none',
              fontSize: '0.92rem',
              fontWeight: 500,
              transition: 'color 0.2s',
            }}
          >
            Home
          </Link>
          <Link
            to="/properties"
            style={{
              color: isActive('/properties') ? 'var(--gold)' : 'var(--text-main)',
              textDecoration: 'none',
              fontSize: '0.92rem',
              fontWeight: 500,
              transition: 'color 0.2s',
            }}
          >
            Properties
          </Link>
          <Link
            to="/ai"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              background: isActive('/ai')
                ? 'linear-gradient(135deg, #7c1a5d, #a2247b)'
                : 'linear-gradient(135deg, rgba(90, 22, 69, 0.4), rgba(90, 22, 69, 0.15))',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.92rem',
              fontWeight: 600,
              border: '1px solid rgba(197, 160, 89, 0.35)',
              boxShadow: isActive('/ai') ? '0 0 20px rgba(90, 22, 69, 0.6)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <Sparkles size={16} color="var(--gold)" />
            LYKA AI Consultant
          </Link>

          <Link
            to="/customer/compare"
            style={{
              color: isActive('/customer/compare') ? 'var(--gold)' : 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.92rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Scale size={16} />
            Compare
            {compareList.length > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  backgroundColor: 'var(--gold)',
                  color: '#000',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}
              >
                {compareList.length}
              </span>
            )}
          </Link>

          <Link
            to="/customer/shortlist"
            style={{
              color: isActive('/customer/shortlist') ? 'var(--gold)' : 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.92rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Heart size={16} />
            Saved
            {shortlist.length > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}
              >
                {shortlist.length}
              </span>
            )}
          </Link>

          {/* Role specific links */}
          {(role === 'employee' || role === 'sales_agent') && (
            <Link
              to="/sales/dashboard"
              style={{
                color: location.pathname.startsWith('/sales') || location.pathname.startsWith('/employee') ? 'var(--gold)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Briefcase size={16} />
              Sales Workspace
            </Link>
          )}

          {role === 'manager' && (
            <Link
              to="/manager/dashboard"
              style={{
                color: location.pathname.startsWith('/manager') ? 'var(--gold)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Briefcase size={16} />
              Manager Pipeline
            </Link>
          )}

          {role === 'admin' && (
            <Link
              to="/admin/dashboard"
              style={{
                color: location.pathname.startsWith('/admin') ? 'var(--gold)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ShieldAlert size={16} />
              Admin
            </Link>
          )}

          {role === 'super_admin' && (
            <Link
              to="/super-admin/dashboard"
              style={{
                color: location.pathname.startsWith('/super-admin') ? 'var(--gold)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ShieldAlert size={16} />
              Super Admin
            </Link>
          )}
        </nav>

        {/* Right Action: Account & Auth Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'right' }}>
                {user.full_name}<br />
                <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
              </span>
              <button type="button" onClick={logout} className="btn btn-outline btn-sm">Sign out</button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-outline btn-sm">Sign in</Link>
          )}

          {/* Quick CTA or Mobile Toggle */}
          <Link
            to="/ai"
            className="btn btn-gold btn-sm"
            style={{ display: 'none' }}
            id="header-cta-talk"
          >
            <Sparkles size={14} />
            <span>Talk to AI</span>
          </Link>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: '74px',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10, 11, 14, 0.98)',
            backdropFilter: 'blur(20px)',
            padding: '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            zIndex: 899,
          }}
        >
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: '#fff', fontSize: '1.2rem', textDecoration: 'none' }}
          >
            Home
          </Link>
          <Link
            to="/properties"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: '#fff', fontSize: '1.2rem', textDecoration: 'none' }}
          >
            Properties
          </Link>
          <Link
            to="/ai"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              color: 'var(--gold)',
              fontSize: '1.2rem',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <Sparkles size={20} />
            LYKA AI Consultant
          </Link>
          <Link
            to="/customer/compare"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textDecoration: 'none' }}
          >
            Compare ({compareList.length})
          </Link>
          <Link
            to="/customer/shortlist"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textDecoration: 'none' }}
          >
            Saved Properties ({shortlist.length})
          </Link>

          {(role === 'employee' || role === 'admin') && (
            <Link
              to="/employee/leads"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: '#38bdf8', fontSize: '1.1rem', textDecoration: 'none' }}
            >
              Employee CRM
            </Link>
          )}

          {role === 'admin' && (
            <Link
              to="/admin/analytics"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: '#ef4444', fontSize: '1.1rem', textDecoration: 'none' }}
            >
              Admin Dashboard
            </Link>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link
              to="/ai"
              onClick={() => setMobileMenuOpen(false)}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              <Sparkles size={16} />
              Start Conversation
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 900px) {
          .desktop-nav {
            display: flex !important;
          }
          #header-cta-talk {
            display: inline-flex !important;
          }
          button[aria-label="Toggle menu"] {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
};
