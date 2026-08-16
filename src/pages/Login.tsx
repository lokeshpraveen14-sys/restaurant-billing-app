import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { ShieldCheck, Eye, EyeSlash, ForkKnife } from '@phosphor-icons/react';

export default function Login() {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const toast = useToast();

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        handleLogin(newPin);
      }
    }
  };

  const handleLogin = (enteredPin: string) => {
    setLoading(true);
    setTimeout(() => {
      const success = login(enteredPin);
      if (success) {
        toast.success('Welcome back!', 'Logged in successfully');
      } else {
        setError('Invalid PIN. Please try again.');
        setPin('');
      }
      setLoading(false);
    }, 300);
  };

  const handleFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError('PIN must be 4 digits');
      return;
    }
    handleLogin(pin);
  };

  const pinDots = [0, 1, 2, 3].map((i) => (
    <div
      key={i}
      style={{
        width: 14, height: 14, borderRadius: '50%',
        background: i < pin.length ? 'var(--accent)' : 'var(--border-strong)',
        transition: 'background 0.15s ease',
      }}
    />
  ));

  const numpad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <ForkKnife size={28} weight="bold" color="#0c0e16" />
        </div>
        <h1 className="login-title">Railway Coach </h1>
        <p className="login-sub">Restaurant & Bakery Billing System</p>

        <form onSubmit={handleFormLogin}>
          {/* PIN display */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
            {pinDots}
          </div>

          {/* Manual PIN input (hidden, for keyboard) */}
          <div className="input-group" style={{ marginBottom: 16 }}>
            <div className="input-with-icon">
              <ShieldCheck size={18} className="input-icon" />
              <input
                className="input select"
                type={showPin ? 'text' : 'password'}
                placeholder="Enter 4-digit PIN"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                  setError('');
                }}
                maxLength={4}
                autoFocus
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                }}
              >
                {showPin ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {numpad.map((key, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (key === '⌫') setPin((p) => p.slice(0, -1));
                  else if (key !== '') handlePinInput(key);
                }}
                style={{
                  padding: '14px 8px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-strong)',
                  background: key === '' ? 'transparent' : 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  cursor: key === '' ? 'default' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.1s ease',
                  visibility: key === '' ? 'hidden' : 'visible',
                }}
                onMouseOver={(e) => {
                  if (key !== '') (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                }}
                onMouseOut={(e) => {
                  if (key !== '') (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {error && (
            <p style={{ color: 'var(--status-occupied)', fontSize: '0.8125rem', textAlign: 'center', marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full btn-lg"
            disabled={loading || pin.length !== 4}
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
          <p className="text-xs text-muted" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Demo PINs</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { role: 'Admin', pin: '1234' },
              { role: 'Manager', pin: '2345' },
              { role: 'Cashier', pin: '3456' },
              { role: 'Waiter', pin: '4567' },
              { role: 'Kitchen', pin: '5678' },
            ].map((d) => (
              <div key={d.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-xs text-secondary">{d.role}</span>
                <button
                  type="button"
                  onClick={() => { setPin(d.pin); setError(''); handleLogin(d.pin); }}
                  style={{
                    background: 'var(--accent-dim)', color: 'var(--accent)',
                    border: 'none', borderRadius: 6, padding: '3px 10px',
                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {d.pin}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
