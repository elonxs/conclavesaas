import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

// Garantir que o arquivo de banco existe
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], sessions: {}, history: [] }, null, 2));
}

export function readDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Erro ao ler banco de dados JSON:', e);
    return { users: [], sessions: {}, history: [] };
  }
}

export function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao escrever no banco de dados JSON:', e);
  }
}

// Criptografia de senhas
export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Criar Usuário
export function createUser(email, password, name) {
  const db = readDb();
  
  // Verificar se o e-mail já existe
  const normalizedEmail = email.toLowerCase().trim();
  if (db.users.find(u => u.email === normalizedEmail)) {
    throw new Error('Este e-mail já está cadastrado.');
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  
  // Pegar iniciais do nome
  const nameParts = name.trim().split(' ');
  const avatarInitials = nameParts.length > 1 
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].slice(0, 2).toUpperCase();

  // Sortear um gradiente de avatar
  const gradients = [
    'linear-gradient(135deg, #F59E0B, #06B6D4)',
    'linear-gradient(135deg, #10B981, #06B6D4)',
    'linear-gradient(135deg, #EC4899, #8B5CF6)',
    'linear-gradient(135deg, #F59E0B, #EC4899)'
  ];
  const avatarColor = gradients[Math.floor(Math.random() * gradients.length)];

  const newUser = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    name: name.trim(),
    passwordHash,
    salt,
    plan: 'Free',
    avatarInitials,
    avatarColor,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDb(db);

  // Retornar usuário sem hash e salt por segurança
  const { passwordHash: _, salt: __, ...userResponse } = newUser;
  return userResponse;
}

// Autenticar Usuário
export function validateUser(email, password) {
  const db = readDb();
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.users.find(u => u.email === normalizedEmail);
  
  if (!user) return null;

  const checkHash = hashPassword(password, user.salt);
  if (checkHash === user.passwordHash) {
    const { passwordHash: _, salt: __, ...userResponse } = user;
    return userResponse;
  }
  return null;
}

// Gerenciar Sessões
export function createSession(userId) {
  const db = readDb();
  const token = crypto.randomBytes(32).toString('hex');
  
  db.sessions[token] = {
    userId,
    createdAt: new Date().toISOString()
  };
  writeDb(db);
  return token;
}

export function destroySession(token) {
  const db = readDb();
  if (db.sessions[token]) {
    delete db.sessions[token];
    writeDb(db);
    return true;
  }
  return false;
}

export function getUserBySession(token) {
  const db = readDb();
  const session = db.sessions[token];
  if (!session) return null;

  // Opcional: verificar expiração da sessão (ex: 7 dias)
  const user = db.users.find(u => u.id === session.userId);
  if (!user) return null;

  const { passwordHash: _, salt: __, ...userResponse } = user;
  return userResponse;
}

// Atualizar informações do usuário
export function updateUserProfile(userId, data) {
  const db = readDb();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index] = {
    ...db.users[index],
    name: data.name || db.users[index].name,
    email: (data.email || db.users[index].email).toLowerCase().trim(),
    avatarInitials: data.avatarInitials || db.users[index].avatarInitials,
    avatarColor: data.avatarColor || db.users[index].avatarColor
  };

  writeDb(db);
  const { passwordHash: _, salt: __, ...userResponse } = db.users[index];
  return userResponse;
}

// Alterar Plano
export function upgradeUserPlan(userId, plan) {
  const db = readDb();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index].plan = plan;
  writeDb(db);
  const { passwordHash: _, salt: __, ...userResponse } = db.users[index];
  return userResponse;
}

// Adicionar ao Histórico
export function addHistory(userId, originalName, size, preset, duration) {
  const db = readDb();
  const entry = {
    id: crypto.randomUUID(),
    userId,
    originalName,
    size,
    preset,
    duration,
    createdAt: new Date().toISOString()
  };
  db.history.push(entry);
  writeDb(db);
  return entry;
}

// Obter Histórico do Usuário
export function getUserHistory(userId) {
  const db = readDb();
  return db.history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
