import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapPin, Locate, Loader2 } from "lucide-react"; // Adicionado Locate e Loader2
import { Button } from "@/components/ui/button"; // Importar Button do shadcn/ui
import { toast } from "sonner"; // Importar toast para feedback

interface AddressMapEditorProps {
  initialLat: number;
  initialLng: number;
  onSave: (coords: { lat: number; lng: number }) => void;
  onClose: () => void;
  addressName: string;
}

export default function AddressMapEditor({
  initialLat,
  initialLng,
  onSave,
  onClose,
  addressName,
}: AddressMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [isLocating, setIsLocating] = useState(false); // Estado para o carregamento do botão

  useEffect(() => {
    if (!mapContainer.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [initialLng, initialLat],
      zoom: 15,
    });

    markerRef.current = new maplibregl.Marker({ draggable: true })
      .setLngLat([initialLng, initialLat])
      .addTo(mapRef.current);

    mapRef.current.on('load', () => {
      mapRef.current?.resize();
    });

    return () => {
      if (mapRef.current) mapRef.current.remove();
    };
  }, [initialLat, initialLng]);

  const handleSave = () => {
    const lngLat = markerRef.current?.getLngLat();
    if (lngLat) {
      onSave({ lat: lngLat.lat, lng: lngLat.lng });
    }
    onClose();
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não é suportada pelo seu navegador.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (mapRef.current && markerRef.current) {
          mapRef.current.setCenter([longitude, latitude]);
          markerRef.current.setLngLat([longitude, latitude]);
          toast.success("Localização atualizada para sua posição GPS!");
        }
        setIsLocating(false);
      },
      (error) => {
        console.error("Erro ao obter localização:", error);
        let errorMessage = "Erro ao obter sua localização.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "Permissão de geolocalização negada. Por favor, permita o acesso à localização nas configurações do seu navegador.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = "Informações de localização indisponíveis.";
        } else if (error.code === error.TIMEOUT) {
          errorMessage = "Tempo limite excedido ao tentar obter a localização.";
        }
        toast.error(errorMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card p-6 rounded-xl w-full max-w-[600px] shadow-xl border border-primary/20">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
          <MapPin className="h-5 w-5 text-primary" />
          Ajustar Localização
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{addressName}</p>

        <div
          ref={mapContainer}
          className="w-full h-[400px] rounded-lg overflow-hidden border border-primary/30 shadow-inner"
        />

        <div className="flex justify-between gap-3 mt-4">
          <Button
            variant="outline"
            onClick={handleLocateMe}
            disabled={isLocating}
            className="flex items-center gap-2"
          >
            {isLocating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Locate className="h-4 w-4" />
            )}
            Minha Localização
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLocating}
            >
              Cancelar
            </Button>

            <Button
              onClick={handleSave}
              disabled={isLocating}
            >
              Salvar Localização
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}