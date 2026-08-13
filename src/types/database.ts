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

export type ConexaoGoogleMeet = {
  id: string;
  user_id: string;
  google_email: string;
  ultima_verificacao: string | null;
  created_at: string;
  updated_at: string;
};

export type ReuniaoMeetStatus = 'pendente' | 'ignorada' | 'ata_criada';

export type ReuniaoMeetDetectada = {
  id: string;
  conexao_id: string;
  user_id: string;
  conference_record_name: string;
  titulo: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  transcricao: string;
  status: ReuniaoMeetStatus;
  ata_id: string | null;
  created_at: string;
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
      conexoes_google_meet: {
        Row: ConexaoGoogleMeet;
        Insert: Partial<ConexaoGoogleMeet> & Pick<ConexaoGoogleMeet, 'user_id' | 'google_email'>;
        Update: Partial<ConexaoGoogleMeet>;
        Relationships: [];
      };
      reunioes_meet_detectadas: {
        Row: ReuniaoMeetDetectada;
        Insert: Partial<ReuniaoMeetDetectada> &
          Pick<ReuniaoMeetDetectada, 'conexao_id' | 'user_id' | 'conference_record_name'>;
        Update: Partial<ReuniaoMeetDetectada>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      salvar_conexao_google_meet: {
        Args: { p_google_email: string; p_refresh_token: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
