// server/server.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import bcrypt from 'bcryptjs'; // server-side auth
import { signJwt, authenticate, allowRoles, requireSameBranch } from './auth.js'; // RBAC helpers

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Point dotenv at the env file that sits NEXT TO THIS FILE
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(cors());

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false },
});
async function query(q, p = []) {
  const { rows } = await pool.query(q, p);
  return rows;
}

/* =========================
   RBAC HELPERS (branch lookups)
   ========================= */

// Returns the branch for a MENU ITEM id (null if not found)
async function getMenuItemBranch(menuItemId) {
  const rows = await query('SELECT branch FROM menu_items WHERE id = $1', [menuItemId]);
  return rows[0]?.branch || null;
}

// Returns the branch for an ORDER id (null if not found)
async function getOrderBranch(orderId) {
  const rows = await query('SELECT branch FROM orders WHERE id = $1', [orderId]);
  return rows[0]?.branch || null;
}

/* =========================
   DB INIT / LIGHT MIGRATIONS
   ========================= */
async function initDb() {
  // 1) Create users table if missing
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      role TEXT,
      branch TEXT,
      password TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 2) Safety: add columns if an older DB exists
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  // 3) Backfill & defaults / constraints
  await query(`UPDATE users SET role = 'Customer' WHERE role IS NULL;`);
  await query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Customer';`);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_email_key'
          AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
      END IF;
    END
    $$;
  `);

  // 4) Create posts table if missing
  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 5) Ensure menu_items table exists and has a branch column (for branch-scoped RBAC)
  await query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price NUMERIC,
      is_special BOOLEAN NOT NULL DEFAULT false,
      is_available BOOLEAN NOT NULL DEFAULT true,
      branch TEXT, -- <- used for branch scoping
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS branch TEXT;`);
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* =========================
   Customer Sign-up (NEW)
   ========================= */
app.post('/api/signup', async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();
    password = (password || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid email format' });
    }
    if (password.length < 5) {
      return res.status(400).json({ error: 'password must be at least 5 characters' });
    }

    // unique email check
    const existing = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'email already registered' });
    }

    // hash the password and save (mirror into password + password_hash for compatibility)
    const hash = await bcrypt.hash(password, 10);
    const rows = await query(
      `INSERT INTO users (name, email, role, branch, password, password_hash)
       VALUES ($1,$2,'Customer',NULL,$3,$3)
       RETURNING id, name, email, role, branch, created_at, updated_at`,
      [name, email, hash]
    );

    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error('signup error:', e);
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'email already registered', code: e.code, detail: e.message });
    }
    return res.status(500).json({ error: 'signup failed', detail: e?.message, code: e?.code });
  }
});

/* =========================
   Login (server-side auth) — returns JWT
   ========================= */
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  try {
    const rows = await query(
      'SELECT id, name, email, role, branch, password, password_hash, created_at, updated_at FROM users WHERE email=$1',
      [email.toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const u = rows[0];
    const hashed = u.password_hash || u.password;
    const ok = await bcrypt.compare(password, hashed);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Sign a JWT so we can do RBAC on protected routes
    const token = signJwt({ id: u.id, role: u.role, branch: u.branch });

    res.json({
      ok: true,
      token,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        branch: u.branch,
        created_at: u.created_at,
        updated_at: u.updated_at
      }
    });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'login failed', detail: e?.message, code: e?.code });
  }
});

/* =========================
   USERS: list / PUT / PATCH / DELETE  (protected)
   ========================= */

// List users (admin/HQ only)
app.get(
  '/api/users',
  authenticate,
  allowRoles('admin', 'hq', 'hq_manager'),
  async (_req, res) => {
    try {
      const rows = await query(
        'SELECT id, name, email, role, branch FROM users ORDER BY id'
      );
      res.json(rows);
    } catch (e) {
      console.error('GET /api/users error:', e);
      res.status(500).json({ error: 'Failed to load users', detail: e?.message, code: e?.code });
    }
  }
);

