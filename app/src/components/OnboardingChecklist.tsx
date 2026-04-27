interface OnboardingChecklistProps {
  title: string;
  items: string[];
}

export function OnboardingChecklist({ title, items }: OnboardingChecklistProps) {
  return (
    <div className="studio-checklist p-5 text-left">
      <p className="studio-overline">起步顺序</p>
      <p className="mt-3 text-sm font-medium text-[color:var(--studio-text)]">{title}</p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item} className="flex items-start gap-3 text-sm text-[color:var(--studio-muted)]">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--studio-line)] bg-[color:var(--studio-accent-soft)] text-xs font-medium text-[color:var(--studio-accent-strong)]">
              {index + 1}
            </div>
            <p className="leading-6">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
