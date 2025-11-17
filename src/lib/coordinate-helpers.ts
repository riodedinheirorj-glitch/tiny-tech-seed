export function normalizeCoordinate(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  
  const stringValue = String(value).trim().replace(",", ".");
  const num = Number(stringValue);
  
  return isNaN(num) ? undefined : num;
}

/**
 * Extrai o complemento de um endereço formatado como "Rua, Número, Complemento".
 * Retorna o complemento ou uma string vazia se não houver.
 * Ex: "Estrada São Tarcísio, 116, veterinaria apaixonados 4 pata" -> "veterinaria apaixonados 4 pata"
 * Ex: "Rua Exemplo, 123" -> ""
 * @param fullAddress A string completa do endereço.
 * @returns O complemento do endereço.
 */
export function extractAddressComplement(fullAddress: string): string {
  const match = fullAddress.match(/^(.*?),\s*(\d+[a-zA-Z]?)\s*(?:,\s*(.*))?$/);
  if (match && match[3]) {
    return match[3].trim();
  }
  return "";
}

/**
 * Extrai e normaliza o nome da rua e o número da casa de um endereço.
 * Ignora sufixos como 'a', 'b', 'fundos' no número da casa.
 * Ex: "Estrada São Tarcísio, 116, veterinaria" -> "estrada sao tarcisio 116"
 * Ex: "Rua Exemplo, 123a" -> "rua exemplo 123"
 * @param fullAddress A string completa do endereço.
 * @returns Uma string normalizada contendo a rua e o número principal.
 */
export function extractNormalizedStreetAndNumber(fullAddress: string): string {
  if (!fullAddress) return "";

  // Remove complement first to simplify street and number extraction
  const addressWithoutComplement = fullAddress.split(',').slice(0, 2).join(',').trim();

  // Regex para capturar o nome da rua e o número (ignorando sufixos)
  // Ex: "Rua Exemplo, 123a" -> ["Rua Exemplo", "123a"]
  // Ex: "Av. Principal 456" -> ["Av. Principal", "456"]
  const match = addressWithoutComplement.match(/^(.*?),\s*(\d+)([a-zA-Z\s\-\/]*)$/);

  let streetPart = addressWithoutComplement;
  let numberPart = "";

  if (match) {
    streetPart = match[1].trim();
    numberPart = match[2].trim(); // Only the numerical part
  } else {
    // Fallback if comma-separated number not found, try to find a number at the end
    const lastNumberMatch = addressWithoutComplement.match(/^(.*?)\s+(\d+)$/);
    if (lastNumberMatch) {
      streetPart = lastNumberMatch[1].trim();
      numberPart = lastNumberMatch[2].trim();
    }
  }

  // Normalize street part: lowercase, remove accents, common abbreviations
  const normalizedStreet = streetPart
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(av|av\.|avenida)\b/g, "avenida")
    .replace(/\b(r|r\.)\b/g, "rua")
    .replace(/(rod|rod\.|rodovia)\b/g, "rodovia")
    .replace(/[^\w\s]/g, "") // Remove non-alphanumeric except spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();

  // Combine normalized street and number
  return `${normalizedStreet} ${numberPart}`.trim();
}