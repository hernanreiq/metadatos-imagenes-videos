const $ = id => document.getElementById(id);
const input = $('foto');
const zona = $('zona');
const resultado = $('resultado');
const errorBox = $('error');
let urlActual = null;

const VIDEO_EXT = /\.(mp4|m4v|mov|3gp|3g2|webm|mkv|avi)$/i;
const esVideo = f => (f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name);

/* ---------- utilidades comunes ---------- */

function formatear(valor) {
    if (valor instanceof Date) return valor.toLocaleString();
    if (valor instanceof Uint8Array || valor instanceof ArrayBuffer || ArrayBuffer.isView(valor)) {
        return `[${valor.byteLength} bytes binarios]`;
    }
    if (Array.isArray(valor)) return valor.map(formatear).join(', ');
    if (valor && typeof valor === 'object') {
        try { return JSON.stringify(valor); } catch { return String(valor); }
    }
    return String(valor);
}

function mostrarError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    resultado.style.display = 'none';
}

function fila(clave, valor) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = clave;
    td.textContent = valor;
    tr.append(th, td);
    return tr;
}

function linea(etq, val) {
    const d = document.createElement('div');
    const b = document.createElement('strong');
    b.textContent = etq + ': ';
    d.append(b, document.createTextNode(val));
    return d;
}

function mostrarGps(gps) {
    const ubic = $('ubicacion');
    ubic.innerHTML = '';
    const caja = document.createElement('div');
    if (gps && gps.latitude != null && gps.longitude != null) {
        caja.className = 'gps';
        const mapa = `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=17/${gps.latitude}/${gps.longitude}`;
        caja.append(document.createTextNode(`Ubicación: ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)} `));
        const a = document.createElement('a');
        a.href = mapa; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Ver en mapa';
        caja.appendChild(a);
    } else {
        caja.className = 'sin-gps';
        caja.textContent = 'Este archivo no trae ubicación GPS.';
    }
    ubic.appendChild(caja);
}

function mostrarDisp(pares) {
    const box = $('dispositivo');
    box.innerHTML = '';
    const ok = pares.filter(([, v]) => v != null && v !== '');
    if (!ok.length) return;
    const d = document.createElement('div');
    d.className = 'disp';
    ok.forEach(([e, v]) => d.appendChild(linea(e, formatear(v))));
    box.appendChild(d);
}

function mostrarTabla(pares) {
    const tabla = $('tabla');
    tabla.innerHTML = '';
    pares.forEach(([k, v]) => tabla.appendChild(fila(k, formatear(v))));
    if (!pares.length) {
        tabla.appendChild(fila('Sin metadatos', 'El archivo no contiene metadatos, o fueron borrados.'));
    }
    $('contador').textContent = pares.length ? `(${pares.length})` : '';
    resultado.style.display = 'block';
}

async function sha256(file) {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function prepararCabecera(file) {
    if (urlActual) URL.revokeObjectURL(urlActual);
    urlActual = URL.createObjectURL(file);
    const video = esVideo(file);
    const img = $('vista'), vid = $('vistaVideo');
    img.style.display = video ? 'none' : '';
    vid.style.display = video ? '' : 'none';
    if (video) { vid.src = urlActual; img.removeAttribute('src'); }
    else { img.src = urlActual; vid.removeAttribute('src'); }

    const info = $('info');
    info.innerHTML = '';
    [
        ['Nombre', file.name],
        ['Tipo', file.type || 'desconocido'],
        ['Tamaño', file.size > 1048576 ? (file.size / 1048576).toFixed(2) + ' MB' : (file.size / 1024).toFixed(1) + ' KB'],
        ['Modificado', new Date(file.lastModified).toLocaleString()],
    ].forEach(([k, v]) => info.appendChild(linea(k, v)));

    const h = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hash-btn'; btn.textContent = 'Calcular SHA-256';
    btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Calculando…';
        try {
            const v = await sha256(file);
            const s = document.createElement('span');
            s.className = 'hash-val'; s.textContent = v;
            h.innerHTML = '';
            const b = document.createElement('strong');
            b.textContent = 'SHA-256: ';
            h.append(b, s);
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Calcular SHA-256';
            mostrarError('No se pudo calcular el hash: ' + e.message);
        }
    });
    h.appendChild(btn);
    info.appendChild(h);
}

