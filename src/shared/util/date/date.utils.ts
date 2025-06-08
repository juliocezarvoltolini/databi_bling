export function subtrairMeses(date: Date, meses: number): Date {
  const novaData = new Date(date);
  const diaOriginal = novaData.getDate();

  novaData.setMonth(novaData.getMonth() - meses);

  // Verifica se o mês "voltou" por ter ultrapassado o fim
  if (novaData.getDate() < diaOriginal) {
    novaData.setDate(0); // volta para o último dia do mês anterior
  }

  return novaData;
}

export function obterDataAnterior(dias: number): Date {
  const agora = new Date();
  const milissegundosPorDia = 24 * 60 * 60 * 1000;
  return new Date(agora.getTime() - dias * milissegundosPorDia);
}

// ========================================
// ENUM PARA DIAS DA SEMANA
// ========================================
enum DiaDaSemana {
  DOMINGO = 0,
  SEGUNDA = 1,
  TERCA = 2,
  QUARTA = 3,
  QUINTA = 4,
  SEXTA = 5,
  SABADO = 6,
}

// ========================================
// VERSÃO ALTERNATIVA COM NOMES EM INGLÊS
// ========================================
enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

// ========================================
// FUNÇÃO PRINCIPAL - OBTER ÚLTIMO DIA DA SEMANA
// ========================================
function obterUltimoDiaDaSemana(diaDesejado: DiaDaSemana, incluirHoje: boolean = true): Date {
  const hoje = new Date();
  const diaAtual = hoje.getDay();

  let diasParaVoltar: number;

  if (incluirHoje && diaAtual === diaDesejado) {
    // Se hoje é o dia desejado e queremos incluir hoje
    diasParaVoltar = 0;
  } else if (diaAtual >= diaDesejado) {
    // Se o dia atual é maior ou igual ao desejado
    diasParaVoltar = diaAtual - diaDesejado;
  } else {
    // Se o dia atual é menor que o desejado, volta para a semana anterior
    diasParaVoltar = 7 - diaDesejado + diaAtual;
  }

  const ultimoDia = new Date(hoje);
  ultimoDia.setDate(hoje.getDate() - diasParaVoltar);
  ultimoDia.setHours(0, 0, 0, 0); // Zerar as horas

  return ultimoDia;
}

// ========================================
// VERSÃO ALTERNATIVA MAIS SIMPLES
// ========================================
function obterUltimoDiaSimples(diaDesejado: DiaDaSemana): Date {
  const hoje = new Date();
  const diasParaVoltar = (hoje.getDay() - diaDesejado + 7) % 7;

  const ultimoDia = new Date(hoje);
  ultimoDia.setDate(hoje.getDate() - diasParaVoltar);
  ultimoDia.setHours(0, 0, 0, 0);

  return ultimoDia;
}

// ========================================
// FUNÇÃO PARA COMPARAR DATA COM ÚLTIMO DIA DA SEMANA
// ========================================
function isUltimoDiaDaSemana(dataParaComparar: Date, diaDesejado: DiaDaSemana): boolean {
  const ultimoDia = obterUltimoDiaDaSemana(diaDesejado);
  const dataLimpa = new Date(dataParaComparar);
  dataLimpa.setHours(0, 0, 0, 0);

  return dataLimpa.getTime() === ultimoDia.getTime();
}

// ========================================
// FUNÇÕES DE CONVENIÊNCIA PARA DIAS ESPECÍFICOS
// ========================================
const obterUltimoDomingo = () => obterUltimoDiaDaSemana(DiaDaSemana.DOMINGO);
const obterUltimaSegunda = () => obterUltimoDiaDaSemana(DiaDaSemana.SEGUNDA);
const obterUltimaTerca = () => obterUltimoDiaDaSemana(DiaDaSemana.TERCA);
const obterUltimaQuarta = () => obterUltimoDiaDaSemana(DiaDaSemana.QUARTA);
const obterUltimaQuinta = () => obterUltimoDiaDaSemana(DiaDaSemana.QUINTA);
const obterUltimaSexta = () => obterUltimoDiaDaSemana(DiaDaSemana.SEXTA);
const obterUltimoSabado = () => obterUltimoDiaDaSemana(DiaDaSemana.SABADO);

// ========================================
// HELPER PARA OBTER NOME DO DIA
// ========================================
function obterNomeDia(dia: DiaDaSemana): string {
  const nomes = {
    [DiaDaSemana.DOMINGO]: 'Domingo',
    [DiaDaSemana.SEGUNDA]: 'Segunda-feira',
    [DiaDaSemana.TERCA]: 'Terça-feira',
    [DiaDaSemana.QUARTA]: 'Quarta-feira',
    [DiaDaSemana.QUINTA]: 'Quinta-feira',
    [DiaDaSemana.SEXTA]: 'Sexta-feira',
    [DiaDaSemana.SABADO]: 'Sábado',
  };
  return nomes[dia];
}

// ========================================
// FUNÇÃO PARA OBTER RANGE DE DATAS (SEMANA COMPLETA)
// ========================================
function obterSemanaCompleta(diaInicio: DiaDaSemana = DiaDaSemana.DOMINGO): Date[] {
  const primeiroDia = obterUltimoDiaDaSemana(diaInicio);
  const semana: Date[] = [];

  for (let i = 0; i < 7; i++) {
    const dia = new Date(primeiroDia);
    dia.setDate(primeiroDia.getDate() + i);
    semana.push(dia);
  }

  return semana;
}

// ========================================
// EXPORT PARA USO EM OUTROS MÓDULOS
// ========================================
export {
  DiaDaSemana,
  DayOfWeek,
  obterUltimoDiaDaSemana,
  obterUltimoDiaSimples,
  isUltimoDiaDaSemana,
  obterUltimoDomingo,
  obterUltimaSegunda,
  obterUltimaTerca,
  obterUltimaQuarta,
  obterUltimaQuinta,
  obterUltimaSexta,
  obterUltimoSabado,
  obterNomeDia,
  obterSemanaCompleta,
};
