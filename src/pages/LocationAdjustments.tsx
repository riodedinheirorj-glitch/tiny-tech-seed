import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Edit, ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { ProcessedAddress } from "@/lib/nominatim-service";
import AddressMapEditor from "@/components/AddressMapEditor";
import { toast } from "sonner";
import { buildLearningKey, saveLearnedLocation } from "@/lib/location-learning";
import { useIsMobile } from "@/hooks/use-mobile"; // Importar o hook useIsMobile

interface LocationAdjustmentsState {
  initialProcessedData: ProcessedAddress[];
  totalOriginalSequences: number; // Adicionado para passar o total de pacotes
}

export default function LocationAdjustments() {
  const navigate = useNavigate();
  const location = useLocation();
  const { initialProcessedData, totalOriginalSequences } = (location.state || {}) as LocationAdjustmentsState;

  const [addresses, setAddresses] = useState<ProcessedAddress[]>(initialProcessedData || []);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | null>(null);
  const isMobile = useIsMobile(); // Usar o hook para detectar mobile

  useEffect(() => {
    if (!initialProcessedData || initialProcessedData.length === 0) {
      toast.error("Nenhum dado de endereço para ajustar. Por favor, faça o upload de uma planilha.");
      navigate("/"); // Redirect if no data
    }
  }, [initialProcessedData, navigate]);

  const handleAdjustClick = (index: number) => {
    setSelectedAddressIndex(index);
    const addressToEdit = addresses[index];
    const lat = addressToEdit?.latitude ? parseFloat(addressToEdit.latitude) : -23.55052;
    const lng = addressToEdit?.longitude ? parseFloat(addressToEdit.longitude) : -46.633309;
    
    console.log(`Opening map editor for index ${index}:`);
    console.log(`  Address: ${addressToEdit.correctedAddress || addressToEdit.originalAddress}`);
    console.log(`  Original Lat/Lng: ${addressToEdit.latitude}, ${addressToEdit.longitude}`);
    console.log(`  Map Initial Lat/Lng: ${lat}, ${lng}`);

    if (!addressToEdit.latitude || !addressToEdit.longitude) {
      toast.info("Coordenadas não encontradas para este endereço. O mapa será centralizado em São Paulo. Arraste o marcador para a localização correta.");
    }
  };

  const handleSaveLocation = (coords: { lat: number; lng: number }) => {
    if (selectedAddressIndex !== null) {
      setAddresses((prevAddresses) => {
        const newAddresses = [...prevAddresses];
        const updatedAddress = {
          ...newAddresses[selectedAddressIndex],
          latitude: coords.lat.toFixed(6), // Formatar para 6 casas decimais
          longitude: coords.lng.toFixed(6), // Formatar para 6 casas decimais
          status: 'corrected', // Marcar como corrigido manualmente
          note: 'Ajustado manualmente no mapa',
          learned: true, // Marcar como aprendido
        };
        newAddresses[selectedAddressIndex] = updatedAddress;

        // Salvar no aprendizado automático
        const learningKey = buildLearningKey(updatedAddress);
        saveLearnedLocation(learningKey, coords.lat, coords.lng);

        return newAddresses;
      });
      toast.success("Localização atualizada com sucesso e aprendida para uso futuro!");
    }
    setSelectedAddressIndex(null); // Fechar o editor após salvar
  };

  const handleCloseEditor = () => {
    setSelectedAddressIndex(null); // Fechar o editor sem salvar
  };

  const handleFinishAdjustments = () => {
    navigate("/", { state: { adjustedData: addresses, fromAdjustments: true, totalOriginalSequences: totalOriginalSequences } });
  };

  const currentAddress = selectedAddressIndex !== null ? addresses[selectedAddressIndex] : null;
  const initialMapLat = currentAddress?.latitude ? parseFloat(currentAddress.latitude) : -23.55052; // Padrão para São Paulo
  const initialMapLng = currentAddress?.longitude ? parseFloat(currentAddress.longitude) : -46.633309; // Padrão para São Paulo

  // Função para traduzir nomes de colunas
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
      'address': 'Endereço do Cliente',
      'reference': 'Referência', // NEW: Add translation for reference
    };
    return translations[col] || col;
  };

  // Filtrar e ordenar colunas para exibição na tabela, condicionalmente para mobile
  const baseColumns = ['correctedAddress', 'reference', 'status']; // NEW: Include reference
  const desktopColumns = ['latitude', 'longitude'];

  const columnsToShow = isMobile ? baseColumns : [...baseColumns, ...desktopColumns];

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
        <div className="flex flex-col sm:flex-row items-center sm:justify-between mb-6 gap-4">
          <Button variant="outline" onClick={() => navigate("/")} className="flex items-center gap-2 w-full sm:w-auto" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent text-center">
            Ajuste de Localização
          </h1>
          <Button
            onClick={handleFinishAdjustments}
            className="bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90 flex items-center gap-2 w-full sm:w-auto"
            size="sm"
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
                    <TableHead key={idx} className="text-xs sm:text-sm">
                      {translateColumnName(col)}
                    </TableHead>
                  ))}
                  <TableHead className="text-xs sm:text-sm text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addresses.map((address, index) => (
                  <TableRow key={index} className={address.status === 'pending' ? 'bg-red-900/20 hover:bg-red-900/30' : ''}>
                    {columnsToShow.map((col, colIndex) => (
                      <TableCell 
                        key={colIndex} 
                        className={`text-xs sm:text-sm ${
                          col === 'correctedAddress' ? 'max-w-[100px] truncate' : // Ajustado max-w para mobile
                          (col === 'latitude' || col === 'longitude') ? 'w-[60px]' : // Largura fixa para lat/lng
                          col === 'status' ? 'w-[60px]' : '' // Largura fixa para status
                        }`} 
                      >
                        {col === 'status' ? (
                          <span className={`inline-flex items-center px-1 py-0.5 rounded-full text-[10px] font-medium ${ // Menor texto para o badge de status
                            address.status === 'valid' ? 'bg-green-500/20 text-green-400' :
                            address.status === 'corrected' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {address.status === 'valid' ? 'Válido' :
                             address.status === 'corrected' ? 'Corrigido' :
                             'Pendente'}
                             {address.learned && <Sparkles className="ml-0.5 h-2.5 w-2.5 text-yellow-400" />} {/* Menor ícone de sparkles */}
                          </span>
                        ) : (
                          String(address[col as keyof ProcessedAddress] ?? '')
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right w-[50px] sm:w-[80px]"> {/* Largura fixa para ações */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAdjustClick(index)}
                        className="h-7 w-7 p-0" // Garante que o botão seja pequeno
                      >
                        <Edit className="h-3 w-3" /> {/* Ícone menor */}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>

      {/* Renderiza o AddressMapEditor condicionalmente */}
      {selectedAddressIndex !== null && currentAddress && (
        <AddressMapEditor
          initialLat={initialMapLat}
          initialLng={initialMapLng}
          addressName={currentAddress.correctedAddress || currentAddress.originalAddress || "Endereço"}
          onSave={handleSaveLocation}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
}