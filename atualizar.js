const fs = require('fs');

const ARQUIVO_DADOS = 'dados.json';

const LIMITES = {
  megasena:  { max: 60, dezenas: 6,  soma: 183.2, pares: 3.0, endpoint: "mega-sena" },
  quina:     { max: 80, dezenas: 5,  soma: 202.3, pares: 2.5, endpoint: "quina" },
  lotofacil: { max: 25, dezenas: 15, soma: 195.2, pares: 7.2, endpoint: "lotofacil" }
};

// APIs alternativas e muito estáveis
const APIS = [
  (loteria) => `https://loteriascaixa-api.herokuapp.com/api/${loteria.replace('-', '')}`,
  (loteria) => `https://api.potatotech.me/loterias/${loteria}/latest`,
  (loteria) => `https://api.guidi.dev/loterias/${loteria.replace('-', '')}/latest`
];

async function buscarComContingencia(loteriaKey) {
  const endpoint = LIMITES[loteriaKey].endpoint;
  
  for (let i = 0; i < APIS.length; i++) {
    const url = APIS[i](endpoint);
    try {
      console.log(`    > Tentando API ${i + 1}: ${url}`);
      
      // Passando User-Agent para simular um navegador e evitar bloqueios de firewall do GitHub Actions
      const response = await fetch(url, { 
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(8000) 
      });
      
      if (response.ok) {
        const json = await response.json();
        
        // Mapeamento inteligente para aceitar os diferentes formatos de retorno de cada API
        const numero = json.numero || json.concurso || (json.listaDeConcursos && json.listaDeConcursos[0]?.numero);
        let dezenasRaw = json.listaDezenas || json.dezenas || (json.listaDeConcursos && json.listaDeConcursos[0]?.dezenas);
        
        if (numero && dezenasRaw) {
          const dezenas = dezenasRaw.map(Number).sort((a, b) => a - b);
          return {
            numero: Number(numero),
            dataApuracao: json.dataApuracao || json.data || "",
            listaDezenas: dezenas,
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
    console.log("Iniciando atualização dos dados com Agente de Navegação...");
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

        if (!dadosAtuais[loteria] || concursoNovo > ultConcursoSalvo) {
          console.log(`🔥 Novo concurso detectado para ${loteria}: ${concursoNovo}`);
          
          let recentesValidos = dadosAtuais[loteria]?.recentDraws || [];
          
          if (dadosAPI.raw.listaDeConcursos && Array.isArray(dadosAPI.raw.listaDeConcursos)) {
            recentesValidos = dadosAPI.raw.listaDeConcursos.map(r => ({
              concurso: Number(r.numero || r.concurso),
              data: r.dataApuracao || r.data,
              dezenas: (r.listaDezenas || r.dezenas).map(Number).sort((a,b)=>a-b)
            }));
          } else {
            const jaExiste = recentesValidos.some(r => r.concurso === concursoNovo);
            if (!jaExiste) {
              recentesValidos.push({
                concurso: concursoNovo,
                data: dadosAPI.dataApuracao,
                dezenas: dadosAPI.listaDezenas
              });
            }
          }

          recentesValidos = recentesValidos
            .filter(r => r && r.dezenas && r.dezenas.length === LIMITES[loteria].dezenas)
            .sort((a, b) => a.concurso - b.concurso)
            .slice(-50);

          dadosAtuais[loteria] = {
            ultimoConcurso: concursoNovo,
            somaMedia: LIMITES[loteria].soma,
            paresMedia: LIMITES[loteria].pares,
            frequencia: dadosAtuais[loteria]?.frequencia || {},
            atraso: dadosAtuais[loteria]?.atraso || {},
            recentDraws: recentesValidos,
            atualizadoEm: new Date().toISOString()
          };

          const maxDezena = LIMITES[loteria].max;
          for (let i = 1; i <= maxDezena; i++) {
            dadosAtuais[loteria].atraso[i] = (dadosAtuais[loteria].atraso[i] || 0) + 1;
          }
          
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
    console.log("\n💾 Processo geral concluído.");
  } catch (e) {
    console.error("Erro geral no ecossistema:", e);
  }
}

rodar();
