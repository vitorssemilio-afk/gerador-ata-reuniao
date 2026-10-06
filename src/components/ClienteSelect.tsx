import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Cliente } from '../types/database';

function normalizar(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

type ClienteSelectProps = {
  label?: string;
  value: string;
  onChange: (nome: string, opcoes: { novo: boolean }) => void;
  placeholder?: string;
  required?: boolean;
};

// Campo "Cliente" pesquisável com cadastro integrado: busca clientes já
// cadastrados enquanto digita, deixa escolher um existente ou criar um
// novo. A criação de verdade só acontece quando o formulário que usa
// este campo salva (via obter_ou_criar_cliente) — aqui só se decide
// *o que* vai ser salvo, nunca se cria nada ao digitar.
export function ClienteSelect({ label = 'Cliente', value, onChange, placeholder, required }: ClienteSelectProps) {
  const id = useId();
  const [termo, setTermo] = useState(value);
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [novo, setNovo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTermo(value);
    setNovo(false);
  }, [value]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  useEffect(() => {
    const termoBusca = termo.trim();
    if (!aberto || !termoBusca) {
      setResultados([]);
      return;
    }

    let cancelado = false;
    setBuscando(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .ilike('nome', `%${termoBusca}%`)
        .order('nome')
        .limit(8);

      if (!cancelado) {
        setResultados(data ?? []);
        setBuscando(false);
      }
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termo, aberto]);

  const temCorrespondenciaExata = useMemo(
    () => resultados.some((c) => normalizar(c.nome) === normalizar(termo)),
    [resultados, termo],
  );

  function selecionar(cliente: Cliente) {
    setTermo(cliente.nome);
    setNovo(false);
    setAberto(false);
    onChange(cliente.nome, { novo: false });
  }

  function criarNovo() {
    const nomeDigitado = termo.trim();
    if (!nomeDigitado) return;
    setNovo(true);
    setAberto(false);
    onChange(nomeDigitado, { novo: true });
  }

  return (
    <div className="cliente-select" ref={containerRef}>
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-listbox`}
          value={termo}
          placeholder={placeholder}
          required={required}
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTermo(e.target.value);
            setNovo(false);
            setAberto(true);
          }}
        />
      </label>

      {novo && (
        <p className="field-hint cliente-select-hint-novo">
          Um novo cliente “{termo.trim()}” será cadastrado ao salvar.
        </p>
      )}

      {aberto && termo.trim() && (
        <ul className="cliente-select-dropdown" id={`${id}-listbox`} role="listbox">
          {buscando && <li className="cliente-select-info">Buscando…</li>}
          {!buscando &&
            resultados.map((cliente) => (
              <li key={cliente.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => selecionar(cliente)}>
                  {cliente.nome}
                </button>
              </li>
            ))}
          {!buscando && !temCorrespondenciaExata && (
            <li>
              <button type="button" className="cliente-select-criar" onClick={criarNovo}>
                + Criar cliente “{termo.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
