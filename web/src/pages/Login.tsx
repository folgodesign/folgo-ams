import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Button, Input, Field } from '../components/ui';
import { Wordmark } from '../components/Logo';

export function LoginPage() {
  const { user, login, setSession } = useAuth();
  const navigate = useNavigate();
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null);
  const [email, setEmail] = useState('admin@folgo.studio');
  const [password, setPassword] = useState('folgopulse2026');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    api.get<{ bootstrapped: boolean }>('/auth/bootstrap-status').then((r) => setBootstrapped(r.bootstrapped)).catch(() => setBootstrapped(true));
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? 'Invalid email or password.' : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (bootstrapped === false) return <BootstrapWizard onDone={setSession} />;

  return (
    <div className="h-screen grid lg:grid-cols-2">
      {/* Brand gradient panel — reserved for login (PRD §7.1). */}
      <div className="folgo-gradient hidden lg:flex flex-col justify-between p-12">
        <Wordmark className="text-display text-white" />
        <div>
          <h1 className="text-display text-white max-w-md leading-tight">Attendance, without the surveillance.</h1>
          <p className="text-white/70 text-body mt-4 max-w-md">
            One tap to start your day. A live studio wall for the team. Clean, exportable hours at month-end — no chasing.
          </p>
        </div>
        <p className="text-white/50 text-sm">Self-reported status over covert monitoring. Always.</p>
      </div>

      <div className="flex items-center justify-center p-8 bg-bg-base">
        <form onSubmit={onLogin} className="w-full max-w-sm">
          <Wordmark className="text-h1 lg:hidden mb-8 block" />
          <h2 className="text-h1 mb-1">Sign in</h2>
          <p className="text-text-muted text-sm mb-8">Folgo Pulse — internal access only.</p>

          <div className="space-y-4">
            <Field label="Work email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          </div>

          {error && <div className="mt-4 text-sm text-[#F4713F]">{error}</div>}

          <Button type="submit" className="w-full mt-6" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <button type="button" className="w-full mt-3 text-sm text-text-muted hover:text-text-secondary" title="SSO is stubbed in this build">
            Continue with Google Workspace
          </button>

          <p className="mt-8 text-caption uppercase text-text-muted text-center">
            No public signup · accounts are created by an admin
          </p>
        </form>
      </div>
    </div>
  );
}

function BootstrapWizard({ onDone }: { onDone: (access: string, user: any) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ secret: 'folgo-bootstrap', orgName: 'Folgo Design', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ access: string; user: any }>('/auth/bootstrap', form);
      onDone(res.access, res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bootstrap failed.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="h-screen grid place-items-center bg-bg-base p-8">
      <form onSubmit={submit} className="w-full max-w-md">
        <Wordmark className="text-h1 mb-2 block" />
        <h2 className="text-h1 mb-1">First-run setup</h2>
        <p className="text-text-muted text-sm mb-8">Create the first Super Admin. This wizard disables itself afterward.</p>
        <div className="space-y-4">
          <Field label="Organisation name"><Input value={form.orgName} onChange={set('orgName')} required /></Field>
          <Field label="Your name"><Input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Work email"><Input type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Password (min 12 chars)"><Input type="password" value={form.password} onChange={set('password')} minLength={12} required /></Field>
          <Field label="Bootstrap secret"><Input value={form.secret} onChange={set('secret')} required /></Field>
        </div>
        {error && <div className="mt-4 text-sm text-[#F4713F]">{error}</div>}
        <Button type="submit" className="w-full mt-6" disabled={busy}>{busy ? 'Creating…' : 'Create organisation'}</Button>
      </form>
    </div>
  );
}
