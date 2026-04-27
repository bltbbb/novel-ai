import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  details?: ReactNode;
}

export function EmptyState({ icon, title, description, actions, details }: EmptyStateProps) {
  return (
    <div className="studio-empty-shell flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-[color:var(--studio-line)] bg-[color:var(--studio-accent-soft)] text-[color:var(--studio-accent-strong)]">
          {icon}
        </div>
        <p className="studio-overline">空白起稿区</p>
        <h2 className="studio-heading mt-3 text-2xl font-semibold text-[color:var(--studio-text)]">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--studio-muted)]">{description}</p>
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        {details && <div className="mt-6">{details}</div>}
      </div>
    </div>
  );
}
