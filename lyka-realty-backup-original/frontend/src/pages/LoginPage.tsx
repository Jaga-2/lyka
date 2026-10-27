import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Lock, Mail, ShieldAlert, KeyRound, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine expected role from route
  const getExpectedRoleFromPath = (): string | undefined => {
    if (location.pathname === '/login/customer') return 'customer';
    if (location.pathname === '/login/sales') return 'sales_agent';
    if (location.pathname === '/login/manager') return 'manager';
    if (location.pathname === '/login/admin') return 'admin';
    if (location.pathname === '/login/super-admin') return 'super_admin';
    return undefined;
  };

  const expectedRole = getExpectedRoleFromPath();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Password reset state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // If user navigated to /login/lead, redirect to lead lookup (after hook declarations)
  if (location.pathname === '/login/lead') {
    return <Navigate to="/lead/status" replace />;
  }

  const roleTitles: Record<string, { title: string; subtitle: string; badge: string }> = {
    customer: {
      title: 'Customer Portal Login',
      subtitle: 'Sign in to access saved favorites, comparison lists, and private viewing schedules.',
      badge: 'Customer Workspace',
    },
    sales_agent: {
      title: 'Sales Agent Workspace',
      subtitle: 'Access assigned leads, customer requirements, AI follow-up drafts, and calling tools.',
      badge: 'Sales & Broker Access',
    },
    manager: {
      title: 'Manager Workspace',
      subtitle: 'Oversee team pipeline, response times, workload distribution, and lead reassignments.',
      badge: 'Management Team',
    },
    admin: {
      title: 'Operations Admin Login',
      subtitle: 'Manage property inventory, employee accounts, telephony settings, and CRM logs.',
      badge: 'System Admin',
    },
    super_admin: {
      title: 'Super Admin Console',
      subtitle: 'Access platform configurations, sensitive roles, security events, and audit trails.',
      badge: 'Platform Super Admin',
    },
  };

  const activeRoleInfo = expectedRole ? roleTitles[expectedRole] : {
    title: 'Welcome to LYKA Realty',
    subtitle: 'Sign in to access your personalized real estate workspace and AI consultant insights.',
    badge: 'Universal Sign In',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password, expectedRole);
      const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      const roleHome: Record<string, string> = {
        customer: '/customer/shortlist',
        employee: '/sales/dashboard',
        sales_agent: '/sales/dashboard',
        manager: '/manager/dashboard',
        admin: '/admin/analytics',
        super_admin: '/super-admin/dashboard',
      };
      navigate(requestedPath || roleHome[user.role] || '/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError('');
    try {
      await api.requestPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || 'Failed to submit password reset request.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className="page-wrapper"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-dark)',
        minHeight: '100vh',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card-luxury"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '2.5rem',
        }}
      >
        {/* Role Workspace Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/lyka-realty-logo.png"
            alt="Lyka Realty"
            style={{ display: 'block', width: '160px', height: '74px', objectFit: 'contain', margin: '0 auto 0.75rem' }}
          />

          <span
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(197, 160, 89, 0.15)',
              border: '1px solid rgba(197, 160, 89, 0.4)',
              color: 'var(--gold)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '3px 12px',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.75rem',
            }}
          >
            {activeRoleInfo.badge}
          </span>

          <h1 style={{ color: '#fff', fontSize: '1.6rem', marginBottom: '0.4rem', fontWeight: 700 }}>
            {activeRoleInfo.title}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
            {activeRoleInfo.subtitle}
          </p>
        </div>

        {/* Quick Role Switcher Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            justifyContent: 'center',
            marginBottom: '1.75rem',
            padding: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '8px',
          }}
        >
          <Link
            to="/login/customer"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: expectedRole === 'customer' ? '#fff' : 'var(--text-dim)',
              backgroundColor: expectedRole === 'customer' ? 'var(--primary)' : 'transparent',
              fontWeight: expectedRole === 'customer' ? 600 : 400,
            }}
          >
            Customer
          </Link>
          <Link
            to="/login/sales"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: expectedRole === 'sales_agent' ? '#fff' : 'var(--text-dim)',
              backgroundColor: expectedRole === 'sales_agent' ? 'var(--primary)' : 'transparent',
              fontWeight: expectedRole === 'sales_agent' ? 600 : 400,
            }}
          >
            Sales
          </Link>
          <Link
            to="/login/manager"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: expectedRole === 'manager' ? '#fff' : 'var(--text-dim)',
              backgroundColor: expectedRole === 'manager' ? 'var(--primary)' : 'transparent',
              fontWeight: expectedRole === 'manager' ? 600 : 400,
            }}
          >
            Manager
          </Link>
          <Link
            to="/login/admin"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: expectedRole === 'admin' ? '#fff' : 'var(--text-dim)',
              backgroundColor: expectedRole === 'admin' ? 'var(--primary)' : 'transparent',
              fontWeight: expectedRole === 'admin' ? 600 : 400,
            }}
          >
            Admin
          </Link>
          <Link
            to="/login/super-admin"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: expectedRole === 'super_admin' ? '#fff' : 'var(--text-dim)',
              backgroundColor: expectedRole === 'super_admin' ? 'var(--primary)' : 'transparent',
              fontWeight: expectedRole === 'super_admin' ? 600 : 400,
            }}
          >
            Super Admin
          </Link>
          <Link
            to="/lead/status"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              color: 'var(--gold)',
              fontWeight: 500,
            }}
          >
            Lead Tracker
          </Link>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                color="var(--text-dim)"
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="input-luxury"
                style={{ paddingLeft: '40px', width: '100%' }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setShowForgotModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--gold)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                color="var(--text-dim)"
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-luxury"
                style={{ paddingLeft: '40px', width: '100%' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-gold"
            style={{ width: '100%', marginTop: '0.5rem', fontWeight: 700 }}
          >
            {isLoading ? 'Signing In...' : `Sign In to ${activeRoleInfo.badge}`}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
            Create Customer Account
          </Link>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card-luxury"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '2rem',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <KeyRound size={20} color="var(--gold)" />
              <h3 style={{ color: '#fff', margin: 0, fontSize: '1.25rem' }}>Secure Password Reset</h3>
            </div>

            {resetSent ? (
              <div>
                <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  If an account exists for <strong>{resetEmail}</strong>, password reset instructions and a cryptographic token have been generated.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false);
                    setResetSent(false);
                  }}
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: '1rem' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestPasswordReset}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
                  Enter your registered account email to request a secure password reset token.
                </p>

                {resetError && (
                  <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                    {resetError}
                  </div>
                )}

                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@lykarealty.ae"
                  className="input-luxury"
                  style={{ width: '100%', marginBottom: '1rem' }}
                />

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="btn btn-gold btn-sm"
                  >
                    {resetLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
