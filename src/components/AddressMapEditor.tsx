import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibregl/dist/maplibre-gl.css"; // Re-adicionado conforme instrução do usuário
import { MapPin } from "lucide-react"; // Mantido para o ícone no título

interface AddressMapEditorProps {
  initialLat: number;
  initialLng: number;
  onSave: (coords: { lat: number; lng: number }) => void;
  onClose: () => void;
  addressName: string; // Adicionado de volta para melhor UX
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

  useEffect(() => {
    if (!mapContainer.current) return;

    // Limpar mapa existente antes de criar um novo (importante para re-renderizações)
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }

    // Criar mapa sem API
    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [initialLng, initialLat],
      zoom: 15,
    });

    // Adicionar marcador arrastável
    markerRef.current = new maplibregl.Marker({ draggable: true })
      .setLngLat([initialLng, initialLat])
      .addTo(mapRef.current);

    // Garantir que o mapa redimensione corretamente
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
    onClose(); // Fechar o editor após salvar
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card p-6 rounded-xl w-full max-w-[600px] shadow-xl border border-primary/20">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
          <MapPin className="h-5 w-5 text-primary" />
          Ajustar Localização
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{addressName}</p>

        {/* Container do mapa */}
        <div
          ref={mapContainer}
          className="w-full h-[400px] rounded-lg overflow-hidden border border-primary/30 shadow-inner"
        />

        {/* Botões */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            className="px-4 py-2 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={handleSave}
          >
            Salvar Localização
          </button>
        </div>
      </div>
    </div>
  );
}