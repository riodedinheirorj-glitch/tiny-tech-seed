import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function useDeviceAuthCheck() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkDeviceStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return; // Nenhum usuário logado, não há necessidade de verificar o dispositivo
      }

      const userId = user.id;
      const deviceId = localStorage.getItem('rotasmart_device_id');

      if (!deviceId) {
        // Este dispositivo não tem um device_id, o que é inesperado se estiver logado.
        // Força o logout para garantir a segurança.
        console.warn("Nenhum device_id encontrado no localStorage para o usuário logado. Forçando logout.");
        await supabase.auth.signOut();
        navigate('/auth');
        toast.error("Sua sessão foi encerrada por segurança. Por favor, faça login novamente.");
        return;
      }

      // Verifica se este device_id ainda está registrado para este usuário
      const { data, error } = await supabase
        .from('user_devices')
        .select('id')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao verificar o status do dispositivo:", error);
        // Não força o logout em caso de erro, pode ser um problema temporário de rede
        return;
      }

      if (!data) {
        // O registro deste dispositivo foi excluído pela ação "Continuar com esse" de outro dispositivo
        console.log("Registro do dispositivo não encontrado. Forçando logout.");
        await supabase.auth.signOut();
        navigate('/auth');
        toast.info("Sua sessão foi encerrada porque você fez login em outro dispositivo e optou por continuar lá.");
      }
    };

    // Executa a verificação na montagem e em mudanças de estado de autenticação (ex: após o login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        checkDeviceStatus();
      } else if (event === 'SIGNED_OUT') {
        // Limpa o ID do dispositivo ao sair
        localStorage.removeItem('rotasmart_device_id');
      }
    });

    // Também executa uma vez na montagem do componente para a verificação inicial
    checkDeviceStatus();

    // Configura uma verificação periódica (ex: a cada 30 segundos) para sessões de longa duração
    const intervalId = setInterval(checkDeviceStatus, 30 * 1000); // Verifica a cada 30 segundos

    return () => {
      subscription?.unsubscribe();
      clearInterval(intervalId);
    };
  }, [navigate]);
}