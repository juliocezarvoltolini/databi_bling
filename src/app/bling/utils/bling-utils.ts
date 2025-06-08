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

export function toDateTimeBling(date: Date | string, inicioOuFim: 'INICIO' | 'FIM'): string {
  let dateInstance: Date;
  if (date instanceof Date) {
    dateInstance = date;
  } else {
    dateInstance = new Date(`${date}T00:00:01`);
  }

  const year = dateInstance.getUTCFullYear();
  const month = String(dateInstance.getUTCMonth() + 1).padStart(2, '0'); // UTCMonth é 0-indexado
  const day = String(dateInstance.getUTCDate()).padStart(2, '0'); // getDate() para dia do mês

  const dateString = `${year}-${month}-${day} ${inicioOuFim == 'INICIO' ? '00:00:01' : '23:59:59'}`;
  return dateString;
}

export function updateDateOfSearchParameters(
  parametros: Record<string, any>,
  data: Date,
): Record<string, any> {
  for (const [key, value] of Object.entries(parametros)) {
    if (value == 'date') {
      parametros[key] = toDateBling(data); // Substitui 'date' pela data
    } else if (value == 'timestamp_inicio') {
      parametros[key] = toDateTimeBling(data, 'INICIO');
    } else if (value == 'timestamp_fim') parametros[key] = toDateTimeBling(data, 'FIM');
  }
  return parametros;
}

export function getItensRestantes(lista: any, ultimoIndexProcessado: number): any[] {
  return lista.data.length > 0 ? lista.data.slice(ultimoIndexProcessado + 1) : [];
}

export function dateBlingToDate(dateAsString: string): Date {
  if (dateAsString.length === 10) {
    if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
    else return null;
  } else if (dateAsString.length === 19) {
    if (dateAsString != '0000-00-00 00:00:00') {
      const [primeiraParte, segundaParte] = dateAsString.split(' ');
      return new Date(`${primeiraParte}T${segundaParte}`);
    } else {
      return null;
    }
  }
}
