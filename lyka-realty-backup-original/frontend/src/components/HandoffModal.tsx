import React, { useState } from 'react';
import { X, PhoneCall, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { CustomerRequirements } from '../types';

interface HandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirementSummary?: string;
  conversationId: string;
  interestedPropertyId?: number;
  preferredLanguage: string;
  requirements: Partial<CustomerRequirements>;
}

export const HandoffModal: React.FC<HandoffModalProps> = ({
  isOpen,
  onClose,
  requirementSummary = '',
  conversationId,
  interestedPropertyId,
  preferredLanguage,
  requirements,
}) => {
  const { user } = useAuth();
  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [summary, setSummary] = useState(requirementSummary);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await api.requestAgentHandoff({
        customer_name: name,
        customer_phone: phone,
        customer_email: email || undefined,
        requirement_summary: summary,
        conversation_id: conversationId,
        interested_property_id: interestedPropertyId,
        preferred_language: preferredLanguage,
        requirements,
      });
      setIsSuccess(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The request could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PhoneCall size={20} color="var(--gold)" />
            <h3 style={{ color: '#fff', fontSize: '1.2rem', margin: 0 }}>Connect with LYKA Property Advisor</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {isSuccess ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <CheckCircle2 size={32} color="var(--success)" />
            </div>
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Callback Request Received</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Your request and contact details are saved for the LYKA Realty team to review. This app does not confirm that an agent has contacted you.
            </p>
            <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
              Submit your callback request and contact details for the LYKA Realty team to review.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Your Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="input-luxury"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Phone Number (WhatsApp Preferred)
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
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com (optional)"
                className="input-luxury"
              />
            </div>

            {errorMessage && <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>{errorMessage}</div>}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Requirement Context for Agent
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                className="input-luxury"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button type="button" onClick={onClose} className="btn btn-outline" style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ flex: 2 }}>
                {isSubmitting ? 'Requesting...' : 'Request Immediate Call'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
