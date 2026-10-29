// Trae el nivel actual (altura, en metros) de las estaciones del SNIH que miden altura de río
// y lo guarda en data/snih-niveles.json. La app lee ese archivo.
const fs = require('fs');
const path = require('path');

const URL = 'https://snih.hidricosargentina.gob.ar/MuestraDatos.aspx/LeerDatosActuales';
const CODIGO_ALTURA = 1;
const SIMULTANEAS = 5;
const ARCHIVO_ESTACIONES = path.join(__dirname, '..', 'data', 'snih-estaciones.json');
const ARCHIVO_SALIDA = path.join(__dirname, '..', 'data', 'snih-niveles.json');

async function pedir(codigo, codMed = CODIGO_ALTURA) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ estacion: String(codigo) }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const d = j.d || {};
    if (d.RespuestaOK === false) throw new Error(d.MsgErr || 'RespuestaOK false');
    const m = (d.Mediciones || []).find(x => x.Codigo === codMed && x.Valor != null);
    if (!m || Number(m.Valor) <= -100) return null; // -999 / -9999 = sin dato válido
    const ms = Number((String(m.FechaHora).match(/-?\d+/) || [])[0]);
    return { valor: Number(m.Valor), fecha: new Date(ms).toISOString() };
  } finally { clearTimeout(timer); }
}

async function conReintento(codigo, codMed) {
  try { return await pedir(codigo, codMed); }
  catch (e) { await new Promise(r => setTimeout(r, 1500)); return pedir(codigo, codMed); }
}

async function niveles() {
  const estaciones = JSON.parse(fs.readFileSync(ARCHIVO_ESTACIONES, 'utf8'));
  const resultados = [];
  let errores = 0, primerError = null, i = 0;

  await Promise.all(Array.from({ length: SIMULTANEAS }, async () => {
    while (i < estaciones.length) {
      if (resultados.length === 0 && errores >= 15) return; // el SNIH no responde: se corta
      const e = estaciones[i++];
      try {
        const m = await conReintento(e.c);
        if (m) resultados.push({ ...e, valor: m.valor, fecha: m.fecha });
      } catch (err) { errores++; if (!primerError) primerError = err.message; }
    }
  }));

  console.log(`Estaciones: ${estaciones.length}. Con dato: ${resultados.length}. Errores: ${errores}.`);
  if (resultados.length === 0) {
    throw new Error(`El SNIH no devolvió ningún dato (primer error: ${primerError || 'sin error, respuesta vacía'}).`);
  }
  resultados.sort((a, b) => a.c - b.c);

  // Historial corto por estación: h = [[fecha, valor], ...] (últimas 12 lecturas distintas)
  let anterior = null;
  try { anterior = JSON.parse(fs.readFileSync(ARCHIVO_SALIDA, 'utf8')).estaciones; } catch (e) {}
  const previas = new Map((anterior || []).map(x => [x.c, x.h || []]));
  resultados.forEach(r => {
    const h = (previas.get(r.c) || []).slice();
    const ult = h[h.length - 1];
    if (!ult || ult[0] !== r.fecha) h.push([r.fecha, r.valor]);
    r.h = h.slice(-12);
  });
  if (anterior && JSON.stringify(anterior) === JSON.stringify(resultados)) {
    console.log('Sin cambios.');
    return;
  }
  fs.writeFileSync(ARCHIVO_SALIDA, JSON.stringify({
    actualizado: new Date().toISOString(),
    fuente: 'SNIH — datos sin validar',
    estaciones: resultados,
  }));
  console.log('Archivo guardado.');
}

// Lluvia (código 20, mm) de estaciones del SNIH en un radio de 250 km de Mercedes.
// Se guarda cada lectura distinta con su fecha: h = [[fecha, mm], ...] (últimas 48).
async function lluvia() {
  const ARCH_EST = path.join(__dirname, '..', 'data', 'snih-lluvia-estaciones.json');
  const ARCH_OUT = path.join(__dirname, '..', 'data', 'snih-lluvia.json');
  const estaciones = JSON.parse(fs.readFileSync(ARCH_EST, 'utf8'));
  let anterior = [];
  try { anterior = JSON.parse(fs.readFileSync(ARCH_OUT, 'utf8')).estaciones; } catch (e) {}
  const previas = new Map(anterior.map(x => [x.c, x.h || []]));
  const res = [];
  for (let k = 0; k < estaciones.length; k += SIMULTANEAS) {
    await Promise.all(estaciones.slice(k, k + SIMULTANEAS).map(async e => {
      try {
        const m = await conReintento(e.c, 20);
        if (!m) return;
        const h = (previas.get(e.c) || []).slice();
        const ult = h[h.length - 1];
        if (!ult || ult[0] !== m.fecha) h.push([m.fecha, m.valor]);
        res.push({ ...e, valor: m.valor, fecha: m.fecha, h: h.slice(-48) });
      } catch (err) { console.log(`Lluvia ${e.c}: ${err.message}`); }
    }));
  }
  console.log(`Lluvia: ${res.length} de ${estaciones.length} estaciones con dato.`);
  if (!res.length) return;
  res.sort((a, b) => a.c - b.c);
  if (JSON.stringify(anterior) === JSON.stringify(res)) return;
  fs.writeFileSync(ARCH_OUT, JSON.stringify({ actualizado: new Date().toISOString(), fuente: 'SNIH — datos sin validar', estaciones: res }));
}

(async () => {
  let fallo = null;
  try { await niveles(); } catch (e) { fallo = e; }
  try { await lluvia(); } catch (e) { console.log('Lluvia: ' + e.message); }
  if (fallo) { console.error(fallo.message); process.exit(1); }
})();
