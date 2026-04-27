import { useEffect, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface ShellActionMenuItem {
  icon: LucideIcon;
  label: string;
  note: string;
  onSelect: () => void;
}

interface ShellActionMenuProps {
  label: string;
  icon: LucideIcon;
  items: ShellActionMenuItem[];
  align?: 'start' | 'end';
}

export function ShellActionMenu({
  label,
  icon: Icon,
  items,
  align = 'end',
}: ShellActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="studio-action-menu">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="studio-command-button"
      >
        <Icon size={15} />
        {label}
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>

      {open ? (
        <div
          role="menu"
          className={`studio-action-menu__panel ${align === 'start' ? 'left-0' : 'right-0'}`}
        >
          {items.map((item) => {
            const ItemIcon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="studio-action-menu__item"
              >
                <span className="studio-action-menu__icon">
                  <ItemIcon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="studio-action-menu__label">{item.label}</span>
                  <span className="studio-action-menu__note">{item.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
