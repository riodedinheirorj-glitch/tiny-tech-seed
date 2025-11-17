import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock } from "lucide-react";

interface MultipleDeviceLoginWarningProps {
  open: boolean;
  onClose: () => void;
}

export function MultipleDeviceLoginWarning({ open, onClose }: MultipleDeviceLoginWarningProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <AlertTriangle className="h-16 w-16 text-orange-500 animate-pulse-glow" />
          </div>
          <DialogTitle className="text-center text-2xl text-orange-400">
            Alerta de Segurança!
          </DialogTitle>
          <DialogDescription className="text-center text-base pt-4 space-y-3">
            <p className="text-lg font-semibold text-foreground">
              Sua conta foi acessada de outro dispositivo.
            </p>
            <p>
              Se você não reconhece este acesso ou não o autorizou, recomendamos fortemente que você altere sua senha imediatamente para proteger sua conta.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
          <Button onClick={onClose} variant="outline" className="w-full sm:w-auto">
            Entendi
          </Button>
          <Button onClick={() => {
            // Redirecionar para a página de recuperação de senha ou perfil para alteração
            // Por simplicidade, vamos apenas fechar e o usuário pode ir para a recuperação de senha
            onClose();
            // Poderia adicionar um navigate('/auth?mode=reset') aqui se quisesse forçar a troca
          }} className="w-full sm:w-auto bg-destructive hover:bg-destructive/90">
            <Lock className="mr-2 h-4 w-4" />
            Alterar Senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}