/* ---------- fotos ---------- */

async function procesarFoto(file) {
    $('extras').innerHTML = '';
    let data = null, gps = null;
    try {
        data = await exifr.parse(file, {
            tiff: true, xmp: true, icc: true, iptc: true, jfif: true, ihdr: true,
            ifd0: true, exif: true, gps: true, interop: true, ifd1: true,
            makerNote: true, userComment: true, multiSegment: true,
            mergeOutput: true, sanitize: false, translateKeys: true, translateValues: true,
            reviveValues: true
        });
        gps = await exifr.gps(file);
    } catch (err) {
        mostrarError('No se pudo leer la foto: ' + err.message);
        return;
    }

    mostrarGps(gps);

    const camposDisp = [
        ['Fabricante', 'Make'], ['Modelo', 'Model'], ['Nombre del equipo', 'HostComputer'],
        ['Software', 'Software'], ['Lente', 'LensModel'], ['Dueño de cámara', 'CameraOwnerName'],
        ['Serie del cuerpo', 'BodySerialNumber'], ['Serie del lente', 'LensSerialNumber'],
        ['Serie interna', 'InternalSerialNumber'], ['ID único de imagen', 'ImageUniqueID'],
        ['Artista', 'Artist'], ['Fecha original', 'DateTimeOriginal'],
        ['Zona horaria', 'OffsetTimeOriginal']
    ];
    mostrarDisp(camposDisp.map(([e, c]) => [e, data ? data[c] : null]));

    const claves = data ? Object.keys(data).sort() : [];
    mostrarTabla(claves.map(k => [k, data[k]]));
}

/* ---------- videos: lector de contenedor MP4 / MOV ---------- */

const E1904 = Date.UTC(1904, 0, 1);
const C2PA_UUID = 'd8fec3d61b0e483c92975828877ec481';

const cc = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
const txt = (dv, ini, fin) => new TextDecoder('utf-8')
    .decode(new Uint8Array(dv.buffer, dv.byteOffset + ini, Math.max(0, fin - ini)))
    .replace(/\u0000+$/, '');
const fechaMp4 = s => s ? new Date(E1904 + s * 1000) : null;
const fmtFecha = d => d ? d.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'vacía (0 o borrada)';
const gcd = (a, b) => b ? gcd(b, a % b) : a;

function* cajas(dv, ini, fin) {
    fin = Math.min(fin, dv.byteLength);
    let o = ini;
    while (o + 8 <= fin) {
        let size = dv.getUint32(o), hdr = 8;
        const tipo = cc(dv, o + 4);
        if (size === 1) {
            if (o + 16 > fin) return;
            size = Number(dv.getBigUint64(o + 8)); hdr = 16;
        } else if (size === 0) size = fin - o;
        if (size < hdr) return;
        yield { tipo, o, ini: o + hdr, fin: Math.min(o + size, fin) };
        o += size;
    }
}

async function cajasTop(file) {
    const res = [];
    let o = 0;
    while (o + 8 <= file.size && res.length < 300) {
        const dv = new DataView(await file.slice(o, o + 16).arrayBuffer());
        if (dv.byteLength < 8) break;
        let size = dv.getUint32(0), hdr = 8;
        const tipo = cc(dv, 4);
        if (size === 1 && dv.byteLength >= 16) { size = Number(dv.getBigUint64(8)); hdr = 16; }
        else if (size === 0) size = file.size - o;
        if (size < hdr) break;
        res.push({ tipo, o, size, hdr });
        o += size;
    }
    return res;
}

function nombreHandler(dv, ini, fin) {
    if (ini >= fin) return '';
    const n = dv.getUint8(ini);
    if (n > 0 && n < 32 && n <= fin - ini - 1) return txt(dv, ini + 1, ini + 1 + n);
    return txt(dv, ini, fin).split('\u0000')[0];
}

function perfilAvc(p, l) {
    const n = { 66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10', 122: 'High 4:2:2', 244: 'High 4:4:4' };
    return `H.264 ${n[p] || p} nivel ${(l / 10).toFixed(1)}`;
}

function iso6709(s) {
    const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s.trim());
    return m ? { latitude: +m[1], longitude: +m[2] } : null;
}

