import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
    if (!open || !mapContainer.current) return;

    // Se o mapa já existe, apenas atualize a posição e o marcador
    if (mapRef.current) {
      mapRef.current.setCenter([initialLng, initialLat]);
      markerRef.current?.setLngLat([initialLng, initialLat]);
      mapRef.current.resize(); // Garante que o mapa se ajuste ao tamanho do dialog
      return;
    }

    // Criar mapa
    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [initialLng, initialLat],
      zoom: 15,
    });

    // Adicionar marcador arrastável
    markerRef.current = new maplibregl.Marker({ draggable: true })
      .setLngLat([initialLng, initialLat])
      .addTo(mapRef.current);

    // Limpar o mapa ao desmontar o componente ou fechar o dialog
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
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