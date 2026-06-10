import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { execSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PHOTOS_DIR = path.join(__dirname, 'assets', 'photos');
const VIDEOS_DIR = path.join(__dirname, 'assets', 'videos');

// Criar pastas se não existirem
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

// Função para baixar imagem
const downloadImage = (url, filepath) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Seguir redirecionamento do Picsum
        downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`Falha ao baixar imagem: Código ${res.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(filepath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

async function seedPhotos() {
  console.log('--- Iniciando sementes de fotos (10 imagens) ---');
  for (let i = 1; i <= 10; i++) {
    const photoPath = path.join(PHOTOS_DIR, `photo_${i}.jpg`);
    if (fs.existsSync(photoPath)) {
      console.log(`Foto photo_${i}.jpg já existe, pulando.`);
      continue;
    }

    // Usando IDs ou seeds diferentes para garantir fotos diferentes do Picsum
    const picsumUrl = `https://picsum.photos/seed/flashcut_${i}/1080/1920`;
    console.log(`Baixando foto ${i}/10 de: ${picsumUrl}`);
    try {
      await downloadImage(picsumUrl, photoPath);
      console.log(`Foto ${i} salva com sucesso em: ${photoPath}`);
    } catch (error) {
      console.error(`Erro ao baixar foto ${i}: ${error.message}`);
      // Fallback: criar imagem sólida se falhar a internet
      try {
        console.log('Tentando criar imagem local de fallback...');
        execSync(`"${ffmpegStatic}" -f lavfi -i "color=c=0x${Math.floor(Math.random()*16777215).toString(16)}:s=1080x1920:d=1" -vframes 1 "${photoPath}" -y`);
        console.log(`Imagem fallback ${i} gerada!`);
      } catch (fallbackError) {
        console.error('Falha ao gerar imagem de fallback:', fallbackError.message);
      }
    }
  }
}

async function seedVideos() {
  console.log('--- Iniciando sementes de vídeos de encerramento (3 vídeos de 1 min) ---');
  
  const outros = [
    {
      name: 'outro_1_gradient.mp4',
      cmd: `"${ffmpegStatic}" -f lavfi -i "testsrc2=size=1080x1920:rate=30" -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -vf "drawtext=text='OBRIGADO POR ASSISTIR':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-100:box=1:boxcolor=black@0.6:boxborderw=20,drawtext=text='Curta e Compartilhe!':fontcolor=0x8B5CF6:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+50:box=1:boxcolor=black@0.6:boxborderw=15" -t 60 -c:v libx264 -c:a aac -pix_fmt yuv420p`
    },
    {
      name: 'outro_2_neon.mp4',
      cmd: `"${ffmpegStatic}" -f lavfi -i "color=c=0x0F0F16:s=1080x1920:rate=30" -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -vf "drawtext=text='FIM DO VIDEO':fontcolor=0x06B6D4:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-100:box=1:boxcolor=0x1E293B@0.4:boxborderw=20,drawtext=text='Inscreva-se para mais conteúdo':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+20" -t 60 -c:v libx264 -c:a aac -pix_fmt yuv420p`
    },
    {
      name: 'outro_3_minimal.mp4',
      cmd: `"${ffmpegStatic}" -f lavfi -i "color=c=0x1E1B4B:s=1080x1920:rate=30" -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -vf "drawtext=text='FLASH CUT SaaS':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2-100,drawtext=text='Edição de Vídeo Inteligente':fontcolor=0x10B981:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+20" -t 60 -c:v libx264 -c:a aac -pix_fmt yuv420p`
    }
  ];

  for (const outro of outros) {
    const videoPath = path.join(VIDEOS_DIR, outro.name);
    if (fs.existsSync(videoPath)) {
      console.log(`Vídeo ${outro.name} já existe, pulando.`);
      continue;
    }

    console.log(`Gerando vídeo ${outro.name} de 60 segundos...`);
    try {
      // Executar comando do FFmpeg para gerar o vídeo estático de encerramento
      execSync(`${outro.cmd} "${videoPath}" -y`);
      console.log(`Vídeo ${outro.name} gerado com sucesso!`);
    } catch (error) {
      console.error(`Erro ao gerar vídeo ${outro.name}:`, error.message);
    }
  }
}

async function run() {
  try {
    await seedPhotos();
    await seedVideos();
    console.log('=== Seeding concluído com sucesso! ===');
  } catch (err) {
    console.error('Erro geral no seeding:', err);
  }
}

run();
