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
        console.log("useDeviceAuthCheck: No user logged in, skipping device check.");
        return; // Nenhum usuário logado, não há necessidade de verificar o dispositivo
      }

      const userId = user.id;
      const deviceId = localStorage.getItem('rotasmart_device_id');
      const currentPath = window.location.pathname;

      console.log(`useDeviceAuthCheck: Checking device status for user ${userId} on path ${currentPath}`);
      console.log(`useDeviceAuthCheck: Local deviceId from localStorage: ${deviceId}`);

      if (!deviceId) {
        console.warn("useDeviceAuthCheck: No device_id found in localStorage for logged in user. Forcing logout.");
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
        console.error("useDeviceAuthCheck: Error checking device status:", error);
        // Não força o logout em caso de erro, pode ser um problema temporário de rede
        return;
      }

      if (!data) {
        // O registro deste dispositivo foi excluído pela ação "Continuar com esse" de outro dispositivo
        console.log("useDeviceAuthCheck: Device record not found for current device. Forcing logout.");
        await supabase.auth.signOut();
        navigate('/auth');
        toast.info("Sua sessão foi encerrada porque você fez login em outro dispositivo e optou por continuar lá.");
      } else {
        console.log("useDeviceAuthCheck: Device record found. Session is valid.");
      }
    };

    // Executa a verificação na montagem e em mudanças de estado de autenticação (ex: após o login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`useDeviceAuthCheck: Auth state changed: ${event}`);
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        checkDeviceStatus();
      } else if (event === 'SIGNED_OUT') {
        console.log("useDeviceAuthCheck: User signed out. Clearing device_id from localStorage.");
        localStorage.removeItem('rotasmart_device_id');
      }
    });

    // Também executa uma vez na montagem do componente para a verificação inicial
    checkDeviceStatus();

    // Configura uma verificação periódica (ex: a cada 30 segundos) para sessões de longa duração
    const intervalId = setInterval(checkDeviceStatus, 30 * 1000); // Verifica a cada 30 segundos

    return () => {
      console.log("useDeviceAuthCheck: Cleaning up subscription and interval.");
      subscription?.unsubscribe();
      clearInterval(intervalId);
    };
  }, [navigate]);
}