function addTag(out, k, v) {
    if (/location|xyz/i.test(k)) {
        const g = iso6709(String(v));
        if (g && !out.gps) out.gps = g;
    }
    let nombre = k, i = 2;
    while (nombre in out.etiquetas) nombre = k + ' #' + (i++);
    out.etiquetas[nombre] = v;
}

function parseMeta(dv, c, out) {
    let ini = c.ini;
    if (c.fin - ini >= 8 && dv.getUint32(ini) === 0) ini += 4;
    const keys = [];
    for (const m of cajas(dv, ini, c.fin)) {
        if (m.tipo === 'keys') {
            const n = dv.getUint32(m.ini + 4);
            let o = m.ini + 8;
            for (let i = 0; i < n && o + 8 <= m.fin; i++) {
                const sz = dv.getUint32(o);
                if (sz < 8) break;
                keys.push(txt(dv, o + 8, o + sz));
                o += sz;
            }
        } else if (m.tipo === 'ilst') {
            for (const it of cajas(dv, m.ini, m.fin)) {
                const idx = dv.getUint32(it.o + 4);
                const nombre = (keys.length && idx >= 1 && idx <= keys.length) ? keys[idx - 1] : it.tipo;
                for (const d of cajas(dv, it.ini, it.fin)) {
                    if (d.tipo !== 'data') continue;
                    const tipoDato = dv.getUint32(d.ini) & 0xffffff;
                    const largo = d.fin - d.ini - 8;
                    let val;
                    if (tipoDato === 1) val = txt(dv, d.ini + 8, d.fin);
                    else if (tipoDato === 21 && largo === 1) val = dv.getInt8(d.ini + 8);
                    else if (tipoDato === 21 && largo === 2) val = dv.getInt16(d.ini + 8);
                    else if (tipoDato === 21 && largo === 4) val = dv.getInt32(d.ini + 8);
                    else val = `[${largo} bytes]`;
                    addTag(out, nombre, val);
                }
            }
        }
    }
}

function parseUdta(dv, c, out) {
    const otras = [];
    for (const u of cajas(dv, c.ini, c.fin)) {
        if (u.tipo.charCodeAt(0) === 0xA9 && u.fin - u.ini > 4) addTag(out, 'udta:' + u.tipo, txt(dv, u.ini + 4, u.fin));
        else if (u.tipo === 'meta') parseMeta(dv, u, out);
        else otras.push(`${u.tipo} (${u.fin - u.ini} B)`);
    }
    if (otras.length) addTag(out, 'udta:otras cajas', otras.join(', '));
}

function parseStbl(dv, s, p) {
    for (const x of cajas(dv, s.ini, s.fin)) {
        if (x.tipo === 'stsd') {
            const e = x.ini + 8, esz = dv.getUint32(e);
            p.codec = cc(dv, e + 4);
            const base = e + 16;
            if (p.tipo === 'vide') {
                p.ancho = dv.getUint16(base + 16);
                p.alto = dv.getUint16(base + 18);
                const n = dv.getUint8(base + 34);
                p.compresor = txt(dv, base + 35, base + 35 + Math.min(n, 31));
                for (const h of cajas(dv, e + 86, Math.min(e + esz, x.fin))) {
                    if (h.tipo === 'avcC') p.perfil = perfilAvc(dv.getUint8(h.ini + 1), dv.getUint8(h.ini + 3));
                    if (h.tipo === 'hvcC') p.perfil = 'HEVC perfil ' + (dv.getUint8(h.ini + 1) & 31);
                }
            } else if (p.tipo === 'soun') {
                p.canales = dv.getUint16(base + 8);
                p.hz = dv.getUint32(base + 16) >>> 16;
            }
        } else if (x.tipo === 'stts') {
            const n = Math.min(dv.getUint32(x.ini + 4), 200000);
            let cnt = 0, tot = 0;
            const deltas = new Set();
            for (let i = 0; i < n; i++) {
                const c = dv.getUint32(x.ini + 8 + i * 8), d = dv.getUint32(x.ini + 12 + i * 8);
                cnt += c; tot += c * d; deltas.add(d);
            }
            p.muestras = cnt; p.sttsDur = tot; p.vfr = deltas.size > 2;
        }
    }
}

