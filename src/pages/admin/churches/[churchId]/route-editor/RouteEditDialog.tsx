import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Navigation, MapPin, Pencil, RefreshCw, X } from 'lucide-react';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';

interface RouteContact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  numero_cuerda: string | null;
}

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
}

interface RouteEditDialogProps {
  open: boolean;
  onCancel: () => void;
  onApply: () => void | Promise<void>;
  hasRoute: boolean;

  // Start point
  startAddress: string;
  setStartAddress: (s: string) => void;
  startLat: number | null;
  setStartLat: (n: number | null) => void;
  startLng: number | null;
  setStartLng: (n: number | null) => void;
  churchCoords: { lat: number | null; lng: number | null } | null;
  church: { address: string | null } | null | undefined;
  onUseGeolocation: () => void;
  onUseChurchAddress: () => void;

  // Filters
  search: string;
  setSearch: (s: string) => void;
  filterResponsableId: string;
  setFilterResponsableId: (s: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (s: string) => void;
  filterDateTo: string;
  setFilterDateTo: (s: string) => void;
  onlyWithNumber: boolean;
  setOnlyWithNumber: (b: boolean) => void;
  onlyInZone: boolean;
  setOnlyInZone: (b: boolean) => void;
  activeTerritoryPaths: { lat: number; lng: number }[][] | null | undefined;

  // Lists
  teamMembers: TeamMember[];
  profile: { id?: string; role?: string | null } | null | undefined;
  contactsLoading: boolean;
  filtered: RouteContact[];
  selectedIds: Set<string>;
  selectedContacts: RouteContact[];

  // Actions
  toggleContact: (id: string) => void;
  setEditingContactId: (id: string | null) => void;
}

/**
 * Start-point + contact-picker dialog used to (re)calculate a route.
 * All state lives in the parent — this component is a thick view layer
 * over RouteEditorPage's existing state. The prop count is high on
 * purpose: the alternative is leaking refs / context across files,
 * and the page's state model is already cohesive enough that the
 * explicit prop list reads as the dialog's contract.
 */
export const RouteEditDialog = ({
  open, onCancel, onApply, hasRoute,
  startAddress, setStartAddress, startLat, setStartLat, startLng, setStartLng,
  churchCoords, church, onUseGeolocation, onUseChurchAddress,
  search, setSearch, filterResponsableId, setFilterResponsableId,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo,
  onlyWithNumber, setOnlyWithNumber, onlyInZone, setOnlyInZone, activeTerritoryPaths,
  teamMembers, profile,
  contactsLoading, filtered, selectedIds, selectedContacts,
  toggleContact, setEditingContactId,
}: RouteEditDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Editar contactos de la ruta</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Starting point */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-primary" /> Punto de partida
              {startLat && startLng && <span className="text-[10px] text-green-500 font-medium normal-case">✓ Listo</span>}
            </label>
            <AddressAutocomplete
              value={startAddress}
              onChange={(addr, lat, lng) => {
                setStartAddress(addr);
                if (lat && lng) { setStartLat(lat); setStartLng(lng); }
              }}
              placeholder="Escribí la dirección de partida..."
              biasLat={churchCoords?.lat ?? null}
              biasLng={churchCoords?.lng ?? null}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={onUseGeolocation} className="text-xs h-8">
                <Navigation className="h-3 w-3 mr-1" /> Mi ubicación
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onUseChurchAddress} className="text-xs h-8" disabled={!church?.address}>
                <MapPin className="h-3 w-3 mr-1" /> Iglesia
              </Button>
            </div>
          </div>

          {/* Contact filters */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Contactos ({selectedIds.size} seleccionados)
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o dirección..."
                className="pl-9 h-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <select value={filterResponsableId} onChange={e => setFilterResponsableId(e.target.value)} className="h-8 text-xs border rounded px-2 bg-background">
                <option value="">Todos los responsables</option>
                <option value="__none__">Sin responsable</option>
                {(() => {
                  // Visibility rule (mirrors the Semillero responsable dropdown):
                  // privileged roles see every teammate; everyone else sees only
                  // themselves — picking another responsable always returns
                  // empty for them because the backend filters by responsable_id.
                  const isPrivileged = profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
                  const list = isPrivileged ? teamMembers : teamMembers.filter(m => m.id === profile?.id);
                  return list
                    .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                    ));
                })()}
              </select>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="Desde" className="h-8 w-full text-xs border rounded px-2 bg-background" />
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="Hasta" className="h-8 w-full text-xs border rounded px-2 bg-background" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyWithNumber}
                onChange={(e) => setOnlyWithNumber(e.target.checked)}
                className="rounded border-input"
              />
              Solo direcciones con número (recomendado para rutas precisas)
            </label>
            <label
              className={`flex items-center gap-2 text-xs mb-3 cursor-pointer select-none ${activeTerritoryPaths ? 'text-muted-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}`}
              title={activeTerritoryPaths ? 'Mostrar solo los contactos dentro de la zona dibujada para tu cuerda' : 'Tu cuerda no tiene un territorio dibujado'}
            >
              <input
                type="checkbox"
                checked={onlyInZone}
                disabled={!activeTerritoryPaths}
                onChange={(e) => setOnlyInZone(e.target.checked)}
                className="rounded border-input"
              />
              Solo en zona (dentro del territorio dibujado para mi cuerda)
            </label>

            <div className="max-h-[320px] overflow-y-auto border rounded">
              {contactsLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {search ? 'Sin resultados' : 'No hay contactos georreferenciados.'}
                </div>
              ) : (
                filtered.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <div key={c.id} className={`flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleContact(c.id)} className="mt-0.5 cursor-pointer" />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleContact(c.id)}>
                        <div className="text-sm font-medium truncate">
                          {c.first_name} {c.last_name || ''}
                          {c.numero_cuerda && (
                            <span className="ml-2 text-xs text-muted-foreground">· Cuerda {c.numero_cuerda}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.address || 'Sin dirección'}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingContactId(c.id); }}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Editar contacto"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {selectedContacts.length > 0 && (
              <div className="mt-3 p-3 bg-primary/5 rounded border">
                <div className="text-xs font-semibold mb-2 text-muted-foreground">
                  Seleccionados ({selectedContacts.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedContacts.map(c => (
                    <div key={c.id} className="flex items-center gap-1 bg-card border rounded-full pl-3 pr-1 py-0.5 text-xs">
                      <span>{c.first_name} {c.last_name || ''}</span>
                      <button
                        onClick={() => toggleContact(c.id)}
                        className="ml-1 w-4 h-4 rounded-full bg-muted hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center"
                        title="Quitar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => { void onApply(); }} disabled={selectedIds.size === 0 || !startLat} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {hasRoute ? 'Recalcular ruta' : 'Calcular ruta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
