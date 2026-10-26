import React, { useState } from 'react';
import { X, Calculator, DollarSign, Percent, Clock, AlertCircle } from 'lucide-react';
import { useProperty } from '../context/PropertyContext';
import { api } from '../services/api';

export const EMICalculatorModal: React.FC = () => {
  const { emiProperty, closeEMIModal } = useProperty();

  const [priceOverride, setPriceOverride] = useState<{ propertyId: number; price: number } | null>(null);
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(20);
  const [tenureYears, setTenureYears] = useState<number>(25);
  const [interestRate, setInterestRate] = useState<number>(4.49);

  if (!emiProperty || emiProperty.sale_price == null || emiProperty.sale_price <= 0) return null;

  const propertyPrice =
    priceOverride?.propertyId === emiProperty.id ? priceOverride.price : emiProperty.sale_price;
  const calculation = api.calculateEMI(
    propertyPrice,
    downPaymentPercent,
    interestRate,
    tenureYears
  );

  const formatAED = (val: number) => {
    return new Intl.NumberFormat('en-AE').format(val);
  };

  const principalRatio = Math.round((calculation.principal / calculation.totalRepayment) * 100) || 50;
  const interestRatio = 100 - principalRatio;

  return (
    <div className="modal-overlay" onClick={closeEMIModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={22} color="var(--gold)" />
            <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: 0 }}>Dubai Mortgage & EMI Calculator</h3>
          </div>
          <button
            onClick={closeEMIModal}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Property Reference */}
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(90, 22, 69, 0.15)',
            border: '1px solid rgba(90, 22, 69, 0.35)',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#fff', fontWeight: 600 }}>{emiProperty.title}</span>
          <span style={{ color: 'var(--gold-light)' }}>{emiProperty.location}</span>
        </div>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Property Price (AED)
            </label>
            <input
              type="number"
              value={propertyPrice}
              onChange={(e) =>
                setPriceOverride({
                  propertyId: emiProperty.id,
                  price: Math.max(100000, Number(e.target.value)),
                })
              }
              className="input-luxury"
              step={50000}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Down Payment</label>
              <span style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>{downPaymentPercent}% (AED {formatAED(calculation.downPayment)})</span>
            </div>
            <input
              type="range"
              min={15}
              max={50}
              step={1}
              value={downPaymentPercent}
              onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--gold)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loan Tenure</label>
              <span style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>{tenureYears} Years</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={tenureYears}
              onChange={(e) => setTenureYears(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--gold)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Interest Rate (% p.a.)
            </label>
            <input
              type="number"
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
              step={0.1}
              min={1}
              max={15}
              className="input-luxury"
            />
          </div>
        </div>

        {/* Results Banner */}
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Estimated Monthly Installment (EMI)
            </div>
            <div
              style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: '2.2rem',
                fontWeight: 700,
                color: 'var(--gold-light)',
                marginTop: '4px',
              }}
            >
              AED {formatAED(calculation.monthlyEMI)} <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>/ month</span>
            </div>
          </div>

          {/* Breakdown Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-color)',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Principal Loan</div>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>
                AED {formatAED(calculation.principal)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Total Interest</div>
              <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.95rem' }}>
                AED {formatAED(calculation.totalInterest)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Total Payable</div>
              <div style={{ fontWeight: 600, color: 'var(--gold-light)', fontSize: '0.95rem' }}>
                AED {formatAED(calculation.totalRepayment)}
              </div>
            </div>
          </div>

          {/* Ratio Bar */}
          <div style={{ marginTop: '1rem' }}>
            <div
              style={{
                height: '8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${principalRatio}%`, backgroundColor: 'var(--primary-light)' }} title="Principal" />
              <div style={{ width: `${interestRatio}%`, backgroundColor: 'var(--gold)' }} title="Interest" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              <span>Principal: {principalRatio}%</span>
              <span>Interest: {interestRatio}%</span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', color: 'var(--text-dim)', fontSize: '0.74rem', marginBottom: '1rem' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Calculations are estimates for financial planning. Actual terms depend on bank underwriting, DLD registration fees (4%), and trustee fees. Minimum down payment for UAE residents is 20% (15% for UAE nationals).
          </span>
        </div>

        <button onClick={closeEMIModal} className="btn btn-outline" style={{ width: '100%' }}>
          Close Calculator
        </button>
      </div>
    </div>
  );
};
