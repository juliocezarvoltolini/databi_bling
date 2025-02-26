export function toDateBling(date: Date | string): string {
  let dateInstance: Date;
  if (date instanceof Date) {
    dateInstance = date;
  } else {
    dateInstance = new Date(`${date}T00:00:01`);
  }

  const year = dateInstance.getUTCFullYear();
  const month = String(dateInstance.getUTCMonth() + 1).padStart(2, '0'); // UTCMonth é 0-indexado
  const day = String(dateInstance.getUTCDate()).padStart(2, '0'); // getDate() para dia do mês

  const dateString = `${year}-${month}-${day}`;
  return dateString;
}

export function updateDateOfSearchParameters(
  parametros: Record<string, any>,
  data: Date,
): Record<string, any> {
  for (const [key, value] of Object.entries(parametros)) {
    if (value == 'date') {
      parametros[key] = toDateBling(data); // Substitui 'date' pela data
    }
  }
  return parametros;
}

export function getItensRestantes(lista: any, ultimoIndexProcessado: number): any[] {
  return lista.data.length > 0 ? lista.data.slice(ultimoIndexProcessado + 1) : [];
}
