/* ============================================
   TURSO CLIENT WRAPPER
   Emula la interfaz de Supabase para facilitar la migración
   ============================================ */

const TURSO_URL = 'https://fpcuenta-jerryblack.aws-us-west-2.turso.io/v2/pipeline';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3Nzc1NTA3OTEsImlkIjoiMDE5ZGRiZTYtZjYwMS03ZTRmLWJiNzMtYzQ5YjAyZWY2ZWFjIiwicmlkIjoiZWY3OWQ5ODQtMGI4My00ZDhlLTgxZjMtNTNhNzUzYTZkMjhlIn0.XvG1r97iqCWUNECnOkU3E3lm9hTur8Qjpailkplyi_Ai94oTOgkyIjBbad64chLa2nZVQwP7H1NXoxPyBLKcCA';

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
    const response = await fetch(TURSO_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TURSO_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requests: [
                { type: 'execute', stmt: { sql, params } },
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
        let paramIdx = 1;

        if (this._filters.length > 0) {
            const whereParts = [];
            for (const f of this._filters) {
                whereParts.push(`${f.column} = $${paramIdx}`);
                params.push(f.value);
                paramIdx++;
            }
            sql += ' WHERE ' + whereParts.join(' AND ');
        }

        if (this._order) {
            sql += ` ORDER BY ${this._order}${this._ascending ? ' ASC' : ' DESC'}`;
        }

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(data.error) };
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
        this._columns = '*';
        this._single = false;
    }

    select(columns = '*') {
        this._columns = columns;
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
        const placeholders = rows.map((_, rowIdx) => {
            return '(' + columns.map((_, colIdx) => {
                return '$' + (rowIdx * columns.length + colIdx + 1);
            }).join(', ') + ')';
        }).join(', ');

        let sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES ${placeholders}`;

        const params = [];
        rows.forEach(row => {
            columns.forEach(col => {
                params.push(row[col]);
            });
        });

        const data = await tursoExecute(sql, params);

	if (data.error) {
		return { data: null, error: new Error(data.error) };
	}

	const result = data.results?.[0];
	if (result?.type === 'error') {
		return { data: null, error: new Error(result.error?.message || JSON.stringify(result)) };
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

        const setParts = [];
        const params = [];
        let paramIdx = 1;

        for (const [key, value] of Object.entries(this._data)) {
            setParts.push(`${key} = $${paramIdx}`);
            params.push(value);
            paramIdx++;
        }

        let sql = `UPDATE ${this.table} SET ${setParts.join(', ')}`;

        const whereParts = [];
        for (const f of this._filters) {
            whereParts.push(`${f.column} = $${paramIdx}`);
            params.push(f.value);
            paramIdx++;
        }
        sql += ' WHERE ' + whereParts.join(' AND ');

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(data.error) };
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

        let sql = `DELETE FROM ${this.table}`;
        const params = [];
        let paramIdx = 1;

        const whereParts = [];
        for (const f of this._filters) {
            whereParts.push(`${f.column} = $${paramIdx}`);
            params.push(f.value);
            paramIdx++;
        }
        sql += ' WHERE ' + whereParts.join(' AND ');

        const data = await tursoExecute(sql, params);

        if (data.error) {
            return { data: null, error: new Error(data.error) };
        }

        return { data: null, error: null };
    }
}

const sb = new TursoClient();