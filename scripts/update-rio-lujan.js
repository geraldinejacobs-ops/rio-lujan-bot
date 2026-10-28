// Robot que trae el nivel del río Luján en Mercedes desde la Red Hidrométrica
// de la UNLu y lo guarda en data/rio-lujan-mercedes.json.
// Corre del lado del servidor (GitHub Actions), por eso no choca con CORS.
//
// IMPORTANTE: la respuesta de la estación 43 trae SEIS sensores (distintos puentes del río).
// El nivel de Mercedes es SOLO el sensor 1377 (Puente Manuel J. García). Los demás se guardan
// aparte, como información extra de río abajo, y nunca se mezclan con el de Mercedes.

const fs = require('fs');

const STATION_ID = 43;
const SENSOR_GARCIA = '1377';
const STATION_NAME = 'Río Luján en Mercedes - Puente Manuel J. García';
const OTROS = {
  '1804': 'Puente Olivera',
  '1375': 'Puente Jáuregui',
  '1806': 'Puente Ruta Nac. 8',
  '1803': 'Puente Ruta Nac. 6',
  '1805': 'Puente Ruta Nac. 9',
};

const leerValor = (entry) => {
  const crudo = (entry != null && typeof entry === 'object') ? entry.valor : entry;
  const v = parseFloat(crudo);
  return isNaN(v) ? null : v;
};

// Última lectura válida de un sensor y su tendencia (comparando contra ~3 horas antes).
function ultimaLectura(entries, dates) {
  if (!Array.isArray(entries)) return null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const v = leerValor(entries[i]);
    if (v == null) continue;
    const e = entries[i];
    const fecha = (e && typeof e === 'object' && e.fechamedicion) ? e.fechamedicion : dates[i];
    if (!fecha) continue;
    let tendencia = null;
    const idxInicio = Math.max(0, i - 9);
    let anterior = null;
    for (let j = idxInicio; j >= 0 && i > 0; j--) {
      const w = leerValor(entries[j]);
      if (w != null) { anterior = w; break; }
    }
    if (anterior != null) {
      const diff = v - anterior;
      tendencia = diff > 0.02 ? 'subiendo' : diff < -0.02 ? 'bajando' : 'estable';
    }
    return { valor_m: v, fecha, tendencia };
  }
  return null;
}

async function main() {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - 14 * 24 * 3600000); // ventana amplia
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url = `https://redhidro.unlu.edu.ar/api/getmediciones/${STATION_ID}/${fmt(desde)}/${fmt(hoy)}`;
  console.log('Pidiendo datos a:', url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`La UNLu respondió con estado ${res.status}`);
  const data = await res.json();
  const dates = data.dates || [];
  const equipos = data.equipos || {};

  const garcia = ultimaLectura(equipos[SENSOR_GARCIA], dates);

  const otras = [];
  for (const [id, nombre] of Object.entries(OTROS)) {
    const l = ultimaLectura(equipos[id], dates);
    if (l) otras.push({ estacion: nombre, ...l });
  }

  if (!garcia) {
    throw new Error('El sensor de García (Mercedes) no devolvió lecturas válidas en los últimos 14 días: la estación no está informando.');
  }

  const output = {
    estacion: STATION_NAME,
    valor_m: garcia.valor_m,
    tendencia: garcia.tendencia,
    fecha: garcia.fecha,
    otras_estaciones: otras,
    actualizado: new Date().toISOString(),
  };

  // Si no hay nada nuevo, no se reescribe (evita commits inútiles cada 15 min).
  try {
    const previo = JSON.parse(fs.readFileSync('data/rio-lujan-mercedes.json', 'utf8'));
    const sinFecha = (o) => JSON.stringify({ ...o, actualizado: null });
    if (sinFecha(previo) === sinFecha(output)) {
      console.log('Sin lectura nueva. Última lectura de García:', output.fecha);
      avisarSiEstaVieja(output.fecha);
      return;
    }
  } catch (e) { /* no existe todavía */ }

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/rio-lujan-mercedes.json', JSON.stringify(output, null, 2));
  console.log('Guardado con éxito:', output);
  avisarSiEstaVieja(output.fecha);
}

// Si la última lectura de García tiene más de 6 horas, el robot termina en rojo
// para que GitHub avise por mail (el archivo igual queda guardado).
function avisarSiEstaVieja(fecha) {
  // Las fechas de la UNLu vienen en hora argentina, sin zona horaria: se interpretan como UTC-3
  // (GitHub corre en UTC y, si no, la lectura parecería 3 horas más vieja de lo que es).
  const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(fecha) ? fecha : `${fecha}-03:00`;
  const horas = (Date.now() - new Date(conZona).getTime()) / 3600000;
  if (horas > 6) {
    throw new Error(`La estación de García no informa desde hace ${Math.round(horas)} horas (última lectura: ${fecha}).`);
  }
}

main().catch((err) => {
  console.error('Error al actualizar el dato del río:', err.message);
  process.exit(1);
});
