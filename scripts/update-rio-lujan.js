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

  const leerValor = (entry) => {
    const crudo = (entry != null && typeof entry === 'object') ? entry.valor : entry;
    const v = parseFloat(crudo);
    return isNaN(v) ? null : v;
  };

  // Buscamos, entre todos los sensores de la estación, la lectura válida más reciente.
  let bestValor = null;
  let bestFecha = null;
  let bestEntries = null;
  let bestIndex = -1;
  Object.values(equipos).forEach((entries) => {
    if (!Array.isArray(entries)) return;
    for (let i = entries.length - 1; i >= 0; i--) {
      const v = leerValor(entries[i]);
      if (v != null) {
        const entry = entries[i];
        const f = (entry && typeof entry === 'object' && entry.fechamedicion) ? entry.fechamedicion : dates[i];
        if (f && (bestFecha == null || new Date(f) > new Date(bestFecha))) {
          bestValor = v;
          bestFecha = f;
          bestEntries = entries;
          bestIndex = i;
        }
        break;
      }
    }
  });

  if (bestValor == null) {
    throw new Error('No se encontró ninguna lectura válida en la respuesta de la UNLu.');
  }

  // Tendencia: comparamos contra una lectura ~3 horas antes, del mismo sensor
  // (las mediciones suelen venir cada 20 min, así que retrocedemos ~9 pasos).
  let tendencia = null;
  if (bestEntries && bestIndex > 0) {
    const pasosAtras = 9;
    const idxInicio = Math.max(0, bestIndex - pasosAtras);
    let valorAnterior = null;
    for (let j = idxInicio; j >= 0; j--) {
      const v = leerValor(bestEntries[j]);
      if (v != null) { valorAnterior = v; break; }
    }
    if (valorAnterior != null) {
      const diff = bestValor - valorAnterior;
      if (diff > 0.02) tendencia = 'subiendo';
      else if (diff < -0.02) tendencia = 'bajando';
      else tendencia = 'estable';
    }
  }

  const output = {
    estacion: STATION_NAME,
    valor_m: bestValor,
    tendencia,
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
