'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (res.ok) {
      router.push('/');
    } else {
      setError('Invalid password');
      setPassword('');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
    }}>
      <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ color: '#e8c97a', fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>
            two.desk
          </div>
          <div style={{ color: '#6b6b70', fontSize: 13, marginTop: 4 }}>
            dual trading agents
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            autoFocus
            style={{
              background: '#16161a',
              border: `1px solid ${error ? '#c0392b' : '#2a2a2d'}`,
              borderRadius: 6,
              color: '#e8e6e1',
              fontFamily: 'inherit',
              fontSize: 14,
              padding: '10px 14px',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {error && (
            <div style={{ color: '#c0392b', fontSize: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              background: loading || !password ? '#1e1e22' : '#e8c97a',
              color: loading || !password ? '#6b6b70' : '#0a0a0b',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 0',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'checking...' : 'enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
