const fs = require('fs');

// ⚠️ Necessário: o servidor da Caixa (servicebus2.caixa.gov.br) tem uma cadeia de
// certificado TLS que o Node rejeita por padrão. Isso é um workaround conhecido e
// usado por várias implementações públicas dessa mesma API — não é opcional aqui,
// mas fique ciente de que desativa a validação de certificado para TODAS as
// requisições https deste processo (não só para a Caixa).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const ARQUIVO_DADOS = 'dados.json';

const MAX_DEZENA = { lotofacil: 25, quina: 80, megasena: 60 };
const SOMA_MEDIA_INICIAL  = { lotofacil: 195.2, quina: 202.3, megasena: 183.2 };
const PARES_MEDIA_INICIAL = { lotofacil: 7.2,   quina: 2.5,   megasena: 3.0 };

async function buscarConcurso(loteria, numero) {
  const url = numero ? `${API_BASE}/${loteria}/${numero}` : `${API_BASE}/${loteria}`;
  const resposta = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function rodar() {
  console.log("Iniciando atualização dos dados diretamente pela API Oficial da Caixa...");

  let dadosAtuais = {};
  if (fs.existsSync(ARQUIVO_DADOS)) {
    const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf8');
    if (conteudo.trim().length > 5) dadosAtuais = JSON.parse(conteudo);
  }

  const loterias = ['megasena', 'quina', 'lotofacil'];

  for (const loteria of loterias) {
    console.log(`\n🔄 Verificando ${loteria}...`);
    try {
      const ultimo = await buscarConcurso(loteria);
      const concursoNovo = Number(ultimo.numero);
      const base = dadosAtuais[loteria] || {
        ultimoConcurso: 0,
        totalConcursos: 0,
        somaMedia: SOMA_MEDIA_INICIAL[loteria],
        paresMedia: PARES_MEDIA_INICIAL[loteria],
        frequencia: {},
        atraso: {},
        recentDraws: [],
      };

      if (concursoNovo <= base.ultimoConcurso) {
        console.log(`☕ ${loteria} já está atualizada (concurso ${base.ultimoConcurso}).`);
        base.atualizadoEm = new Date().toISOString(); // confirma que checamos, mesmo sem novidade
        dadosAtuais[loteria] = base;
        continue;
      }

      // Descobre TODOS os concursos que faltam entre o último salvo e o mais recente —
      // não assume que é só +1. Se o robô ficar alguns dias sem rodar, ele recupera tudo.
      const faltantes = [];
      for (let n = base.ultimoConcurso + 1; n <= concursoNovo; n++) faltantes.push(n);
      console.log(`🔥 ${faltantes.length} concurso(s) novo(s) para ${loteria}: ${faltantes.join(', ')}`);

      for (const n of faltantes) {
        // O concurso mais recente já veio na resposta acima; evita rebuscar.
        const dadosConcurso = (n === concursoNovo) ? ultimo : await buscarConcurso(loteria, n);
        if (!dadosConcurso?.listaDezenas) {
          console.log(`⚠️ Concurso ${n} de ${loteria} sem "listaDezenas" na resposta — pulando.`);
          continue;
        }

        const dezenas = dadosConcurso.listaDezenas.map(Number).sort((a, b) => a - b);

        // atraso: todo mundo envelhece 1 concurso; quem saiu agora zera
        for (let i = 1; i <= MAX_DEZENA[loteria]; i++) {
          base.atraso[i] = (base.atraso[i] || 0) + 1;
        }
        dezenas.forEach(num => {
          base.frequencia[num] = (base.frequencia[num] || 0) + 1;
          base.atraso[num] = 0;
        });

        base.recentDraws.push({
          concurso: n,
          data: dadosConcurso.dataApuracao,
          dezenas
        });

        base.totalConcursos = (base.totalConcursos || 0) + 1;
        base.ultimoConcurso = n;
      }

      base.recentDraws = base.recentDraws.slice(-50); // mantém o histórico leve
      base.atualizadoEm = new Date().toISOString();
      dadosAtuais[loteria] = base;
      console.log(`✅ ${loteria} atualizada com sucesso até o concurso ${base.ultimoConcurso}.`);

    } catch (erroLoteria) {
      // Não mexe em dadosAtuais[loteria] — mantém o que já tinha, sem fingir sucesso.
      console.log(`❌ Falha ao atualizar ${loteria}: ${erroLoteria.message}`);
    }
  }

  fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dadosAtuais, null, 2));
  console.log("\n💾 dados.json salvo.");
}

rodar().catch(e => {
  console.error("Erro geral não tratado:", e);
  process.exit(1); // deixa o GitHub Actions marcar a execução como falha (ver cron.yml)
});
