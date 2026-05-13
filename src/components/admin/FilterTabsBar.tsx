"use client";
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';

export interface FilterTabFilters {
  // Legacy single-cuerda field. Older saved tabs only have this one. New
  // saves always write `cuerdas` (array) instead, but reads accept either.
  cuerda?: string;
  // Multi-select cuerda filter. Empty array or undefined = all cuerdas.
  cuerdas?: string[];
  responsable?: string;
  sexo?: string;
  estadoCivil?: string;
  edadMin?: string;
  edadMax?: string;
  fechaContactoFrom?: string;
  fechaContactoTo?: string;
  zonaId?: string;
  hasPhone?: 'yes' | 'no' | '';
  hasAddress?: 'yes' | 'no' | '';
  hasCoords?: 'yes' | 'no' | '';
  zonaStatus?: 'in' | 'out' | '';
  // Only contacts the trigger flagged as "received from an MJA-side
  // cuerda" (is_church_cuerda=true). Driven by the locked
  // MJA_RECEIVED_TAB_ID tab, not exposed in the save-tab dialog.
  mjaReceived?: boolean;
}

export interface FilterTab {
  id: string;
  user_id: string;
  church_id: string | null;
  name: string;
  filters: FilterTabFilters;
  position: number;
}

interface Cuerda { id: string; numero: string; is_church_cuerda?: boolean; }
interface TeamMember { id: string; first_name: string | null; last_name: string | null; numero_cuerda?: string | null; }
interface Zona { id: string; nombre: string; }

interface FilterTabsBarProps {
  churchId: string;
  activeTabId: string | null;
  onActiveTabChange: (tabId: string | null, filters: FilterTabFilters) => void;
  cuerdas: Cuerda[];
  teamMembers: TeamMember[];
  zonas: Zona[];
  // Count of "received from MJA" contacts the receiving cuerda hasn't
  // marked seen yet. Drives the badge next to the locked MJA tab. The
  // parent (SemilleroPage) owns the query so the bar stays presentational.
  mjaUnseenCount?: number;
}

const EMPTY_FILTERS: FilterTabFilters = {};
const TODOS_TAB_ID = '__all__';
// Locked tab that always sits second. Filters Semillero to contacts
// whose received_from_mja_at column is non-null. Tab can't be edited
// or deleted from the UI — it's part of the bar's contract with the
// Semillero page (which also marks contacts as seen on click).
export const MJA_RECEIVED_TAB_ID = '__mja_received__';
const MJA_RECEIVED_FILTERS: FilterTabFilters = { mjaReceived: true };

