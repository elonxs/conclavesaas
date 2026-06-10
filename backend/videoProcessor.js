import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegStatic);

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
    blackScreenDuration = 60, // Duração da tela preta selecionada (em segundos)
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

  console.log(`[Processor] Processando: ${path.basename(inputPath)}`);
  console.log(`[Processor] Duração original: ${duration.toFixed(2)}s | Tem áudio: ${hasAudio}`);
  console.log(`[Processor] Colocando foto como intro de 0.5s no início`);
  console.log(`[Processor] Tela preta final: ${blackScreenDuration}s de duração`);

  const finalDuration = 0.5 + duration + blackScreenDuration; // Intro (0.5s) + Principal (duration) + Tela Preta (blackScreenDuration)

  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    
    // Entrada 0: Vídeo original do usuário
    command = command.input(inputPath);
    
    // Entrada 1: Foto (loop de 0.5 segundos a 30fps para introdução)
    command = command.input(photoPath).inputOptions(['-loop 1', '-r 30', '-t 0.5']);
    
    // Entrada 2: Tela preta de encerramento gerada dinamicamente via lavfi
    command = command.input(`color=c=black:s=1080x1920:rate=30:d=${blackScreenDuration}`).inputFormat('lavfi');

    // Entrada 3: Silêncio de 0.5 segundos para o áudio da foto de introdução
    command = command.input('anullsrc=channel_layout=stereo:sample_rate=44100:d=0.5').inputFormat('lavfi');

    // Entrada 4: Silêncio para a tela preta de encerramento
    command = command.input(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${blackScreenDuration}`).inputFormat('lavfi');

    // Entrada 5: Silêncio para o vídeo original caso ele não possua áudio (usando index 5 se não houver áudio)
    if (!hasAudio) {
      command = command.input(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}`).inputFormat('lavfi');
    }

    // Filtros de vídeo e áudio
    // 1. Redimensiona e padroniza tudo para 1080x1920 (Portait / Mobile HD)
    // 2. Concatena Foto (Intro) -> Vídeo do Usuário -> Tela Preta (Outro)
    let filterComplex = '';
    
    // Escalar inputs para garantir dimensões 1080x1920 exatamente
    filterComplex += `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v1_intro];`;
    filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v0_scaled];`;
    filterComplex += `[2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v2_scaled];`;

    // Concatenação de 3 segmentos: Intro (1s), Principal (duration), Tela Preta (blackScreenDuration)
    if (hasAudio) {
      // Vídeo original tem áudio (0:a), intro tem silêncio (3:a) e tela preta tem silêncio (4:a)
      filterComplex += `[v1_intro][3:a][v0_scaled][0:a][v2_scaled][4:a]concat=n=3:v=1:a=1[v_out][a_out]`;
    } else {
      // Vídeo original não tem áudio (usamos silêncio 5:a), intro tem silêncio (3:a) e tela preta tem silêncio (4:a)
      filterComplex += `[v1_intro][3:a][v0_scaled][5:a][v2_scaled][4:a]concat=n=3:v=1:a=1[v_out][a_out]`;
    }

    command
      .complexFilter(filterComplex)
      .map('[v_out]')
      .map('[a_out]')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset fast',
        '-crf 23',
        '-movflags +faststart' // Carrega mais rápido na web
      ])
      .output(outputPath)
      .on('start', (cmdline) => {
        console.log(`[Processor] Iniciou FFmpeg com comando:\n${cmdline}`);
      })
      .on('progress', (progress) => {
        const elapsed = timemarkToSeconds(progress.timemark);
        const percent = Math.min(Math.round((elapsed / finalDuration) * 100), 99);
        onProgress(percent);
      })
      .on('end', () => {
        console.log(`[Processor] Sucesso! Vídeo salvo em: ${path.basename(outputPath)}`);
        onProgress(100);
        resolve();
      })
      .on('error', (err) => {
        console.error(`[Processor] Erro no FFmpeg para ${path.basename(inputPath)}:`, err.message);
        reject(err);
      })
      .run();
  });
}
