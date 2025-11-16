import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocationPicker } from './LocationPicker';
import { updateDeliveryLocation, calculateDistance } from '@/lib/delivery-helpers';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface MarkLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId?: string;
  address: string;
  initialLat?: number;
  initialLng?: number;
  geocodedLat?: number;
  geocodedLng?: number;
  onLocationConfirmed?: () => void;
}

export function MarkLocationDialog({
  open,
  onOpenChange,
  deliveryId,
  address,
  initialLat,
  initialLng,
  geocodedLat,
  geocodedLng,
  onLocationConfirmed,
}: MarkLocationDialogProps) {
  const [currentLat, setCurrentLat] = useState<number | undefined>(initialLat);
  const [currentLng, setCurrentLng] = useState<number | undefined>(initialLng);
  const [hasMovedMarker, setHasMovedMarker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentLat(initialLat);
    setCurrentLng(initialLng);
    setHasMovedMarker(false);
  }, [initialLat, initialLng, open]);

  const handleLocationChange = (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
    setHasMovedMarker(true);
  };

  const handleConfirm = async () => {
    if (!deliveryId || !currentLat || !currentLng) {
      toast.error('Dados inválidos para confirmar localização');
      return;
    }

    // Verificar distância se houver coordenadas geocodificadas
    if (geocodedLat && geocodedLng) {
      const distance = calculateDistance(geocodedLat, geocodedLng, currentLat, currentLng);
      
      if (distance > 400) {
        const distanceKm = (distance / 1000).toFixed(2);
        toast.warning(
          `A localização marcada está a ${distanceKm} km do endereço original. Tem certeza?`,
          {
            duration: 5000,
          }
        );
      }
    }

    setIsSaving(true);
    const result = await updateDeliveryLocation(deliveryId, currentLat, currentLng);
    setIsSaving(false);

    if (result.success) {
      toast.success('✔ Localização salva com sucesso');
      onLocationConfirmed?.();
      onOpenChange(false);
    } else {
      toast.error(`Erro ao salvar localização: ${result.error}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] md:h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📍 Marcar Local Exato
          </DialogTitle>
          <DialogDescription>
            Arraste o marcador para o local correto da entrega.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
            <strong>Endereço:</strong> {address}
          </div>
          
          <div className="flex-1 min-h-0">
            <LocationPicker
              initialLat={currentLat || geocodedLat}
              initialLng={currentLng || geocodedLng}
              onLocationChange={handleLocationChange}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasMovedMarker || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