function parseTrak(dv, c) {
    const p = {};
    for (const a of cajas(dv, c.ini, c.fin)) {
        if (a.tipo === 'tkhd') {
            const v = dv.getUint8(a.ini);
            p.id = dv.getUint32(a.ini + (v ? 20 : 12));
            p.creado = fechaMp4(v ? Number(dv.getBigUint64(a.ini + 4)) : dv.getUint32(a.ini + 4));
            const m = a.ini + (v ? 52 : 40);
            const A = dv.getInt32(m) / 65536, B = dv.getInt32(m + 4) / 65536;
            p.rot = ((Math.round(Math.atan2(B, A) * 180 / Math.PI) % 360) + 360) % 360;
            p.anchoV = dv.getUint32(m + 36) / 65536;
            p.altoV = dv.getUint32(m + 40) / 65536;
        } else if (a.tipo === 'mdia') {
            for (const b of cajas(dv, a.ini, a.fin)) {
                if (b.tipo === 'mdhd') {
                    const v = dv.getUint8(b.ini);
                    let o = b.ini + 4;
                    o += v ? 16 : 8;
                    p.ts = dv.getUint32(o);
                    p.dur = v ? Number(dv.getBigUint64(o + 4)) : dv.getUint32(o + 4);
                    const l = dv.getUint16(o + (v ? 12 : 8));
                    p.idioma = String.fromCharCode(((l >> 10) & 31) + 0x60, ((l >> 5) & 31) + 0x60, (l & 31) + 0x60);
                } else if (b.tipo === 'hdlr') {
                    p.tipo = cc(dv, b.ini + 8);
                    p.handler = nombreHandler(dv, b.ini + 24, b.fin);
                } else if (b.tipo === 'minf') {
                    for (const s of cajas(dv, b.ini, b.fin)) if (s.tipo === 'stbl') parseStbl(dv, s, p);
                }
            }
        }
    }
    return p;
}

async function pistasTexto(file) {
    const N = 512 * 1024;
    const partes = [await file.slice(0, N).arrayBuffer()];
    if (file.size > N) partes.push(await file.slice(Math.max(N, file.size - N)).arrayBuffer());
    const clave = /Lavf|Lavc|x264|x265|CapCut|TikTok|ByteDance|douyin|Adobe|Premiere|DaVinci|HandBrake|FFmpeg|Final Cut|iMovie|OpenAI|Runway|Kling|Hailuo|MiniMax|Midjourney|c2pa|jumb|Content Credentials|InShot|Filmora|Canva|Snapchat|Instagram|WhatsApp|Google|Android|Apple|\b(?:Sora|Veo|Pika|Luma|Grok|xAI)\b/i;
    const hits = new Set();
    for (const b of partes) {
        const s = new TextDecoder('latin1').decode(b);
        for (const m of s.matchAll(/[\x20-\x7e]{5,}/g)) {
            if (clave.test(m[0])) hits.add(m[0].slice(0, 120));
            if (hits.size >= 25) break;
        }
    }
    return [...hits];
}

function metaElemento(file) {
    return new Promise(res => {
        const v = document.createElement('video');
        const fin = r => { v.removeAttribute('src'); res(r); };
        const t = setTimeout(() => fin(null), 4000);
        v.preload = 'metadata';
        v.onloadedmetadata = () => { clearTimeout(t); fin({ dur: v.duration, w: v.videoWidth, h: v.videoHeight }); };
        v.onerror = () => { clearTimeout(t); fin(null); };
        v.src = URL.createObjectURL(file);
    });
}

