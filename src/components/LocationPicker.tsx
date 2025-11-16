import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para ícones do Leaflet no Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Componente para centralizar o mapa
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, 18);
  }, [center, map]);
  
  return null;
}

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (lat: number, lng: number) => void;
}

export function LocationPicker({ initialLat, initialLng, onLocationChange }: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number]>([
    initialLat || -15.7801,
    initialLng || -47.9292,
  ]);
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (initialLat && initialLng) {
      setPosition([initialLat, initialLng]);
    }
  }, [initialLat, initialLng]);

  const handleMarkerDrag = () => {
    const marker = markerRef.current;
    if (marker) {
      const latLng = marker.getLatLng();
      setPosition([latLng.lat, latLng.lng]);
      onLocationChange(latLng.lat, latLng.lng);
    }
  };

  return (
    <div className="w-full h-full">
      <MapContainer
        center={position}
        zoom={18}
        className="w-full h-full rounded-lg"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={position} />
        <Marker
          position={position}
          draggable={true}
          eventHandlers={{
            dragend: handleMarkerDrag,
          }}
          ref={markerRef}
        />
      </MapContainer>
      
      <div className="mt-2 text-sm text-muted-foreground">
        <p>📍 Coordenadas:</p>
        <p className="font-mono">
          Lat: {position[0].toFixed(6)} | Lng: {position[1].toFixed(6)}
        </p>
      </div>
    </div>
  );
}
