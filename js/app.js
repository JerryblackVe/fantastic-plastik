/* ============================================
   FANTASTIC PLASTIK - App Principal v3
   Supabase Edition - Cloud Database
   ============================================ */

const SUPABASE_URL = 'https://kltmnefipiqooqupycnl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsdG1uZWZpcGlxb29xdXB5Y25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTMyNjIsImV4cCI6MjA5MDI4OTI2Mn0.WooVjFLihzL6DqWI2KCIlve2hS0Nvl52Rj9lVaTwkv8';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let data = { gastosFijos: [], gastosEmpaque: [], materiasPrimas: [], impresoras: [], serviciosTerceros: [], productos: [], ventas: [], precioKWH: 160, costoTrabajoPorMinuto: 33.33 };
let charts = {};
let rendimientoPeriodo = 'mensual';

// ---- Snake/Camel mapping ----
const mapGastoEmpaque = r => ({ id: r.id, nombre: r.nombre, precioUnitario: Number(r.precio_unitario) });
const mapServicio = r => ({ id: r.id, nombre: r.nombre, unidad: r.unidad, cantidad: r.cantidad, piezas: r.piezas, precioUnidad: Number(r.precio_unidad) });
const mapProducto = r => ({ id: r.id, nombre: r.nombre, gramosFilamento: Number(r.gramos_filamento), materiaPrimaId: r.materia_prima_id, impresoraId: r.impresora_id, tiempoImpresion: Number(r.tiempo_impresion), tiempoTrabajo: Number(r.tiempo_trabajo), precioVenta: Number(r.precio_venta), precioMinorista: Number(r.precio_minorista), servicios: [], descuentos: [] });
const mapDescuento = r => ({ id: r.id, productoId: r.producto_id, cantidadMinima: r.cantidad_minima, precio: Number(r.precio) });

