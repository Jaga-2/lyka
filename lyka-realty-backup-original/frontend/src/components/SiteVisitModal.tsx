import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Calendar, MapPin, CheckCircle2 } from 'lucide-react';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const TIME_SLOTS = [
  '10:00 AM',
  '11:30 AM',
  '01:00 PM',
  '02:30 PM',
  '04:00 PM',
  '05:30 PM',
];

export const SiteVisitModal: React.FC = () => {
  const { siteVisitProperty, siteVisitConversationId, closeSiteVisitModal } = useProperty();
  const { user } = useAuth();

  const [date, setDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [minimumDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState(TIME_SLOTS[1]);
  const name = user?.full_name || '';
  const email = user?.email || '';
  const [phone, setPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!siteVisitProperty) return null;

  if (!user) {
    return (
      <div className="modal-overlay" onClick={closeSiteVisitModal}>
        <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '460px', textAlign: 'center' }}>
          <h3 style={{ color: '#fff' }}>Sign in to schedule a site visit</h3>
          <p style={{ color: 'var(--text-muted)' }}>Your visit request will be saved to your LYKA account.</p>
          <Link to="/login" state={{ from: { pathname: `/properties/${siteVisitProperty.id}` } }} className="btn btn-gold">
            Sign in
          </Link>
          <button type="button" onClick={closeSiteVisitModal} className="btn btn-outline" style={{ marginLeft: '0.75rem' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await api.scheduleSiteVisit({
        property_id: siteVisitProperty.id,
        customer_name: user.full_name,
        customer_email: user.email,
        customer_phone: phone,
        preferred_date: date,
        preferred_time: selectedSlot,
        notes,
        conversation_id: siteVisitConversationId || undefined,
      });
      setIsSuccess(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'The site visit could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeSiteVisitModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={22} color="var(--gold)" />
            <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: 0 }}>Schedule Exclusive Site Visit</h3>
          </div>
          <button
            onClick={closeSiteVisitModal}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {isSuccess ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <CheckCircle2 size={36} color="var(--success)" />
            </div>
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Site Visit Confirmed!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Your site-visit request for <strong>{siteVisitProperty.title}</strong> has been saved for{' '}
              <strong style={{ color: 'var(--gold)' }}>{date} at {selectedSlot}</strong>. The LYKA Realty team can now review it.
            </p>
            <button onClick={closeSiteVisitModal} className="btn btn-primary" style={{ minWidth: '160px' }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Property Summary Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{siteVisitProperty.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  <MapPin size={13} color="var(--gold)" />
                  <span>{siteVisitProperty.location}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: '0.95rem' }}>
                  AED {new Intl.NumberFormat('en-AE').format(siteVisitProperty.sale_price || siteVisitProperty.rent_price)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{siteVisitProperty.beds} Beds • {siteVisitProperty.property_type}</div>
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Preferred Date
              </label>
              <input
                type="date"
                required
                value={date}
                min={minimumDate}
                onChange={(e) => setDate(e.target.value)}
                className="input-luxury"
              />
            </div>

            {/* Time Slot Chips */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Select Time Slot (GST)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: selectedSlot === slot ? 'var(--gold)' : 'var(--border-color)',
                      backgroundColor: selectedSlot === slot ? 'rgba(197, 160, 89, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: selectedSlot === slot ? 'var(--gold-light)' : 'var(--text-muted)',
                      fontSize: '0.82rem',
                      fontWeight: selectedSlot === slot ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  readOnly
                  placeholder="Full Name"
                  className="input-luxury"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 50 000 0000"
                  className="input-luxury"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                readOnly
                placeholder="your.email@example.com"
                className="input-luxury"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Special Requirements or Questions (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Interested in high floor view, need parking details"
                className="input-luxury"
              />
            </div>

            {errorMessage && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>{errorMessage}</div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={closeSiteVisitModal}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-gold"
                style={{ flex: 2 }}
              >
                {isSubmitting ? 'Confirming...' : 'Confirm Appointment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