// PUT (replace) a user
app.put(
  '/api/users/:id',
  authenticate,
  allowRoles('admin', 'hq', 'hq_manager'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // normalize inputs
      let { name, email, role, branch, password } = req.body || {};
      name = (name || '').trim();
      email = (email || '').trim().toLowerCase();

      if (!name || !email) {
        return res.status(400).json({ error: 'name and email required' });
      }

      let password_hash = null;
      if (password) password_hash = await bcrypt.hash(password, 10);

      const rows = await query(
        `
        UPDATE users
           SET name=$1,
               email=$2,
               role=COALESCE($3, role),
               branch=COALESCE($4, branch),
               password_hash=COALESCE($5, password_hash),
               updated_at=NOW()
         WHERE id=$6
         RETURNING id, name, email, role, branch, created_at, updated_at;
        `,
        [name, email, role ?? null, branch ?? null, password_hash, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('PUT /api/users error:', err);
      if (err && err.code === '23505') {
        return res.status(409).json({ error: 'email already registered', code: err.code, detail: err.message });
      }
      res.status(500).json({ error: 'failed to put user', detail: err?.message, code: err?.code });
    }
  }
);

// PATCH (partial update) a user
app.patch(
  '/api/users/:id',
  authenticate,
  allowRoles('admin', 'hq', 'hq_manager'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const setParts = [];
      const values = [];
      let idx = 1;

      const fields = ['name', 'email', 'role', 'branch'];
      fields.forEach((f) => {
        if (req.body[f] !== undefined) {
          let val = req.body[f];
          if (f === 'email' && typeof val === 'string') {
            val = val.trim().toLowerCase(); // normalize email on patch
          }
          if (f === 'name' && typeof val === 'string') {
            val = val.trim();
          }
          setParts.push(`${f}=$${idx++}`);
          values.push(val);
        }
      });

      if (req.body.password !== undefined) {
        const hash = await bcrypt.hash(req.body.password, 10);
        setParts.push(`password_hash=$${idx++}`);
        values.push(hash);
      }

      if (setParts.length === 0) return res.status(400).json({ error: 'no fields to update' });

      setParts.push(`updated_at=NOW()`);

      const sql = `UPDATE users SET ${setParts.join(', ')} WHERE id=$${idx}
                   RETURNING id, name, email, role, branch, created_at, updated_at;`;
      values.push(id);

      const rows = await query(sql, values);
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('PATCH /api/users error:', err);
      if (err && err.code === '23505') {
        return res.status(409).json({ error: 'email already registered', code: err.code, detail: err.message });
      }
      res.status(500).json({ error: 'failed to patch user', detail: err?.message, code: err?.code });
    }
  }
);

// DELETE a user (admin only)
app.delete(
  '/api/users/:id',
  authenticate,
  allowRoles('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await query(`DELETE FROM users WHERE id=$1 RETURNING id;`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true, deletedId: rows[0].id });
    } catch (err) {
      console.error('DELETE /api/users error:', err);
      res.status(500).json({ error: 'failed to delete user', detail: err?.message, code: err?.code });
    }
  }
);

/* =========================
   MENU (with branch scoping)
   ========================= */

app.get('/api/menu', async (_req, res) => {
  const rows = await query(
    'SELECT id,name,category,price,is_special AS "isSpecial",is_available AS "isAvailable",branch FROM menu_items ORDER BY id'
  );
  res.json(rows);
});

// Create menu item (HQ only). Keep if you need it; otherwise remove.
app.post(
  '/api/menu',
  authenticate,
  allowRoles('admin', 'hq', 'hq_manager'),
  async (req, res) => {
    const { name, category, price, isSpecial = false, isAvailable = true, branch = null } = req.body;
    const r = await query(
      `INSERT INTO menu_items (name,category,price,is_special,is_available,branch)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,category,price,is_special AS "isSpecial",is_available AS "isAvailable",branch`,
      [name, category, price, isSpecial, isAvailable, branch]
    );
    res.json(r[0]);
  }
);

