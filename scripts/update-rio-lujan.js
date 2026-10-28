// Robot que trae el nivel del río Luján en Mercedes desde la Red Hidrométrica
// de la UNLu y lo guarda en data/rio-lujan-mercedes.json.
// Corre del lado del servidor (GitHub Actions), por eso no choca con CORS.

const fs = require('fs');

const STATION_ID = 43; // "Río Luján - Puente Manuel J. García" (Mercedes)
const STATION_NAME = 'Río Luján en Mercedes - Puente Manuel J. García';

// Si la última lectura tiene más de 6 horas, el robot termina en rojo para que GitHub avise por mail.
function avisarSiEstaVieja(fecha) {
  const horas = (Date.now() - new Date(fecha).getTime()) / 3600000;
  if (horas > 6) {
    throw new Error(`La estación no informa desde hace ${Math.round(horas)} horas (última lectura: ${fecha}).`);
  }
}

async function main() {
  const hoy = new Date();
  const hace3dias = new Date(hoy.getTime() - 14 * 24 * 3600000); // ventana amplia: si la estación se corta unos días, seguimos mostrando la última lectura
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
    // No es un error del robot: la estación no está informando. Se conserva el último dato guardado.
    throw new Error('La UNLu no devolvió lecturas válidas en los últimos 14 días: la estación no está informando.');
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

  // Si la lectura es la misma que ya está guardada, no se reescribe (evita commits inútiles cada 15 min).
  try {
    const previo = JSON.parse(fs.readFileSync('data/rio-lujan-mercedes.json', 'utf8'));
    if (previo.valor_m === output.valor_m && previo.fecha === output.fecha && previo.tendencia === output.tendencia) {
      console.log('Sin lectura nueva. Última lectura:', output.fecha);
      avisarSiEstaVieja(output.fecha);
      return;
    }
  } catch (e) { /* no existe todavía */ }

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/rio-lujan-mercedes.json', JSON.stringify(output, null, 2));
  console.log('Guardado con éxito:', output);
  avisarSiEstaVieja(output.fecha);
}

main().catch((err) => {
  console.error('Error al actualizar el dato del río:', err.message);
  process.exit(1);
});
