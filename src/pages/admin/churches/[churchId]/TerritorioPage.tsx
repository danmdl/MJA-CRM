"use client";
import React, { useState } from 'react';
import { Building2, Users, PenLine } from 'lucide-react';
import MapaPage from './MapaPage';
import TerritoriosPage from './TerritoriosPage';
import { usePermissions } from '@/lib/permissions';

// Unified "Territorio" page that merges:
//   - Mapa de Células  (formerly MapaPage viewMode='cells')
//   - Mapa de Contactos (formerly MapaPage viewMode='contacts')
//   - Delineación de Territorio (formerly TerritoriosPage)
//
// Both underlying pages are kept mounted (display:none when inactive)
// to avoid reinitializing Google Maps on every tab switch.

type SubTab = 'celulas' | 'contactos' | 'delineacion';

const TABS: { key: SubTab; label: string; Icon: React.ElementType }[] = [
  { key: 'celulas',     label: 'Mapa de Células',    Icon: Building2 },
  { key: 'contactos',   label: 'Mapa de Contactos',  Icon: Users     },
  { key: 'delineacion', label: 'Delineación',         Icon: PenLine   },
];

const TerritorioPage: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('celulas');
  const { canSeeMapa, canSeeCuerdas } = usePermissions();

  const visibleTabs = TABS.filter(t => {
    if (t.key === 'delineacion') return canSeeCuerdas();
    return canSeeMapa();
  });

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-0 border-b shrink-0">
        {visibleTabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* MapaPage — kept mounted, hidden when not active to preserve Google Maps state */}
      <div className={`flex-1 min-h-0 ${subTab !== 'delineacion' ? 'flex flex-col' : 'hidden'}`}>
        <MapaPage
          forcedViewMode={subTab === 'contactos' ? 'contacts' : 'cells'}
          hideToggle
        />
      </div>

      {/* TerritoriosPage — same keep-mounted pattern */}
      <div className={`flex-1 min-h-0 overflow-auto ${subTab === 'delineacion' ? 'block' : 'hidden'}`}>
        <TerritoriosPage />
      </div>
    </div>
  );
};

export default TerritorioPage;
