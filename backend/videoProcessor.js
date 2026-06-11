import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegStatic);

// Número de threads disponíveis no servidor (usa todos os núcleos)
const CPU_THREADS = os.cpus().length;

// Helper para rodar o ffmpeg e obter informações básicas do vídeo (duração e se tem áudio)
export function getVideoInfo(filePath) {
  return new Promise((resolve) => {
    exec(`"${ffmpegStatic}" -i "${filePath}"`, (err, stdout, stderr) => {
      const output = stderr || stdout;
      
      // Parsear duração
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      let duration = 10; // Padrão
      if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10);
        const minutes = parseInt(durationMatch[2], 10);
        const seconds = parseInt(durationMatch[3], 10);
        const centiseconds = parseInt(durationMatch[4], 10);
        duration = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
      }
      
      // Verificar se o arquivo possui stream de áudio
      const hasAudio = output.includes('Audio:');

      // Verificar resolução original para otimização do scaling
      const resolutionMatch = output.match(/(\d{2,4})x(\d{2,4})/);
      let width = 1080, height = 1920;
      if (resolutionMatch) {
        width = parseInt(resolutionMatch[1], 10);
        height = parseInt(resolutionMatch[2], 10);
      }
      
      resolve({ duration, hasAudio, width, height });
    });
  });
}

// Converte string timemark (hh:mm:ss.xs) em segundos
function timemarkToSeconds(timemark) {
  if (!timemark) return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

// Gera um arquivo de tela preta pré-renderizado em cache para reutilização
function generateBlackScreen(outputPath, durationSeconds) {
  return new Promise((resolve, reject) => {
    // Se já existe com o mesmo nome, reutilizar (evitar re-renderizar)
    if (fs.existsSync(outputPath)) {
      return resolve(outputPath);
    }

    ffmpeg()
      .input(`color=c=black:s=1080x1920:r=24:d=${durationSeconds}`)
      .inputOptions(['-f', 'lavfi'])
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputOptions(['-f', 'lavfi'])
      .outputOptions([
        '-t', String(durationSeconds),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'stillimage',
        '-crf', '35',
        '-c:a', 'aac',
        '-b:a', '64k',
        `-threads`, String(CPU_THREADS),
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function processVideo(options, onProgress) {
  const {
    inputPath,
    outputPath,
    blackScreenDuration = 60,
    customPhotoPath,
    assetsDir
  } = options;

  const { duration, hasAudio } = await getVideoInfo(inputPath);
  
  // Selecionar foto (personalizada ou aleatória)
  let photoPath = '';
  if (customPhotoPath && fs.existsSync(customPhotoPath)) {
    photoPath = customPhotoPath;
    console.log(`[Processor] Usando foto de introdução personalizada: ${path.basename(photoPath)}`);
  } else {
    const photosDir = path.join(assetsDir, 'photos');
    const photos = fs.readdirSync(photosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
    if (photos.length === 0) {
      throw new Error('Nenhuma foto encontrada para inserção.');
    }
    const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
    photoPath = path.join(photosDir, randomPhoto);
    console.log(`[Processor] Usando foto de introdução aleatória: ${randomPhoto}`);
  }

  console.log(`[Processor] CPUs disponíveis: ${CPU_THREADS} threads`);
  console.log(`[Processor] Processando: ${path.basename(inputPath)}`);
  console.log(`[Processor] Duração original: ${duration.toFixed(2)}s | Tem áudio: ${hasAudio}`);

  // Pré-gerar o arquivo de tela preta em cache para acelerar a concatenação
  const blackScreenCachePath = path.join(
    path.dirname(outputPath),
    `black_${blackScreenDuration}s.mp4`
  );
  console.log(`[Processor] Gerando/recuperando cache de tela preta (${blackScreenDuration}s)...`);
  await generateBlackScreen(blackScreenCachePath, blackScreenDuration);
  console.log(`[Processor] Tela preta pronta. Iniciando edição principal...`);

  const finalDuration = 0.5 + duration + blackScreenDuration;

  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    
    // Entrada 0: Vídeo original do usuário
    command = command.input(inputPath);
    
    // Entrada 1: Foto de introdução (0.5s estático a 24fps — mais leve que 30fps)
    command = command.input(photoPath).inputOptions(['-loop 1', '-r 24', '-t 0.5']);

    // Entrada 2: Tela preta pré-renderizada em cache (muito mais rápido que gerar via filtro)
    command = command.input(blackScreenCachePath);

    // Filtros otimizados: escalar apenas os inputs do usuário e a foto
    let filterComplex = '';

    // Silêncio de 0.5s para a intro da foto
    filterComplex += `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=0.5,asetpts=PTS-STARTPTS[a1_silence];`;

    // Silêncio para o vídeo principal se não tiver áudio
    if (!hasAudio) {
      filterComplex += `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=${duration},asetpts=PTS-STARTPTS[a0_silence];`;
    }
    
    // Escalar foto de intro para 1080x1920
    filterComplex += `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[v1_intro];`;
    
    // Escalar vídeo principal para 1080x1920
    filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[v0_scaled];`;

    // Concatenação de 3 segmentos: Intro (0.5s) + Principal + Tela Preta (do arquivo cache)
    if (hasAudio) {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][0:a][2:v][2:a]concat=n=3:v=1:a=1[v_out][a_out]`;
    } else {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][a0_silence][2:v][2:a]concat=n=3:v=1:a=1[v_out][a_out]`;
    }

    command
      .complexFilter(filterComplex)
      .map('[v_out]')
      .map('[a_out]')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset ultrafast',   // Máxima velocidade de codificação
        '-tune zerolatency',   // Otimizado para encoding rápido sem buffer acumulado
        '-crf 26',             // Qualidade ótima para mobile (23=alto, 28=rápido, 26=equilíbrio)
        `-threads ${CPU_THREADS}`, // Usar TODOS os núcleos disponíveis no servidor
        '-movflags +faststart', // Permite streaming/carregamento rápido na web
        '-b:a 128k'            // Áudio em qualidade adequada para vídeos mobile
      ])
      .output(outputPath)
      .on('start', (cmdline) => {
        console.log(`[Processor] FFmpeg iniciado com ${CPU_THREADS} threads`);
      })
      .on('progress', (progress) => {
        const elapsed = timemarkToSeconds(progress.timemark);
        const percent = Math.min(Math.round((elapsed / finalDuration) * 100), 99);
        onProgress(percent);
      })
      .on('end', () => {
        console.log(`[Processor] Sucesso! Vídeo salvo em: ${path.basename(outputPath)}`);
        onProgress(100);
        resolve({ duration });
      })
      .on('error', (err) => {
        console.error(`[Processor] Erro no FFmpeg para ${path.basename(inputPath)}:`, err.message);
        reject(err);
      })
      .run();
  });
}
