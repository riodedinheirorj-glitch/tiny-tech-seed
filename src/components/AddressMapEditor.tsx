import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
// import "maplibregl/dist/maplibre-gl.css"; // Esta linha foi removida
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MapPin } from "lucide-react";

interface AddressMapEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat: number;
  initialLng: number;
  addressName: string;
  onSave: (lat: number, lng: number) => void;
}

export default function AddressMapEditor({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  addressName,
  onSave,
}: AddressMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!open) {
      // Limpar o mapa ao fechar o dialog
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!mapContainer.current) return;

      if (mapRef.current) {
        mapRef.current.setCenter([initialLng, initialLat]);
        markerRef.current?.setLngLat([initialLng, initialLat]);
        mapRef.current.resize();
      } else {
        mapRef.current = new maplibregl.Map({
          container: mapContainer.current,
          // Alterado para um estilo de mapa mais detalhado (MapTiler Streets)
          // Você precisará de uma chave de API MapTiler.com gratuita para uso em produção.
          // Substitua 'YOUR_MAPTILER_API_KEY' pela sua chave real.
          style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY || 'YOUR_MAPTILER_API_KEY'}`,
          center: [initialLng, initialLat],
          zoom: 15,
        });

        markerRef.current = new maplibregl.Marker({ draggable: true })
          .setLngLat([initialLng, initialLat])
          .addTo(mapRef.current);
        
        mapRef.current.on('load', () => {
          mapRef.current?.resize();
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [open, initialLat, initialLng]);

  const handleSave = () => {
    const lngLat = markerRef.current?.getLngLat();
    if (lngLat) {
      onSave(lngLat.lat, lngLat.lng);
    }
    onOpenChange(false);
  };

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
          <div
            ref={mapContainer}
            className="w-full h-[300px] sm:h-[400px] rounded-lg overflow-hidden border border-primary/30 shadow-lg"
          />
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