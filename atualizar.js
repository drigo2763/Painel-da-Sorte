const fs = require('fs');

const API_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
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
      try {
        const response = await fetch(`${API_BASE}/${loteria}`);
        if (!response.ok) {
          console.log(`API indisponível para ${loteria}, pulando...`);
          continue;
        }

        const dadosAPI = await response.json();
        const concursoNovo = Number(dadosAPI.numero);

        if (!dadosAtuais[loteria] || concursoNovo > (dadosAtuais[loteria].ultimoConcurso || 0)) {
          console.log(`Novo concurso para ${loteria}: ${concursoNovo}`);
          
          const nums = [];
          for (let i = Math.max(1, concursoNovo - 29); i <= concursoNovo; i++) nums.push(i);

          const resultados = await Promise.all(
            nums.map(n => fetch(`${API_BASE}/${loteria}/${n}`).then(r => r.ok ? r.json() : null).catch(() => null))
          );

         const recentesValidos = resultados
  .filter(r => r && r.listaDezenas)
  .map(r => ({
    concurso: Number(r.numero),
    data: r.dataApuracao,
    dezenas: r.listaDezenas.map(Number)
  }));

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
          
          dadosAPI.listaDezenas.map(Number).forEach(num => {
            dadosAtuais[loteria].frequencia[num] = (dadosAtuais[loteria].frequencia[num] || 0) + 1;
            dadosAtuais[loteria].atraso[num] = 0;
          });

          houveAlteracao = true;
        }
      } catch (erroLoteria) {
        console.log(`Falha ao ler dados de ${loteria}:`, erroLoteria.message);
      }
    }

    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dadosAtuais, null, 2));
    console.log("Processo concluído com segurança.");
  } catch (e) {
    console.error("Erro geral:", e);
  }
}
rodar();
