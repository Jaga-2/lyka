import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+971 50 ');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(fullName, email, password, phone);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
      }}
    >
      <div
        className="card-luxury"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '2.5rem',
          margin: '0 1rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/lyka-realty-logo.png"
            alt="Lyka Realty"
            style={{ display: 'block', width: '180px', height: '83px', objectFit: 'contain', margin: '0 auto 1rem' }}
          />
          <h2 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '0.5rem' }}>Create LYKA Account</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Join Dubai's premier AI-enabled luxury real-estate network.
          </p>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="input-luxury"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="input-luxury"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Phone Number / WhatsApp
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971 50 123 4567"
              className="input-luxury"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-luxury"
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn btn-gold" style={{ width: '100%', marginTop: '0.5rem' }}>
            {isLoading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
