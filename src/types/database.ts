export type AtaStatus = 'rascunho' | 'processando_ia' | 'revisao' | 'concluida' | 'erro';

export type AtaTopico = {
  titulo: string;
  resumo: string;
};

export type AtaAcao = {
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
};

export type AtaReuniao = {
  id: string;
  user_id: string;
  cliente: string;
  assunto: string;
  data_reuniao: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  participantes: string[];
  transcricao: string;
  status: AtaStatus;
  erro_ia: string | null;
  pauta: string;
  topicos: AtaTopico[];
  decisoes: string[];
  acoes: AtaAcao[];
  pendencias: string[];
  proxima_reuniao: string | null;
  texto_whatsapp: string;
  drive_file_id: string | null;
  drive_file_link: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      atas_reuniao: {
        Row: AtaReuniao;
        Insert: Partial<AtaReuniao> & Pick<AtaReuniao, 'user_id' | 'cliente' | 'assunto' | 'data_reuniao'>;
        Update: Partial<AtaReuniao>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