const App = {
    // ---- INIT ----
    async init() {
        await this.loadData();
        this.initNavigation();
        this.initMobileMenu();
        this.initDefaultFilters();
        this.renderAll();
        setTimeout(() => this.renderRendimiento(), 100);
    },

    async loadData() {
        try {
            const [cfgRes, gfRes, geRes, mpRes, impRes, stRes, prodRes, psRes, pdRes, ventRes, vaRes, veRes] = await Promise.all([
                sb.from('config').select('*').single(),
                sb.from('gastos_fijos').select('*').order('id'),
                sb.from('gastos_empaque').select('*').order('id'),
                sb.from('materias_primas').select('*').order('id'),
                sb.from('impresoras').select('*').order('id'),
                sb.from('servicios_terceros').select('*').order('id'),
                sb.from('productos').select('*').order('id'),
                sb.from('producto_servicios').select('*'),
                sb.from('producto_descuentos').select('*').order('cantidad_minima'),
                sb.from('ventas').select('*').order('created_at', { ascending: false }),
                sb.from('venta_articulos').select('*'),
                sb.from('venta_empaque').select('*')
            ]);

            if (cfgRes.data) {
                data.precioKWH = Number(cfgRes.data.precio_kwh);
                data.costoTrabajoPorMinuto = Number(cfgRes.data.costo_trabajo_por_minuto);
            }
            data.gastosFijos = (gfRes.data || []).map(r => ({ id: r.id, nombre: r.nombre, monto: Number(r.monto) }));
            data.gastosEmpaque = (geRes.data || []).map(mapGastoEmpaque);
            data.materiasPrimas = (mpRes.data || []).map(r => ({ id: r.id, nombre: r.nombre, unidad: r.unidad, precio: Number(r.precio) }));
            data.impresoras = (impRes.data || []).map(r => ({ id: r.id, nombre: r.nombre, watios: Number(r.watios) }));
            data.serviciosTerceros = (stRes.data || []).map(mapServicio);

            // Products with their services and descuentos
            const prodServs = psRes.data || [];
            const prodDescs = pdRes.data || [];
            data.productos = (prodRes.data || []).map(r => {
                const p = mapProducto(r);
                p.servicios = prodServs.filter(ps => ps.producto_id === p.id).map(ps => ({ servicioId: ps.servicio_id, cantidadPiezas: ps.cantidad_piezas }));
                p.descuentos = prodDescs.filter(d => d.producto_id === p.id).map(mapDescuento);
                return p;
            });

            // Ventas with articulos and empaque
            const allArts = vaRes.data || [];
            const allEmps = veRes.data || [];
            data.ventas = (ventRes.data || []).map(v => {
                const articulos = allArts.filter(a => a.venta_id === v.id).map(a => ({
                    productoId: a.producto_id, cantidad: a.cantidad, precioUnitario: Number(a.precio_unitario), subtotal: Number(a.subtotal)
                }));
                const empaque = allEmps.filter(e => e.venta_id === v.id).map(e => ({
                    empaqueId: e.empaque_id, cantidad: e.cantidad, subtotal: Number(e.subtotal)
                }));
                const cantidadTotal = articulos.reduce((s, a) => s + a.cantidad, 0);
                const totalArticulos = articulos.reduce((s, a) => s + a.subtotal, 0);
                const totalEmpaque = empaque.reduce((s, e) => s + e.subtotal, 0);
                const total = totalArticulos + totalEmpaque;
                const estadoPago = v.estado_pago || 'Completo';
                const montoPagado = v.monto_pagado != null ? Number(v.monto_pagado) : total;
                return {
                    id: v.id, fecha: v.fecha, tipoVenta: v.tipo_venta, canal: v.canal,
                    cliente: v.cliente || '', metodoPago: v.metodo_pago || '', ocasion: v.ocasion || '',
                    notas: v.notas || '', estadoPago, montoPagado,
                    articulos, empaque, cantidadTotal, totalArticulos, totalEmpaque, total
                };
            });

            console.log('Datos cargados desde Supabase');
        } catch (err) {
            console.error('Error cargando datos:', err);
            this.toast('Error al cargar datos', 'error');
        }
    },

    // ---- NAVIGATION ----
    initNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(item.dataset.section);
            });
        });
    },

    navigateTo(section) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${section}`).classList.add('active');
        document.getElementById('sidebar').classList.remove('open');
        if (section === 'rendimiento') setTimeout(() => this.renderRendimiento(), 50);
    },

    initMobileMenu() {
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
    },

    initDefaultFilters() {
        const now = new Date();
        document.getElementById('filtroMes').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    },

    renderAll() {
        this.renderGastosFijos();
        this.renderGastosEmpaque();
        this.renderGastosVariables();
        this.renderProductos();
        this.renderVentas();
    },

    refreshAll() {
        this.renderProductos();
        this.renderVentas();
    },

    // ---- HELPERS ----
    formatMoney(n) { return (n === null || n === undefined || isNaN(n)) ? '$0' : '$' + Math.round(n).toLocaleString('es-AR'); },
    formatPercent(n) { return (n === null || n === undefined || isNaN(n)) ? '0%' : (n * 100).toFixed(1) + '%'; },
    formatFecha(d) { if (!d) return '-'; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; },

    toast(msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fas ${icons[type]}"></i> ${msg}`;
        container.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },

    // ---- CALCULATIONS ----
    getTotalGastosFijos() { return data.gastosFijos.reduce((s, c) => s + (c.monto || 0), 0); },
    getMateriaPrima(id) { return data.materiasPrimas.find(m => m.id === id); },
    getImpresora(id) { return data.impresoras.find(i => i.id === id); },
    getServicioTercero(id) { return data.serviciosTerceros.find(s => s.id === id); },
    getGastoEmpaque(id) { return data.gastosEmpaque.find(e => e.id === id); },

    calcCostoProducto(prod) {
        const materia = this.getMateriaPrima(prod.materiaPrimaId);
        const impresora = this.getImpresora(prod.impresoraId);
        const gastoFilamento = materia ? (prod.gramosFilamento * materia.precio / 1000) : 0;
        const kw = impresora ? impresora.watios / 1000 : 0;
        const costoElectricidad = kw * (prod.tiempoImpresion / 60) * data.precioKWH;
        const costoTrabajador = prod.tiempoTrabajo * data.costoTrabajoPorMinuto;
        let costoServicios = 0;
        if (prod.servicios) {
            prod.servicios.forEach(s => {
                const serv = this.getServicioTercero(s.servicioId);
                if (serv) costoServicios += (serv.precioUnidad / (serv.piezas || 1)) * (s.cantidadPiezas || 1);
            });
        }
        const costoTotal = gastoFilamento + costoElectricidad + costoServicios + costoTrabajador;
        const margen = prod.precioVenta > 0 ? (prod.precioVenta - costoTotal) / prod.precioVenta : 0;
        return { gastoFilamento, costoElectricidad, costoServicios, costoTrabajador, costoTotal, margen, gananciaBruta: prod.precioVenta - costoTotal };
    },

    // ========================================
    //  GASTOS FIJOS
    // ========================================
    renderGastosFijos() {
        const tbody = document.querySelector('#tablaGastosFijos tbody');
        const total = this.getTotalGastosFijos();
        tbody.innerHTML = data.gastosFijos.map(c => {
            const pct = total > 0 ? ((c.monto / total) * 100).toFixed(1) : 0;
            return `<tr>
                <td class="editable-cell" onclick="App.editGastoFijo(${c.id}, 'nombre', this)">${c.nombre}</td>
                <td class="editable-cell" onclick="App.editGastoFijo(${c.id}, 'monto', this)">${this.formatMoney(c.monto)}</td>
                <td>${pct}%</td>
                <td><button class="btn-icon delete" onclick="App.deleteGastoFijo(${c.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        }).join('');
        document.getElementById('totalGastosFijos').innerHTML = `<strong>${this.formatMoney(total)}</strong>`;
    },

    editGastoFijo(id, field, td) {
        const item = data.gastosFijos.find(c => c.id === id);
        if (!item) return;
        const inputType = field === 'monto' ? 'number' : 'text';
        const rawVal = item[field];
        td.innerHTML = `<input class="cell-input" type="${inputType}" value="${rawVal}" onblur="App.saveGastoFijo(${id}, '${field}', this.value)" onkeydown="if(event.key==='Enter') this.blur();" autofocus>`;
        td.querySelector('input').focus();
    },

    async saveGastoFijo(id, field, value) {
        const item = data.gastosFijos.find(c => c.id === id);
        if (!item) return;
        if (field === 'monto') item.monto = parseFloat(value) || 0;
        else item.nombre = value || 'Sin nombre';
        await sb.from('gastos_fijos').update({ [field]: field === 'monto' ? item.monto : item.nombre }).eq('id', id);
        this.renderGastosFijos();
    },

    async addGastoFijo() {
        const { data: row } = await sb.from('gastos_fijos').insert({ nombre: 'Nuevo gasto', monto: 0 }).select().single();
        if (row) data.gastosFijos.push({ id: row.id, nombre: row.nombre, monto: Number(row.monto) });
        this.renderGastosFijos();
        this.toast('Gasto fijo agregado');
    },

    async deleteGastoFijo(id) {
        if (!confirm('¿Eliminar este gasto fijo?')) return;
        await sb.from('gastos_fijos').delete().eq('id', id);
        data.gastosFijos = data.gastosFijos.filter(c => c.id !== id);
        this.renderGastosFijos();
        this.toast('Gasto eliminado', 'info');
    },

    // ========================================
    //  GASTOS EMPAQUE
    // ========================================
    renderGastosEmpaque() {
        const tbody = document.querySelector('#tablaGastosEmpaque tbody');
        tbody.innerHTML = data.gastosEmpaque.map(e => `<tr>
            <td class="editable-cell" onclick="App.editGastoEmpaque(${e.id}, 'nombre', this)">${e.nombre}</td>
            <td class="editable-cell" onclick="App.editGastoEmpaque(${e.id}, 'precioUnitario', this)">${this.formatMoney(e.precioUnitario)}</td>
            <td><button class="btn-icon delete" onclick="App.deleteGastoEmpaque(${e.id})"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('');
    },

    editGastoEmpaque(id, field, td) {
        const item = data.gastosEmpaque.find(e => e.id === id);
        if (!item) return;
        const inputType = field === 'precioUnitario' ? 'number' : 'text';
        td.innerHTML = `<input class="cell-input" type="${inputType}" value="${item[field]}" onblur="App.saveGastoEmpaque(${id}, '${field}', this.value)" onkeydown="if(event.key==='Enter') this.blur();" autofocus>`;
        td.querySelector('input').focus();
    },

    async saveGastoEmpaque(id, field, value) {
        const item = data.gastosEmpaque.find(e => e.id === id);
        if (!item) return;
        if (field === 'precioUnitario') item.precioUnitario = parseFloat(value) || 0;
        else item.nombre = value || 'Sin nombre';
        const dbField = field === 'precioUnitario' ? 'precio_unitario' : 'nombre';
        const dbValue = field === 'precioUnitario' ? item.precioUnitario : item.nombre;
        await sb.from('gastos_empaque').update({ [dbField]: dbValue }).eq('id', id);
        this.renderGastosEmpaque();
    },

    async addGastoEmpaque() {
        const { data: row } = await sb.from('gastos_empaque').insert({ nombre: 'Nuevo empaque', precio_unitario: 0 }).select().single();
        if (row) data.gastosEmpaque.push(mapGastoEmpaque(row));
        this.renderGastosEmpaque();
        this.toast('Item de empaque agregado');
    },

    async deleteGastoEmpaque(id) {
        if (!confirm('¿Eliminar este item de empaque?')) return;
        await sb.from('gastos_empaque').delete().eq('id', id);
        data.gastosEmpaque = data.gastosEmpaque.filter(e => e.id !== id);
        this.renderGastosEmpaque();
        this.toast('Item eliminado', 'info');
    },

    // ========================================
    //  GASTOS VARIABLES
    // ========================================
    renderGastosVariables() {
        this.renderMateriasPrimas();
        this.renderImpresoras();
        this.renderServiciosTerceros();
        document.getElementById('precioKWH').value = data.precioKWH;
        document.getElementById('costoTrabajo').value = data.costoTrabajoPorMinuto;
    },

    async updatePrecioKWH(val) {
        data.precioKWH = parseFloat(val) || 0;
        await sb.from('config').update({ precio_kwh: data.precioKWH }).eq('id', 1);
        this.renderImpresoras();
        this.refreshAll();
        this.toast('Precio KWH actualizado');
    },

    async updateCostoTrabajo(val) {
        data.costoTrabajoPorMinuto = parseFloat(val) || 0;
        await sb.from('config').update({ costo_trabajo_por_minuto: data.costoTrabajoPorMinuto }).eq('id', 1);
        this.refreshAll();
        this.toast('Gasto de trabajo actualizado');
    },

    // -- Materias Primas --
    renderMateriasPrimas() {
        const tbody = document.querySelector('#tablaMateriasPrimas tbody');
        tbody.innerHTML = data.materiasPrimas.map(m => `<tr>
            <td class="editable-cell" onclick="App.editMateria(${m.id}, 'nombre', this)">${m.nombre}</td>
            <td class="editable-cell" onclick="App.editMateria(${m.id}, 'unidad', this)">${m.unidad}</td>
            <td class="editable-cell" onclick="App.editMateria(${m.id}, 'precio', this)">${this.formatMoney(m.precio)}</td>
            <td><button class="btn-icon delete" onclick="App.deleteMateria(${m.id})"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('');
    },

    editMateria(id, field, td) {
        const item = data.materiasPrimas.find(m => m.id === id);
        const inputType = field === 'precio' ? 'number' : 'text';
        td.innerHTML = `<input class="cell-input" type="${inputType}" value="${item[field]}" onblur="App.saveMateria(${id}, '${field}', this.value)" onkeydown="if(event.key==='Enter') this.blur();" autofocus>`;
        td.querySelector('input').focus();
    },

    async saveMateria(id, field, value) {
        const item = data.materiasPrimas.find(m => m.id === id);
        if (field === 'precio') item.precio = parseFloat(value) || 0;
        else item[field] = value || '';
        await sb.from('materias_primas').update({ [field]: item[field] }).eq('id', id);
        this.renderMateriasPrimas();
        this.refreshAll();
    },

    async addMateriaPrima() {
        const { data: row } = await sb.from('materias_primas').insert({ nombre: 'NUEVA', unidad: 'KILO', precio: 0 }).select().single();
        if (row) data.materiasPrimas.push({ id: row.id, nombre: row.nombre, unidad: row.unidad, precio: Number(row.precio) });
        this.renderMateriasPrimas();
        this.toast('Materia prima agregada');
    },

    async deleteMateria(id) {
        const usada = data.productos.filter(p => p.materiaPrimaId === id).map(p => p.nombre);
        if (usada.length > 0) { alert(`No se puede eliminar: usada por ${usada.join(', ')}`); return; }
        if (!confirm('¿Eliminar esta materia prima?')) return;
        await sb.from('materias_primas').delete().eq('id', id);
        data.materiasPrimas = data.materiasPrimas.filter(m => m.id !== id);
        this.renderMateriasPrimas();
        this.refreshAll();
    },

    // -- Impresoras --
    renderImpresoras() {
        const tbody = document.querySelector('#tablaImpresoras tbody');
        tbody.innerHTML = data.impresoras.map(i => {
            const kw = i.watios / 1000;
            return `<tr>
                <td class="editable-cell" onclick="App.editImpresora(${i.id}, 'nombre', this)">${i.nombre}</td>
                <td class="editable-cell" onclick="App.editImpresora(${i.id}, 'watios', this)">${i.watios}W</td>
                <td>${kw.toFixed(3)} KW</td>
                <td>${this.formatMoney(kw * data.precioKWH)}/h</td>
                <td><button class="btn-icon delete" onclick="App.deleteImpresora(${i.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        }).join('');
    },

    editImpresora(id, field, td) {
        const item = data.impresoras.find(i => i.id === id);
        const inputType = field === 'watios' ? 'number' : 'text';
        td.innerHTML = `<input class="cell-input" type="${inputType}" value="${item[field]}" onblur="App.saveImpresora(${id}, '${field}', this.value)" onkeydown="if(event.key==='Enter') this.blur();" autofocus>`;
        td.querySelector('input').focus();
    },

    async saveImpresora(id, field, value) {
        const item = data.impresoras.find(i => i.id === id);
        if (field === 'watios') item.watios = parseFloat(value) || 0;
        else item[field] = value || '';
        await sb.from('impresoras').update({ [field]: item[field] }).eq('id', id);
        this.renderImpresoras();
        this.refreshAll();
    },

    async addImpresora() {
        const { data: row } = await sb.from('impresoras').insert({ nombre: 'NUEVA IMPRESORA', watios: 100 }).select().single();
        if (row) data.impresoras.push({ id: row.id, nombre: row.nombre, watios: Number(row.watios) });
        this.renderImpresoras();
        this.toast('Impresora agregada');
    },

    async deleteImpresora(id) {
        const usada = data.productos.filter(p => p.impresoraId === id).map(p => p.nombre);
        if (usada.length > 0) { alert(`No se puede eliminar: usada por ${usada.join(', ')}`); return; }
        if (!confirm('¿Eliminar esta impresora?')) return;
        await sb.from('impresoras').delete().eq('id', id);
        data.impresoras = data.impresoras.filter(i => i.id !== id);
        this.renderImpresoras();
        this.refreshAll();
    },

    // -- Servicios Terceros --
    renderServiciosTerceros() {
        const tbody = document.querySelector('#tablaServicios tbody');
        tbody.innerHTML = data.serviciosTerceros.map(s => {
            const pxp = s.piezas > 0 ? s.precioUnidad / s.piezas : s.precioUnidad;
            return `<tr>
                <td class="editable-cell" onclick="App.editServicio(${s.id}, 'nombre', this)">${s.nombre}</td>
                <td class="editable-cell" onclick="App.editServicio(${s.id}, 'unidad', this)">${s.unidad}</td>
                <td class="editable-cell" onclick="App.editServicio(${s.id}, 'cantidad', this)">${s.cantidad}</td>
                <td class="editable-cell" onclick="App.editServicio(${s.id}, 'piezas', this)">${s.piezas}</td>
                <td class="editable-cell" onclick="App.editServicio(${s.id}, 'precioUnidad', this)">${this.formatMoney(s.precioUnidad)}</td>
                <td>${this.formatMoney(pxp)}</td>
                <td><button class="btn-icon delete" onclick="App.deleteServicio(${s.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        }).join('');
    },

    editServicio(id, field, td) {
        const item = data.serviciosTerceros.find(s => s.id === id);
        const numFields = ['cantidad', 'piezas', 'precioUnidad'];
        const inputType = numFields.includes(field) ? 'number' : 'text';
        td.innerHTML = `<input class="cell-input" type="${inputType}" value="${item[field]}" onblur="App.saveServicio(${id}, '${field}', this.value)" onkeydown="if(event.key==='Enter') this.blur();" autofocus>`;
        td.querySelector('input').focus();
    },

    async saveServicio(id, field, value) {
        const item = data.serviciosTerceros.find(s => s.id === id);
        const numFields = ['cantidad', 'piezas', 'precioUnidad'];
        if (numFields.includes(field)) item[field] = parseFloat(value) || 0;
        else item[field] = value || '';
        const dbField = field === 'precioUnidad' ? 'precio_unidad' : field;
        await sb.from('servicios_terceros').update({ [dbField]: item[field] }).eq('id', id);
        this.renderServiciosTerceros();
        this.refreshAll();
    },

    async addServicioTercero() {
        const { data: row } = await sb.from('servicios_terceros').insert({ nombre: 'NUEVO SERVICIO', unidad: 'UNIDAD', cantidad: 1, piezas: 1, precio_unidad: 0 }).select().single();
        if (row) data.serviciosTerceros.push(mapServicio(row));
        this.renderServiciosTerceros();
        this.toast('Servicio agregado');
    },

    async deleteServicio(id) {
        const usado = data.productos.filter(p => p.servicios && p.servicios.some(s => s.servicioId === id)).map(p => p.nombre);
        if (usado.length > 0) { alert(`No se puede eliminar: usado por ${usado.join(', ')}`); return; }
        if (!confirm('¿Eliminar este servicio?')) return;
        await sb.from('servicios_terceros').delete().eq('id', id);
        data.serviciosTerceros = data.serviciosTerceros.filter(s => s.id !== id);
        this.renderServiciosTerceros();
        this.refreshAll();
    },

    // ========================================
    //  PRODUCTOS
    // ========================================
    renderProductos() {
        const grid = document.getElementById('productosGrid');
        grid.innerHTML = data.productos.map(p => {
            const c = this.calcCostoProducto(p);
            const materia = this.getMateriaPrima(p.materiaPrimaId);
            const impresora = this.getImpresora(p.impresoraId);
            const servNames = (p.servicios && p.servicios.length > 0)
                ? p.servicios.map(s => { const sv = this.getServicioTercero(s.servicioId); return sv ? sv.nombre : '?'; }).join(', ')
                : 'Ninguno';

            const margenMinorista = p.precioMinorista > 0 ? (p.precioMinorista - c.costoTotal) / p.precioMinorista : 0;

            const descuentosHtml = (p.descuentos && p.descuentos.length > 0)
                ? `<div class="descuentos-section">
                    <h4><i class="fas fa-tags"></i> Descuentos por Cantidad</h4>
                    <div>${p.descuentos.sort((a, b) => a.cantidadMinima - b.cantidadMinima).map(d => `<span class="descuento-tag">+${d.cantidadMinima} u → ${this.formatMoney(d.precio)}</span>`).join('')}</div>
                </div>` : '';

            return `<div class="producto-card" onclick="this.classList.toggle('open')" data-id="${p.id}">
                <div class="producto-card-header">
                    <div>
                        <h3>${p.nombre}</h3>
                        <div class="producto-card-summary">
                            Gasto: ${this.formatMoney(c.costoTotal)} | Margen: ${this.formatPercent(c.margen)}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                            <span class="producto-precio">${this.formatMoney(p.precioVenta)}<small style="font-weight:400; font-size:10px; opacity:0.7;"> MAY</small></span>
                            <span class="producto-precio" style="background:#22C55E;">${this.formatMoney(p.precioMinorista)}<small style="font-weight:400; font-size:10px; opacity:0.7;"> MIN</small></span>
                        </div>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                </div>
                <div class="producto-card-body">
                    <div class="producto-detail"><span class="label">Material</span><span class="value">${materia ? materia.nombre : '-'} (${p.gramosFilamento}g)</span></div>
                    <div class="producto-detail"><span class="label">Gasto Filamento</span><span class="value">${this.formatMoney(c.gastoFilamento)}</span></div>
                    <div class="producto-detail"><span class="label">Impresora</span><span class="value">${impresora ? impresora.nombre : '-'}</span></div>
                    <div class="producto-detail"><span class="label">Tiempo Impresión</span><span class="value">${p.tiempoImpresion} min</span></div>
                    <div class="producto-detail"><span class="label">Gasto Electricidad</span><span class="value">${this.formatMoney(c.costoElectricidad)}</span></div>
                    <div class="producto-detail"><span class="label">Gasto Trabajador</span><span class="value">${this.formatMoney(c.costoTrabajador)} (${p.tiempoTrabajo} min)</span></div>
                    <div class="producto-detail"><span class="label">Servicios Terceros</span><span class="value">${servNames}</span></div>
                    <div class="producto-detail"><span class="label">Gasto Servicios</span><span class="value">${this.formatMoney(c.costoServicios)}</span></div>
                    <div class="producto-detail" style="font-weight:700; border-top:2px solid #eee; padding-top:12px;">
                        <span class="label" style="color:#1A1A1A;font-weight:700;">GASTO TOTAL</span>
                        <span class="value">${this.formatMoney(c.costoTotal)}</span>
                    </div>
                </div>
                ${descuentosHtml}
                <div style="display:flex;">
                    <div class="producto-margen" style="flex:1;">
                        <span class="margen-label">MAYORISTA</span>
                        <span class="margen-value">${this.formatPercent(c.margen)}</span>
                    </div>
                    <div class="producto-margen" style="flex:1; background:#F0FDF4; border-top-color:#22C55E;">
                        <span class="margen-label">MINORISTA</span>
                        <span class="margen-value">${this.formatPercent(margenMinorista)}</span>
                    </div>
                </div>
                <div class="producto-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-secondary" onclick="App.editProducto(${p.id})"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="App.deleteProducto(${p.id})"><i class="fas fa-trash"></i> Eliminar</button>
                </div>
            </div>`;
        }).join('');
    },

    addProducto() { this.abrirModalProducto(); },

    abrirModalProducto() {
        document.getElementById('modalProducto').classList.add('active');
        this.populateProductoSelects();
        this.updateProductoPreview();
    },

    cerrarModalProducto() {
        document.getElementById('modalProducto').classList.remove('active');
        document.getElementById('productoEditId').value = '';
        document.getElementById('productoNombre').value = '';
        document.getElementById('productoGramos').value = 0;
        document.getElementById('productoTiempoImpresion').value = 0;
        document.getElementById('productoTiempoTrabajo').value = 0;
        document.getElementById('productoPrecioVenta').value = 0;
        document.getElementById('productoPrecioMinorista').value = 0;
        document.getElementById('productoServicios').innerHTML = '';
        document.getElementById('productoDescuentos').innerHTML = '';
        document.getElementById('modalProductoTitulo').textContent = 'Nuevo Producto';
    },

    populateProductoSelects() {
        const ms = document.getElementById('productoMateria');
        ms.innerHTML = data.materiasPrimas.map(m => `<option value="${m.id}">${m.nombre} (${this.formatMoney(m.precio)}/kg)</option>`).join('');
        const is = document.getElementById('productoImpresora');
        is.innerHTML = data.impresoras.map(i => `<option value="${i.id}">${i.nombre} (${i.watios}W)</option>`).join('');
        ['productoGramos', 'productoTiempoImpresion', 'productoTiempoTrabajo', 'productoPrecioVenta', 'productoPrecioMinorista'].forEach(id => {
            const el = document.getElementById(id);
            el.onchange = el.oninput = () => this.updateProductoPreview();
        });
        ms.onchange = is.onchange = () => this.updateProductoPreview();
    },

    editProducto(id) {
        const p = data.productos.find(pr => pr.id === id);
        if (!p) return;
        this.abrirModalProducto();
        document.getElementById('modalProductoTitulo').textContent = 'Editar Producto';
        document.getElementById('productoEditId').value = p.id;
        document.getElementById('productoNombre').value = p.nombre;
        document.getElementById('productoGramos').value = p.gramosFilamento;
        document.getElementById('productoMateria').value = p.materiaPrimaId;
        document.getElementById('productoImpresora').value = p.impresoraId;
        document.getElementById('productoTiempoImpresion').value = p.tiempoImpresion;
        document.getElementById('productoTiempoTrabajo').value = p.tiempoTrabajo;
        document.getElementById('productoPrecioVenta').value = p.precioVenta;
        document.getElementById('productoPrecioMinorista').value = p.precioMinorista || 0;
        const container = document.getElementById('productoServicios');
        container.innerHTML = '';
        if (p.servicios) p.servicios.forEach(s => this.renderServicioProductoRow(container, s.servicioId, s.cantidadPiezas));
        const descContainer = document.getElementById('productoDescuentos');
        descContainer.innerHTML = '';
        if (p.descuentos) p.descuentos.forEach(d => this.renderDescuentoRow(descContainer, d.cantidadMinima, d.precio));
        setTimeout(() => this.updateProductoPreview(), 50);
    },

    addServicioProducto() {
        this.renderServicioProductoRow(document.getElementById('productoServicios'), data.serviciosTerceros[0]?.id || 0, 1);
        this.updateProductoPreview();
    },

    addDescuentoProducto() {
        this.renderDescuentoRow(document.getElementById('productoDescuentos'), 0, 0);
    },

    renderDescuentoRow(container, cantidadMinima, precio) {
        const row = document.createElement('div');
        row.className = 'descuento-row';
        row.innerHTML = `
            <input type="number" class="input-field desc-cantidad" value="${cantidadMinima}" min="1" placeholder="Mín. unidades">
            <input type="number" class="input-field desc-precio" value="${precio}" min="0" placeholder="Precio unitario">
            <button class="btn-icon delete" onclick="this.parentElement.remove();"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
    },

    renderServicioProductoRow(container, servicioId, cantidad) {
        const row = document.createElement('div');
        row.className = 'servicio-row';
        row.innerHTML = `
            <select class="input-field servicio-select" onchange="App.updateProductoPreview()">
                ${data.serviciosTerceros.map(s => {
                    const pxp = s.piezas > 0 ? s.precioUnidad / s.piezas : s.precioUnidad;
                    return `<option value="${s.id}" ${s.id === servicioId ? 'selected' : ''}>${s.nombre} (${this.formatMoney(pxp)}/pza)</option>`;
                }).join('')}
            </select>
            <input type="number" class="input-field servicio-cantidad" value="${cantidad}" min="1" onchange="App.updateProductoPreview()" oninput="App.updateProductoPreview()">
            <button class="btn-icon delete" onclick="this.parentElement.remove(); App.updateProductoPreview();"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
    },

    updateProductoPreview() {
        const gramos = parseFloat(document.getElementById('productoGramos').value) || 0;
        const materia = this.getMateriaPrima(parseInt(document.getElementById('productoMateria').value));
        const impresora = this.getImpresora(parseInt(document.getElementById('productoImpresora').value));
        const tiempoImp = parseFloat(document.getElementById('productoTiempoImpresion').value) || 0;
        const tiempoTrab = parseFloat(document.getElementById('productoTiempoTrabajo').value) || 0;
        const precioVenta = parseFloat(document.getElementById('productoPrecioVenta').value) || 0;
        const precioMinorista = parseFloat(document.getElementById('productoPrecioMinorista').value) || 0;

        const gFil = materia ? (gramos * materia.precio / 1000) : 0;
        const gElec = impresora ? (impresora.watios / 1000) * (tiempoImp / 60) * data.precioKWH : 0;
        const gTrab = tiempoTrab * data.costoTrabajoPorMinuto;
        let gServ = 0;
        document.querySelectorAll('#productoServicios .servicio-row').forEach(row => {
            const serv = this.getServicioTercero(parseInt(row.querySelector('.servicio-select').value));
            const cant = parseFloat(row.querySelector('.servicio-cantidad').value) || 0;
            if (serv) gServ += (serv.precioUnidad / (serv.piezas || 1)) * cant;
        });
        const total = gFil + gElec + gServ + gTrab;
        const margenMay = precioVenta > 0 ? (precioVenta - total) / precioVenta : 0;
        const margenMin = precioMinorista > 0 ? (precioMinorista - total) / precioMinorista : 0;

        document.getElementById('productoPreviewCostos').innerHTML = `
            <div class="preview-row"><span>Filamento (${gramos}g)</span><span>${this.formatMoney(gFil)}</span></div>
            <div class="preview-row"><span>Electricidad (${tiempoImp} min)</span><span>${this.formatMoney(gElec)}</span></div>
            <div class="preview-row"><span>Trabajo (${tiempoTrab} min)</span><span>${this.formatMoney(gTrab)}</span></div>
            <div class="preview-row"><span>Servicios Terceros</span><span>${this.formatMoney(gServ)}</span></div>
            <div class="preview-row total"><span>GASTO TOTAL</span><span>${this.formatMoney(total)}</span></div>
            <div class="preview-row"><span>Precio Mayorista</span><span>${this.formatMoney(precioVenta)}</span></div>
            <div class="preview-row" style="color:${margenMay >= 0 ? '#22C55E' : '#EF4444'}; font-weight:600;">
                <span>Margen Mayorista</span><span>${this.formatPercent(margenMay)} (${this.formatMoney(precioVenta - total)})</span>
            </div>
            <div class="preview-row"><span>Precio Minorista</span><span>${this.formatMoney(precioMinorista)}</span></div>
            <div class="preview-row" style="color:${margenMin >= 0 ? '#22C55E' : '#EF4444'}; font-weight:600;">
                <span>Margen Minorista</span><span>${this.formatPercent(margenMin)} (${this.formatMoney(precioMinorista - total)})</span>
            </div>`;
    },

    async guardarProducto() {
        const nombre = document.getElementById('productoNombre').value.trim();
        if (!nombre) { this.toast('Ingresa un nombre', 'error'); return; }
        const servicios = [];
        document.querySelectorAll('#productoServicios .servicio-row').forEach(row => {
            servicios.push({ servicioId: parseInt(row.querySelector('.servicio-select').value), cantidadPiezas: parseFloat(row.querySelector('.servicio-cantidad').value) || 1 });
        });
        const descuentos = [];
        document.querySelectorAll('#productoDescuentos .descuento-row').forEach(row => {
            const cant = parseInt(row.querySelector('.desc-cantidad').value) || 0;
            const prec = parseFloat(row.querySelector('.desc-precio').value) || 0;
            if (cant > 0 && prec > 0) descuentos.push({ cantidadMinima: cant, precio: prec });
        });

        const dbRow = {
            nombre: nombre.toUpperCase(),
            gramos_filamento: parseFloat(document.getElementById('productoGramos').value) || 0,
            materia_prima_id: parseInt(document.getElementById('productoMateria').value),
            impresora_id: parseInt(document.getElementById('productoImpresora').value),
            tiempo_impresion: parseFloat(document.getElementById('productoTiempoImpresion').value) || 0,
            tiempo_trabajo: parseFloat(document.getElementById('productoTiempoTrabajo').value) || 0,
            precio_venta: parseFloat(document.getElementById('productoPrecioVenta').value) || 0,
            precio_minorista: parseFloat(document.getElementById('productoPrecioMinorista').value) || 0
        };

        const editId = document.getElementById('productoEditId').value;
        let prodId;

        if (editId) {
            prodId = parseInt(editId);
            await sb.from('productos').update(dbRow).eq('id', prodId);
            await sb.from('producto_servicios').delete().eq('producto_id', prodId);
            await sb.from('producto_descuentos').delete().eq('producto_id', prodId);
            const idx = data.productos.findIndex(p => p.id === prodId);
            if (idx >= 0) {
                data.productos[idx] = { ...mapProducto({ id: prodId, ...dbRow }), servicios, descuentos };
            }
        } else {
            const { data: row } = await sb.from('productos').insert(dbRow).select().single();
            prodId = row.id;
            data.productos.push({ ...mapProducto(row), servicios, descuentos });
        }

        // Insert servicios
        if (servicios.length > 0) {
            await sb.from('producto_servicios').insert(servicios.map(s => ({
                producto_id: prodId, servicio_id: s.servicioId, cantidad_piezas: s.cantidadPiezas
            })));
        }
        // Insert descuentos
        if (descuentos.length > 0) {
            const { data: insertedDescs } = await sb.from('producto_descuentos').insert(descuentos.map(d => ({
                producto_id: prodId, cantidad_minima: d.cantidadMinima, precio: d.precio
            }))).select();
            const idx = data.productos.findIndex(p => p.id === prodId);
            if (idx >= 0 && insertedDescs) data.productos[idx].descuentos = insertedDescs.map(mapDescuento);
        }

        this.renderProductos();
        this.cerrarModalProducto();
        this.toast(editId ? 'Producto actualizado' : 'Producto creado');
    },

    async deleteProducto(id) {
        if (!confirm('¿Eliminar este producto?')) return;
        await sb.from('productos').delete().eq('id', id);
        data.productos = data.productos.filter(p => p.id !== id);
        this.renderProductos();
        this.toast('Producto eliminado', 'info');
    },

    // ========================================
    //  VENTAS (con empaque)
    // ========================================
    abrirModalVenta(editId) {
        document.getElementById('modalVenta').classList.add('active');
        document.getElementById('ventaEditId').value = '';
        document.getElementById('ventaFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('ventaCliente').value = '';
        document.getElementById('ventaNotas').value = '';
        document.getElementById('ventaArticulos').innerHTML = '';
        document.getElementById('ventaEmpaque').innerHTML = '';
        document.getElementById('ventaTipoVenta').value = 'Mayorista';
        document.getElementById('ventaCanal').value = 'WhatsApp';
        document.getElementById('ventaEstadoPago').value = 'Completo';
        document.getElementById('ventaMontoPagado').value = 0;
        document.getElementById('montoPagadoGroup').style.display = 'none';
        document.getElementById('ventaSaldoDisplay').textContent = '';
        document.getElementById('modalVentaTitulo').textContent = 'Nueva Venta';
        this.addArticuloVenta();
        this.updateVentaTotal();

        if (editId) {
            const v = data.ventas.find(vv => vv.id === editId);
            if (v) {
                document.getElementById('modalVentaTitulo').textContent = 'Editar Venta';
                document.getElementById('ventaEditId').value = v.id;
                document.getElementById('ventaFecha').value = v.fecha;
                document.getElementById('ventaCliente').value = v.cliente;
                document.getElementById('ventaMetodoPago').value = v.metodoPago;
                document.getElementById('ventaOcasion').value = v.ocasion;
                document.getElementById('ventaTipoVenta').value = v.tipoVenta || 'Mayorista';
                document.getElementById('ventaCanal').value = v.canal || 'WhatsApp';
                document.getElementById('ventaEstadoPago').value = v.estadoPago || 'Completo';
                document.getElementById('ventaMontoPagado').value = v.montoPagado || 0;
                this.toggleMontoPagado();
                document.getElementById('ventaNotas').value = v.notas || '';
                document.getElementById('ventaArticulos').innerHTML = '';
                v.articulos.forEach(a => this.renderArticuloVentaRow(a.productoId, a.cantidad, a.precioUnitario));
                document.getElementById('ventaEmpaque').innerHTML = '';
                if (v.empaque) v.empaque.forEach(e => this.renderEmpaqueVentaRow(e.empaqueId, e.cantidad));
                this.updateVentaTotal();
            }
        }
    },

    cerrarModalVenta() { document.getElementById('modalVenta').classList.remove('active'); },

    toggleMontoPagado() {
        const estado = document.getElementById('ventaEstadoPago').value;
        document.getElementById('montoPagadoGroup').style.display = estado === 'Parcial' ? '' : 'none';
        if (estado === 'Completo') {
            document.getElementById('ventaMontoPagado').value = 0;
            document.getElementById('ventaSaldoDisplay').textContent = '';
        }
        this.updateSaldoDisplay();
    },

    updateSaldoDisplay() {
        const estado = document.getElementById('ventaEstadoPago').value;
        if (estado !== 'Parcial') return;
        const totalText = document.getElementById('ventaTotalDisplay').textContent;
        const total = parseFloat(totalText.replace(/[^0-9.-]/g, '').replace(/\./g, '')) || 0;
        const pagado = parseFloat(document.getElementById('ventaMontoPagado').value) || 0;
        const saldo = total - pagado;
        document.getElementById('ventaSaldoDisplay').textContent = saldo > 0 ? `Saldo pendiente: ${this.formatMoney(saldo)}` : 'Pagado';
    },

    addArticuloVenta() { this.renderArticuloVentaRow(data.productos[0]?.id || 0, 1, null); },

    onTipoVentaChange() {
        document.querySelectorAll('#ventaArticulos .articulo-row').forEach(row => this.syncArticuloPrecio(row));
        this.updateVentaTotal();
    },

    renderArticuloVentaRow(productoId, cantidad, precioOverride) {
        const container = document.getElementById('ventaArticulos');
        const row = document.createElement('div');
        row.className = 'articulo-row';
        row.innerHTML = `
            <select class="input-field art-producto" onchange="App.onArticuloChange(this)">
                ${data.productos.map(p => `<option value="${p.id}" ${p.id === productoId ? 'selected' : ''}>${p.nombre}</option>`).join('')}
            </select>
            <input type="number" class="input-field art-cantidad" value="${cantidad}" min="1" onchange="App.onArticuloCantidadChange(this)" oninput="App.onArticuloCantidadChange(this)">
            <input type="number" class="input-field art-precio" value="${precioOverride || 0}" min="0" style="border:2px solid #F59E0B; font-weight:600;" onchange="App.updateVentaTotal()" oninput="App.updateVentaTotal()">
            <span class="art-subtotal" style="font-weight:700; font-size:13px; text-align:right;"></span>
            <button class="btn-icon delete" onclick="this.parentElement.remove(); App.updateVentaTotal();"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
        // Set initial price
        if (!precioOverride) this.syncArticuloPrecio(row);
        this.updateVentaTotal();
    },

    syncArticuloPrecio(row) {
        const prod = data.productos.find(p => p.id === parseInt(row.querySelector('.art-producto').value));
        const cant = parseFloat(row.querySelector('.art-cantidad').value) || 0;
        if (prod) {
            const precio = this.getPrecioVenta(prod, cant);
            row.querySelector('.art-precio').value = precio;
        }
    },

    onArticuloChange(select) {
        const row = select.closest('.articulo-row');
        this.syncArticuloPrecio(row);
        this.updateVentaTotal();
    },

    onArticuloCantidadChange(input) {
        const row = input.closest('.articulo-row');
        this.syncArticuloPrecio(row);
        this.updateVentaTotal();
    },

    addEmpaqueVenta() { this.renderEmpaqueVentaRow(data.gastosEmpaque[0]?.id || 0, 1); },

    renderEmpaqueVentaRow(empaqueId, cantidad) {
        const container = document.getElementById('ventaEmpaque');
        const row = document.createElement('div');
        row.className = 'articulo-row';
        row.innerHTML = `
            <select class="input-field emp-item" onchange="App.updateVentaTotal()">
                ${data.gastosEmpaque.map(e => `<option value="${e.id}" ${e.id === empaqueId ? 'selected' : ''}>${e.nombre} (${this.formatMoney(e.precioUnitario)})</option>`).join('')}
            </select>
            <input type="number" class="input-field emp-cantidad" value="${cantidad}" min="1" onchange="App.updateVentaTotal()" oninput="App.updateVentaTotal()">
            <span class="emp-subtotal" style="font-weight:600; font-size:13px; text-align:right;"></span>
            <button class="btn-icon delete" onclick="this.parentElement.remove(); App.updateVentaTotal();"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
        this.updateVentaTotal();
    },

    getPrecioVenta(prod, cantidad) {
        const tipo = document.getElementById('ventaTipoVenta')?.value || 'Mayorista';
        let precio = tipo === 'Minorista' ? (prod.precioMinorista || prod.precioVenta) : prod.precioVenta;
        // Apply quantity discount (only for mayorista)
        if (tipo === 'Mayorista' && prod.descuentos && prod.descuentos.length > 0 && cantidad > 0) {
            const applicable = prod.descuentos.filter(d => cantidad >= d.cantidadMinima).sort((a, b) => b.cantidadMinima - a.cantidadMinima);
            if (applicable.length > 0) precio = applicable[0].precio;
        }
        return precio;
    },

    updateVentaTotal() {
        let subtotalArt = 0;
        document.querySelectorAll('#ventaArticulos .articulo-row').forEach(row => {
            const cant = parseFloat(row.querySelector('.art-cantidad').value) || 0;
            const precio = parseFloat(row.querySelector('.art-precio').value) || 0;
            const sub = precio * cant;
            row.querySelector('.art-subtotal').textContent = this.formatMoney(sub);
            subtotalArt += sub;
        });
        let subtotalEmp = 0;
        document.querySelectorAll('#ventaEmpaque .articulo-row').forEach(row => {
            const emp = data.gastosEmpaque.find(e => e.id === parseInt(row.querySelector('.emp-item').value));
            const cant = parseFloat(row.querySelector('.emp-cantidad').value) || 0;
            const sub = emp ? emp.precioUnitario * cant : 0;
            row.querySelector('.emp-subtotal').textContent = this.formatMoney(sub);
            subtotalEmp += sub;
        });
        document.getElementById('ventaSubtotalArticulos').textContent = this.formatMoney(subtotalArt);
        document.getElementById('ventaSubtotalEmpaque').textContent = this.formatMoney(subtotalEmp);
        document.getElementById('ventaTotalDisplay').textContent = this.formatMoney(subtotalArt + subtotalEmp);
    },

    async guardarVenta() {
        try {
            const fecha = document.getElementById('ventaFecha').value;
            const cliente = document.getElementById('ventaCliente').value.trim();
            if (!fecha || !cliente) { this.toast('Completa fecha y cliente', 'error'); return; }

            const articulos = [];
            let totalArticulos = 0, cantidadTotal = 0;
            document.querySelectorAll('#ventaArticulos .articulo-row').forEach(row => {
                const productoId = parseInt(row.querySelector('.art-producto').value);
                const cantidad = parseFloat(row.querySelector('.art-cantidad').value) || 0;
                const prod = data.productos.find(p => p.id === productoId);
                if (prod && cantidad > 0) {
                    const precio = parseFloat(row.querySelector('.art-precio').value) || 0;
                    articulos.push({ productoId, cantidad, precioUnitario: precio, subtotal: precio * cantidad });
                    totalArticulos += precio * cantidad;
                    cantidadTotal += cantidad;
                }
            });
            if (articulos.length === 0) { this.toast('Agrega al menos un artículo', 'error'); return; }

            const empaque = [];
            let totalEmpaque = 0;
            document.querySelectorAll('#ventaEmpaque .articulo-row').forEach(row => {
                const empaqueId = parseInt(row.querySelector('.emp-item').value);
                const cantidad = parseFloat(row.querySelector('.emp-cantidad').value) || 0;
                const emp = data.gastosEmpaque.find(e => e.id === empaqueId);
                if (emp && cantidad > 0) {
                    empaque.push({ empaqueId, cantidad, precioUnitario: emp.precioUnitario, subtotal: emp.precioUnitario * cantidad });
                    totalEmpaque += emp.precioUnitario * cantidad;
                }
            });

            const tipoVenta = document.getElementById('ventaTipoVenta').value;
            const canal = document.getElementById('ventaCanal').value;
            const metodoPago = document.getElementById('ventaMetodoPago').value;
            const ocasion = document.getElementById('ventaOcasion').value;
            const notas = document.getElementById('ventaNotas').value.trim();
            const estadoPago = document.getElementById('ventaEstadoPago').value;
            const total = totalArticulos + totalEmpaque;
            const montoPagado = estadoPago === 'Completo' ? total : (parseFloat(document.getElementById('ventaMontoPagado').value) || 0);

            const editId = document.getElementById('ventaEditId').value;
            let ventaId;

            const dbVenta = {
                fecha, tipo_venta: tipoVenta, canal, total_empaque: totalEmpaque,
                cliente, metodo_pago: metodoPago, ocasion, notas,
                estado_pago: estadoPago, monto_pagado: montoPagado
            };

            if (editId) {
                ventaId = parseInt(editId);
                const { error: updErr } = await sb.from('ventas').update(dbVenta).eq('id', ventaId);
                if (updErr) throw updErr;
                const { error: delArtErr } = await sb.from('venta_articulos').delete().eq('venta_id', ventaId);
                if (delArtErr) throw delArtErr;
                const { error: delEmpErr } = await sb.from('venta_empaque').delete().eq('venta_id', ventaId);
                if (delEmpErr) throw delEmpErr;
                const idx = data.ventas.findIndex(v => v.id === ventaId);
                if (idx >= 0) {
                    data.ventas[idx] = { id: ventaId, fecha, cliente, metodoPago, ocasion, tipoVenta, canal, notas, estadoPago, montoPagado, articulos, empaque, cantidadTotal, totalArticulos, totalEmpaque, total };
                }
            } else {
                const { data: row, error: insErr } = await sb.from('ventas').insert(dbVenta).select().single();
                if (insErr) throw insErr;
                ventaId = row.id;
                data.ventas.unshift({ id: ventaId, fecha, cliente, metodoPago, ocasion, tipoVenta, canal, notas, estadoPago, montoPagado, articulos, empaque, cantidadTotal, totalArticulos, totalEmpaque, total });
            }

            // Insert articulos
            if (articulos.length > 0) {
                const { error: artErr } = await sb.from('venta_articulos').insert(articulos.map(a => ({
                    venta_id: ventaId, producto_id: a.productoId, cantidad: a.cantidad,
                    precio_unitario: a.precioUnitario, subtotal: a.subtotal
                })));
                if (artErr) throw artErr;
            }
            // Insert empaque
            if (empaque.length > 0) {
                const { error: empErr } = await sb.from('venta_empaque').insert(empaque.map(e => ({
                    venta_id: ventaId, empaque_id: e.empaqueId, cantidad: e.cantidad, subtotal: e.subtotal
                })));
                if (empErr) throw empErr;
            }

            this.renderVentas();
            this.cerrarModalVenta();
            this.toast(editId ? 'Venta actualizada' : 'Venta registrada');
        } catch (err) {
            console.error('Error guardando venta:', err);
            this.toast('Error al guardar venta: ' + (err.message || err.details || JSON.stringify(err)), 'error');
        }
    },

    async completarPago(id) {
        const v = data.ventas.find(vv => vv.id === id);
        if (!v) return;
        const saldo = v.total - v.montoPagado;
        if (!confirm(`¿Registrar pago del saldo pendiente de ${this.formatMoney(saldo)}?`)) return;
        v.estadoPago = 'Completo';
        v.montoPagado = v.total;
        await sb.from('ventas').update({ estado_pago: 'Completo', monto_pagado: v.total }).eq('id', id);
        this.renderVentas();
        this.toast('Pago completado');
    },

    async registrarAbono(id) {
        const v = data.ventas.find(vv => vv.id === id);
        if (!v) return;
        const saldo = v.total - v.montoPagado;
        const abono = parseFloat(prompt(`Saldo pendiente: ${this.formatMoney(saldo)}\n¿Cuánto abona?`));
        if (!abono || abono <= 0) return;
        const nuevoMonto = Math.min(v.montoPagado + abono, v.total);
        v.montoPagado = nuevoMonto;
        if (nuevoMonto >= v.total) v.estadoPago = 'Completo';
        await sb.from('ventas').update({ estado_pago: v.estadoPago, monto_pagado: nuevoMonto }).eq('id', id);
        this.renderVentas();
        this.toast(v.estadoPago === 'Completo' ? 'Pago completado' : `Abono de ${this.formatMoney(abono)} registrado`);
    },

    async deleteVenta(id) {
        if (!confirm('¿Eliminar esta venta?')) return;
        await sb.from('ventas').delete().eq('id', id);
        data.ventas = data.ventas.filter(v => v.id !== id);
        this.renderVentas();
        this.toast('Venta eliminada', 'info');
    },

    filtrarVentas() { this.renderVentas(); },

    getVentasFiltradas() {
        let ventas = [...data.ventas];
        const mes = document.getElementById('filtroMes').value;
        const metodo = document.getElementById('filtroMetodo').value;
        const ocasion = document.getElementById('filtroOcasion').value;
        const tipo = document.getElementById('filtroTipo').value;
        const canal = document.getElementById('filtroCanal').value;
        if (mes) ventas = ventas.filter(v => v.fecha && v.fecha.startsWith(mes));
        if (metodo) ventas = ventas.filter(v => v.metodoPago === metodo);
        if (ocasion) ventas = ventas.filter(v => v.ocasion === ocasion);
        if (tipo) ventas = ventas.filter(v => v.tipoVenta === tipo);
        if (canal) ventas = ventas.filter(v => v.canal === canal);
        return ventas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    },

    renderVentas() {
        const ventas = this.getVentasFiltradas();
        const tbody = document.querySelector('#tablaVentas tbody');
        const empty = document.getElementById('ventasEmpty');

        if (ventas.length === 0) {
            tbody.innerHTML = '';
            empty.classList.add('visible');
            document.querySelector('#tablaVentas').style.display = 'none';
        } else {
            empty.classList.remove('visible');
            document.querySelector('#tablaVentas').style.display = '';
            tbody.innerHTML = ventas.map(v => {
                const artNames = v.articulos.map(a => { const p = data.productos.find(pr => pr.id === a.productoId); return `${p ? p.nombre : '?'} x${a.cantidad}`; }).join(', ');
                const empNames = (v.empaque && v.empaque.length > 0)
                    ? v.empaque.map(e => { const em = data.gastosEmpaque.find(ee => ee.id === e.empaqueId); return `${em ? em.nombre : '?'} x${e.cantidad}`; }).join(', ')
                    : '-';
                return `<tr>
                    <td>${this.formatFecha(v.fecha)}</td>
                    <td>${v.cliente}</td>
                    <td style="max-width:180px; font-size:12px;">${artNames}</td>
                    <td>${v.cantidadTotal}</td>
                    <td><span class="badge" style="background:${v.tipoVenta === 'Minorista' ? '#E8F5E9' : '#FFF8ED'}; color:${v.tipoVenta === 'Minorista' ? '#2E7D32' : '#E09000'}; padding:2px 8px; border-radius:10px; font-size:11px;">${v.tipoVenta || 'Mayorista'}</span></td>
                    <td style="font-size:12px;">${v.canal || '-'}</td>
                    <td><span class="badge">${v.ocasion}</span></td>
                    <td>${v.metodoPago}</td>
                    <td style="font-weight:600;">${this.formatMoney(v.total)}</td>
                    <td>${v.estadoPago === 'Parcial'
                        ? `<div style="display:flex;flex-direction:column;gap:2px;align-items:center;">
                            <span class="badge" style="background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:11px;">Parcial</span>
                            <span style="font-size:10px;color:#888;">Pagó ${this.formatMoney(v.montoPagado)}</span>
                            <span style="font-size:10px;color:#DC2626;font-weight:600;">Debe ${this.formatMoney(v.total - v.montoPagado)}</span>
                            <div style="display:flex;gap:3px;">
                            <button class="btn btn-sm" style="font-size:9px;padding:2px 5px;background:#3B82F6;color:#fff;border:none;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation();App.registrarAbono(${v.id})">Abonar</button>
                            <button class="btn btn-sm" style="font-size:9px;padding:2px 5px;background:#22C55E;color:#fff;border:none;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation();App.completarPago(${v.id})">Saldar</button>
                            </div>
                          </div>`
                        : `<span class="badge" style="background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:10px;font-size:11px;">Completo</span>`
                    }</td>
                    <td>
                        <button class="btn-icon edit" onclick="App.abrirModalVenta(${v.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="App.deleteVenta(${v.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }

        const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
        const totalUnidades = ventas.reduce((s, v) => s + v.cantidadTotal, 0);
        const totalEmpaque = ventas.reduce((s, v) => s + (v.totalEmpaque || 0), 0);
        const ticketPromedio = ventas.length > 0 ? totalVentas / ventas.length : 0;

        document.getElementById('ventasKPIs').innerHTML = `
            <div class="kpi-card primary"><div class="kpi-label">Total Ventas</div><div class="kpi-value">${this.formatMoney(totalVentas)}</div><div class="kpi-detail">${ventas.length} transacciones</div></div>
            <div class="kpi-card info"><div class="kpi-label">Unidades Vendidas</div><div class="kpi-value">${totalUnidades.toLocaleString('es-AR')}</div></div>
            <div class="kpi-card warning"><div class="kpi-label">Gasto Empaque</div><div class="kpi-value">${this.formatMoney(totalEmpaque)}</div></div>
            <div class="kpi-card success"><div class="kpi-label">Ticket Promedio</div><div class="kpi-value">${this.formatMoney(ticketPromedio)}</div></div>
        `;
    },

    // ========================================
    //  RENDIMIENTO (Home + Punto de Equilibrio)
    // ========================================
    toggleRendimiento(period) {
        rendimientoPeriodo = period;
        document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
        document.querySelector(`.btn-toggle[data-period="${period}"]`).classList.add('active');
        this.renderRendimiento();
    },

    renderRendimiento() {
        const isAnual = rendimientoPeriodo === 'anual';
        const now = new Date();
        let ventasPeriodo;
        if (isAnual) {
            ventasPeriodo = data.ventas.filter(v => v.fecha && v.fecha.startsWith(now.getFullYear().toString()));
        } else {
            const mes = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            ventasPeriodo = data.ventas.filter(v => v.fecha && v.fecha.startsWith(mes));
        }

        const totalIngresos = ventasPeriodo.reduce((s, v) => s + (v.totalArticulos || v.total), 0);
        const totalEmpaque = ventasPeriodo.reduce((s, v) => s + (v.totalEmpaque || 0), 0);
        let totalGastoProductos = 0;
        ventasPeriodo.forEach(v => {
            v.articulos.forEach(a => {
                const prod = data.productos.find(p => p.id === a.productoId);
                if (prod) totalGastoProductos += this.calcCostoProducto(prod).costoTotal * a.cantidad;
            });
        });

        const gastosFijos = isAnual ? this.getTotalGastosFijos() * 12 : this.getTotalGastosFijos();
        const gastosTotal = totalGastoProductos + totalEmpaque + gastosFijos;
        const gananciaBruta = totalIngresos - totalGastoProductos - totalEmpaque;
        const gananciaNeta = gananciaBruta - gastosFijos;
        const unidades = ventasPeriodo.reduce((s, v) => s + v.cantidadTotal, 0);
        const label = isAnual ? 'Anual' : 'Mensual';

        document.getElementById('rendimientoKPIs').innerHTML = `
            <div class="kpi-card primary"><div class="kpi-label">Ingresos ${label}</div><div class="kpi-value">${this.formatMoney(totalIngresos)}</div><div class="kpi-detail">${ventasPeriodo.length} ventas | ${unidades} unidades</div></div>
            <div class="kpi-card danger"><div class="kpi-label">Gastos Totales</div><div class="kpi-value">${this.formatMoney(gastosTotal)}</div><div class="kpi-detail">Fijos: ${this.formatMoney(gastosFijos)} | Prod: ${this.formatMoney(totalGastoProductos)} | Emp: ${this.formatMoney(totalEmpaque)}</div></div>
            <div class="kpi-card ${gananciaNeta >= 0 ? 'success' : 'danger'}"><div class="kpi-label">Ganancia Neta</div><div class="kpi-value">${this.formatMoney(gananciaNeta)}</div><div class="kpi-detail">Margen: ${totalIngresos > 0 ? this.formatPercent(gananciaNeta / totalIngresos) : '0%'}</div></div>
            <div class="kpi-card info"><div class="kpi-label">Unidades Vendidas</div><div class="kpi-value">${unidades.toLocaleString('es-AR')}</div></div>
        `;

        this.renderRendimientoCharts(ventasPeriodo, isAnual);
        this.renderEquilibrioTable();
    },

    destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } },

    renderRendimientoCharts(ventasPeriodo, isAnual) {
        this.destroyChart('ingresosGastos');
        const igCtx = document.getElementById('chartIngresosGastos');
        if (igCtx) {
            let labels, ingresosData, gastosData;
            if (isAnual) {
                labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                ingresosData = new Array(12).fill(0);
                gastosData = new Array(12).fill(0);
                const gfMensual = this.getTotalGastosFijos();
                ventasPeriodo.forEach(v => {
                    const m = parseInt(v.fecha.split('-')[1]) - 1;
                    ingresosData[m] += (v.totalArticulos || v.total);
                    v.articulos.forEach(a => { const p = data.productos.find(pp => pp.id === a.productoId); if (p) gastosData[m] += this.calcCostoProducto(p).costoTotal * a.cantidad; });
                    gastosData[m] += (v.totalEmpaque || 0);
                });
                gastosData = gastosData.map(g => g + gfMensual);
            } else {
                labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'];
                ingresosData = new Array(5).fill(0);
                gastosData = new Array(5).fill(0);
                const gfSemanal = this.getTotalGastosFijos() / 4;
                ventasPeriodo.forEach(v => {
                    const w = Math.min(Math.floor((parseInt(v.fecha.split('-')[2]) - 1) / 7), 4);
                    ingresosData[w] += (v.totalArticulos || v.total);
                    v.articulos.forEach(a => { const p = data.productos.find(pp => pp.id === a.productoId); if (p) gastosData[w] += this.calcCostoProducto(p).costoTotal * a.cantidad; });
                    gastosData[w] += (v.totalEmpaque || 0);
                });
                gastosData = gastosData.map(g => g + gfSemanal);
            }
            charts.ingresosGastos = new Chart(igCtx, {
                type: 'bar',
                data: { labels, datasets: [
                    { label: 'Ingresos', data: ingresosData, backgroundColor: '#F5A623', borderRadius: 6 },
                    { label: 'Gastos', data: gastosData, backgroundColor: '#EF4444', borderRadius: 6 }
                ]},
                options: { responsive: true, scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins' } } } } }
            });
        }

        this.destroyChart('ventasProducto');
        const vpCtx = document.getElementById('chartVentasProducto');
        if (vpCtx) {
            const ps = {};
            ventasPeriodo.forEach(v => v.articulos.forEach(a => {
                const p = data.productos.find(pp => pp.id === a.productoId);
                ps[p ? p.nombre : '?'] = (ps[p ? p.nombre : '?'] || 0) + a.cantidad;
            }));
            charts.ventasProducto = new Chart(vpCtx, {
                type: 'doughnut',
                data: { labels: Object.keys(ps), datasets: [{ data: Object.values(ps), backgroundColor: ['#F5A623', '#1A1A1A', '#22C55E', '#3B82F6', '#8B5CF6', '#EF4444'], borderWidth: 2, borderColor: '#fff' }] },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins' } } } } }
            });
        }

        this.destroyChart('ventasOcasion');
        const voCtx = document.getElementById('chartVentasOcasion');
        if (voCtx) {
            const oc = {};
            ventasPeriodo.forEach(v => oc[v.ocasion] = (oc[v.ocasion] || 0) + (v.totalArticulos || v.total));
            charts.ventasOcasion = new Chart(voCtx, {
                type: 'pie',
                data: { labels: Object.keys(oc), datasets: [{ data: Object.values(oc), backgroundColor: ['#F5A623', '#FF8C00', '#FFD080', '#1A1A1A', '#555', '#888'], borderWidth: 2, borderColor: '#fff' }] },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins' } } } } }
            });
        }

        const cd = {};
        ventasPeriodo.forEach(v => cd[v.cliente] = (cd[v.cliente] || 0) + v.total);
        const top = Object.entries(cd).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const topDiv = document.getElementById('topClientes');
        topDiv.innerHTML = top.length === 0
            ? '<p style="color:#888; text-align:center; padding:20px;">No hay datos de clientes</p>'
            : top.map((c, i) => `<div class="top-item"><span class="rank">${i + 1}</span><span class="name">${c[0]}</span><span class="amount">${this.formatMoney(c[1])}</span></div>`).join('');
    },

    renderEquilibrioTable() {
        const totalGF = this.getTotalGastosFijos();
        const tbody = document.querySelector('#tablaEquilibrio tbody');
        tbody.innerHTML = data.productos.map(p => {
            const c = this.calcCostoProducto(p);
            const margenUnit = p.precioVenta - c.costoTotal;
            const unitsEq = margenUnit > 0 ? Math.ceil(totalGF / margenUnit) : Infinity;
            const ventasEq = unitsEq !== Infinity ? unitsEq * p.precioVenta : Infinity;
            return `<tr>
                <td><strong>${p.nombre}</strong></td>
                <td>${this.formatMoney(c.costoTotal)}</td>
                <td>${this.formatMoney(p.precioVenta)}</td>
                <td>${this.formatMoney(margenUnit)}</td>
                <td>${this.formatPercent(c.margen)}</td>
                <td style="font-weight:700; color:var(--primary-dark);">${unitsEq === Infinity ? '∞' : unitsEq.toLocaleString('es-AR')}</td>
                <td>${ventasEq === Infinity ? '∞' : this.formatMoney(ventasEq)}</td>
            </tr>`;
        }).join('');
    },

    // ========================================
    //  EXPORTAR
    // ========================================
    exportarExcel(tipo) {
        const wb = XLSX.utils.book_new();
        if (tipo === 'todo' || tipo === 'costos') {
            const gf = [['Concepto', 'Monto Mensual']];
            data.gastosFijos.forEach(c => gf.push([c.nombre, c.monto]));
            gf.push(['TOTAL', this.getTotalGastosFijos()]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gf), 'Gastos Fijos');

            const ge = [['Concepto', 'Precio Unitario']];
            data.gastosEmpaque.forEach(e => ge.push([e.nombre, e.precioUnitario]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ge), 'Empaque y Envío');

            const mp = [['Material', 'Unidad', 'Precio']];
            data.materiasPrimas.forEach(m => mp.push([m.nombre, m.unidad, m.precio]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mp), 'Materias Primas');
        }
        if (tipo === 'todo' || tipo === 'productos') {
            const pd = [['Producto', 'Gramos', 'Material', 'Impresora', 'Tiempo Imp', 'Tiempo Trab', 'Gasto Total', 'Precio Mayorista', 'Margen May.', 'Precio Minorista', 'Margen Min.']];
            data.productos.forEach(p => {
                const c = this.calcCostoProducto(p);
                const margenMin = p.precioMinorista > 0 ? ((p.precioMinorista - c.costoTotal) / p.precioMinorista * 100).toFixed(1) + '%' : '-';
                pd.push([p.nombre, p.gramosFilamento, (this.getMateriaPrima(p.materiaPrimaId) || {}).nombre || '', (this.getImpresora(p.impresoraId) || {}).nombre || '', p.tiempoImpresion, p.tiempoTrabajo, Math.round(c.costoTotal), p.precioVenta, (c.margen * 100).toFixed(1) + '%', p.precioMinorista || 0, margenMin]);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pd), 'Productos');
        }
        if (tipo === 'todo' || tipo === 'ventas') {
            const vd = [['Fecha', 'Cliente', 'Tipo Venta', 'Canal', 'Método Pago', 'Ocasión', 'Artículos', 'Empaque', 'Cant. Total', 'Total Art.', 'Total Emp.', 'Total', 'Notas']];
            data.ventas.forEach(v => {
                const arts = v.articulos.map(a => { const p = data.productos.find(pp => pp.id === a.productoId); return `${p ? p.nombre : '?'} x${a.cantidad}`; }).join('; ');
                const emps = (v.empaque || []).map(e => { const em = data.gastosEmpaque.find(ee => ee.id === e.empaqueId); return `${em ? em.nombre : '?'} x${e.cantidad}`; }).join('; ');
                vd.push([v.fecha, v.cliente, v.tipoVenta || 'Mayorista', v.canal || '-', v.metodoPago, v.ocasion, arts, emps, v.cantidadTotal, v.totalArticulos || v.total, v.totalEmpaque || 0, v.total, v.notas || '']);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vd), 'Ventas');
        }
        XLSX.writeFile(wb, `FantasticPlastik_${tipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.toast('Excel exportado');
    },

    exportarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(245, 166, 35);
        doc.text('Fantastic Plastik', 105, 20, { align: 'center' });
        doc.setFontSize(12); doc.setTextColor(100);
        doc.text('Reporte de Gastos y Rendimiento', 105, 28, { align: 'center' });
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 105, 35, { align: 'center' });

        let y = 45;
        doc.setFontSize(14); doc.setTextColor(26, 26, 26);
        doc.text('Gastos Fijos Mensuales', 14, y); y += 5;
        doc.autoTable({ startY: y, head: [['Concepto', 'Monto']], body: data.gastosFijos.map(c => [c.nombre, this.formatMoney(c.monto)]), foot: [['TOTAL', this.formatMoney(this.getTotalGastosFijos())]], theme: 'striped', headStyles: { fillColor: [245, 166, 35], textColor: [26, 26, 26] }, footStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] } });

        y = doc.lastAutoTable.finalY + 15;
        doc.text('Productos', 14, y); y += 5;
        doc.autoTable({ startY: y, head: [['Producto', 'Gasto', 'Precio', 'Margen']], body: data.productos.map(p => { const c = this.calcCostoProducto(p); return [p.nombre, this.formatMoney(c.costoTotal), this.formatMoney(p.precioVenta), this.formatPercent(c.margen)]; }), theme: 'striped', headStyles: { fillColor: [245, 166, 35], textColor: [26, 26, 26] } });

        y = doc.lastAutoTable.finalY + 15;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.text('Punto de Equilibrio', 14, y); y += 5;
        const totalGF = this.getTotalGastosFijos();
        doc.autoTable({ startY: y, head: [['Producto', 'Margen Unit.', 'Unidades Eq.', 'Ventas Eq.']], body: data.productos.map(p => { const c = this.calcCostoProducto(p); const mu = p.precioVenta - c.costoTotal; const ueq = mu > 0 ? Math.ceil(totalGF / mu) : '∞'; const veq = mu > 0 ? this.formatMoney(ueq * p.precioVenta) : '∞'; return [p.nombre, this.formatMoney(mu), typeof ueq === 'number' ? ueq.toLocaleString('es-AR') : ueq, veq]; }), theme: 'striped', headStyles: { fillColor: [26, 26, 26], textColor: [245, 166, 35] } });

        doc.save(`FantasticPlastik_Reporte_${new Date().toISOString().split('T')[0]}.pdf`);
        this.toast('PDF exportado');
    },

    exportarListaPreciosPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const fecha = new Date().toLocaleDateString('es-AR');

        doc.setFontSize(24); doc.setTextColor(245, 166, 35);
        doc.text('Fantastic Plastik', 105, 20, { align: 'center' });
        doc.setFontSize(16); doc.setTextColor(26, 26, 26);
        doc.text('Lista de Precios', 105, 30, { align: 'center' });
        doc.setFontSize(10); doc.setTextColor(120);
        doc.text(`Fecha: ${fecha}`, 105, 37, { align: 'center' });

        const rows = data.productos.map(p => {
            const c = this.calcCostoProducto(p);
            const margenMay = p.precioVenta > 0 ? ((p.precioVenta - c.costoTotal) / p.precioVenta * 100).toFixed(1) + '%' : '-';
            const margenMin = p.precioMinorista > 0 ? ((p.precioMinorista - c.costoTotal) / p.precioMinorista * 100).toFixed(1) + '%' : '-';
            return [p.nombre, this.formatMoney(p.precioVenta), margenMay, this.formatMoney(p.precioMinorista || 0), margenMin];
        });

        doc.autoTable({
            startY: 45,
            head: [['Producto', 'Mayorista', 'Margen', 'Minorista', 'Margen']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [245, 166, 35], textColor: [26, 26, 26], fontStyle: 'bold' },
            styles: { fontSize: 11 },
            columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'center' } }
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(9); doc.setTextColor(150);
        doc.text('Precios expresados en ARS. Sujetos a cambio sin previo aviso.', 105, finalY, { align: 'center' });

        doc.save(`FantasticPlastik_ListaPrecios_${new Date().toISOString().split('T')[0]}.pdf`);
        this.toast('Lista de precios PDF exportada');
    },

    exportarListaPreciosMD() {
        const fecha = new Date().toLocaleDateString('es-AR');
        let md = `# Fantastic Plastik - Lista de Precios\n\n`;
        md += `**Fecha:** ${fecha}\n\n`;
        md += `| Producto | Mayorista | Margen | Minorista | Margen |\n`;
        md += `|----------|----------:|:------:|----------:|:------:|\n`;

        data.productos.forEach(p => {
            const c = this.calcCostoProducto(p);
            const margenMay = p.precioVenta > 0 ? ((p.precioVenta - c.costoTotal) / p.precioVenta * 100).toFixed(1) + '%' : '-';
            const margenMin = p.precioMinorista > 0 ? ((p.precioMinorista - c.costoTotal) / p.precioMinorista * 100).toFixed(1) + '%' : '-';
            md += `| ${p.nombre} | ${this.formatMoney(p.precioVenta)} | ${margenMay} | ${this.formatMoney(p.precioMinorista || 0)} | ${margenMin} |\n`;
        });

        md += `\n---\n*Precios expresados en ARS. Sujetos a cambio sin previo aviso.*\n`;

        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FantasticPlastik_ListaPrecios_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('Lista de precios MD exportada');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
