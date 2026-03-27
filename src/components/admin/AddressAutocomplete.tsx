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

// Load Google Maps script once
let googleScriptLoaded = false;
const loadGoogleMaps = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).google?.maps?.places) { resolve(); return; }
    if (googleScriptLoaded) {
      // Already loading — wait for it
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
        {
          input: q,
          componentRestrictions: { country: 'ar' },
          types: ['address'],
        },
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

    // Geocode to get lat/lng
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

  // Fallback if no API key configured
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
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled || !ready}
          className="pr-8"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        </div>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
              onClick={() => handleSelect(s)}
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
