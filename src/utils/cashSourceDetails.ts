export function cashSourceDetails(lines: string[] = []) {
  const notes: string[] = [];
  const payments: { player: string; method: string; amount: number }[] = [];
  for (const line of lines) {
    if (line === 'Detalle recuperado del origen actual (no histórico)') continue;
    const separator = line.lastIndexOf(' · ');
    const player = line.slice(0, separator);
    const parts = line.slice(separator + 3).split(' + ');
    const matches = parts.map(part => part.match(/^(Efectivo|Tarjeta|Transferencia|Cuenta corriente|Sin medio informado) \$ (-?\d+(?:,\d+)?)$/));
    if (separator < 1 || !matches.every(match => match)) {
      notes.push(line);
      continue;
    }
    for (const match of matches) {
      payments.push({ player, method: match![1], amount: Number(match![2].replace(',', '.')) });
    }
  }
  return { notes, payments };
}
