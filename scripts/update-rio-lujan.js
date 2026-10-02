// Robot que trae el nivel del río Luján en Mercedes desde la Red Hidrométrica
// de la UNLu y lo guarda en data/rio-lujan-mercedes.json.
// Corre del lado del servidor (GitHub Actions), por eso no choca con CORS.

const fs = require('fs');

const STATION_ID = 43; // "Río Luján - Puente Manuel J. García" (Mercedes)
const STATION_NAME = 'Río Luján en Mercedes - Puente Manuel J. García';

async function main() {
  const hoy = new Date();
  const hace3dias = new Date(hoy.getTime() - 3 * 24 * 3600000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `https://redhidro.unlu.edu.ar/api/getmediciones/${STATION_ID}/${fmt(hace3dias)}/${fmt(hoy)}`;
  console.log('Pidiendo datos a:', url);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`La UNLu respondió con estado ${res.status}`);
  }
  const data = await res.json();

  const dates = data.dates || [];
  const equipos = data.equipos || {};

  // Cada entrada de "equipos" es un objeto { fechamedicion, valor } (no un número suelto).
  let bestValor = null;
  let bestFecha = null;
  Object.values(equipos).forEach((entries) => {
    if (!Array.isArray(entries)) return;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry == null) continue;
      const crudo = (typeof entry === 'object') ? entry.valor : entry;
      const v = parseFloat(crudo);
      if (!isNaN(v)) {
        const f = (typeof entry === 'object' && entry.fechamedicion) ? entry.fechamedicion : dates[i];
        if (f && (bestFecha == null || new Date(f) > new Date(bestFecha))) {
          bestValor = v;
          bestFecha = f;
        }
        break;
      }
    }
  });

  if (bestValor == null) {
    throw new Error('No se encontró ninguna lectura válida en la respuesta de la UNLu.');
  }

  const output = {
    estacion: STATION_NAME,
    valor_m: bestValor,
    fecha: bestFecha,
    actualizado: new Date().toISOString(),
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/rio-lujan-mercedes.json', JSON.stringify(output, null, 2));
  console.log('Guardado con éxito:', output);
}

main().catch((err) => {
  console.error('Error al actualizar el dato del río:', err.message);
  process.exit(1);
});
