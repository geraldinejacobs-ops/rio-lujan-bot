// Hace dos cosas, sin tocar el robot actual del río:
//  1) Lee los avisos a corto plazo del SMN y los guarda en data/alertas-smn.json
//  2) Agrega cada lectura nueva del río Luján a data/historial-rio-lujan.csv
import fs from 'node:fs';

const SMN_FEEDS = [
  'http://www3.smn.gob.ar/feeds/CAP/avisocortoplazo/rss_acpCAP.xml',
  'https://www3.smn.gob.ar/feeds/CAP/avisocortoplazo/rss_acpCAP.xml',
];

function limpiar(txt) {
  return (txt || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function campo(item, tag) {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? limpiar(m[1]) : '';
}

async function leerAvisosSMN() {
  let xml = null;
  for (const url of SMN_FEEDS) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.ok) { xml = await r.text(); break; }
    } catch (e) {
      console.log('No se pudo leer', url, '-', e.message);
    }
  }
  if (xml === null) return null; // si falló, no se toca el archivo

  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return items
    .map((it) => ({
      titulo: campo(it, 'title'),
      descripcion: campo(it, 'description'),
      link: campo(it, 'link'),
      fecha: campo(it, 'pubDate'),
    }))
    .filter((a) => !/no se han emitido|no hay avisos/i.test(`${a.titulo} ${a.descripcion}`));
}

function escribirSiCambio(ruta, objeto) {
  const nuevo = JSON.stringify(objeto, null, 2) + '\n';
  let actual = '';
  try { actual = fs.readFileSync(ruta, 'utf8'); } catch (e) { /* no existe todavía */ }
  if (actual !== nuevo) {
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(ruta, nuevo);
    console.log('Actualizado', ruta);
  }
}

function guardarHistorial() {
  const origen = 'data/rio-lujan-mercedes.json';
  const destino = 'data/historial-rio-lujan.csv';
  let dato;
  try { dato = JSON.parse(fs.readFileSync(origen, 'utf8')); }
  catch (e) { console.log('Todavía no hay dato del río'); return; }
  if (dato.valor_m == null || !dato.fecha) return;

  let contenido;
  try { contenido = fs.readFileSync(destino, 'utf8'); }
  catch (e) { contenido = 'fecha,valor_m,tendencia,actualizado\n'; }

  const lineas = contenido.trim().split('\n');
  const ultima = lineas[lineas.length - 1] || '';
  if (ultima.startsWith(`${dato.fecha},`)) return; // esa lectura ya está guardada

  const fila = [dato.fecha, dato.valor_m, dato.tendencia || '', dato.actualizado || ''].join(',') + '\n';
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(destino, (contenido.endsWith('\n') ? contenido : contenido + '\n') + fila);
  console.log('Lectura agregada al historial:', dato.fecha, dato.valor_m);
}

const avisos = await leerAvisosSMN();
if (avisos !== null) escribirSiCambio('data/alertas-smn.json', { avisos });
guardarHistorial();
