import { useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { LatLngExpression, Icon } from 'leaflet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

// Default icon for Leaflet markers
const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

interface AddressMapEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPosition: LatLngExpression;
  addressName: string;
  onSave: (lat: number, lng: number) => void;
}

export default function AddressMapEditor({
  open,
  onOpenChange,
  initialPosition,
  addressName,
  onSave,
}: AddressMapEditorProps) {
  const [position, setPosition] = useState<LatLngExpression>(initialPosition);
  const markerRef = useRef<any>(null);

  // Update internal position state when initialPosition changes (e.g., when a new address is selected)
  useMemo(() => {
    setPosition(initialPosition);
  }, [initialPosition]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          setPosition(marker.getLatLng());
        }
      },
    }),
    [],
  );

  const handleSave = () => {
    if (Array.isArray(position)) {
      onSave(position[0], position[1]);
    } else {
      onSave(position.lat, position.lng);
    }
    onOpenChange(false);
  };

  // Component to handle map clicks and update marker position
  function MapClickHandler() {
    useMapEvents({
      click(e) {
        setPosition(e.latlng);
      },
    });
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] p-0 bg-card/95 backdrop-blur-sm border-2 border-primary/20">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent flex items-center gap-2">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Ajustar Localização
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{addressName}</p>
        </DialogHeader>
        <div className="p-6 pt-4">
          <div className="h-[400px] w-full rounded-lg overflow-hidden border border-primary/30 shadow-lg">
            <MapContainer
              center={position}
              zoom={15}
              scrollWheelZoom={true}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler />
              <Marker
                draggable={true}
                eventHandlers={eventHandlers}
                position={position}
                ref={markerRef}
                icon={defaultIcon}
              />
            </MapContainer>
          </div>
        </div>
        <DialogFooter className="p-6 pt-0 flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90">
            Salvar Localização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}