import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Inicializa o Pool de Conexões do PostgreSQL
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('supabase.co') 
    ? { rejectUnauthorized: false } 
    : false // Habilita SSL apenas se for conexão Supabase em produção
});

// Testar conexão inicial
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[Database] Erro ao conectar com o PostgreSQL:', err.message);
  } else {
    console.log('[Database] Conexão com o PostgreSQL (Supabase) estabelecida com sucesso.');
  }
});

// Criptografia de senhas (permanece síncrona/segura)
export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Criar Usuário
export async function createUser(email, password, name) {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Verificar se é o primeiro usuário no banco
  const countRes = await pool.query('SELECT COUNT(*) FROM users');
  const isFirstUser = parseInt(countRes.rows[0].count, 10) === 0;

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  // Pegar iniciais do nome
  const nameParts = name.trim().split(' ');
  const avatarInitials = nameParts.length > 1 
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].slice(0, 2).toUpperCase();

  const gradients = [
    'linear-gradient(135deg, #F59E0B, #06B6D4)',
    'linear-gradient(135deg, #10B981, #06B6D4)',
    'linear-gradient(135deg, #EC4899, #8B5CF6)',
    'linear-gradient(135deg, #F59E0B, #EC4899)'
  ];
  const avatarColor = gradients[Math.floor(Math.random() * gradients.length)];

  const userId = crypto.randomUUID();
  const role = isFirstUser ? 'admin' : 'user';
  const status = 'active';

  const queryText = `
    INSERT INTO users (id, email, name, password_hash, salt, plan, role, status, avatar_initials, avatar_color, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING id, email, name, plan, role, status, avatar_initials AS "avatarInitials", avatar_color AS "avatarColor", created_at AS "createdAt"
  `;

  try {
    const res = await pool.query(queryText, [
      userId,
      normalizedEmail,
      name.trim(),
      passwordHash,
      salt,
      'Free',
      role,
      status,
      avatarInitials,
      avatarColor
    ]);
    return res.rows[0];
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation no Postgres
      throw new Error('Este e-mail já está cadastrado.');
    }
    throw err;
  }
}

// Validar Usuário (Login)
export async function validateUser(email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  if (res.rows.length === 0) return null;

  const user = res.rows[0];
  const checkHash = hashPassword(password, user.salt);
  if (checkHash === user.password_hash) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      role: user.role,
      status: user.status,
      avatarInitials: user.avatar_initials,
      avatarColor: user.avatar_color,
      createdAt: user.created_at
    };
  }
  return null;
}

// Criar Sessão
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, NOW())', [token, userId]);
  return token;
}

// Destruir Sessão
export async function destroySession(token) {
  const res = await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  return res.rowCount > 0;
}

// Obter Usuário pela Sessão
export async function getUserBySession(token) {
  const queryText = `
    SELECT u.* 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1
  `;
  const res = await pool.query(queryText, [token]);
  if (res.rows.length === 0) return null;

  const user = res.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    role: user.role,
    status: user.status,
    avatarInitials: user.avatar_initials,
    avatarColor: user.avatar_color,
    createdAt: user.created_at
  };
}

// Atualizar Perfil do Usuário
export async function updateUserProfile(userId, data) {
  const queryText = `
    UPDATE users
    SET name = COALESCE($1, name),
        email = COALESCE($2, email),
        avatar_initials = COALESCE($3, avatar_initials),
        avatar_color = COALESCE($4, avatar_color)
    WHERE id = $5
    RETURNING id, email, name, plan, role, status, avatar_initials AS "avatarInitials", avatar_color AS "avatarColor"
  `;
  try {
    const res = await pool.query(queryText, [
      data.name || null,
      data.email ? data.email.toLowerCase().trim() : null,
      data.avatarInitials || null,
      data.avatarColor || null,
      userId
    ]);
    return res.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new Error('Este e-mail já está em uso.');
    }
    throw err;
  }
}

// Alterar Plano
export async function upgradeUserPlan(userId, plan) {
  const queryText = `
    UPDATE users
    SET plan = $1
    WHERE id = $2
    RETURNING id, email, name, plan, role, status, avatar_initials AS "avatarInitials", avatar_color AS "avatarColor"
  `;
  const res = await pool.query(queryText, [plan, userId]);
  return res.rows[0];
}

// Adicionar Entrada no Histórico
export async function addHistory(userId, originalName, size, preset, duration) {
  const id = crypto.randomUUID();
  const queryText = `
    INSERT INTO history (id, user_id, original_name, size, preset, duration, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, user_id AS "userId", original_name AS "originalName", size, preset, duration, created_at AS "createdAt"
  `;
  const res = await pool.query(queryText, [id, userId, originalName, size, preset, duration]);
  return res.rows[0];
}