const FilterTabsBar = ({ churchId, activeTabId, onActiveTabChange, cuerdas, teamMembers, zonas, mjaUnseenCount = 0 }: FilterTabsBarProps) => {
  const { session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const [editingTab, setEditingTab] = useState<FilterTab | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: tabs = [] } = useQuery<FilterTab[]>({
    queryKey: ['filter-tabs', userId, churchId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase.from('seedling_filter_tabs')
        .select('*')
        .eq('user_id', userId)
        .eq('church_id', churchId)
        .order('position', { ascending: true });
      return (data || []) as FilterTab[];
    },
    enabled: !!userId && !!churchId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('seedling_filter_tabs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['filter-tabs', userId, churchId] });
      showSuccess('Solapa eliminada.');
      if (activeTabId === deletedId) onActiveTabChange(null, EMPTY_FILTERS);
    },
    onError: (e: any) => showError(e.message || 'Error al eliminar.'),
  });

  const handleSelectTab = (tabId: string | null) => {
    if (tabId === null || tabId === TODOS_TAB_ID) {
      onActiveTabChange(null, EMPTY_FILTERS);
      return;
    }
    if (tabId === MJA_RECEIVED_TAB_ID) {
      onActiveTabChange(MJA_RECEIVED_TAB_ID, MJA_RECEIVED_FILTERS);
      return;
    }
    const tab = tabs.find(t => t.id === tabId);
    if (tab) onActiveTabChange(tab.id, tab.filters);
  };

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px scrollbar-thin">
        {/* "Todos" default tab — always first, can't be edited/deleted. */}
        <TabButton
          isActive={activeTabId === null}
          onClick={() => handleSelectTab(null)}
          label="Todos"
        />
        {/* "Recibidos de MJA" — always second. Filters to contacts the
            trigger flagged as coming in from an MJA-side cuerda. Badge
            count shows unseen arrivals; the Semillero clears them on
            tab click. Locked: no edit/delete buttons rendered. */}
        <TabButton
          isActive={activeTabId === MJA_RECEIVED_TAB_ID}
          onClick={() => handleSelectTab(MJA_RECEIVED_TAB_ID)}
          label="Recibidos de MJA"
          badge={mjaUnseenCount > 0 ? mjaUnseenCount : undefined}
        />
        {tabs.map(tab => (
          <TabButton
            key={tab.id}
            isActive={activeTabId === tab.id}
            onClick={() => handleSelectTab(tab.id)}
            label={tab.name}
            onEdit={() => setEditingTab(tab)}
            onDelete={() => {
              if (confirm(`¿Eliminar la solapa "${tab.name}"?`)) deleteMutation.mutate(tab.id);
            }}
          />
        ))}
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-md whitespace-nowrap"
          title="Crear nueva solapa con filtros"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva solapa
        </button>
      </div>

      {(creating || editingTab) && (
        <FilterTabDialog
          tab={editingTab}
          churchId={churchId}
          userId={userId!}
          existingPositions={tabs.map(t => t.position)}
          cuerdas={cuerdas}
          teamMembers={teamMembers}
          zonas={zonas}
          onClose={() => { setCreating(false); setEditingTab(null); }}
          onSaved={(savedTab) => {
            queryClient.invalidateQueries({ queryKey: ['filter-tabs', userId, churchId] });
            // Auto-activate the just-saved tab
            onActiveTabChange(savedTab.id, savedTab.filters);
          }}
        />
      )}
    </>
  );
};

