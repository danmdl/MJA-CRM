"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ContactMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  contactAddress: string;
  suggestedCell: {
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    cuerdaNumero?: string;
    meetingDay?: string | null;
    meetingTime?: string | null;
  } | null;
}

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

const loadGoogleMaps = (): Promise<any> => {
  return new Promise((resolve) => {
    if ((window as any).google?.maps) { resolve((window as any).google.maps); return; }
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      const interval = setInterval(() => {
        if ((window as any).google?.maps) { clearInterval(interval); resolve((window as any).google.maps); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    document.head.appendChild(script);
  });
};

const darkStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b0b0b0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const ContactMapDialog = ({ open, onOpenChange, contactName, contactAddress, suggestedCell }: ContactMapDialogProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !contactAddress) return;
    setMapError(null);
    setLoading(true);

    // Wait for dialog to fully render and be visible
    const timer = setTimeout(async () => {
      if (!mapRef.current) { setLoading(false); return; }

      try {
        const gmaps = await loadGoogleMaps();
        const geocoder = new gmaps.Geocoder();

        const biasedAddress = contactAddress.includes('Buenos Aires') ? contactAddress : `${contactAddress}, Buenos Aires, Argentina`;

        geocoder.geocode({ address: biasedAddress, region: 'ar' }, (results: any, status: string) => {
          setLoading(false);
          if (status !== 'OK' || !results?.[0]) {
            setMapError(`No se pudo geocodificar: "${contactAddress}" (${status})`);
            return;
          }
          if (!mapRef.current) return;

          const contactPos = results[0].geometry.location;

          // Clear previous map content
          mapRef.current.innerHTML = '';

          const map = new gmaps.Map(mapRef.current, {
            center: contactPos,
            zoom: 15,
            mapTypeId: 'roadmap',
            styles: darkStyles,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: false,
          });

          // Inject CSS to shrink InfoWindow padding
          const style = document.createElement('style');
          style.textContent = `.gm-style-iw-c { padding: 8px !important; max-width: 240px !important; } .gm-style-iw-d { overflow: hidden !important; } .gm-style-iw-tc { display: none !important; }`;
          mapRef.current.appendChild(style);

          // Force resize after creation
          gmaps.event.trigger(map, 'resize');

          // Blue pin for contact — rendered AFTER cell pin so it appears on top
          const contactMarker = new gmaps.Marker({
            position: contactPos,
            map,
            icon: {
              path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
              fillColor: '#3B82F6',
              fillOpacity: 1,
              strokeColor: '#1E40AF',
              strokeWeight: 1.5,
              scale: 1.8,
              anchor: new gmaps.Point(12, 24),
            },
            title: contactName,
            zIndex: 10,
          });

          // Blue info window for contact
          const contactInfo = new gmaps.InfoWindow({
            maxWidth: 200,
            content: `<div style="font-family:system-ui,sans-serif;padding:0;color:#111;max-width:180px;"><div style="font-size:12px;font-weight:700;color:#1E40AF;">${contactName}</div><div style="font-size:10px;color:#777;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${contactAddress}</div></div>`,
          });
          contactMarker.addListener('click', () => contactInfo.open(map, contactMarker));

          // Gold pin for suggested cell with info window
          if (suggestedCell?.lat && suggestedCell?.lng) {
            const cellPos = { lat: suggestedCell.lat, lng: suggestedCell.lng };

            const cellMarker = new gmaps.Marker({
              position: cellPos,
              map,
              icon: {
                path: 'M12 0C7.6 0 4 3.6 4 8c0 5.4 7.1 13.2 7.4 13.6.3.3.9.3 1.2 0C13 21.2 20 13.4 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z',
                fillColor: '#FFC233',
                fillOpacity: 1,
                strokeColor: '#B8720A',
                strokeWeight: 1.5,
                scale: 1.8,
                anchor: new gmaps.Point(12, 24),
              },
              title: suggestedCell.name,
              zIndex: 5,
            });

            const schedule = [suggestedCell.meetingDay, suggestedCell.meetingTime].filter(Boolean).join(' · ');
            const cellInfo = new gmaps.InfoWindow({
              maxWidth: 220,
              content: `<div style="font-family:system-ui,sans-serif;padding:0;color:#111;max-width:200px;"><div style="font-size:12px;font-weight:700;color:#B8720A;white-space:nowrap;">${suggestedCell.name}${suggestedCell.cuerdaNumero ? ` · #${suggestedCell.cuerdaNumero}` : ''}</div>${schedule ? `<div style="font-size:11px;color:#555;margin-top:1px;">🕐 ${schedule}</div>` : ''}${suggestedCell.address ? `<div style="font-size:10px;color:#777;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${suggestedCell.address}</div>` : ''}</div>`,
            });
            cellInfo.open(map, cellMarker);

            // Fit bounds to show both markers with max zoom cap
            const bounds = new gmaps.LatLngBounds();
            bounds.extend(contactPos);
            bounds.extend(cellPos);
            map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
            // Cap zoom so both pins are always visible even when very close
            const listener = gmaps.event.addListener(map, 'idle', () => {
              if (map.getZoom() > 16) map.setZoom(16);
              gmaps.event.removeListener(listener);
            });
          }
        });
      } catch (e) {
        setLoading(false);
        setMapError(`Error al cargar el mapa: ${e}`);
      }
    }, 500); // Wait 500ms for dialog animation to complete

    return () => clearTimeout(timer);
  }, [open, contactAddress, suggestedCell, contactName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px]">
        <DialogHeader>
          <DialogTitle className="text-base">{contactName}</DialogTitle>
          <DialogDescription className="text-xs">{contactAddress}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <div ref={mapRef} className="w-full rounded-lg overflow-hidden border" style={{ height: '400px' }} />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
              <p className="text-sm text-muted-foreground">Cargando mapa...</p>
            </div>
          )}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
              <p className="text-sm text-red-400 text-center px-4">{mapError}</p>
            </div>
          )}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Contacto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#FFC233] inline-block" /> Célula sugerida
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactMapDialog;
