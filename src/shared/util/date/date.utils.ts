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
