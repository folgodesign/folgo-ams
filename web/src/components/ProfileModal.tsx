import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Input, Select } from './ui';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

/** Edit your own profile (PRD PATCH /me): name, phone, timezone. */
export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Kolkata');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Prefill phone/timezone from the full profile.
  useEffect(() => {
    api.get<{ name: string; phone: string | null; timezone: string | null }>('/me').then((me) => {
      setName(me.name);
      setPhone(me.phone ?? '');
      if (me.timezone) setTimezone(me.timezone);
    }).catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch('/me', { name: name.trim(), phone: phone || undefined, timezone });
      await refreshUser();
      onClose();
    } catch {
      setError('Could not save. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 bg-bg-raised" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h2 mb-1">My profile</h3>
        <p className="text-sm text-text-muted mb-5">{user?.email}</p>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <div className="mt-4 text-sm text-[#F4713F]">{error}</div>}
        <div className="flex gap-2 mt-6">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
