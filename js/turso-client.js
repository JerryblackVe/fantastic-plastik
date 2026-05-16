/* ============================================
   TURSO CLIENT WRAPPER
   Emula la interfaz de Supabase para facilitar la migración
   ============================================ */

// El token de Turso ya NO esta aca. Vive en Vercel como variable de entorno.
// El navegador habla con el proxy /api/turso, que agrega el token del lado servidor.
const TURSO_PROXY_URL = '/api/turso';

// Convierte valores JS a formato tipado de Turso API
function toTursoValue(v) {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return { type: 'integer', value: String(v) };
        return { type: 'float', value: String(v) };
    }
    return { type: 'text', value: String(v) };
}

function convertRow(row, cols) {
    const obj = {};
    if (!cols || !row) return obj;
    row.forEach((val, idx) => {
        const colName = cols[idx]?.name;
        if (colName) {
            let value = val?.value ?? val;
            if (val?.type === 'integer') value = parseInt(val.value, 10);
            else if (val?.type === 'float') value = parseFloat(val.value);
            else if (val?.type === 'text') value = String(val.value);
            else if (val?.type === 'null') value = null;
            obj[colName] = value;
        }
    });
    return obj;
}

async function tursoExecute(sql, params = []) {
    const response = await fetch(TURSO_PROXY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requests: [
                { type: 'execute', stmt: { sql, args: params.map(toTursoValue) } },
                { type: 'close' }
            ]
        })
    });
    return response.json();
}

class TursoClient {
    from(table) {
        return new TursoQuery(table);
    }
}

class TursoQuery {
    constructor(table) {
        this.table = table;
        this._columns = '*';
        this._order = null;
        this._ascending = true;
        this._filters = [];
        this._single = false;
    }

    select(columns = '*') {
        this._columns = columns;
        return this;
    }

    order(column, options = {}) {
        this._order = column;
        this._ascending = options.ascending !== false;
        return this;
    }

    single() {
        this._single = true;
        return this;
    }

    eq(column, value) {
        this._filters.push({ column, op: '=', value });
        return this;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        let sql = `SELECT ${this._columns} FROM ${this.table}`;
        const params = [];

        if (this._filters.length > 0) {
            const whereParts = this._filters.map(f => {
                params.push(f.value);
                return `${f.column} = ?`;
            });
            sql += ' WHERE ' + whereParts.join(' AND ');
        }

        if (this._order) {
            sql += ` ORDER BY ${this._order}${this._ascending ? ' ASC' : ' DESC'}`;
        }

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(String(data.error)) };
        }

        const result = data.results?.[0];
        if (result?.type === 'error') {
            return { data: null, error: new Error(result.error?.message || JSON.stringify(result)) };
        }
        if (!result || result.type !== 'ok') {
            return { data: null, error: new Error('No result') };
        }

        const execResult = result.response?.result;
        if (!execResult) {
            return { data: null, error: new Error('No execute result') };
        }

        const cols = execResult.cols || [];
        const rows = (execResult.rows || []).map(row => convertRow(row, cols));

        if (this._single) {
            return { data: rows[0] || null, error: null };
        }

        return { data: rows, error: null };
    }

    insert(data) {
        return new TursoInsert(this.table, data);
    }

    update(data) {
        return new TursoUpdate(this.table, data);
    }

    delete() {
        return new TursoDelete(this.table);
    }
}

class TursoInsert {
    constructor(table, data) {
        this.table = table;
        this._data = data;
        this._returning = false;
        this._single = false;
    }

    select(columns = '*') {
        this._returning = true;
        return this;
    }

    single() {
        this._single = true;
        return this;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        const isArray = Array.isArray(this._data);
        const rows = isArray ? this._data : [this._data];

        const columns = Object.keys(rows[0]);
        const placeholders = rows.map(() => '(' + columns.map(() => '?').join(', ') + ')').join(', ');

        let sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES ${placeholders}`;
        if (this._returning) sql += ' RETURNING *';

        const params = [];
        rows.forEach(row => columns.forEach(col => params.push(row[col])));

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(String(data.error)) };
        }

        const result = data.results?.[0];
        if (result?.type === 'error') {
            return { data: null, error: new Error(result.error?.message || JSON.stringify(result)) };
        }

        if (this._returning) {
            const execResult = result?.response?.result;
            if (execResult) {
                const cols = execResult.cols || [];
                const returnedRows = (execResult.rows || []).map(row => convertRow(row, cols));
                if (this._single) return { data: returnedRows[0] || null, error: null };
                return { data: returnedRows, error: null };
            }
        }

        // Sin RETURNING, adjuntar last_insert_rowid como id
        const lastId = result?.response?.result?.last_insert_rowid;
        if (!isArray && lastId) {
            return { data: { ...this._data, id: parseInt(lastId, 10) }, error: null };
        }

        return { data: this._data, error: null };
    }
}

class TursoUpdate {
    constructor(table, data) {
        this.table = table;
        this._data = data;
        this._filters = [];
    }

    eq(column, value) {
        this._filters.push({ column, op: '=', value });
        return this;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        if (this._filters.length === 0) {
            return { data: null, error: new Error('UPDATE without WHERE clause is not allowed. Use .eq() to specify a filter.') };
        }

        const params = [];
        const setParts = Object.entries(this._data).map(([key, value]) => {
            params.push(value);
            return `${key} = ?`;
        });

        let sql = `UPDATE ${this.table} SET ${setParts.join(', ')}`;

        const whereParts = this._filters.map(f => {
            params.push(f.value);
            return `${f.column} = ?`;
        });
        sql += ' WHERE ' + whereParts.join(' AND ');

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(String(data.error)) };
        }

        return { data: null, error: null };
    }
}

class TursoDelete {
    constructor(table) {
        this.table = table;
        this._filters = [];
    }

    eq(column, value) {
        this._filters.push({ column, op: '=', value });
        return this;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        if (this._filters.length === 0) {
            return { data: null, error: new Error('DELETE without WHERE clause is not allowed. Use .eq() to specify a filter.') };
        }

        const params = [];
        const whereParts = this._filters.map(f => {
            params.push(f.value);
            return `${f.column} = ?`;
        });
        let sql = `DELETE FROM ${this.table} WHERE ` + whereParts.join(' AND ');

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(String(data.error)) };
        }

        return { data: null, error: null };
    }
}

const sb = new TursoClient();
