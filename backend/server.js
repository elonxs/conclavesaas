import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { processVideo } from './videoProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5005;

// Habilitar CORS para permitir o frontend rodar na porta 5173
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

// Banco de dados em memória para gerenciar o estado dos vídeos
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

// Rota de Upload para Foto de Introdução Customizada
app.post('/api/upload-intro-photo', (req, res) => {
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

// Rota de Upload
app.post('/api/upload', (req, res) => {
  upload.array('videos', 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const newTasks = [];
    req.files.forEach((file) => {
      const taskId = uuidv4();
      const task = {
        id: taskId,
        originalName: file.originalname,
        size: file.size,
        status: 'pending', // pending, processing, completed, error
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
    });

    res.json({ tasks: newTasks });
  });
});

// Obter status de todas as tarefas
app.get('/api/status', (req, res) => {
  const tasksSummary = Object.values(tasksStore).map(task => ({
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

// Obter status de uma tarefa específica
app.get('/api/status/:id', (req, res) => {
  const task = tasksStore[req.params.id];
  if (!task) {
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
app.post('/api/process', async (req, res) => {
  const { taskIds, blackScreenDuration, customPhotoPath } = req.body;

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: 'Nenhum taskId fornecido' });
  }

  // Filtrar tarefas válidas no estado pendente ou de erro
  const validTasks = taskIds
    .map(id => tasksStore[id])
    .filter(task => task && (task.status === 'pending' || task.status === 'error'));

  if (validTasks.length === 0) {
    return res.status(400).json({ error: 'Nenhuma tarefa elegível para processamento' });
  }

  // Responder imediatamente para o cliente que o processamento começou
  res.json({ message: `Processamento de ${validTasks.length} vídeo(s) iniciado em segundo plano.` });

  // Executar o processamento em paralelo
  validTasks.forEach(async (task) => {
    task.status = 'processing';
    task.progress = 0;
    task.errorMsg = null;

    try {
      await processVideo({
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
    } catch (err) {
      task.status = 'error';
      task.errorMsg = err.message || 'Erro inesperado durante a edição';
      console.error(`Erro ao processar tarefa ${task.id}:`, err);
    }
  });
});

// Rota para baixar todos os vídeos em formato ZIP
app.get('/api/download-all', (req, res) => {
  const completedTasks = Object.values(tasksStore).filter(t => t.status === 'completed');

  if (completedTasks.length === 0) {
    return res.status(400).json({ error: 'Nenhum vídeo foi editado com sucesso ainda.' });
  }

  const zip = new AdmZip();
  let filesAdded = 0;

  completedTasks.forEach((task) => {
    if (fs.existsSync(task.outputPath)) {
      // Usar o nome original com sufixo editado
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
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="videos_editados.zip"');
  res.send(zipBuffer);
});

// Rota para baixar um vídeo individual diretamente como MP4
app.get('/api/download/:id', (req, res) => {
  const task = tasksStore[req.params.id];
  if (!task || !fs.existsSync(task.outputPath)) {
    return res.status(404).json({ error: 'Vídeo não encontrado ou ainda não processado.' });
  }
  const baseName = path.basename(task.originalName, path.extname(task.originalName));
  const cleanName = `${baseName}_editado.mp4`;
  res.download(task.outputPath, cleanName);
});

// Rota para deletar uma tarefa e limpar seus arquivos físicos do servidor
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = tasksStore[id];
  if (task) {
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

// Rota de listagem de assets disponíveis (fotos/vídeos do banco de sementes)
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

// Iniciar o Servidor
app.listen(PORT, () => {
  console.log(`[Server] Servidor rodando em http://localhost:${PORT}`);
  console.log(`[Server] Diretório de uploads: ${UPLOADS_DIR}`);
  console.log(`[Server] Diretório de saídas: ${OUTPUTS_DIR}`);
});
