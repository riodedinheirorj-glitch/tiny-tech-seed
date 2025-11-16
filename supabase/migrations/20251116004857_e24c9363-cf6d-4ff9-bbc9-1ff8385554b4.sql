-- Criar tabela de entregas com suporte a coordenadas confirmadas
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados originais do endereço
  original_address text NOT NULL,
  corrected_address text,
  
  -- Coordenadas da geocodificação automática
  geocoded_latitude numeric(10, 8),
  geocoded_longitude numeric(11, 8),
  
  -- Coordenadas confirmadas manualmente pelo motorista
  confirmed_latitude numeric(10, 8),
  confirmed_longitude numeric(11, 8),
  confirmed_at timestamp with time zone,
  
  -- Status e metadados
  status text DEFAULT 'pending',
  bairro text,
  cidade text,
  estado text,
  quadra text,
  lote text,
  sequence text,
  
  -- Notas e observações
  note text,
  driver_notes text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_deliveries_user_id ON public.deliveries(user_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_confirmed_coords ON public.deliveries(confirmed_latitude, confirmed_longitude) WHERE confirmed_latitude IS NOT NULL;

-- Habilitar RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own deliveries"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deliveries"
  ON public.deliveries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deliveries"
  ON public.deliveries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deliveries"
  ON public.deliveries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at (reutilizando função existente)
CREATE TRIGGER update_deliveries_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();