async function leerVideo(file) {
    const r = { iso: false, general: [], etiquetas: {}, pistas: [], gps: null, c2pa: false, errores: [] };
    const top = await cajasTop(file);
    const moov = top.find(b => b.tipo === 'moov');
    const ftyp = top.find(b => b.tipo === 'ftyp');

    if (top.length) {
        r.general.push(['Orden de cajas', top.slice(0, 20).map(b => b.tipo).join(' › ')]);
    }

    if (ftyp) {
        const bytes = new Uint8Array(await file.slice(ftyp.o + ftyp.hdr, ftyp.o + ftyp.size).arrayBuffer());
        const s = i => String.fromCharCode(...bytes.slice(i, i + 4));
        const compat = [];
        for (let i = 8; i + 4 <= bytes.length; i += 4) compat.push(s(i));
        r.general.push(['Marca principal (ftyp)', s(0).trim() || '(vacía)']);
        if (compat.length) r.general.push(['Marcas compatibles', compat.join(', ')]);
    }

    for (const b of top.filter(x => x.tipo === 'uuid')) {
        const u = new Uint8Array(await file.slice(b.o + b.hdr, b.o + b.hdr + 16).arrayBuffer());
        const hex = [...u].map(x => x.toString(16).padStart(2, '0')).join('');
        if (hex === C2PA_UUID) r.c2pa = true;
    }

    if (!moov) return r;
    r.iso = true;
    if (moov.size > 256 * 1048576) { r.errores.push('Bloque moov demasiado grande para leer.'); return r; }

    try {
        const dv = new DataView(await file.slice(moov.o, moov.o + moov.size).arrayBuffer());
        for (const c of cajas(dv, moov.hdr, dv.byteLength)) {
            try {
                if (c.tipo === 'mvhd') {
                    const v = dv.getUint8(c.ini);
                    let o = c.ini + 4, cr, mo, ts, du;
                    if (v === 1) {
                        cr = Number(dv.getBigUint64(o)); mo = Number(dv.getBigUint64(o + 8));
                        ts = dv.getUint32(o + 16); du = Number(dv.getBigUint64(o + 20));
                    } else {
                        cr = dv.getUint32(o); mo = dv.getUint32(o + 4);
                        ts = dv.getUint32(o + 8); du = dv.getUint32(o + 12);
                    }
                    r.general.push(['Creado (mvhd)', fmtFecha(fechaMp4(cr))]);
                    r.general.push(['Modificado (mvhd)', fmtFecha(fechaMp4(mo))]);
                    if (ts) {
                        r.duracion = du / ts;
                        r.general.push(['Duración', r.duracion.toFixed(2) + ' s']);
                    }
                } else if (c.tipo === 'trak') {
                    r.pistas.push(parseTrak(dv, c));
                } else if (c.tipo === 'udta') {
                    parseUdta(dv, c, r);
                } else if (c.tipo === 'meta') {
                    parseMeta(dv, c, r);
                }
            } catch (e) {
                r.errores.push(`Error en caja ${c.tipo}: ${e.message}`);
            }
        }
    } catch (e) {
        r.errores.push('No se pudo leer moov: ' + e.message);
    }

    if (r.duracion) {
        r.general.push(['Tasa de bits media', ((file.size * 8) / r.duracion / 1e6).toFixed(2) + ' Mbps']);
    }
    return r;
}

function buscar(etiquetas, re) {
    for (const [k, v] of Object.entries(etiquetas)) if (re.test(k)) return v;
    return null;
}

function describirPista(p, n) {
    const caja = document.createElement('div');
    caja.className = 'caja';
    const tit = document.createElement('div');
    tit.className = 'tit';
    const nombres = { vide: 'Video', soun: 'Audio', text: 'Texto', sbtl: 'Subtítulos', tmcd: 'Timecode', meta: 'Metadatos' };
    tit.textContent = `Pista ${p.id ?? n}: ${nombres[p.tipo] || p.tipo || 'desconocida'}`;
    caja.appendChild(tit);
    const add = (e, v) => { if (v != null && v !== '') caja.appendChild(linea(e, v)); };

    add('Códec', p.codec + (p.perfil ? ` (${p.perfil})` : ''));
    if (p.tipo === 'vide') {
        if (p.ancho && p.alto) {
            const g = gcd(p.ancho, p.alto);
            add('Resolución codificada', `${p.ancho}×${p.alto} (relación ${p.ancho / g}:${p.alto / g})`);
            if (p.rot === 90 || p.rot === 270) add('Se muestra como', `${p.alto}×${p.ancho} (rotado ${p.rot}°)`);
            else if (p.rot) add('Rotación', p.rot + '°');
        }
        if (p.muestras && p.sttsDur && p.ts) {
            const fps = p.muestras / (p.sttsDur / p.ts);
            add('Cuadros por segundo', fps.toFixed(2) + (p.vfr ? ' (variable)' : ''));
            add('Cuadros totales', p.muestras);
        }
        add('Compresor', p.compresor);
    }
    if (p.tipo === 'soun') {
        add('Canales', p.canales);
        add('Frecuencia', p.hz ? p.hz + ' Hz' : '');
    }
    add('Handler', p.handler);
    add('Idioma', p.idioma);
    return caja;
}

