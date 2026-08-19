import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-body font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    // White on orange is only used at ≥16px medium (PRD contrast note); labels here qualify.
    primary: 'bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white',
    ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
    outline: 'border border-border-strong text-text-primary hover:bg-bg-hover',
    danger: 'border border-[#C94B1D] text-[#F4713F] hover:bg-[#C94B1D]/10',
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-bg-surface border border-border-subtle rounded-lg ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-3 py-1.5 text-sm border transition-colors ${
        active
          ? 'bg-accent/[0.14] border-accent/40 text-text-primary'
          : 'border-border-subtle text-text-secondary hover:bg-bg-hover'
      }`}
    >
      {children}
    </button>
  );
}

export function Badge({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-caption uppercase"
      style={{ color: colour, background: `${colour}1a` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colour }} />
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-10 text-text-muted text-sm">
      <div className="w-5 h-5 border-2 border-border-strong border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-h2 text-text-secondary mb-1">{title}</div>
      {hint && <div className="text-sm text-text-muted">{hint}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-caption uppercase text-text-muted block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-bg-base border border-border-strong rounded-sm px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent transition-colors ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-bg-base border border-border-strong rounded-sm px-3 py-2 text-body text-text-primary focus:border-accent transition-colors ${props.className ?? ''}`}
    />
  );
}
