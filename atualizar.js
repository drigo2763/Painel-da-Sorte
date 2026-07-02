const fs = require('fs');

// 💡 ISSO DAQUI É A MÁGICA: Evita que o Node.js derrube a conexão com o servidor da Caixa por incompatibilidade de TLS/SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const ARQUIVO_DADOS = 'dados.json';

async function rodar() {
  try {
    console.log("Iniciando atualização dos dados diretamente pela API Oficial da Caixa...");
    let dadosAtuais = {};
    if (fs.existsSync(ARQUIVO_DADOS)) {
      const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf8');
      if (conteudo.trim().length > 5) dadosAtuais = JSON.parse(conteudo);
    }

    const loterias = ['megasena', 'quina', 'lotofacil'];

    for (const loteria of loterias) {
      console.log(`\n🔄 Buscando ${loteria} na Caixa...`);
      try {
        // Faz a requisição simulando o navegador para o servidor da Caixa aceitar
        const response = await fetch(`${API_BASE}/${loteria}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          console.log(`❌ API da Caixa indisponível para ${loteria}, status: ${response.status}`);
          continue;
        }

        const dadosAPI = await response.json();
        const concursoNovo = Number(dadosAPI.numero);
        const ultConcursoSalvo = dadosAtuais[loteria]?.ultimoConcurso || 0;

        if (!dadosAtuais[loteria] || concursoNovo > ultConcursoSalvo) {
          console.log(`🔥 Novo concurso detectado para ${loteria}: ${concursoNovo}`);
          
          let recentesValidos = dadosAtuais[loteria]?.recentDraws || [];
          
          // Adiciona o concurso mais recente se ele não estiver na lista
          const jaExiste = recentesValidos.some(r => r.concurso === concursoNovo);
          if (!jaExiste && dadosAPI.listaDezenas) {
            recentesValidos.push({
              concurso: concursoNovo,
              data: dadosAPI.dataApuracao,
              dezenas: dadosAPI.listaDezenas.map(Number).sort((a,b)=>a-b)
            });
          }

          // Limita para os últimos 50 históricos para o painel respirar leve
          recentesValidos = recentesValidos.slice(-50);

          dadosAtuais[loteria] = {
            ultimoConcurso: concursoNovo,
            somaMedia: loteria === 'lotofacil' ? 195.2 : loteria === 'quina' ? 202.3 : 183.2,
            paresMedia: loteria === 'lotofacil' ? 7.2 : loteria === 'quina' ? 2.5 : 3.0,
            frequencia: dadosAtuais[loteria]?.frequencia || {},
            atraso: dadosAtuais[loteria]?.atraso || {},
            recentDraws: recentesValidos,
            atualizadoEm: new Date().toISOString()
          };

          const maxDezena = loteria === 'lotofacil' ? 25 : loteria === 'quina' ? 80 : 60;
          for(let i=1; i<=maxDezena; i++) {
            dadosAtuais[loteria].atraso[i] = (dadosAtuais[loteria].atraso[i] || 0) + 1;
          }
          
          if (dadosAPI.listaDezenas) {
            dadosAPI.listaDezenas.map(Number).forEach(num => {
              dadosAtuais[loteria].frequencia[num] = (dadosAtuais[loteria].frequencia[num] || 0) + 1;
              dadosAtuais[loteria].atraso[num] = 0;
            });
          }

          console.log(`✅ ${loteria} atualizada com sucesso para o concurso ${concursoNovo}.`);
        } else {
          console.log(`☕ ${loteria} já está atualizada no concurso mais recente (${ultConcursoSalvo}).`);
        }
      } catch (erroLoteria) {
        console.log(`❌ Falha ao ler dados de ${loteria}:`, erroLoteria.message);
      }
    }

    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dadosAtuais, null, 2));
    console.log("\n💾 Processo concluído com segurança pela API Oficial.");
  } catch (e) {
    console.error("Erro geral:", e);
  }
}

rodar();
