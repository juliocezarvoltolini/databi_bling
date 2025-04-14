const API_URL = 'http://127.0.0.1:3000/controle-importacao';

// Formata a data no padrão dd/mm/yyyy
function formatarData(dataStr) {
  if (!dataStr) return 'N/A';
  const data = new Date(dataStr+ 'T04:00:00');
  return data.toLocaleDateString('pt-BR');
}

async function carregarDashboard() {
  const container = document.getElementById('dashboard');
  container.innerHTML = '<p>🔄 Carregando...</p>';

  try {
    const response = await fetch(API_URL);
    const dados = await response.json();

    container.innerHTML = '';

    dados.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <h2>📁 ${item.tabela}</h2>
        <p><strong>Página:</strong> ${item.pagina}</p>
        <p><strong>Quantidade de Registros:</strong> ${item.ultimoIndexProcessado  + 1}</p>
        <p class="data"><strong>Data:</strong> ${formatarData(item.data)}</p>
      `;

      container.appendChild(card);
    });
  } catch (erro) {
    container.innerHTML = `<p>❌ Erro ao carregar dados: ${erro.message}</p>`;
    console.error('Erro ao carregar dados do dashboard:', erro);
  }
}

// Evento no botão de atualização
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAtualizar').addEventListener('click', carregarDashboard);
  carregarDashboard();
});
