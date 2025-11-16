import { supabase } from "@/integrations/supabase/client";

export interface Delivery {
  id?: string;
  user_id?: string;
  original_address: string;
  corrected_address?: string;
  geocoded_latitude?: number;
  geocoded_longitude?: number;
  confirmed_latitude?: number;
  confirmed_longitude?: number;
  confirmed_at?: string;
  status?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  quadra?: string;
  lote?: string;
  sequence?: string;
  note?: string;
  driver_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProcessedAddress {
  [key: string]: any;
  status?: string;
  latitude?: string | number;
  longitude?: string | number;
}

/**
 * Salva entregas processadas no banco de dados
 */
export async function saveDeliveries(processedData: ProcessedAddress[]): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const deliveries = processedData.map(item => ({
      user_id: user.id,
      original_address: item['endereço'] || item['endereco'] || item['address'] || item['originalAddress'] || '',
      corrected_address: item['correctedAddress'] || item['corrected_address'] || item['endereço corrigido'],
      geocoded_latitude: item.latitude ? Number(item.latitude) : undefined,
      geocoded_longitude: item.longitude ? Number(item.longitude) : undefined,
      status: item.status === 'valid' || item.status === 'corrected' ? 'pending' : 'geocoding_failed',
      bairro: item['bairro'] || item['neighborhood'],
      cidade: item['cidade'] || item['city'],
      estado: item['estado'] || item['state'],
      quadra: item['quadra'] || item['block'],
      lote: item['lote'] || item['lot'],
      sequence: item['sequence'] || item['sequência'] || item['numero'],
    }));

    const { error } = await supabase
      .from('deliveries')
      .insert(deliveries);

    if (error) {
      console.error('Erro ao salvar entregas:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao salvar entregas:', error);
    return { success: false, error: 'Erro desconhecido ao salvar entregas' };
  }
}

/**
 * Atualiza a localização confirmada de uma entrega
 */
export async function updateDeliveryLocation(
  deliveryId: string,
  latitude: number,
  longitude: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('deliveries')
      .update({
        confirmed_latitude: latitude,
        confirmed_longitude: longitude,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed',
      })
      .eq('id', deliveryId);

    if (error) {
      console.error('Erro ao atualizar localização:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar localização:', error);
    return { success: false, error: 'Erro desconhecido ao atualizar localização' };
  }
}

/**
 * Busca todas as entregas do usuário
 */
export async function getDeliveries(status?: string): Promise<{ data: Delivery[] | null; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { data: null, error: "Usuário não autenticado" };
    }

    let query = supabase
      .from('deliveries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar entregas:', error);
      return { data: null, error: error.message };
    }

    return { data };
  } catch (error) {
    console.error('Erro ao buscar entregas:', error);
    return { data: null, error: 'Erro desconhecido ao buscar entregas' };
  }
}

/**
 * Busca uma entrega específica por ID
 */
export async function getDeliveryById(deliveryId: string): Promise<{ data: Delivery | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (error) {
      console.error('Erro ao buscar entrega:', error);
      return { data: null, error: error.message };
    }

    return { data };
  } catch (error) {
    console.error('Erro ao buscar entrega:', error);
    return { data: null, error: 'Erro desconhecido ao buscar entrega' };
  }
}

/**
 * Calcula a distância entre duas coordenadas usando a fórmula de Haversine
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distância em metros
}
