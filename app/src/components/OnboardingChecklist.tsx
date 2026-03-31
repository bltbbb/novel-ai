interface OnboardingChecklistProps {
  title: string;
  items: string[];
}

export function OnboardingChecklist({ title, items }: OnboardingChecklistProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-left">
      <p className="mb-3 text-sm font-medium text-neutral-200">{title}</p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item} className="flex items-start gap-3 text-sm text-neutral-400">
            <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-medium text-indigo-300">
              {index + 1}
            </div>
            <p className="leading-6">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