const TabButton = ({ isActive, onClick, label, onEdit, onDelete, badge }: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  onEdit?: () => void;
  onDelete?: () => void;
  badge?: number;
}) => {
  return (
    <div className={`group flex items-center rounded-t-md whitespace-nowrap ${isActive ? 'bg-card border-x border-t border-border -mb-px' : 'hover:bg-muted/30'}`}>
      <button
        onClick={onClick}
        className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {onEdit && isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="px-1 text-muted-foreground hover:text-foreground"
          title="Editar"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-1 mr-1 text-muted-foreground hover:text-red-400"
          title="Eliminar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

interface FilterTabDialogProps {
  tab: FilterTab | null;
  churchId: string;
  userId: string;
  existingPositions: number[];
  cuerdas: Cuerda[];
  teamMembers: TeamMember[];
  zonas: Zona[];
  onClose: () => void;
  onSaved: (savedTab: FilterTab) => void;
}

const FilterTabDialog = ({ tab, churchId, userId, existingPositions, cuerdas, teamMembers, zonas, onClose, onSaved }: FilterTabDialogProps) => {
  const [name, setName] = useState(tab?.name || '');
  // Local copy of filters. We migrate the legacy single `cuerda` field into
  // the new `cuerdas` array on init so the multi-select picker shows the
  // correct selection for older saved tabs.
  const [filters, setFilters] = useState<FilterTabFilters>(() => {
    const init: FilterTabFilters = { ...(tab?.filters || {}) };
    if (!init.cuerdas && init.cuerda) init.cuerdas = [init.cuerda];
    delete init.cuerda;
    return init;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(tab?.name || '');
    const init: FilterTabFilters = { ...(tab?.filters || {}) };
    if (!init.cuerdas && init.cuerda) init.cuerdas = [init.cuerda];
    delete init.cuerda;
    setFilters(init);
  }, [tab]);

  const setF = (key: keyof FilterTabFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const toggleCuerda = (numero: string) => {
    setFilters(prev => {
      const current = prev.cuerdas || [];
      const next = current.includes(numero) ? current.filter(n => n !== numero) : [...current, numero];
      return { ...prev, cuerdas: next.length ? next : undefined };
    });
  };

  const selectedCuerdaCount = filters.cuerdas?.length || 0;
  const cuerdaButtonLabel = selectedCuerdaCount === 0
    ? 'Todas'
    : selectedCuerdaCount === 1
      ? `Cuerda ${filters.cuerdas![0]}`
      : `${selectedCuerdaCount} cuerdas`;

  const handleSave = async () => {
    if (!name.trim()) { showError('Ingresá un nombre para la solapa.'); return; }
    setSaving(true);
    try {
      // Strip empty filter values + the legacy `cuerda` field before saving.
      // We always persist as `cuerdas` going forward, even for single-value
      // selections, so reads only ever need to handle the array shape.
      const cleaned: FilterTabFilters = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (k === 'cuerda') return; // never write the legacy field
        if (v === '' || v === undefined || v === null) return;
        if (Array.isArray(v) && v.length === 0) return;
        (cleaned as any)[k] = v;
      });

      if (tab) {
        const { data, error } = await supabase.from('seedling_filter_tabs')
          .update({ name: name.trim(), filters: cleaned })
          .eq('id', tab.id)
          .select()
          .single();
        if (error) throw error;
        showSuccess('Solapa actualizada.');
        onSaved(data as FilterTab);
      } else {
        const nextPosition = existingPositions.length > 0 ? Math.max(...existingPositions) + 1 : 0;
        const { data, error } = await supabase.from('seedling_filter_tabs')
          .insert({ user_id: userId, church_id: churchId, name: name.trim(), filters: cleaned, position: nextPosition })
          .select()
          .single();
        if (error) throw error;
        showSuccess('Solapa creada.');
        onSaved(data as FilterTab);
      }
      onClose();
    } catch (e: any) {
      showError(e.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tab ? 'Editar solapa' : 'Nueva solapa de filtros'}</DialogTitle>
          <DialogDescription>
            Dale un nombre y configurá los filtros. Solo verás contactos que coincidan con todos los filtros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">Nombre <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Mujeres jóvenes Cuerda 202"
              maxLength={50}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cuerda</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-muted/40"
                  >
                    <span className={selectedCuerdaCount === 0 ? 'text-muted-foreground' : ''}>{cuerdaButtonLabel}</span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Cuerdas</DropdownMenuLabel>
                  <DropdownMenuItem onClick={(e) => { e.preventDefault(); setFilters(prev => ({ ...prev, cuerdas: undefined })); }}>
                    Todas (limpiar)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {cuerdas.map(c => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={(filters.cuerdas || []).includes(c.numero)}
                      onCheckedChange={() => toggleCuerda(c.numero)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {c.numero}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Responsable</Label>
              <select value={filters.responsable || ''} onChange={e => setF('responsable', e.target.value)} className={selectClass}>
                <option value="">Todos</option>
                <option value="__none__">Sin responsable</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {[m.first_name, m.last_name].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sexo</Label>
              <select value={filters.sexo || ''} onChange={e => setF('sexo', e.target.value)} className={selectClass}>
                <option value="">Todos</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Estado civil</Label>
              <select value={filters.estadoCivil || ''} onChange={e => setF('estadoCivil', e.target.value)} className={selectClass}>
                <option value="">Cualquiera</option>
                <option value="Soltero/a">Soltero/a</option>
                <option value="En pareja">En pareja</option>
                <option value="Casado/a">Casado/a</option>
                <option value="Divorciado/a">Divorciado/a</option>
                <option value="Viudo/a">Viudo/a</option>
                <option value="No brindó información">No brindó información</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Edad mín</Label>
              <Input type="number" value={filters.edadMin || ''} onChange={e => setF('edadMin', e.target.value)} placeholder="Ej: 18" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Edad máx</Label>
              <Input type="number" value={filters.edadMax || ''} onChange={e => setF('edadMax', e.target.value)} placeholder="Ej: 35" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fecha contacto desde</Label>
              <Input type="date" value={filters.fechaContactoFrom || ''} onChange={e => setF('fechaContactoFrom', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fecha contacto hasta</Label>
              <Input type="date" value={filters.fechaContactoTo || ''} onChange={e => setF('fechaContactoTo', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Zona</Label>
              <select value={filters.zonaId || ''} onChange={e => setF('zonaId', e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</Label>
              <select value={filters.hasPhone || ''} onChange={e => setF('hasPhone', e.target.value)} className={selectClass}>
                <option value="">Cualquiera</option>
                <option value="yes">Con teléfono</option>
                <option value="no">Sin teléfono</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dirección</Label>
              <select value={filters.hasAddress || ''} onChange={e => setF('hasAddress', e.target.value)} className={selectClass}>
                <option value="">Cualquiera</option>
                <option value="yes">Con dirección</option>
                <option value="no">Sin dirección</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Coordenadas</Label>
              <select value={filters.hasCoords || ''} onChange={e => setF('hasCoords', e.target.value)} className={selectClass}>
                <option value="">Cualquiera</option>
                <option value="yes">Con coordenadas</option>
                <option value="no">Sin coordenadas</option>
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Zona</Label>
              <select value={filters.zonaStatus || ''} onChange={e => setF('zonaStatus', e.target.value)} className={selectClass}>
                <option value="">Cualquiera</option>
                <option value="in">En zona</option>
                <option value="out">Fuera de zona</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Guardando...' : tab ? 'Guardar cambios' : 'Crear solapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

// Apply filters to a contact list
export function applyFilterTab(contacts: any[], filters: FilterTabFilters): any[] {
  // Build the active cuerda set once. New tabs save into `cuerdas` (array);
  // older tabs only have `cuerda` (string) — read both so legacy saves keep
  // working without a one-off migration.
  const cuerdaSet: Set<string> | null = (() => {
    if (filters.cuerdas && filters.cuerdas.length > 0) return new Set(filters.cuerdas);
    if (filters.cuerda) return new Set([filters.cuerda]);
    return null;
  })();
  return contacts.filter(c => {
    if (filters.mjaReceived && !c.received_from_mja_at) return false;
    if (cuerdaSet && !cuerdaSet.has(c.numero_cuerda || '')) return false;
    if (filters.responsable === '__none__') {
      if (c.responsable_id) return false;
    } else if (filters.responsable && c.responsable_id !== filters.responsable) return false;
    if (filters.sexo && c.sexo !== filters.sexo) return false;
    if (filters.estadoCivil && c.estado_civil !== filters.estadoCivil) return false;
    if (filters.edadMin) {
      const e = parseInt(c.edad || '', 10);
      if (isNaN(e) || e < parseInt(filters.edadMin, 10)) return false;
    }
    if (filters.edadMax) {
      const e = parseInt(c.edad || '', 10);
      if (isNaN(e) || e > parseInt(filters.edadMax, 10)) return false;
    }
    if (filters.fechaContactoFrom && (!c.fecha_contacto || c.fecha_contacto < filters.fechaContactoFrom)) return false;
    if (filters.fechaContactoTo && (!c.fecha_contacto || c.fecha_contacto > filters.fechaContactoTo)) return false;
    if (filters.zonaId && c.zona_id !== filters.zonaId) return false;
    if (filters.hasPhone === 'yes' && !c.phone) return false;
    if (filters.hasPhone === 'no' && c.phone) return false;
    // Treat punctuation-only addresses as "no address" — legacy CSVs imported
    // strings like ". ," before the importer was fixed, so the column is
    // truthy but contains no real address. Mirrors the sanitizeValue rule.
    const addressHasContent = !!c.address && /[\p{L}\p{N}]/u.test(c.address);
    if (filters.hasAddress === 'yes' && !addressHasContent) return false;
    if (filters.hasAddress === 'no' && addressHasContent) return false;
    if (filters.hasCoords === 'yes' && (c.lat == null || c.lng == null)) return false;
    if (filters.hasCoords === 'no' && c.lat != null && c.lng != null) return false;
    return true;
  });
}

export default FilterTabsBar;