async function procesarVideo(file) {
    const extras = $('extras');
    extras.innerHTML = '';
    let r;
    try {
        r = await leerVideo(file);
    } catch (err) {
        mostrarError('No se pudo leer el video: ' + err.message);
        return;
    }

    let basicos = null;
    if (!r.iso) basicos = await metaElemento(file);

    mostrarGps(r.gps);

    const et = r.etiquetas;
    const g = new Map(r.general);
    mostrarDisp([
        ['Marca de archivo (ftyp)', g.get('Marca principal (ftyp)')],
        ['Fecha de creación', g.get('Creado (mvhd)')],
        ['Fecha de modificación', g.get('Modificado (mvhd)')],
        ['Fabricante', buscar(et, /make|©mak/i)],
        ['Modelo', buscar(et, /model|©mod/i)],
        ['Software', buscar(et, /software|©swr/i)],
        ['Encoder', buscar(et, /©too|encoder/i)],
        ['Fecha (etiqueta)', buscar(et, /creationdate|©day/i)],
    ]);

    // C2PA
    const c2 = document.createElement('div');
    c2.className = 'caja' + (r.c2pa ? ' c2pa-si' : '');
    c2.appendChild(linea('Credenciales C2PA', r.c2pa ? 'presentes en el archivo' : 'no encontradas'));
    const nota = document.createElement('div');
    nota.className = 'peq';
    nota.textContent = r.c2pa
        ? 'Hay manifiesto de procedencia. Indica herramienta y firma, no la persona.'
        : 'Ausencia no prueba nada. Las plataformas y editores suelen borrarlas al recodificar.';
    c2.appendChild(nota);
    extras.appendChild(c2);

    // Pistas
    r.pistas.forEach((p, i) => extras.appendChild(describirPista(p, i + 1)));

    if (!r.iso) {
        const b = document.createElement('div');
        b.className = 'caja';
        b.appendChild(linea('Contenedor', 'no es MP4/MOV. Solo datos básicos del navegador.'));
        if (basicos) {
            b.appendChild(linea('Duración', basicos.dur.toFixed(2) + ' s'));
            b.appendChild(linea('Resolución', `${basicos.w}×${basicos.h}`));
            r.general.push(['Duración', basicos.dur.toFixed(2) + ' s'], ['Resolución', `${basicos.w}×${basicos.h}`]);
        }
        extras.appendChild(b);
    }

    // Pistas de software en el texto del archivo
    const hits = await pistasTexto(file);
    if (hits.length) {
        const h = document.createElement('div');
        h.className = 'caja';
        const t = document.createElement('div');
        t.className = 'tit';
        t.textContent = 'Texto reconocible dentro del archivo';
        h.appendChild(t);
        hits.forEach(s => { const d = document.createElement('div'); d.textContent = s; h.appendChild(d); });
        const n = document.createElement('div');
        n.className = 'peq';
        n.textContent = 'Son coincidencias de texto en el inicio y el final del archivo. Pueden ser falsas y se borran con facilidad. Dan pistas, no prueba.';
        h.appendChild(n);
        extras.appendChild(h);
    }

    if (r.errores.length) {
        const e = document.createElement('div');
        e.className = 'caja';
        r.errores.forEach(m => { const d = document.createElement('div'); d.textContent = m; e.appendChild(d); });
        extras.appendChild(e);
    }

    const pares = [...r.general, ...Object.entries(et)];
    r.pistas.forEach((p, i) => {
        const n = p.id ?? i + 1;
        if (p.creado) pares.push([`Pista ${n} · creada (tkhd)`, fmtFecha(p.creado)]);
        if (p.handler) pares.push([`Pista ${n} · handler`, p.handler]);
    });
    mostrarTabla(pares);
}

/* ---------- entrada ---------- */

async function procesar(file) {
    errorBox.style.display = 'none';
    if (!file) return;
    prepararCabecera(file);
    if (esVideo(file)) await procesarVideo(file);
    else await procesarFoto(file);
}

input.addEventListener('change', e => procesar(e.target.files[0]));

['dragenter', 'dragover'].forEach(ev =>
    zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
['dragleave', 'drop'].forEach(ev =>
    zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
zona.addEventListener('drop', e => procesar(e.dataTransfer.files[0]));