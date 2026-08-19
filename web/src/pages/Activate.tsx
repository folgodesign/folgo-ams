import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Input, Field, Spinner, Card } from '../components/ui';
import { Wordmark } from '../components/Logo';

interface InviteInfo {
  status: 'valid' | 'used' | 'expired';
  user?: { name: string; email: string; designation: string | null };
  org?: { name: string };
  consentVersion?: string;
}

export function ActivatePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<InviteInfo>(`/auth/invite/${token}`).then(setInfo).catch(() => setInfo({ status: 'expired' }));
  }, [token]);

  if (!token) return <Centered><p className="text-text-secondary">No invite token provided.</p></Centered>;
  if (!info) return <Centered><Spinner /></Centered>;

  if (info.status === 'expired')
    return (
      <Centered>
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-h2 mb-2">This invite has expired</h2>
          <p className="text-text-muted text-sm mb-6">Invites are valid for 7 days. Ask your admin to resend it.</p>
          <Button variant="outline" onClick={() => alert('Your admin has been notified (stub).')}>Notify admin to resend</Button>
        </Card>
      </Centered>
    );

  if (info.status === 'used')
    return (
      <Centered>
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-h2 mb-2">Already activated</h2>
          <p className="text-text-muted text-sm mb-6">This account is set up. Please sign in.</p>
          <Button onClick={() => navigate('/login')}>Go to sign in</Button>
        </Card>
      </Centered>
    );

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ access: string; user: any }>('/auth/activate', {
        token,
        password,
        phone: phone || undefined,
        consentAcknowledged: true,
      });
      setSession(res.access, res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form onSubmit={activate} className="w-full max-w-md">
        <Wordmark className="text-h1 mb-6 block" />
        <h2 className="text-h1 mb-1">Welcome, {info.user?.name.split(' ')[0]}</h2>
        <p className="text-text-muted text-sm mb-6">
          Joining <span className="text-text-secondary">{info.org?.name}</span> as {info.user?.designation ?? 'team member'}. Set a password to activate {info.user?.email}.
        </p>

        <div className="space-y-4">
          <Field label="Password (min 12 characters)">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>

        {/* Versioned consent screen (PRD F-1.3). */}
        <Card className="p-4 mt-6 text-sm text-text-secondary">
          <p className="font-medium text-text-primary mb-2">What Folgo Pulse records</p>
          <ul className="list-disc pl-5 space-y-1 text-text-muted">
            <li>Your check-in / check-out times and the tasks you log</li>
            <li>Your IP address at check-in (a security signal, visible to you)</li>
            <li>No geolocation, screenshots, or keystroke tracking — ever</li>
          </ul>
          <p className="text-text-muted mt-2">You can view and export everything recorded about you at any time. Retained 3 years. Policy version {info.consentVersion}.</p>
          <label className="flex items-center gap-2 mt-3 text-text-primary cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-[#EB5E29]" />
            I acknowledge the above.
          </label>
        </Card>

        {error && <div className="mt-4 text-sm text-[#F4713F]">{error}</div>}
        <Button type="submit" className="w-full mt-6" disabled={busy || !consent || password.length < 12}>
          {busy ? 'Activating…' : 'Activate & continue'}
        </Button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center bg-bg-base p-8">{children}</div>;
}
