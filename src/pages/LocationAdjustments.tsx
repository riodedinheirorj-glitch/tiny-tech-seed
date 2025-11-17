import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Edit, ArrowLeft, CheckCircle2 } from "lucide-react";
import { ProcessedAddress } from "@/lib/nominatim-service";
import AddressMapEditor from "@/components/AddressMapEditor";
import { LatLngExpression } from "leaflet";
import { toast } from "sonner";

interface LocationAdjustmentsState {
  initialProcessedData: ProcessedAddress[];
}

export default function LocationAdjustments() {
  console.log("LocationAdjustments component rendered."); // LOG ADDED
  const navigate = useNavigate();
  const location = useLocation();
  const { initialProcessedData } = (location.state || {}) as LocationAdjustmentsState;

  console.log("location.state:", location.state); // LOG ADDED
  console.log("initialProcessedData:", initialProcessedData); // LOG ADDED

  const [addresses, setAddresses] = useState<ProcessedAddress[]>(initialProcessedData || []);
  const [isMapEditorOpen, setIsMapEditorOpen] = useState(false);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!initialProcessedData || initialProcessedData.length === 0) {
      toast.error("Nenhum dado de endereço para ajustar. Por favor, faça o upload de uma planilha.");
      navigate("/"); // Redirect if no data
    }
  }, [initialProcessedData, navigate]);

  const handleAdjustClick = (index: number) => {
    setSelectedAddressIndex(index);
    setIsMapEditorOpen(true);
  };

  const handleSaveLocation = (lat: number, lng: number) => {
    if (selectedAddressIndex !== null) {
      setAddresses((prevAddresses) => {
        const newAddresses = [...prevAddresses];
        newAddresses[selectedAddressIndex] = {
          ...newAddresses[selectedAddressIndex],
          latitude: lat.toFixed(6), // Format to 6 decimal places
          longitude: lng.toFixed(6), // Format to 6 decimal places
          status: 'corrected', // Mark as manually corrected
          note: 'Ajustado manualmente no mapa',
        };
        return newAddresses;
      });
      toast.success("Localização atualizada com sucesso!");
    }
  };

  const handleFinishAdjustments = () => {
    navigate("/", { state: { adjustedData: addresses, fromAdjustments: true } });
  };

  const currentAddress = selectedAddressIndex !== null ? addresses[selectedAddressIndex] : null;
  const initialMapPosition: LatLngExpression = currentAddress?.latitude && currentAddress?.longitude
    ? [parseFloat(currentAddress.latitude), parseFloat(currentAddress.longitude)]
    : [-23.55052, -46.633309]; // Default to São Paulo if no coords

  // Get all unique column names from the data, including new ones
  const allColumns = Array.from(new Set(addresses.flatMap(row => Object.keys(row))));

  // Function to translate column names
  const translateColumnName = (col: string): string => {
    const translations: {
      [key: string]: string;
    } = {
      'originalAddress': 'Endereço Original',
      'correctedAddress': 'Endereço Corrigido',
      'latitude': 'Latitude',
      'longitude': 'Longitude',
      'status': 'Status',
      'Destination Address': 'Endereço do Cliente',
      'Sequence': 'Identificação do Pacote',
      'sequence': 'Identificação do Pacote',
      'Address': 'Endereço do Cliente',
      'address': 'Endereço do Cliente'
    };
    return translations[col] || col;
  };

  // Filter and sort columns for display in the table
  const columnsToShow = ['correctedAddress', 'latitude', 'longitude', 'status'];

  if (!initialProcessedData || initialProcessedData.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando dados de ajuste...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate("/")} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent text-center">
            Ajuste de Localização
          </h1>
          <Button
            onClick={handleFinishAdjustments}
            className="bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Finalizar e Exportar
          </Button>
        </div>

        <Card className="p-4 sm:p-6 border-2 border-primary/30 bg-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-semibold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent flex items-center justify-center gap-2">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Endereços para Ajuste
            </h3>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Clique em "Ajustar no mapa" para refinar as coordenadas de cada endereço.
            </p>
          </div>

          <ScrollArea className="h-[400px] rounded-md border border-primary/30 bg-card/30 mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  {columnsToShow.map((col, idx) => (
                    <TableHead key={idx} className="text-xs sm:text-sm whitespace-nowrap">
                      {translateColumnName(col)}
                    </TableHead>
                  ))}
                  <TableHead className="text-xs sm:text-sm whitespace-nowrap text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addresses.map((address, index) => (
                  <TableRow key={index} className={address.status === 'pending' ? 'bg-red-900/20 hover:bg-red-900/30' : ''}>
                    {columnsToShow.map((col, colIndex) => (
                      <TableCell key={colIndex} className="text-xs sm:text-sm whitespace-nowrap">
                        {col === 'status' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            address.status === 'valid' ? 'bg-green-500/20 text-green-400' :
                            address.status === 'corrected' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {address.status === 'valid' ? 'Válido' :
                             address.status === 'corrected' ? 'Corrigido' :
                             'Pendente'}
                          </span>
                        ) : (
                          String(address[col as keyof ProcessedAddress] ?? '')
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAdjustClick(index)}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>

      {currentAddress && (
        <AddressMapEditor
          open={isMapEditorOpen}
          onOpenChange={setIsMapEditorOpen}
          initialPosition={initialMapPosition}
          addressName={currentAddress.correctedAddress || currentAddress.originalAddress || "Endereço"}
          onSave={handleSaveLocation}
        />
      )}
    </div>
  );
}