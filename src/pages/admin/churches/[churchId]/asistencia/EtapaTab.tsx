interface EtapaTabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  fullLabel?: string;
  color?: string;
  icon?: React.ReactNode;
}

export const EtapaTab = ({ active, onClick, label, fullLabel, color, icon }: EtapaTabProps) => (
  <button
    onClick={onClick}
    title={fullLabel || label}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b-2 -mb-px transition-colors ${
      active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}
  >
    {color && (
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
    )}
    {icon}
    {label}
  </button>
);
