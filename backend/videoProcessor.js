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
      
      resolve({ duration, hasAudio });
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
  console.log(`[Processor] Intro: 0.5s | Tela preta final: ${blackScreenDuration}s`);

  const finalDuration = 0.5 + duration + blackScreenDuration;

  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    
    // Entrada 0: Vídeo original do usuário
    command = command.input(inputPath);
    
    // Entrada 1: Foto de introdução (0.5s estático a 24fps)
    command = command.input(photoPath).inputOptions(['-loop 1', '-r 24', '-t 0.5']);

    // Filtros: geração inline de tela preta e silêncios via complexFilter
    // (compatível com ffmpeg-static que não tem o demuxer lavfi externo)
    let filterComplex = '';
    
    // Gerar tela preta e silêncios diretamente via filtros internos do FFmpeg
    filterComplex += `color=c=black:s=1080x1920:r=24:d=${blackScreenDuration}[v2_scaled];`;
    filterComplex += `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=0.5[a1_silence];`;
    filterComplex += `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${blackScreenDuration}[a2_silence];`;
    if (!hasAudio) {
      filterComplex += `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${duration}[a0_silence];`;
    }
    
    // Escalar foto de intro para 1080x1920 a 24fps
    filterComplex += `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[v1_intro];`;
    // Escalar vídeo principal para 1080x1920 a 24fps
    filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[v0_scaled];`;

    // Concatenação: Intro (0.5s) → Vídeo Principal → Tela Preta
    if (hasAudio) {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][0:a][v2_scaled][a2_silence]concat=n=3:v=1:a=1[v_out][a_out]`;
    } else {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][a0_silence][v2_scaled][a2_silence]concat=n=3:v=1:a=1[v_out][a_out]`;
    }

    command
      .complexFilter(filterComplex)
      .map('[v_out]')
      .map('[a_out]')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset ultrafast',       // Máxima velocidade de codificação
        '-tune zerolatency',       // Encoding rápido sem buffer acumulado
        '-crf 26',                 // Equilíbrio ótimo entre qualidade e velocidade para mobile
        `-threads ${CPU_THREADS}`, // Usar TODOS os núcleos do servidor
        '-movflags +faststart',    // Streaming/carregamento rápido na web
        '-b:a 128k'                // Qualidade de áudio adequada para mobile
      ])
      .output(outputPath)
      .on('start', () => {
        console.log(`[Processor] FFmpeg iniciado com ${CPU_THREADS} threads (ultrafast + zerolatency)`);
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
