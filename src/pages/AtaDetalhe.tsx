import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AtaPreviewDocumento } from '../components/AtaPreviewDocumento';
import { AtaStatusBadge } from '../components/AtaStatusBadge';
import { ClienteSelect } from '../components/ClienteSelect';
import { baixarAtaDocx, gerarAtaDocxBlob, nomeArquivoAtaDocx } from '../lib/exportAtaDocx';
import { copiarParaAreaDeTransferencia, gerarTextoWhatsapp } from '../lib/exportAtaWhatsapp';
import { googleDriveConfigurado, salvarAtaNoDrive } from '../lib/googleDrive';
import { supabase } from '../lib/supabaseClient';
import { TIPOS_REUNIAO_MAPEADOR } from '../lib/tiposReuniao';
import type { AtaAcao, AtaReuniao, AtaTopico } from '../types/database';

function atualizarItem<T>(lista: T[], index: number, item: T): T[] {
  return lista.map((atual, i) => (i === index ? item : atual));
}

function removerItem<T>(lista: T[], index: number): T[] {
  return lista.filter((_, i) => i !== index);
}

export function AtaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ata, setAta] = useState<AtaReuniao | null>(null);
  const [textoWhatsapp, setTextoWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerandoNovamente, setGerandoNovamente] = useState(false);
  const [salvandoDrive, setSalvandoDrive] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviandoMapeador, setEnviandoMapeador] = useState(false);
  const [clienteNovo, setClienteNovo] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase.from('atas_reuniao').select('*').eq('id', id).single();

    if (fetchError || !data) {
      setError(fetchError?.message ?? 'Ata não encontrada.');
      setLoading(false);
      return;
    }

    setAta(data);
    setTextoWhatsapp(data.texto_whatsapp || gerarTextoWhatsapp(data));
    setClienteNovo(false);
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function gerarNovamente() {
    if (!id) return;
    setGerandoNovamente(true);
    setError(null);
    const { error: funcaoError } = await supabase.functions.invoke('gerar-ata', { body: { ata_id: id } });
    if (funcaoError) setError('Falha ao gerar a ata com IA.');
    await carregar();
    setGerandoNovamente(false);
  }

  function atualizarCampo<K extends keyof AtaReuniao>(campo: K, valor: AtaReuniao[K]) {
    setAta((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  }

  function atualizarTopico(index: number, campo: keyof AtaTopico, valor: string) {
    if (!ata) return;
    const novo = atualizarItem(ata.topicos, index, { ...ata.topicos[index], [campo]: valor });
    atualizarCampo('topicos', novo);
  }

  function atualizarAcao(index: number, campo: keyof AtaAcao, valor: string) {
    if (!ata) return;
    const valorFinal = valor.trim() === '' && campo !== 'descricao' ? null : valor;
    const novo = atualizarItem(ata.acoes, index, { ...ata.acoes[index], [campo]: valorFinal });
    atualizarCampo('acoes', novo);
  }

  function regenerarTextoWhatsapp() {
    if (!ata) return;
    setTextoWhatsapp(gerarTextoWhatsapp(ata));
  }

  async function copiar() {
    await copiarParaAreaDeTransferencia(textoWhatsapp);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function salvar() {
    if (!ata) return;
    setSalvando(true);
    setMensagem(null);
    setError(null);

    const { data: cliente, error: clienteError } = await supabase.rpc('obter_ou_criar_cliente', {
      p_nome: ata.cliente,
    });

    if (clienteError || !cliente) {
      setError(clienteError?.message ?? 'Erro ao vincular o cliente.');
      setSalvando(false);
      return;
    }

    const { data, error: updateError } = await supabase
      .from('atas_reuniao')
      .update({
        cliente: cliente.nome,
        cliente_id: cliente.id,
        assunto: ata.assunto,
        data_reuniao: ata.data_reuniao,
        hora_inicio: ata.hora_inicio,
        hora_fim: ata.hora_fim,
        participantes: ata.participantes,
        pauta: ata.pauta,
        topicos: ata.topicos,
        decisoes: ata.decisoes,
        acoes: ata.acoes,
        pendencias: ata.pendencias,
        proxima_reuniao: ata.proxima_reuniao,
        texto_whatsapp: textoWhatsapp,
        status: 'concluida',
        mapeador_cliente_id: ata.mapeador_cliente_id,
        mapeador_implementacao_id: ata.mapeador_implementacao_id,
        mapeador_reuniao_id: ata.mapeador_reuniao_id,
        mapeador_tipo_reuniao: ata.mapeador_tipo_reuniao,
      })
      .eq('id', ata.id)
      .select()
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? 'Erro ao salvar a ata.');
      setSalvando(false);
      return;
    }

    setAta(data);
    setClienteNovo(false);
    setSalvando(false);

    setEnviandoMapeador(true);
    const { data: envioData, error: envioError } = await supabase.functions.invoke('enviar-ata-mapeador', {
      body: { ata_id: data.id },
    });
    setEnviandoMapeador(false);

    if (envioError) {
      setMensagem('Ata salva. Não foi possível enviar pro Mapeador agora — tente de novo mais tarde.');
    } else {
      setMensagem(`Ata salva. ${envioData?.mensagem ?? ''}`);
      await carregar();
    }
  }

  async function baixarWord() {
    if (!ata) return;
    await baixarAtaDocx({ ...ata, texto_whatsapp: textoWhatsapp });
  }

  async function salvarNoDrive() {
    if (!ata) return;
    setSalvandoDrive(true);
    setError(null);
    setMensagem(null);
    try {
      const blob = await gerarAtaDocxBlob(ata);
      const nomeArquivo = nomeArquivoAtaDocx(ata);
      const { id: driveFileId, link } = await salvarAtaNoDrive(ata.cliente, nomeArquivo, blob);

      const { data, error: updateError } = await supabase
        .from('atas_reuniao')
        .update({ drive_file_id: driveFileId, drive_file_link: link })
        .eq('id', ata.id)
        .select()
        .single();

      if (updateError || !data) throw new Error(updateError?.message ?? 'Erro ao salvar link do Drive.');

      setAta(data);
      setMensagem('Documento salvo no Google Drive.');
    } catch (driveError) {
      setError(driveError instanceof Error ? driveError.message : 'Falha ao salvar no Google Drive.');
    } finally {
      setSalvandoDrive(false);
    }
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !ata) return <p className="form-error">{error}</p>;
  if (!ata) return null;

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Navegação">
        <Link to="/">Clientes</Link>
        <span aria-hidden="true">/</span>
        {ata.cliente_id ? (
          <Link to={`/clientes/${ata.cliente_id}`}>{ata.cliente}</Link>
        ) : (
          <span>{ata.cliente || 'Sem cliente'}</span>
        )}
        <span aria-hidden="true">/</span>
        <span>{ata.assunto}</span>
      </nav>

      <div className="page-header">
        <div>
          <h1>{ata.assunto}</h1>
          <p className="field-hint">
            {ata.cliente} · Status da ata: <AtaStatusBadge status={ata.status} />
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          Voltar
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {mensagem && <p className="form-info">{mensagem}</p>}

      {ata.status === 'processando_ia' && <p className="page-loading">Gerando ata com IA…</p>}

      {ata.status === 'erro' && (
        <div className="form-error">
          <p>{ata.erro_ia ?? 'Falha ao gerar a ata com IA.'}</p>
          <button type="button" className="btn btn-secondary" onClick={gerarNovamente} disabled={gerandoNovamente}>
            {gerandoNovamente ? 'Gerando…' : 'Tentar novamente'}
          </button>
        </div>
      )}

      {(ata.status === 'revisao' || ata.status === 'concluida') && (
        <>
          <div className="card form-card">
            <h2>Dados da reunião</h2>
            <div className="form-grid">
              <ClienteSelect
                label="Cliente / Projeto"
                value={ata.cliente}
                onChange={(nome, { novo }) => {
                  atualizarCampo('cliente', nome);
                  setClienteNovo(novo);
                }}
              />
              <label className="field">
                <span>Assunto</span>
                <input value={ata.assunto} onChange={(e) => atualizarCampo('assunto', e.target.value)} />
              </label>
              <label className="field">
                <span>Data</span>
                <input
                  type="date"
                  value={ata.data_reuniao}
                  onChange={(e) => atualizarCampo('data_reuniao', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Início</span>
                <input
                  type="time"
                  value={ata.hora_inicio ?? ''}
                  onChange={(e) => atualizarCampo('hora_inicio', e.target.value || null)}
                />
              </label>
              <label className="field">
                <span>Fim</span>
                <input
                  type="time"
                  value={ata.hora_fim ?? ''}
                  onChange={(e) => atualizarCampo('hora_fim', e.target.value || null)}
                />
              </label>
              <label className="field field-full">
                <span>Participantes (separados por vírgula)</span>
                <input
                  value={ata.participantes.join(', ')}
                  onChange={(e) =>
                    atualizarCampo(
                      'participantes',
                      e.target.value.split(',').map((p) => p.trim()).filter(Boolean),
                    )
                  }
                />
              </label>
            </div>
            <label className="field field-full">
              <span>Pauta</span>
              <textarea rows={2} value={ata.pauta} onChange={(e) => atualizarCampo('pauta', e.target.value)} />
            </label>
          </div>

          <div className="card form-card">
            <h2>Integração com o Mapeador de Funil IA</h2>
            <p className="field-hint">
              Opcional, mas recomendado — sem isso a ata chega lá como "aguardando vínculo" e precisa ser ligada
              manualmente. Cole aqui o id do cliente e/ou da implementação (aparecem na URL quando você abre o
              cliente/implementação no Mapeador).
            </p>
            <div className="form-grid">
              <label className="field">
                <span>Cliente (id no Mapeador)</span>
                <input
                  value={ata.mapeador_cliente_id ?? ''}
                  onChange={(e) => atualizarCampo('mapeador_cliente_id', e.target.value.trim() || null)}
                  placeholder="uuid do cliente"
                />
              </label>
              <label className="field">
                <span>Implementação (id no Mapeador)</span>
                <input
                  value={ata.mapeador_implementacao_id ?? ''}
                  onChange={(e) => atualizarCampo('mapeador_implementacao_id', e.target.value.trim() || null)}
                  placeholder="uuid da implementação"
                />
              </label>
              <label className="field">
                <span>Tipo de reunião (no Mapeador)</span>
                <select
                  value={ata.mapeador_tipo_reuniao ?? ''}
                  onChange={(e) => atualizarCampo('mapeador_tipo_reuniao', e.target.value || null)}
                >
                  {TIPOS_REUNIAO_MAPEADOR.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="field-hint">Ajuda o Mapeador a achar a reunião certa quando ele souber a data aproximada.</span>
              </label>
            </div>
            {ata.enviado_mapeador_status && (
              <p className={ata.enviado_mapeador_status === 'falhou' ? 'form-error' : 'form-info'}>
                Mapeador: {ata.enviado_mapeador_mensagem ?? ata.enviado_mapeador_status}
                {ata.enviado_mapeador_em ? ` (${new Date(ata.enviado_mapeador_em).toLocaleString('pt-BR')})` : ''}
              </p>
            )}
          </div>

          <div className="card form-card">
            <h2>Discutido</h2>
            {ata.topicos.map((topico, i) => (
              <div key={i} className="form-grid">
                <label className="field field-full">
                  <span>Tema {i + 1}</span>
                  <input value={topico.titulo} onChange={(e) => atualizarTopico(i, 'titulo', e.target.value)} />
                </label>
                <label className="field field-full">
                  <span>Resumo</span>
                  <textarea rows={2} value={topico.resumo} onChange={(e) => atualizarTopico(i, 'resumo', e.target.value)} />
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => atualizarCampo('topicos', removerItem(ata.topicos, i))}
                >
                  remover tema
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => atualizarCampo('topicos', [...ata.topicos, { titulo: '', resumo: '' }])}
            >
              + Adicionar tema
            </button>
          </div>

          <div className="card form-card">
            <h2>Decisões</h2>
            {ata.decisoes.map((decisao, i) => (
              <div key={i} className="form-grid">
                <label className="field field-full">
                  <span>Decisão {i + 1}</span>
                  <textarea
                    rows={2}
                    value={decisao}
                    onChange={(e) => atualizarCampo('decisoes', atualizarItem(ata.decisoes, i, e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => atualizarCampo('decisoes', removerItem(ata.decisoes, i))}
                >
                  remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => atualizarCampo('decisoes', [...ata.decisoes, ''])}
            >
              + Adicionar decisão
            </button>
          </div>

          <div className="card form-card">
            <h2>Ações</h2>
            {ata.acoes.map((acao, i) => (
              <div key={i} className="form-grid">
                <label className="field field-full">
                  <span>Ação</span>
                  <textarea
                    rows={2}
                    value={acao.descricao}
                    onChange={(e) => atualizarAcao(i, 'descricao', e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Responsável</span>
                  <input value={acao.responsavel ?? ''} onChange={(e) => atualizarAcao(i, 'responsavel', e.target.value)} />
                </label>
                <label className="field">
                  <span>Prazo</span>
                  <input value={acao.prazo ?? ''} onChange={(e) => atualizarAcao(i, 'prazo', e.target.value)} />
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => atualizarCampo('acoes', removerItem(ata.acoes, i))}
                >
                  remover ação
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() =>
                atualizarCampo('acoes', [...ata.acoes, { descricao: '', responsavel: null, prazo: null }])
              }
            >
              + Adicionar ação
            </button>
          </div>

          <div className="card form-card">
            <h2>Pendências</h2>
            {ata.pendencias.map((pendencia, i) => (
              <div key={i} className="form-grid">
                <label className="field field-full">
                  <span>Pendência {i + 1}</span>
                  <textarea
                    rows={2}
                    value={pendencia}
                    onChange={(e) => atualizarCampo('pendencias', atualizarItem(ata.pendencias, i, e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => atualizarCampo('pendencias', removerItem(ata.pendencias, i))}
                >
                  remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => atualizarCampo('pendencias', [...ata.pendencias, ''])}
            >
              + Adicionar pendência
            </button>
            <label className="field field-full">
              <span>Próxima reunião</span>
              <input
                value={ata.proxima_reuniao ?? ''}
                onChange={(e) => atualizarCampo('proxima_reuniao', e.target.value || null)}
                placeholder="Ex: 19/08 às 10h, ou deixe em branco se não definida"
              />
            </label>
          </div>

          <div className="card form-card">
            <div className="page-header">
              <h2>Ata para WhatsApp</h2>
              <button type="button" className="btn btn-ghost" onClick={regenerarTextoWhatsapp}>
                Recriar a partir dos campos acima
              </button>
            </div>
            <textarea rows={16} value={textoWhatsapp} onChange={(e) => setTextoWhatsapp(e.target.value)} />
            <div className="page-header-actions">
              <button type="button" className="btn btn-secondary" onClick={copiar}>
                {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
              </button>
            </div>
          </div>

          <div className="card form-card">
            <h2>Pré-visualização do documento (Word/Drive)</h2>
            <p className="field-hint">
              É assim que a ata sai no arquivo baixado ou salvo no Drive — atualiza sozinha
              conforme você edita os campos acima.
            </p>
            <AtaPreviewDocumento ata={ata} />
          </div>

          <div className="card form-card">
            <h2>Salvar</h2>
            {clienteNovo && (
              <p className="form-info">O cliente “{ata.cliente}” ainda não existe — será cadastrado ao salvar.</p>
            )}
            <div className="page-header-actions">
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando || enviandoMapeador}>
                {salvando ? 'Salvando…' : enviandoMapeador ? 'Enviando pro Mapeador…' : 'Salvar revisão'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={baixarWord}>
                Baixar Word (.docx)
              </button>
              {googleDriveConfigurado() && (
                <button type="button" className="btn btn-secondary" onClick={salvarNoDrive} disabled={salvandoDrive}>
                  {salvandoDrive ? 'Salvando no Drive…' : 'Salvar no Google Drive'}
                </button>
              )}
            </div>
            {ata.drive_file_link && (
              <p className="field-hint">
                Salvo no Drive:{' '}
                <a href={ata.drive_file_link} target="_blank" rel="noreferrer">
                  abrir documento
                </a>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
