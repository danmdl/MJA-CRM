"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, Loader2, MapPin, Phone, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { normalize } from '@/lib/normalize';
import ContactProfileDialog from './ContactProfileDialog';

interface SearchResult {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  numero_cuerda: string | null;
  church_id: string;
  church_name: string | null;
}

interface GlobalContactSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Roles that see contacts across cuerdas. Below supervisor only sees their
// own cuerda — same isolation rule that runs through the rest of the app.
const SUPERVISOR_AND_ABOVE = ['supervisor', 'pastor', 'general', 'admin'];

const GlobalContactSearch = ({ open, onOpenChange }: GlobalContactSearchProps) => {
  const { profile } = useSession();
  const { canAccessAllChurches } = usePermissions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [selected, setSelected] = useState<{ id: string; church_id: string } | null>(null);

  const canSeeAllCuerdas = SUPERVISOR_AND_ABOVE.includes(profile?.role || '');
  const canSeeAllChurches = canAccessAllChurches();
  const userCuerdaNumero = profile?.numero_cuerda || null;

  // Reset query and focus input on open. Without focusing here the user has
  // to click the input after Cmd+K, which defeats the keyboard shortcut.
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setHighlightedIdx(0);
      // tiny delay so the dialog has actually mounted before we try to focus
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounce the search query — 180ms feels responsive without flooding the
  // db on every keystroke. Anything under 2 chars short-circuits to no
  // results, mostly to avoid returning the entire contact base for "j".
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ['global-contact-search', debouncedQuery, profile?.id, canSeeAllCuerdas, canSeeAllChurches],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      // search_name is the accent-stripped + lowercased version of
      // first_name + last_name kept in sync by trigger (migration 0033).
      // Normalize the query the same way and match against that column
      // so "maría", "María" and "maria" all hit the same rows.
      // Phone is stored verbatim (with dashes / spaces sometimes) so
      // the match is fuzzy on that too. Limit 20 keeps the UI
      // responsive — if the user wants more they should refine the term.
      // PostgREST .or() takes a raw filter string and treats commas /
      // parens / dots as syntax. Without escaping, a query like
      // "foo,is_admin.eq.true" or "foo)),first_name.ilike.%a%" would
      // mutate the filter and let an attacker compose additional
      // clauses inside the OR group. Strip those characters from
      // anything that goes through .or(); they have no useful meaning
      // for a name / phone search anyway. SQL injection-equivalent
      // for this layer.
      const safeForOr = (s: string) => s.replace(/[,()*]/g, '').replace(/%/g, '');
      const normalizedQuery = safeForOr(normalize(debouncedQuery));
      const safePhone = safeForOr(debouncedQuery);
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, numero_cuerda, church_id, churches!inner(name)')
        .is('deleted_at', null)
        .or(`search_name.ilike.%${normalizedQuery}%,phone.ilike.%${safePhone}%`)
        .limit(20);
      // Below-supervisor: only own cuerda. If the user has no cuerda set
      // they shouldn't be searching at all — return empty to avoid leaking.
      if (!canSeeAllCuerdas) {
        if (!userCuerdaNumero) return [];
        q = q.eq('numero_cuerda', userCuerdaNumero);
      }
      // Below admin/general: only own church.
      if (!canSeeAllChurches && profile?.church_id) {
        q = q.eq('church_id', profile.church_id);
      }
      const { data, error } = await q;
      if (error) { console.error('global search failed', error); return []; }
      return (data || []).map((r: any) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        numero_cuerda: r.numero_cuerda,
        church_id: r.church_id,
        church_name: r.churches?.name || null,
      }));
    },
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Reset highlight when results change so arrow keys start from the top.
  useEffect(() => { setHighlightedIdx(0); }, [results]);

  const pick = (r: SearchResult) => {
    setSelected({ id: r.id, church_id: r.church_id });
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(idx => Math.min(idx + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(idx => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlightedIdx];
      if (r) pick(r);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Buscar contactos</DialogTitle>
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar por nombre o teléfono..."
              className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
            />
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
            <kbd className="hidden sm:inline px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border border-border">esc</kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {debouncedQuery.length < 2 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Escribí al menos 2 caracteres para buscar.
                <p className="text-[10px] mt-2">Tip: <kbd className="px-1 py-0.5 rounded text-[10px] bg-muted border border-border">Ctrl/Cmd + K</kbd> abre este buscador desde cualquier página.</p>
              </div>
            ) : results.length === 0 && !isFetching ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Sin resultados para "{debouncedQuery}".
              </div>
            ) : (
              <ul className="py-1">
                {results.map((r, idx) => {
                  const isHl = idx === highlightedIdx;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => pick(r)}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 ${isHl ? 'bg-muted/60' : 'hover:bg-muted/30'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {r.first_name} {r.last_name || ''}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                            {r.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {r.phone}
                              </span>
                            )}
                            {r.numero_cuerda && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Cuerda {r.numero_cuerda}
                              </span>
                            )}
                            {canSeeAllChurches && r.church_name && (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" /> {r.church_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Result dialog — opens after picking. Uses the contact's own
          church_id so the profile loads correctly even if the user is
          searching across churches. */}
      {selected && (
        <ContactProfileDialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          contactId={selected.id}
          churchId={selected.church_id}
        />
      )}
    </>
  );
};

export default GlobalContactSearch;
