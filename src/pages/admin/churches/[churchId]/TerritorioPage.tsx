"use client";
import React, { useState } from 'react';
import { Building2, Users, PenLine } from 'lucide-react';
import MapaPage from './MapaPage';
import TerritoriosPage from './TerritoriosPage';
import { usePermissions } from '@/lib/permissions';

type SubTab = 'celulas' | 'contactos' | 'delineacion';

const TABS: { key: SubTab; label: string; Icon: React.ElementType }[] = [
  { key: 'celulas',     label: 'Células',      Icon: Building2 },
  { key: 'contactos',   label: 'Contactos',    Icon: Users     },
  { key: 'delineacion', label: 'Delineación',  Icon: PenLine   },
];

const TerritorioPage: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('celulas');
  const { canSeeMapa, canSeeCuerdas } = usePermissions();

  const visibleTabs = TABS.filter(t => {
    if (t.key === 'delineacion') return canSeeCuerdas();
    return canSeeMapa();
  });

  return (
    <div className="h-full flex">
      {/* Vertical sidebar tabs */}
      <div className="shrink-0 border-r flex flex-col py-1 gap-0.5 bg-background">
        {visibleTabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === key
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* MapaPage — kept mounted, hidden when delineacion is active */}
      <div className={`flex-1 min-h-0 min-w-0 ${subTab !== 'delineacion' ? 'flex flex-col' : 'hidden'}`}>
        <MapaPage
          forcedViewMode={subTab === 'contactos' ? 'contacts' : 'cells'}
          hideToggle
        />
      </div>

      {/* TerritoriosPage — same keep-mounted pattern */}
      <div className={`flex-1 min-h-0 min-w-0 overflow-auto ${subTab === 'delineacion' ? 'block' : 'hidden'}`}>
        <TerritoriosPage />
      </div>
    </div>
  );
};

export default TerritorioPage;
