"use client";
import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!open || !mapRef.current || !contactAddress) return;

    const initMap = async () => {
      const gmaps = await loadGoogleMaps();
      const geocoder = new gmaps.Geocoder();

      // Geocode the contact address
      const biasedAddress = contactAddress.includes('Buenos Aires') ? contactAddress : `${contactAddress}, Buenos Aires, Argentina`;
      
      geocoder.geocode({ address: biasedAddress, region: 'ar' }, (results: any, status: string) => {
        if (status !== 'OK' || !results?.[0]) return;

        const contactPos = results[0].geometry.location;

        const map = new gmaps.Map(mapRef.current, {
          center: contactPos,
          zoom: 15,
          mapTypeId: 'roadmap',
          styles: darkStyles,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: false,
        });

        // Blue pin for contact
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
        });

        // Info window for contact (open by default)
        const contactInfo = new gmaps.InfoWindow({
          content: `
            <div style="font-family:system-ui,sans-serif;padding:2px 0;color:#111;">
              <div style="font-size:13px;font-weight:700;color:#3B82F6;">📍 ${contactName}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">${contactAddress}</div>
            </div>
          `,
        });
        contactInfo.open(map, contactMarker);

        // Gold pin for suggested cell
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
          });

          const cellInfo = new gmaps.InfoWindow({
            content: `
              <div style="font-family:system-ui,sans-serif;padding:2px 0;color:#111;">
                <div style="font-size:13px;font-weight:700;color:#B8720A;">🏠 Célula sugerida</div>
                <div style="font-size:12px;font-weight:600;margin-top:2px;">${suggestedCell.name}${suggestedCell.cuerdaNumero ? ` · #${suggestedCell.cuerdaNumero}` : ''}</div>
                ${suggestedCell.address ? `<div style="font-size:11px;color:#555;margin-top:2px;">${suggestedCell.address}</div>` : ''}
              </div>
            `,
          });
          cellInfo.open(map, cellMarker);

          // Fit bounds to show both markers
          const bounds = new gmaps.LatLngBounds();
          bounds.extend(contactPos);
          bounds.extend(cellPos);
          map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
        }
      });
    };

    // Small delay to let dialog render
    const timer = setTimeout(initMap, 200);
    return () => clearTimeout(timer);
  }, [open, contactAddress, suggestedCell]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="text-base">{contactName}</DialogTitle>
          <DialogDescription className="text-xs">{contactAddress}</DialogDescription>
        </DialogHeader>
        <div ref={mapRef} className="w-full rounded-lg overflow-hidden border" style={{ height: '400px' }} />
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
