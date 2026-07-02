const fs = require('fs');

const API_URL = "https://loteriascaixa-api.irvingdevs.workers.dev";
const ARQUIVO_DADOS = 'dados.json';

async function rodar() {
  try {
    console.log("Iniciando atualização dos dados...");
    let dadosAtuais = {};
    if (fs.existsSync(ARQUIVO_DADOS)) {
      const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf8');
      if (conteudo.trim().length > 5) dadosAtuais = JSON.parse(conteudo);
    }

    const loterias = ['megasena', 'quina', 'lotofacil'];
    let houveAlteracao = false;

    for (const loteria of loterias) {
      console.log(`Buscando ${loteria}...`);
      const response = await fetch(`${API_URL}/${loteria}/latest`);
      if (!response.ok) continue;

      const dadosAPI = await response.json();
      const concursoNovo = Number(dadosAPI.concurso);

      if (!dadosAtuais[loteria] || concursoNovo > (dadosAtuais[loteria].ultimoConcurso || 0)) {
        console.log(`Novo concurso para ${loteria}: ${concursoNovo}`);
        
        const nums = [];
        for (let i = Math.max(1, concursoNovo - 29); i <= concursoNovo; i++) nums.push(i);

        const resultados = await Promise.all(
          nums.map(n => fetch(`${API_URL}/${loteria}/${n}`).then(r => r.ok ? r.json() : null).catch(() => null))
        );

        const recentesValidos = resultados
          .filter(r => r && r.dezenas)
          .map(r => ({ concurso: Number(r.concurso), data: r.data, dezenas: r.dezenas.map(Number) }));

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
        
        dadosAPI.dezenas.map(Number).forEach(num => {
          dadosAtuais[loteria].frequencia[num] = (dadosAtuais[loteria].frequencia[num] || 0) + 1;
          dadosAtuais[loteria].atraso[num] = 0;
        });

        houveAlteracao = true;
      }
    }

    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dadosAtuais, null, 2));
    console.log("Arquivo dados.json atualizado!");
  } catch (e) {
    console.error("Erro:", e);
    process.exit(1);
  }
}
rodar();