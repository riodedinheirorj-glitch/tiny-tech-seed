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