// Toggle availability — branch scoped
app.patch(
  '/api/menu/:id',
  authenticate,
  allowRoles('admin', 'hq', 'hq_manager', 'branch_manager'),
  requireSameBranch(req => getMenuItemBranch(req.params.id)),
  async (req, res) => {
    const { id } = req.params;
    const { isAvailable } = req.body;
    const rows = await query(
      `UPDATE menu_items
         SET is_available=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING id,name,category,price,is_special AS "isSpecial",is_available AS "isAvailable",branch`,
      [!!isAvailable, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

/* =========================
   ORDERS (status updates with branch scoping)
   ========================= */

app.get('/api/orders', async (req, res) => {
  const { branch, userId } = req.query;
  let q = `
    SELECT id, user_id, branch, total, status, created_at, updated_at
    FROM orders
    WHERE 1=1
  `;
  const p = []; let i = 1;
  if (branch) { q += ` AND branch=$${i++}`; p.push(branch); }
  if (userId) { q += ` AND user_id=$${i++}`; p.push(userId); }
  q += ' ORDER BY created_at DESC';
  res.json(await query(q, p));
});

app.post('/api/orders', async (req, res) => {
  const { userId, branch, items, total, status } = req.body;
  const o = await query(
    'INSERT INTO orders (user_id,branch,total,status) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId, branch, total, status || 'Placed']
  );
  const order = o[0];
  for (const it of items) {
    await query(
      'INSERT INTO order_items (order_id,menu_item_id,qty,price) VALUES ($1,$2,$3,$4)',
      [order.id, it.itemId, it.qty, it.price]
    );
  }
  res.json(order);
});

// Update order status — cashier/branch_manager/hq_manager/admin
app.patch(
  '/api/orders/:id/status',
  authenticate,
  allowRoles('cashier', 'branch_manager', 'hq', 'hq_manager', 'admin'),
  requireSameBranch(req => getOrderBranch(req.params.id)),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const rows = await query(
      'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 ' +
      'RETURNING id,user_id,branch,total,status,created_at,updated_at',
      [status, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  }
);

/* =========================
   RESERVATIONS / MESSAGES / OTHER LISTS
   ========================= */

app.get('/api/reservations', async (_req, res) =>
  res.json(await query('SELECT * FROM reservations ORDER BY created_at DESC'))
);
app.post('/api/reservations', async (req, res) => {
  const { branch, name, email, party_size, datetime } = req.body;
  const r = await query(
    'INSERT INTO reservations (branch,name,email,party_size,datetime,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [branch, name, email, party_size, datetime, 'Submitted']
  );
  res.json(r[0]);
});

// -------------------- MESSAGES / OTHER LISTS --------------------
app.get('/api/messages', async (_req, res) =>
  res.json(await query('SELECT * FROM messages ORDER BY created_at DESC'))
);
app.post('/api/messages', async (req, res) => {
  const { from_user_id, body } = req.body;
  const m = await query(
    'INSERT INTO messages (from_user_id,to_role,body) VALUES ($1,$2,$3) RETURNING *',
    [from_user_id, 'Manager', body]
  );
  res.json(m[0]);
});

app.get('/api/suppliers', async (_req, res) => res.json(await query('SELECT * FROM suppliers ORDER BY id')));
app.get('/api/employees', async (_req, res) => res.json(await query('SELECT * FROM employees ORDER BY id')));
app.get('/api/campaigns', async (_req, res) => res.json(await query('SELECT * FROM campaigns ORDER BY id')));
app.get('/api/expenses', async (_req, res) => res.json(await query('SELECT * FROM expenses ORDER BY id')));

/* =========================
   POSTS (RBAC-protected for mutations)
   ========================= */

// Get all posts (public)
app.get('/api/posts', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM posts ORDER BY id DESC;');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to list posts', detail: err?.message, code: err?.code });
  }
});

// Get one post (public)
app.get('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM posts WHERE id=$1;', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to get post', detail: err?.message, code: err?.code });
  }
});

// CREATE post (HQ/Admin only)
app.post(
  '/api/posts',
  authenticate,
  allowRoles('admin', 'hq_manager', 'hq'),
  async (req, res) => {
    try {
      const { title, body } = req.body;
      if (!title || !body) return res.status(400).json({ error: 'title and body required' });
      const rows = await query(
        'INSERT INTO posts (title, body) VALUES ($1, $2) RETURNING *;',
        [title, body]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to create post', detail: err?.message, code: err?.code });
    }
  }
);

// PUT post (replace) (HQ/Admin only)
app.put(
  '/api/posts/:id',
  authenticate,
  allowRoles('admin', 'hq_manager', 'hq'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, body } = req.body;
      if (!title || !body) return res.status(400).json({ error: 'title and body required' });

      const rows = await query(
        `UPDATE posts
           SET title=$1, body=$2, updated_at=NOW()
         WHERE id=$3
         RETURNING *;`,
        [title, body, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to update post', detail: err?.message, code: err?.code });
    }
  }
);

// PATCH post (partial) (HQ/Admin only)
app.patch(
  '/api/posts/:id',
  authenticate,
  allowRoles('admin', 'hq_manager', 'hq'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = [];
      const values = [];
      let idx = 1;

      ['title', 'body'].forEach((f) => {
        if (req.body[f] !== undefined) {
          updates.push(`${f}=$${idx++}`);
          values.push(req.body[f]);
        }
      });
      if (!updates.length) return res.status(400).json({ error: 'no fields to update' });

      updates.push('updated_at=NOW()');

      const sql = `UPDATE posts SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *;`;
      values.push(id);

      const rows = await query(sql, values);
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to patch post', detail: err?.message, code: err?.code });
    }
  }
);

// DELETE post (HQ/Admin only)
app.delete(
  '/api/posts/:id',
  authenticate,
  allowRoles('admin', 'hq_manager', 'hq'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await query('DELETE FROM posts WHERE id=$1 RETURNING id;', [id]);
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true, deletedId: rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to delete post', detail: err?.message, code: err?.code });
    }
  }
);

// Serve React build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(clientDist, 'index.html'));
});

const port = process.env.PORT || 4000;

// Start after ensuring DB is in the shape we need
initDb()
  .then(() => {
    app.listen(port, () => console.log(`Fullstack running on :${port}`));
  })
  .catch((e) => {
    console.error('Failed to initialize DB:', e);
    process.exit(1);
  });
