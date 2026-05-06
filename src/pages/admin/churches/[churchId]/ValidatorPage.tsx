import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, MapPin, Phone, User, Crosshair, ChevronDown, ChevronRight } from 'lucide-react';
import { showSuccess } from '@/utils/toast';
import { isWithinGBA } from '@/lib/geo-validation';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';
import { useSession } from '@/hooks/use-session';

interface Issue {
  id: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  entity: 'contact' | 'cell';
  name: string;
  detail: string;
  entityId: string;
}

const CHECKS = [
  { key: 'contacts_no_coords', label: 'Contactos sin coordenadas', icon: Crosshair, severity: 'error' as const, entity: 'contact' as const },
  { key: 'contacts_bad_coords', label: 'Contactos con coordenadas fuera de zona (GBA)', icon: MapPin, severity: 'error' as const, entity: 'contact' as const },
  { key: 'contacts_no_sexo', label: 'Contactos sin sexo definido', icon: User, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'contacts_no_address', label: 'Contactos sin dirección', icon: MapPin, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'contacts_no_phone', label: 'Contactos sin teléfono', icon: Phone, severity: 'info' as const, entity: 'contact' as const },
  { key: 'contacts_duplicate_phone', label: 'Teléfonos duplicados', icon: Phone, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'cells_no_address', label: 'Células sin dirección', icon: MapPin, severity: 'error' as const, entity: 'cell' as const },
  { key: 'cells_no_coords', label: 'Células con dirección pero sin coordenadas', icon: Crosshair, severity: 'error' as const, entity: 'cell' as const },
];

const ValidatorPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const navigate = useNavigate();
  const { profile } = useSession();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [profileContactId, setProfileContactId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  // Collapsed state per group key. Errors stay expanded by default; warnings
  // and info collapse so the page doesn't dump 130 'sin dirección' rows on
  // first load. User can expand any group by clicking its header.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Cuerda isolation: same rule we apply elsewhere. Below supervisor (referente,
  // encargado, consolidador, conector, anfitrion) only sees data tied to their
  // own cuerda. Supervisor / pastor / general / admin see everything in the
  // church.
  const SUPERVISOR_AND_ABOVE = ['supervisor', 'pastor', 'general', 'admin'];
  const canSeeAllCuerdas = SUPERVISOR_AND_ABOVE.includes(profile?.role || '');
  const userCuerdaNumero = profile?.numero_cuerda || null;

  const runValidation = async () => {
    if (!churchId) return;
    setLoading(true);
    const found: Issue[] = [];

    // For non-globals we filter contacts by numero_cuerda directly (it's a
    // string column on contacts) and cells by cuerda_id (after resolving the
    // user's numero -> cuerda row in this church). If the user has no cuerda
    // and isn't supervisor+, the validator shows nothing — they shouldn't be
    // chasing data outside their lane.
    let userCuerdaIds: string[] | null = null;
    if (!canSeeAllCuerdas) {
      if (!userCuerdaNumero) {
        setIssues([]);
        setLastRun(new Date());
        setLoading(false);
        return;
      }
      const { data: zonasOfChurch } = await supabase.from('zonas').select('id').eq('church_id', churchId);
      const zonaIds = (zonasOfChurch || []).map((z: any) => z.id);
      if (zonaIds.length > 0) {
        const { data: matchingCuerdas } = await supabase.from('cuerdas')
          .select('id').eq('numero', userCuerdaNumero).in('zona_id', zonaIds);
        userCuerdaIds = (matchingCuerdas || []).map((c: any) => c.id);
      } else {
        userCuerdaIds = [];
      }
    }
    // Helper: starts a contacts query already filtered to this church + alive
    // + the caller's cuerda when applicable. Saves repeating the same .eq()
    // chain on every check.
    const contactsBase = () => {
      let q = supabase.from('contacts').select('*').eq('church_id', churchId).is('deleted_at', null);
      if (!canSeeAllCuerdas && userCuerdaNumero) q = q.eq('numero_cuerda', userCuerdaNumero);
      return q;
    };
    const cellsBase = () => {
      let q = supabase.from('cells').select('*').eq('church_id', churchId).is('deleted_at', null);
      if (!canSeeAllCuerdas) {
        if (!userCuerdaIds || userCuerdaIds.length === 0) {
          // No matching cuerda — make the query return nothing.
          q = q.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          q = q.in('cuerda_id', userCuerdaIds);
        }
      }
      return q;
    };

    // 1. Contacts without coordinates (have address but no lat/lng)
    const { data: noCoords } = await contactsBase()
      .not('address', 'is', null)
      .or('lat.is.null,lng.is.null');
    (noCoords || []).filter(c => c.address && c.address.trim()).forEach(c => {
      found.push({ id: `no-coords-${c.id}`, type: 'contacts_no_coords', severity: 'error', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: `Dirección: ${c.address} — sin geolocalización` });
    });

    // 2. Contacts with bad coordinates (outside GBA)
    const { data: allWithCoords } = await contactsBase()
      .not('lat', 'is', null).not('lng', 'is', null);
    (allWithCoords || []).forEach(c => {
      if (!isWithinGBA(c.lat, c.lng)) {
        found.push({ id: `bad-coords-${c.id}`, type: 'contacts_bad_coords', severity: 'error', entity: 'contact', entityId: c.id,
          name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: `Coordenadas (${c.lat?.toFixed(2)}, ${c.lng?.toFixed(2)}) fuera de Buenos Aires` });
      }
    });

    // 3. Contacts without sexo
    const { data: noSexo } = await contactsBase()
      .or('sexo.is.null,sexo.eq.');
    (noSexo || []).forEach(c => {
      found.push({ id: `no-sexo-${c.id}`, type: 'contacts_no_sexo', severity: 'warning', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin sexo — no se puede filtrar por género en la asignación' });
    });

    // 4. Contacts without address
    const { data: noAddr } = await contactsBase()
      .or('address.is.null,address.eq.');
    (noAddr || []).forEach(c => {
      found.push({ id: `no-addr-${c.id}`, type: 'contacts_no_address', severity: 'warning', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin dirección — no se puede calcular proximidad' });
    });

    // 5. Contacts without phone
    const { data: noPhone } = await contactsBase()
      .or('phone.is.null,phone.eq.');
    (noPhone || []).forEach(c => {
      found.push({ id: `no-phone-${c.id}`, type: 'contacts_no_phone', severity: 'info', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin teléfono de contacto' });
    });

    // 6. Duplicate phones
    const { data: allPhones } = await contactsBase()
      .not('phone', 'is', null);
    const phoneCounts = new Map<string, { count: number; contacts: typeof allPhones }>();
    (allPhones || []).forEach(c => {
      if (!c.phone || c.phone.trim().length < 5) return;
      const key = c.phone.replace(/\D/g, '');
      const entry = phoneCounts.get(key) || { count: 0, contacts: [] };
      entry.count++;
      entry.contacts!.push(c);
      phoneCounts.set(key, entry);
    });
    phoneCounts.forEach((v, phone) => {
      if (v.count > 1) {
        v.contacts!.forEach(c => {
          found.push({ id: `dup-phone-${c!.id}`, type: 'contacts_duplicate_phone', severity: 'warning', entity: 'contact', entityId: c!.id,
            name: `${c!.first_name} ${c!.last_name || ''}`.trim(), detail: `Teléfono ${c!.phone} compartido con ${v.count - 1} otro(s)` });
        });
      }
    });

    // 7. Cells without address
    const { data: cellsNoAddr } = await cellsBase()
      .or('address.is.null,address.eq.');
    (cellsNoAddr || []).forEach(c => {
      found.push({ id: `cell-no-addr-${c.id}`, type: 'cells_no_address', severity: 'error', entity: 'cell', entityId: c.id,
        name: c.name, detail: 'Sin dirección — invisible en el mapa y cálculo de proximidad' });
    });

    // 8. Cells with address but no coordinates
    const { data: cellsNoCoords } = await cellsBase()
      .not('address', 'is', null)
      .or('lat.is.null,lng.is.null');
    (cellsNoCoords || []).filter(c => c.address && c.address.trim()).forEach(c => {
      found.push({ id: `cell-no-coords-${c.id}`, type: 'cells_no_coords', severity: 'error', entity: 'cell', entityId: c.id,
        name: c.name, detail: `Dirección: ${c.address} — sin geolocalización` });
    });

    setIssues(found);
    setLastRun(new Date());
    setLoading(false);
  };

  useEffect(() => { runValidation(); }, [churchId, canSeeAllCuerdas, userCuerdaNumero]);

  // Whenever issues change, reset expanded set to just the error groups so
  // the user immediately sees what's broken without scrolling through 130
  // 'sin dirección' rows. Warnings/info collapse — click to expand.
  useEffect(() => {
    const errorKeys = CHECKS.filter(c => c.severity === 'error' && issues.some(i => i.type === c.key)).map(c => c.key);
    setExpandedGroups(new Set(errorKeys));
  }, [issues]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const grouped = CHECKS.map(check => ({
    ...check,
    items: issues.filter(i => i.type === check.key),
  }));

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  const totalIssues = issues.length;

  const [geocodePreview, setGeocodePreview] = useState<{ contactId: string; address: string; lat: number; lng: number; valid: boolean } | null>(null);
  const [geocoding, setGeocoding] = useState<string | null>(null);

  const tryReGeocode = async (contactId: string, address: string) => {
    if (!(window as any).google?.maps) { showError('Google Maps no cargado. Recargá la página.'); return; }
    setGeocoding(contactId);
    setGeocodePreview(null);
    const geocoder = new (window as any).google.maps.Geocoder();
    const searchAddr = `${address}, Buenos Aires, Argentina`;
    geocoder.geocode({ address: searchAddr }, (results: any[], status: string) => {
      setGeocoding(null);
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const lat = results[0].geometry.location.lat();
        const lng = results[0].geometry.location.lng();
        const valid = isWithinGBA(lat, lng);
        setGeocodePreview({ contactId, address: results[0].formatted_address, lat, lng, valid });
      } else {
        showError('No se pudo geocodear esta dirección.');
      }
    });
  };

  const confirmGeocode = async () => {
    if (!geocodePreview) return;
    if (geocodePreview.valid) {
      await supabase.from('contacts').update({ lat: geocodePreview.lat, lng: geocodePreview.lng, address: geocodePreview.address }).eq('id', geocodePreview.contactId);
      showSuccess(`Coordenadas corregidas: ${geocodePreview.address}`);
    } else {
      await supabase.from('contacts').update({ lat: null, lng: null }).eq('id', geocodePreview.contactId);
      showSuccess('Coordenadas eliminadas (fuera de zona). Corregí la dirección manualmente.');
    }
    setGeocodePreview(null);
    runValidation();
  };

  const clearCoords = async (contactId: string) => {
    await supabase.from('contacts').update({ lat: null, lng: null }).eq('id', contactId);
    showSuccess('Coordenadas eliminadas. Editá la dirección manualmente desde el Semillero.');
    runValidation();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Validador de Datos
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Escaneo automático de problemas en contactos y células
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && <span className="text-[10px] text-muted-foreground">Último escaneo: {lastRun.toLocaleTimeString()}</span>}
          <Button size="sm" variant="outline" onClick={runValidation} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Escaneando...' : 'Re-escanear'}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-4 gap-3">
          <div className={`rounded-lg border p-3 ${totalIssues === 0 ? 'border-green-500/30 bg-green-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className={`text-2xl font-bold ${totalIssues === 0 ? 'text-green-500' : 'text-foreground'}`}>{totalIssues}</p>
          </div>
          <div className={`rounded-lg border p-3 ${errorCount > 0 ? 'border-red-500/30 bg-red-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Errores</p>
            <p className={`text-2xl font-bold ${errorCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{errorCount}</p>
          </div>
          <div className={`rounded-lg border p-3 ${warningCount > 0 ? 'border-yellow-500/30 bg-yellow-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Advertencias</p>
            <p className={`text-2xl font-bold ${warningCount > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{warningCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Info</p>
            <p className={`text-2xl font-bold ${infoCount > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>{infoCount}</p>
          </div>
        </div>
      )}

      {/* All green */}
      {!loading && totalIssues === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-500">Todo en orden</p>
          <p className="text-xs text-muted-foreground mt-1">No se encontraron problemas de datos.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Escaneando datos...</p>
        </div>
      )}

      {/* Issue groups — collapsible. Header is always visible (icon + name +
          count + chevron). Body of each group only renders when expanded so
          DOM stays light even when there are 130 rows in a group. Errors
          start expanded; warnings/info start collapsed. */}
      {!loading && grouped.map(group => {
        if (group.items.length === 0) return null;
        const Icon = group.icon;
        const isOpen = expandedGroups.has(group.key);
        const sevColor = group.severity === 'error' ? 'text-red-500 border-red-500/30 bg-red-500/5'
          : group.severity === 'warning' ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5'
          : 'text-blue-400 border-blue-400/30 bg-blue-400/5';
        const badgeColor = group.severity === 'error' ? 'bg-red-500/15 text-red-400'
          : group.severity === 'warning' ? 'bg-yellow-500/15 text-yellow-500'
          : 'bg-blue-400/15 text-blue-400';

        return (
          <div key={group.key} className={`rounded-lg border ${sevColor}`}>
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-foreground/5 transition-colors text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold flex-1 truncate">{group.label}</span>
              <Badge className={`text-[10px] ${badgeColor} shrink-0`}>{group.items.length}</Badge>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-current/20 pt-3">
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded px-3 py-2 bg-background/50 border border-border/50">
                    <div className="min-w-0">
                      <button
                        className="text-sm font-medium text-primary hover:underline text-left"
                        onClick={() => {
                          if (item.entity === 'contact') setProfileContactId(item.entityId);
                          else if (item.entity === 'cell') navigate(`/admin/churches/${churchId}/celulas`);
                        }}
                      >
                        {item.name}
                      </button>
                      <span className="text-[10px] text-muted-foreground ml-2">{item.detail}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.entity === 'contact' && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => navigate(`/admin/churches/${churchId}/pool`)}>
                        Ir al Semillero
                      </Button>
                    )}
                    {item.entity === 'cell' && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => navigate(`/admin/churches/${churchId}/celulas`)}>
                        Ir a Células
                      </Button>
                    )}
                    {item.type === 'contacts_bad_coords' && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={geocoding === item.entityId}
                          onClick={() => tryReGeocode(item.entityId, item.detail.split('fuera')[0].replace('Coordenadas (', '').trim())}>
                          {geocoding === item.entityId ? '...' : 'Re-geocodear'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-400" onClick={() => clearCoords(item.entityId)}>
                          Borrar
                        </Button>
                      </div>
                    )}
                    {item.type === 'contacts_no_coords' && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={geocoding === item.entityId}
                        onClick={() => {
                          const addr = item.detail.replace('Dirección: ', '').replace(' — sin geolocalización', '');
                          tryReGeocode(item.entityId, addr);
                        }}>
                        {geocoding === item.entityId ? '...' : 'Geocodear'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        );
      })}
      {/* Geocode preview */}
      {geocodePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGeocodePreview(null)}>
          <div className="bg-background border rounded-lg p-5 max-w-md w-full mx-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm">Resultado del geocodeo</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Dirección encontrada:</span> {geocodePreview.address}</p>
              <p><span className="text-muted-foreground">Coordenadas:</span> {geocodePreview.lat.toFixed(5)}, {geocodePreview.lng.toFixed(5)}</p>
              <p>
                <span className="text-muted-foreground">Dentro de Buenos Aires:</span>{' '}
                {geocodePreview.valid
                  ? <span className="text-green-500 font-medium">✅ Sí — coordenadas correctas</span>
                  : <span className="text-red-500 font-medium">❌ No — fuera de zona (se borrarán las coordenadas)</span>
                }
              </p>
            </div>
            {geocodePreview.valid && (
              <a href={`https://www.google.com/maps?q=${geocodePreview.lat},${geocodePreview.lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                Ver en Google Maps ↗
              </a>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setGeocodePreview(null)}>Cancelar</Button>
              <Button size="sm" onClick={confirmGeocode}>
                {geocodePreview.valid ? 'Guardar coordenadas' : 'Borrar coordenadas'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Contact profile dialog - opens when clicking a contact name in a validation row */}
      <ContactProfileDialog
        open={!!profileContactId}
        onOpenChange={(o) => { if (!o) { setProfileContactId(null); runValidation(); } }}
        contactId={profileContactId || ''}
        churchId={churchId!}
      />
    </div>
  );
};

export default ValidatorPage;
