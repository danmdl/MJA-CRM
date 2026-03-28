import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface Suggestion {
  description: string;
  place_id: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  disabled?: boolean;
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

let googleScriptLoaded = false;
const loadGoogleMaps = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).google?.maps?.places) { resolve(); return; }
    if (googleScriptLoaded) {
      const interval = setInterval(() => {
        if ((window as any).google?.maps?.places) { clearInterval(interval); resolve(); }
      }, 100);
      return;
    }
    googleScriptLoaded = true;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
};

const AddressAutocomplete = ({
  value,
  onChange,
  placeholder = 'Escribe la dirección...',
  disabled = false,
}: AddressAutocompleteProps) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!GOOGLE_API_KEY) return;
    loadGoogleMaps().then(() => {
      autocompleteServiceRef.current = new (window as any).google.maps.places.AutocompleteService();
      geocoderRef.current = new (window as any).google.maps.Geocoder();
      setReady(true);
    });
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3 || !autocompleteServiceRef.current) {
      setSuggestions([]); setOpen(false); return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      autocompleteServiceRef.current.getPlacePredictions(
        { input: q, componentRestrictions: { country: 'ar' }, types: ['address'] },
        (predictions: any[], status: string) => {
          setLoading(false);
          if (status === 'OK' && predictions) {
            setSuggestions(predictions.map(p => ({ description: p.description, place_id: p.place_id })));
            setOpen(true);
          } else {
            setSuggestions([]); setOpen(false);
          }
        }
      );
    }, 300);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    search(e.target.value);
  };

  const handleSelect = (suggestion: Suggestion) => {
    setQuery(suggestion.description);
    onChange(suggestion.description);
    setSuggestions([]); setOpen(false);
    if (geocoderRef.current) {
      geocoderRef.current.geocode(
        { placeId: suggestion.place_id },
        (results: any[], status: string) => {
          if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            onChange(suggestion.description, loc.lat(), loc.lng());
          }
        }
      );
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!GOOGLE_API_KEY) {
    return (
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <Input
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled || !ready}
        style={{ paddingRight: '2rem' }}
      />
      <div style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted-foreground)' }}>
        {loading ? <Loader2 style={{ width: '0.875rem', height: '0.875rem', animation: 'spin 1s linear infinite' }} /> : <MapPin style={{ width: '0.875rem', height: '0.875rem' }} />}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 9999, backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: '0.875rem',
                background: 'none',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                color: 'var(--popover-foreground)',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
            >
              <MapPin style={{ width: '0.875rem', height: '0.875rem', marginTop: '2px', flexShrink: 0, color: 'var(--primary)' }} />
              <span>{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
