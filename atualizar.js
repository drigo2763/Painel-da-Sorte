const fs = require('fs');

const ARQUIVO_DADOS = 'dados.json';

// Configuração estrita de limites das dezenas
const LIMITES = {
  megasena:  { max: 60, dezenas: 6,  soma: 183.2, pares: 3.0 },
  quina:     { max: 80, dezenas: 5,  soma: 202.3, pares: 2.5 },
  lotofacil: { max: 25, dezenas: 15, soma: 195.2, pares: 7.2 }
};

// Carrossel de APIs estáveis que não bloqueiam o GitHub
const APIS = [
  (loteria) => `https://loteriascaixa-api.herokuapp.com/api/${loteria}`,
  (loteria) => `https://api.guidi.dev/loterias/${loteria}/latest`,
  (loteria) => `https://apis.labs.geeklab.com.br/loterias/${loteria}`
];

async function buscarComContingencia(loteria) {
  for (let i = 0; i < APIS.length; i++) {
    const url = APIS[i](loteria);
    try {
      console.log(`    > Tentando API ${i + 1}: ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const json = await response.json();
        // Normaliza o nó do número do concurso, pois varia entre APIs
        const numero = json.numero || json.concurso || (json.listaDeConcursos && json.listaDeConcursos[0]?.numero);
        const dezenas = json.listaDezenas || json.dezenas || (json.listaDeConcursos && json.listaDeConcursos[0]?.dezenas);
        
        if (numero && dezenas) {
          return {
            numero: Number(numero),
            dataApuracao: json.dataApuracao || json.data || "",
            listaDezenas: dezenas.map(Number).sort((a, b) => a - b),
            raw: json
          };
        }
      }
    } catch (e) {
      console.log(`    ❌ Falha na API ${i + 1}: ${e.message}`);
    }
  }
  return null;
}

async function rodar() {
  try {
    console.log("Iniciando atualização dos dados com Multi-API Blindada...");
    let dadosAtuais = {};
    if (fs.existsSync(ARQUIVO_DADOS)) {
      const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf8');
      if (conteudo.trim().length > 5) dadosAtuais = JSON.parse(conteudo);
    }

    const loterias = ['megasena', 'quina', 'lotofacil'];

    for (const loteria of loterias) {
      console.log(`\n🔄 Buscando ${loteria}...`);
      try {
        const dadosAPI = await buscarComContingencia(loteria);
        
        if (!dadosAPI) {
          console.log(`🚨 Todas as APIs falharam ou estão indisponíveis para ${loteria}, pulando...`);
          continue;
        }

        const concursoNovo = Number(dadosAPI.numero);
        const ultConcursoSalvo = dadosAtuais[loteria]?.ultimoConcurso || 0;

        // Se encontrou um concurso novo ou o painel não tem histórico nenhum ainda
        if (!dadosAtuais[loteria] || concursoNovo > ultConcursoSalvo) {
          console.log(`🔥 Novo concurso detectado para ${loteria}: ${concursoNovo}`);
          
          // Tratamento inteligente do histórico para evitar requisições pesadas em loops de 30 passos
          let recentesValidos = dadosAtuais[loteria]?.recentDraws || [];
          
          // Se a API retornou uma lista completa de histórico de uma vez só, usamos ela
          if (dadosAPI.raw.listaDeConcursos && Array.isArray(dadosAPI.raw.listaDeConcursos)) {
            recentesValidos = dadosAPI.raw.listaDeConcursos.map(r => ({
              concurso: Number(r.numero || r.concurso),
              data: r.dataApuracao || r.data,
              dezenas: (r.listaDezenas || r.dezenas).map(Number).sort((a,b)=>a-b)
            }));
          } else {
            // Caso contrário, adicionamos o novo concurso no topo do histórico existente de forma limpa
            const jaExiste = recentesValidos.some(r => r.concurso === concursoNovo);
            if (!jaExiste) {
              recentesValidos.push({
                concurso: concursoNovo,
                data: dadosAPI.dataApuracao,
                dezenas: dadosAPI.listaDezenas
              });
            }
          }

          // Mantém apenas os últimos 50 sorteios salvos para não inflar o arquivo
          recentesValidos = recentesValidos
            .filter(r => r && r.dezenas && r.dezenas.length === LIMITES[loteria].dezenas)
            .sort((a, b) => a.concurso - b.concurso)
            .slice(-50);

          // Estrutura e calcula os padrões exatamente com a sua lógica original de preenchimento
          dadosAtuais[loteria] = {
            ultimoConcurso: concursoNovo,
            somaMedia: LIMITES[loteria].soma,
            paresMedia: LIMITES[loteria].pares,
            frequencia: dadosAtuais[loteria]?.frequencia || {},
            atraso: dadosAtuais[loteria]?.atraso || {},
            recentDraws: recentesValidos,
            atualizadoEm: new Date().toISOString()
          };

          // Incrementa o atraso de todas as dezenas
          const maxDezena = LIMITES[loteria].max;
          for (let i = 1; i <= maxDezena; i++) {
            dadosAtuais[loteria].atraso[i] = (dadosAtuais[loteria].atraso[i] || 0) + 1;
          }
          
          // Zera o atraso das dezenas sorteadas e adiciona +1 na frequência delas
          dadosAPI.listaDezenas.forEach(num => {
            if (num >= 1 && num <= maxDezena) {
              dadosAtuais[loteria].frequencia[num] = (dadosAtuais[loteria].frequencia[num] || 0) + 1;
              dadosAtuais[loteria].atraso[num] = 0;
            }
          });

          console.log(`✅ ${loteria} atualizada com sucesso para o concurso ${concursoNovo}.`);
        } else {
          console.log(`☕ ${loteria} já está atualizada no concurso mais recente (${ultConcursoSalvo}).`);
        }
      } catch (erroLoteria) {
        console.log(`❌ Falha ao processar dados de ${loteria}:`, erroLoteria.message);
      }
    }

    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dadosAtuais, null, 2));
    console.log("\n💾 Processo geral concluído com segurança máxima.");
  } catch (e) {
    console.error("Erro geral no ecossistema:", e);
  }
}

rodar();
