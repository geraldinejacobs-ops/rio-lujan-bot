// Trae el nivel actual (altura, en metros) de las estaciones del SNIH que miden altura de río
// y lo guarda en data/snih-niveles.json. La app lee ese archivo.
const fs = require('fs');
const path = require('path');

const URL = 'https://snih.hidricosargentina.gob.ar/MuestraDatos.aspx/LeerDatosActuales';
const CODIGO_ALTURA = 1;
const SIMULTANEAS = 5;
const ARCHIVO_ESTACIONES = path.join(__dirname, '..', 'data', 'snih-estaciones.json');
const ARCHIVO_SALIDA = path.join(__dirname, '..', 'data', 'snih-niveles.json');

async function pedir(codigo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
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
    const m = (d.Mediciones || []).find(x => x.Codigo === CODIGO_ALTURA && x.Valor != null);
    if (!m) return null;
    const ms = Number((String(m.FechaHora).match(/-?\d+/) || [])[0]);
    return { valor: Number(m.Valor), fecha: new Date(ms).toISOString() };
  } finally { clearTimeout(timer); }
}

async function conReintento(codigo) {
  try { return await pedir(codigo); }
  catch (e) { await new Promise(r => setTimeout(r, 1500)); return pedir(codigo); }
}

(async () => {
  const estaciones = JSON.parse(fs.readFileSync(ARCHIVO_ESTACIONES, 'utf8'));
  const resultados = [];
  let errores = 0, primerError = null, i = 0;

  await Promise.all(Array.from({ length: SIMULTANEAS }, async () => {
    while (i < estaciones.length) {
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

  let anterior = null;
  try { anterior = JSON.parse(fs.readFileSync(ARCHIVO_SALIDA, 'utf8')).estaciones; } catch (e) {}
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
})().catch(e => { console.error(e.message); process.exit(1); });
