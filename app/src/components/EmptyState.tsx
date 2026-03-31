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
    <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/40 p-10 text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-indigo-300">
          {icon}
        </div>
        <h2 className="text-xl font-medium text-neutral-100">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-400">{description}</p>
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        {details && <div className="mt-6">{details}</div>}
      </div>
    </div>
  );
}