// Obter Histórico do Usuário
export async function getUserHistory(userId) {
  const queryText = `
    SELECT id, user_id AS "userId", original_name AS "originalName", size, preset, duration, created_at AS "createdAt"
    FROM history
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const res = await pool.query(queryText, [userId]);
  return res.rows;
}

// Adicionar Log ao Sistema
export async function addLog(userId, action, details) {
  try {
    // Limitar logs a 500 registros no banco para evitar uso de espaço excessivo
    const countRes = await pool.query('SELECT COUNT(*) FROM logs');
    const count = parseInt(countRes.rows[0].count, 10);
    if (count > 500) {
      await pool.query('DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY created_at ASC LIMIT $1)', [count - 499]);
    }

    // Buscar email do usuário se userId for fornecido
    let email = 'Sistema';
    if (userId) {
      const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length > 0) email = userRes.rows[0].email;
      else email = 'Desconhecido';
    }

    const id = crypto.randomUUID();
    const queryText = `
      INSERT INTO logs (id, user_id, email, action, details, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, user_id AS "userId", email, action, details, created_at AS "createdAt"
    `;
    const res = await pool.query(queryText, [id, userId || null, email, action, details]);
    return res.rows[0];
  } catch (e) {
    console.error('Falha ao escrever log no banco de dados:', e.message);
    return null;
  }
}

// Obter Lista de Logs
export async function getLogs() {
  const queryText = `
    SELECT id, user_id AS "userId", email, action, details, created_at AS "createdAt"
    FROM logs
    ORDER BY created_at DESC
  `;
  const res = await pool.query(queryText);
  return res.rows;
}

// Obter todos os usuários para administração
export async function getAllUsers() {
  const queryText = `
    SELECT 
      u.id, 
      u.email, 
      u.name, 
      u.plan, 
      u.role, 
      u.status, 
      u.avatar_initials AS "avatarInitials", 
      u.avatar_color AS "avatarColor", 
      u.created_at AS "createdAt",
      COUNT(h.id) AS "historyCount",
      COALESCE(SUM(h.size), 0) AS "totalSize"
    FROM users u
    LEFT JOIN history h ON u.id = h.user_id
    GROUP BY u.id, u.email, u.name, u.plan, u.role, u.status, u.avatar_initials, u.avatar_color, u.created_at
    ORDER BY u.created_at DESC
  `;
  const res = await pool.query(queryText);
  return res.rows.map(row => {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      plan: row.plan,
      role: row.role,
      status: row.status,
      avatarInitials: row.avatarInitials,
      avatarColor: row.avatarColor,
      createdAt: row.createdAt,
      historyCount: parseInt(row.historyCount, 10),
      storageUsedGB: parseFloat((parseInt(row.totalSize, 10) / (1024 * 1024 * 1024)).toFixed(3))
    };
  });
}

// Atualizar status do usuário
export async function updateUserStatus(userId, status) {
  const queryText = `
    UPDATE users
    SET status = $1
    WHERE id = $2
    RETURNING id, email, name, plan, role, status
  `;
  const res = await pool.query(queryText, [status, userId]);
  return res.rows[0];
}

// Excluir usuário completamente
export async function deleteUser(userId) {
  const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return null;
  const email = userRes.rows[0].email;

  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM history WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM logs WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  return email;
}

// Configurações globais
export async function getSettings() {
  const res = await pool.query('SELECT * FROM settings WHERE key = $1', ['global_limits']);
  if (res.rows.length === 0) {
    const insertRes = await pool.query(`
      INSERT INTO settings (key, free_limit, pro_limit, max_file_size_mb)
      VALUES ($1, $2, $3, $4)
      RETURNING free_limit AS "freeLimit", pro_limit AS "proLimit", max_file_size_mb AS "maxFileSizeMB"
    `, ['global_limits', 10, 100, 150]);
    return insertRes.rows[0];
  }
  
  const row = res.rows[0];
  return {
    freeLimit: row.free_limit,
    proLimit: row.pro_limit,
    maxFileSizeMB: row.max_file_size_mb
  };
}

export async function updateSettings(newSettings) {
  const queryText = `
    UPDATE settings
    SET free_limit = COALESCE($1, free_limit),
        pro_limit = COALESCE($2, pro_limit),
        max_file_size_mb = COALESCE($3, max_file_size_mb)
    WHERE key = $4
    RETURNING free_limit AS "freeLimit", pro_limit AS "proLimit", max_file_size_mb AS "maxFileSizeMB"
  `;
  const res = await pool.query(queryText, [
    newSettings.freeLimit || null,
    newSettings.proLimit || null,
    newSettings.maxFileSizeMB || null,
    'global_limits'
  ]);
  return res.rows[0];
}

// Obter estatísticas administrativas agregadas
export async function getAdminStats() {
  const activeSessionsRes = await pool.query('SELECT COUNT(*) FROM sessions');
  const totalProcessedRes = await pool.query('SELECT COUNT(*) FROM history');
  const downloadsRes = await pool.query("SELECT COUNT(*) FROM logs WHERE action IN ('download', 'download_all')");
  const uploadsRes = await pool.query("SELECT COUNT(*) FROM logs WHERE action = 'upload'");
  return {
    activeSessionsCount: parseInt(activeSessionsRes.rows[0].count, 10),
    totalProcessed: parseInt(totalProcessedRes.rows[0].count, 10),
    totalDownloads: parseInt(downloadsRes.rows[0].count, 10),
    totalUploadsCount: parseInt(uploadsRes.rows[0].count, 10)
  };
}

