import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegStatic);

const CPU_THREADS = os.cpus().length;

// Parâmetros de codec COMPARTILHADOS entre todos os segmentos
// (devem ser idênticos para o concat -c copy funcionar)
const VIDEO_ENCODE_OPTS = [
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-tune', 'zerolatency',
  '-crf', '26',
  '-pix_fmt', 'yuv420p',
  '-r', '24',
  '-threads', String(CPU_THREADS),
];

const AUDIO_ENCODE_OPTS = [
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-ac', '2',
];

// Helper para obter informações do vídeo
export function getVideoInfo(filePath) {
  return new Promise((resolve) => {
    exec(`"${ffmpegStatic}" -i "${filePath}"`, (err, stdout, stderr) => {
      const output = stderr || stdout;

      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      let duration = 10;
      if (durationMatch) {
        duration =
          parseInt(durationMatch[1], 10) * 3600 +
          parseInt(durationMatch[2], 10) * 60 +
          parseInt(durationMatch[3], 10) +
          parseInt(durationMatch[4], 10) / 100;
      }

      const hasAudio = output.includes('Audio:');
      resolve({ duration, hasAudio });
    });
  });
}

// Converte timemark para segundos
function timemarkToSeconds(timemark) {
  if (!timemark) return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

// ETAPA 1: Gera/reutiliza cache da tela preta usando complexFilter
// (compatível com ffmpeg-static: usa color= como filtro, não como demuxer)
function generateBlackSegment(cachePath, durationSeconds) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(cachePath)) {
      console.log(`[Processor] ♻️  Reutilizando cache de tela preta (${durationSeconds}s)`);
      return resolve(cachePath);
    }

    console.log(`[Processor] 🎨 Gerando cache de tela preta (${durationSeconds}s) com CRF 50...`);
    ffmpeg()
      .complexFilter([
        `color=c=black:s=1080x1920:r=24:d=${durationSeconds},format=yuv420p[vout]`,
        `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${durationSeconds}[aout]`,
      ])
      .map('[vout]')
      .map('[aout]')
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '50',        // CRF 50 para tela preta: quase sem dados, gera em 1-3s
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-threads', String(CPU_THREADS),
        '-c:a', 'aac',
        '-b:a', '32k',       // Áudio mínimo para silêncio
        '-ar', '44100',
        '-ac', '2',
        '-movflags', '+faststart',
      ])
      .output(cachePath)
      .on('end', () => {
        console.log(`[Processor] ✅ Cache de tela preta pronto!`);
        resolve(cachePath);
      })
      .on('error', reject)
      .run();
  });
}

// ETAPA 2: Encodar intro + conteúdo principal (só os segundos que importam!)
function encodeMainContent(inputPath, photoPath, hasAudio, duration, tempPath, onSubProgress) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    command = command.input(inputPath);
    command = command.input(photoPath).inputOptions(['-loop 1', '-r 24', '-t 0.5']);

    const totalDuration = 0.5 + duration;
    let filterComplex = '';

    filterComplex += `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=0.5[a1_silence];`;
    if (!hasAudio) {
      filterComplex += `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${duration}[a0_silence];`;
    }
    filterComplex += `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,format=yuv420p[v1_intro];`;
    filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,format=yuv420p[v0_scaled];`;

    if (hasAudio) {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][0:a]concat=n=2:v=1:a=1[v_out][a_out]`;
    } else {
      filterComplex += `[v1_intro][a1_silence][v0_scaled][a0_silence]concat=n=2:v=1:a=1[v_out][a_out]`;
    }

    command
      .complexFilter(filterComplex)
      .map('[v_out]')
      .map('[a_out]')
      .outputOptions([
        ...VIDEO_ENCODE_OPTS,
        ...AUDIO_ENCODE_OPTS,
        '-movflags', '+faststart',
      ])
      .output(tempPath)
      .on('progress', (progress) => {
        const elapsed = timemarkToSeconds(progress.timemark);
        // Progresso de 10% a 70% durante a etapa de conteúdo
        const pct = Math.min(10 + Math.round((elapsed / totalDuration) * 60), 70);
        onSubProgress(pct);
      })
      .on('end', () => resolve(tempPath))
      .on('error', reject)
      .run();
  });
}

// ETAPA 3: Concatenar os segmentos SEM re-encodar (stream copy - quase instantâneo!)
function concatSegments(contentPath, blackPath, outputPath) {
  return new Promise((resolve, reject) => {
    const concatListPath = outputPath + '.txt';
    // Escapar aspas simples nos caminhos (necessário para o concat demuxer)
    const contentEscaped = contentPath.replace(/'/g, "'\\''");
    const blackEscaped = blackPath.replace(/'/g, "'\\''");
    fs.writeFileSync(concatListPath, `file '${contentEscaped}'\nfile '${blackEscaped}'\n`);

    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .output(outputPath)
      .on('end', () => {
        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
        resolve();
      })
      .on('error', (err) => {
        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
        reject(err);
      })
      .run();
  });
}

// Processamento principal em MODO TURBO (3 etapas, tela preta em paralelo)
export async function processVideo(options, onProgress) {
  const {
    inputPath,
    outputPath,
    blackScreenDuration = 60,
    customPhotoPath,
    assetsDir,
  } = options;

  const { duration, hasAudio } = await getVideoInfo(inputPath);

  // Selecionar foto de introdução
  let photoPath = '';
  if (customPhotoPath && fs.existsSync(customPhotoPath)) {
    photoPath = customPhotoPath;
    console.log(`[Processor] Usando foto personalizada: ${path.basename(photoPath)}`);
  } else {
    const photosDir = path.join(assetsDir, 'photos');
    const photos = fs.readdirSync(photosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
    if (photos.length === 0) throw new Error('Nenhuma foto encontrada para inserção.');
    const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
    photoPath = path.join(photosDir, randomPhoto);
    console.log(`[Processor] Usando foto aleatória: ${randomPhoto}`);
  }

  console.log(`[Processor] 🚀 MODO TURBO | ${CPU_THREADS} threads | ${duration.toFixed(2)}s de conteúdo + ${blackScreenDuration}s de tela preta`);
  onProgress(5);

  // Cache da tela preta fica na pasta outputs (compartilhado entre todas as edições)
  const blackCachePath = path.join(
    path.dirname(outputPath),
    `_black_cache_${blackScreenDuration}s.mp4`
  );

  // Arquivo temporário do conteúdo principal
  const tempContentPath = outputPath + '.content.mp4';

  // ⚡ PARALELO: Gerar/reutilizar tela preta E encodar conteúdo ao mesmo tempo!
  const [, ] = await Promise.all([
    generateBlackSegment(blackCachePath, blackScreenDuration),
    encodeMainContent(inputPath, photoPath, hasAudio, duration, tempContentPath, onProgress),
  ]);

  onProgress(80);
  console.log(`[Processor] 🔗 Concatenando segmentos (stream copy, sem re-encodar)...`);

  // ⚡ CONCAT: Juntar sem re-encodar (quase instantâneo!)
  await concatSegments(tempContentPath, blackCachePath, outputPath);

  // Limpar arquivo temporário do conteúdo
  if (fs.existsSync(tempContentPath)) fs.unlinkSync(tempContentPath);

  console.log(`[Processor] ✅ Concluído! ${path.basename(outputPath)}`);
  onProgress(100);
  return { duration };
}
