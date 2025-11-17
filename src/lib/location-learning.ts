import { ProcessedAddress } from "@/lib/nominatim-service";

/**
 * Constrói uma chave única para o aprendizado de localização baseada nos campos do endereço.
 * Prioriza campos mais específicos para a chave.
 * @param row O objeto de endereço processado.
 * @returns Uma string única para a chave de aprendizado.
 */
export function buildLearningKey(row: ProcessedAddress): string {
  const street = (row.correctedAddress || row.originalAddress || "").trim();
  const bairro = (row.bairro || "").trim(); // Assumindo que 'bairro' pode vir da planilha original
  const cidade = (row.cidade || "").trim(); // Assumindo que 'cidade' pode vir da planilha original
  const estado = (row.estado || "").trim(); // Assumindo que 'estado' pode vir da planilha original
  const reference = (row.reference || "").trim(); // NEW: Include reference
  // Adicione outros campos relevantes da sua planilha para tornar a chave mais específica, se necessário.
  // Ex: const zip = row.Zipcode || "";

  // Normaliza a chave para evitar problemas com espaços e caracteres especiais
  return `${street}_${bairro}_${cidade}_${estado}_${reference}` // NEW: Include reference in key
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "") // Remove caracteres não alfanuméricos, exceto underscore
    .toLowerCase();
}

interface LearnedLocation {
  lat: number;
  lng: number;
  updatedAt: number;
}

/**
 * Salva uma coordenada corrigida no localStorage para aprendizado futuro.
 * @param key A chave de aprendizado do endereço.
 * @param lat Latitude corrigida.
 * @param lng Longitude corrigida.
 */
export function saveLearnedLocation(key: string, lat: number, lng: number): void {
  try {
    const data = JSON.parse(localStorage.getItem("rotasmart_learning") || "{}");
    data[key] = { lat, lng, updatedAt: Date.now() };
    localStorage.setItem("rotasmart_learning", JSON.stringify(data));
  } catch (error) {
    console.error("Erro ao salvar localização aprendida no localStorage:", error);
  }
}

/**
 * Carrega uma coordenada aprendida do localStorage.
 * @param key A chave de aprendizado do endereço.
 * @returns As coordenadas aprendidas (lat, lng) ou null se não encontradas.
 */
export function loadLearnedLocation(key: string): LearnedLocation | null {
  try {
    const data = JSON.parse(localStorage.getItem("rotasmart_learning") || "{}");
    return data[key] || null;
  } catch (error) {
    console.error("Erro ao carregar localização aprendida do localStorage:", error);
    return null;
  }
}