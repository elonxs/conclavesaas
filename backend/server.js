import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { processVideo } from './videoProcessor.js';
import {
  createUser,
  validateUser,
  createSession,
  destroySession,
  getUserBySession,
  updateUserProfile,
  upgradeUserPlan,
  addHistory,
  getUserHistory,
  addLog,
  getAllUsers,
  updateUserStatus,
  deleteUser,
  getLogs,
  getSettings,
  updateSettings,
  getAdminStats
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5005;

// Habilitar CORS para permitir o frontend rodar em qualquer porta/domínio
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const ASSETS_DIR = path.join(__dirname, 'assets');

// Garantir limpeza e criação de diretórios na inicialização
function initDirectories() {
  [UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
    if (fs.existsSync(dir)) {
      // Limpar arquivos antigos para não acumular lixo local
      fs.readdirSync(dir).forEach((file) => {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch (e) {
          console.error(`Falha ao limpar arquivo ${file}:`, e.message);
        }
      });
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
initDirectories();

// Banco de dados em memória para gerenciar o progresso das tarefas de uploads ativos
const tasksStore = {};

// Configuração do Multer para Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de vídeo são permitidos!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 150 * 1024 * 1024, // Limite de 150MB por vídeo
    files: 10 // Upload simultâneo de até 10 arquivos
  }
});

// Servir arquivos estáticos de saídas para visualização/download direto
app.use('/outputs', express.static(OUTPUTS_DIR));

// Configuração do Multer para Imagem de Introdução Customizada
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `intro_${uuidv4()}${ext}`);
  }
});

const photoFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de imagem são permitidos!'), false);
  }
};

const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: photoFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Limite de 10MB para fotos
  }
});

// Middleware de Autenticação
const authenticate = async (req, res, next) => {
  let token = req.query.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login novamente.' });
  }

  try {
    const user = await getUserBySession(token);
    if (!user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao verificar autenticação.' });
  }
};

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    const user = await createUser(email, password, name);
    const token = await createSession(user.id);
    await addLog(user.id, 'register', `Novo usuário registrado: ${user.name} (${user.email})`);
    res.json({ token, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Por favor, informe o e-mail e senha.' });
  }

  try {
    const user = await validateUser(email, password);
    if (!user) {
      await addLog(null, 'login_failed', `Tentativa frustrada de login para: ${email}`);
      return res.status(401).json({ error: 'Credenciais incorretas.' });
    }

    if (user.status === 'suspended') {
      await addLog(user.id, 'login_blocked', `Tentativa de login bloqueada para conta suspensa: ${email}`);
      return res.status(403).json({ error: 'Sua conta foi suspensa por um administrador.' });
    }

    const token = await createSession(user.id);
    await addLog(user.id, 'login', `Usuário efetuou login: ${user.name} (${user.email})`);
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno no servidor ao realizar login' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await destroySession(req.token);
  res.json({ success: true });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const history = await getUserHistory(req.user.id);
    
    // Calcular estatísticas reais baseadas no histórico
    const totalVideos = history.length;
    const totalDurationSeconds = history.reduce((sum, h) => sum + (h.duration || 0), 0);
    const timeSavedMinutes = Math.round((totalDurationSeconds / 60) * 30) || (totalVideos * 15); // Fallback: 15 mins por vídeo
    
    // Armazenamento real (em GB)
    const storageUsedGB = parseFloat((history.reduce((sum, h) => sum + (h.size || 0), 0) / (1024 * 1024 * 1024)).toFixed(3));

    // Cota usada no mês corrente
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const quotaUsed = history.filter(h => {
      const d = new Date(h.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    res.json({
      user: req.user,
      history,
      stats: {
        totalVideos,
        timeSavedMinutes,
        storageUsedGB,
        quotaUsed
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar dados do perfil' });
  }
});

app.post('/api/auth/upgrade', authenticate, async (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'Plano não fornecido.' });

  try {
    const updatedUser = await upgradeUserPlan(req.user.id, plan);
    res.json({ user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
});

app.post('/api/auth/profile', authenticate, async (req, res) => {
  const { name, email, avatarInitials, avatarColor } = req.body;
  try {
    const updatedUser = await updateUserProfile(req.user.id, { name, email, avatarInitials, avatarColor });
    res.json({ user: updatedUser });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ==========================================
// ROTAS DE PROCESSAMENTO (AUTENTICADAS)
// ==========================================

// Rota de Upload para Foto de Introdução Customizada
app.post('/api/upload-intro-photo', authenticate, (req, res) => {
  uploadPhoto.single('introPhoto')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erro no upload da foto: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    res.json({ photoPath: req.file.path, filename: req.file.filename });
  });
});

// Rota de Upload de Vídeo
app.post('/api/upload', authenticate, (req, res) => {
  upload.array('videos', 10)(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const newTasks = [];
    for (const file of req.files) {
      const taskId = uuidv4();
      const task = {
        id: taskId,
        userId: req.user.id, // VINCULAR AO USUÁRIO
        originalName: file.originalname,
        size: file.size,
        status: 'pending',
        progress: 0,
        inputPath: file.path,
        outputPath: path.join(OUTPUTS_DIR, `processed_${taskId}.mp4`),
        errorMsg: null,
        downloadUrl: `/outputs/processed_${taskId}.mp4`
      };
      
      tasksStore[taskId] = task;
      newTasks.push({
        id: task.id,
        originalName: task.originalName,
        size: task.size,
        status: task.status,
        progress: task.progress
      });

      await addLog(req.user.id, 'upload', `Upload de vídeo realizado: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    }

    res.json({ tasks: newTasks });
  });
});

// Obter status de todas as tarefas ativas do usuário
app.get('/api/status', authenticate, (req, res) => {
  const tasksSummary = Object.values(tasksStore)
    .filter(task => task.userId === req.user.id) // FILTRAR POR USUÁRIO
    .map(task => ({
      id: task.id,
      originalName: task.originalName,
      size: task.size,
      status: task.status,
      progress: task.progress,
      errorMsg: task.errorMsg,
      downloadUrl: task.status === 'completed' ? task.downloadUrl : null
    }));
  res.json({ tasks: tasksSummary });
});

// Obter status de uma tarefa específica do usuário
app.get('/api/status/:id', authenticate, (req, res) => {
  const task = tasksStore[req.params.id];
  if (!task || task.userId !== req.user.id) {
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }
  res.json({
    id: task.id,
    originalName: task.originalName,
    size: task.size,
    status: task.status,
    progress: task.progress,
    errorMsg: task.errorMsg,
    downloadUrl: task.status === 'completed' ? task.downloadUrl : null
  });
});

// Iniciar processamento dos vídeos
app.post('/api/process', authenticate, async (req, res) => {
  const { taskIds, blackScreenDuration, customPhotoPath, preset } = req.body;

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: 'Nenhum taskId fornecido' });
  }

  // Filtrar tarefas pertencentes ao usuário autenticado e pendentes
  const validTasks = taskIds
    .map(id => tasksStore[id])
    .filter(task => task && task.userId === req.user.id && (task.status === 'pending' || task.status === 'error'));

  if (validTasks.length === 0) {
    return res.status(400).json({ error: 'Nenhuma tarefa elegível para processamento' });
  }

  res.json({ message: `Processamento de ${validTasks.length} vídeo(s) iniciado em segundo plano.` });

  // Executar o processamento em paralelo
  validTasks.forEach(async (task) => {
    task.status = 'processing';
    task.progress = 0;
    task.errorMsg = null;
    
    await addLog(req.user.id, 'processing_start', `Iniciou o processamento do vídeo: ${task.originalName} (${preset === 'shorts' ? 'Shorts' : 'Reels'})`);

    try {
      const result = await processVideo({
        inputPath: task.inputPath,
        outputPath: task.outputPath,
        blackScreenDuration: parseInt(blackScreenDuration, 10) || 60,
        customPhotoPath: customPhotoPath || null,
        assetsDir: ASSETS_DIR
      }, (progress) => {
        task.progress = progress;
        if (progress === 100) {
          task.status = 'completed';
        }
      });

      // Salvar no histórico persistente do banco local
      await addHistory(
        req.user.id,
        task.originalName,
        task.size,
        preset === 'shorts' ? 'Shorts (9:16)' : 'Reels (9:16)',
        Math.round(result.duration || 10)
      );

      await addLog(req.user.id, 'processing_success', `Processamento concluído com sucesso: ${task.originalName} (${Math.round(result.duration || 10)}s)`);

    } catch (err) {
      task.status = 'error';
      task.errorMsg = err.message || 'Erro inesperado durante a edição';
      console.error(`Erro ao processar tarefa ${task.id}:`, err);
      await addLog(req.user.id, 'processing_error', `Erro ao processar vídeo ${task.originalName}: ${err.message}`);
    }
  });
});

// Rota para baixar todos os vídeos concluídos do usuário em formato ZIP
app.get('/api/download-all', authenticate, async (req, res) => {
  const completedTasks = Object.values(tasksStore)
    .filter(t => t.userId === req.user.id && t.status === 'completed');

  if (completedTasks.length === 0) {
    return res.status(400).json({ error: 'Nenhum vídeo seu foi editado com sucesso ainda.' });
  }

  const zip = new AdmZip();
  let filesAdded = 0;

  completedTasks.forEach((task) => {
    if (fs.existsSync(task.outputPath)) {
      const baseName = path.basename(task.originalName, path.extname(task.originalName));
      const cleanName = `${baseName}_editado.mp4`;
      zip.addLocalFile(task.outputPath, '', cleanName);
      filesAdded++;
    }
  });

  if (filesAdded === 0) {
    return res.status(404).json({ error: 'Os arquivos físicos não foram encontrados.' });
  }

  const zipBuffer = zip.toBuffer();
  
  await addLog(req.user.id, 'download_all', `Usuário baixou pacote ZIP de vídeos contendo ${filesAdded} arquivos`);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="videos_editados.zip"');
  res.send(zipBuffer);
});

// Rota para baixar um vídeo individual diretamente como MP4
app.get('/api/download/:id', authenticate, async (req, res) => {
  const task = tasksStore[req.params.id];
  if (!task || task.userId !== req.user.id || !fs.existsSync(task.outputPath)) {
    return res.status(404).json({ error: 'Vídeo não encontrado ou de outro usuário.' });
  }
  const baseName = path.basename(task.originalName, path.extname(task.originalName));
  const cleanName = `${baseName}_editado.mp4`;
  
  await addLog(req.user.id, 'download', `Usuário baixou vídeo editado: ${task.originalName}`);
  
  res.download(task.outputPath, cleanName);
});

// Rota para deletar uma tarefa e limpar seus arquivos físicos
app.delete('/api/tasks/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const task = tasksStore[id];
  if (task && task.userId === req.user.id) {
    try {
      if (fs.existsSync(task.inputPath)) fs.unlinkSync(task.inputPath);
      if (fs.existsSync(task.outputPath)) fs.unlinkSync(task.outputPath);
      console.log(`[Server] Arquivos da tarefa ${id} removidos.`);
    } catch (e) {
      console.error(`[Server] Erro ao limpar arquivos da tarefa ${id}:`, e.message);
    }
    delete tasksStore[id];
  }
  res.json({ success: true });
});

// Rota de listagem de assets
app.get('/api/assets', (req, res) => {
  try {
    const photosDir = path.join(ASSETS_DIR, 'photos');
    const videosDir = path.join(ASSETS_DIR, 'videos');

    const photos = fs.existsSync(photosDir)
      ? fs.readdirSync(photosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      : [];

    const videos = fs.existsSync(videosDir)
      ? fs.readdirSync(videosDir).filter(f => f.endsWith('.mp4'))
      : [];

    res.json({ photos, videos });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar assets' });
  }
});

// Middleware de verificação de administrador
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
};

// Endpoints administrativos protegidos
app.get('/api/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    const totalUsers = users.length;
    
    // Contar usuários ativos, total de vídeos processados, downloads e uploads do banco
    const dbStats = await getAdminStats();
    
    // Novos cadastros hoje, esta semana e este mês
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let createdToday = 0;
    let createdThisWeek = 0;
    let createdThisMonth = 0;
    
    users.forEach(u => {
      const dt = new Date(u.createdAt);
      if (dt >= startOfToday) createdToday++;
      if (dt >= startOfWeek) createdThisWeek++;
      if (dt >= startOfMonth) createdThisMonth++;
    });
    
    const freeCount = users.filter(u => u.plan === 'Free').length;
    const proCount = users.filter(u => u.plan === 'Pro').length;
    const businessCount = users.filter(u => u.plan === 'Business').length;
    
    // Cálculo do tamanho dos diretórios físicos
    const getDirSize = (dirPath) => {
      let size = 0;
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach(f => {
          const stats = fs.statSync(path.join(dirPath, f));
          if (stats.isFile()) size += stats.size;
        });
      }
      return size;
    };
    
    const uploadsSize = getDirSize(UPLOADS_DIR);
    const outputsSize = getDirSize(OUTPUTS_DIR);
    const totalDiskUsedGB = parseFloat(((uploadsSize + outputsSize) / (1024 * 1024 * 1024)).toFixed(3));
    
    res.json({
      totalUsers,
      activeUsers: dbStats.activeSessionsCount,
      createdToday,
      createdThisWeek,
      createdThisMonth,
      freeCount,
      proCount,
      businessCount,
      totalProcessed: dbStats.totalProcessed,
      totalUploads: dbStats.totalUploadsCount || dbStats.totalProcessed,
      totalDownloads: dbStats.totalDownloads,
      totalDiskUsedGB,
      avgStorageUsedPerUserGB: totalUsers > 0 ? parseFloat((totalDiskUsedGB / totalUsers).toFixed(3)) : 0,
      systemStatus: 'online'
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas do admin:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao gerar estatísticas' });
  }
});

app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

app.post('/api/admin/users/:id/plan', authenticate, requireAdmin, async (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'Plano não fornecido.' });
  
  try {
    const updated = await upgradeUserPlan(req.params.id, plan);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado.' });
    
    await addLog(req.user.id, 'admin_change_plan', `Admin alterou plano do usuário ${updated.email} para ${plan}`);
    res.json({ user: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar plano do usuário.' });
  }
});

app.post('/api/admin/users/:id/status', authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status || !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  
  try {
    const updated = await updateUserStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado.' });
    
    await addLog(req.user.id, `admin_${status}`, `Admin alterou status do usuário ${updated.email} para ${status}`);
    res.json({ user: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status do usuário.' });
  }
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const deletedUserEmail = await deleteUser(req.params.id);
    if (!deletedUserEmail) return res.status(404).json({ error: 'Usuário não encontrado.' });
    
    await addLog(req.user.id, 'admin_delete_user', `Admin excluiu o usuário permanentemente: ${deletedUserEmail}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

app.get('/api/admin/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const logs = await getLogs();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

app.get('/api/admin/settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

app.post('/api/admin/settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const settings = await updateSettings(req.body);
    await addLog(req.user.id, 'admin_update_settings', 'Admin atualizou as configurações de limites da plataforma');
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// Iniciar o Servidor
app.listen(PORT, () => {
  console.log(`[Server] Servidor rodando em http://localhost:${PORT}`);
  console.log(`[Server] Diretório de uploads: ${UPLOADS_DIR}`);
  console.log(`[Server] Diretório de saídas: ${OUTPUTS_DIR}`);
});
