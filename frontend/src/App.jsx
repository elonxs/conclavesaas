import React, { useState, useEffect, useRef } from 'react';

// Componente de Confetes nativo em Canvas (sem dependências)
function ConfettiEffect() {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const colors = ['#F59E0B', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    }));
    
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle);
        p.tilt = Math.sin(p.tiltAngle - idx/3) * 15;
        
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
        
        if (p.y > canvas.height) {
          particles[idx] = {
            ...p,
            x: Math.random() * canvas.width,
            y: -20,
            tilt: Math.random() * 10 - 5
          };
        }
      });
      
      animationFrameId = requestAnimationFrame(draw);
    };
    
    draw();
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [blackScreenDuration, setBlackScreenDuration] = useState(60); // 60s, 120s, 180s
  const [platformPreset, setPlatformPreset] = useState('reels'); // reels, shorts
  const [errorMsg, setErrorMsg] = useState(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState(null);
  const [previewVideoName, setPreviewVideoName] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  // Custom intro photo states
  const [customPhoto, setCustomPhoto] = useState({ photoPath: null, filename: null });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const prevProcessingRef = useRef(false);

  // Parar polling ao desmontar
  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Monitorar se há processos rodando para manter ou parar o polling e disparar confetes
  useEffect(() => {
    const activeTasks = tasks.filter(t => t.status === 'processing');
    const hasActive = activeTasks.length > 0;
    
    if (hasActive) {
      prevProcessingRef.current = true;
      if (!pollIntervalRef.current) {
        startPolling();
      }
    } else {
      stopPolling();
      setProcessing(false);
      if (prevProcessingRef.current && tasks.some(t => t.status === 'completed')) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
      prevProcessingRef.current = false;
    }
  }, [tasks]);

  const startPolling = () => {
    setProcessing(true);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (res.ok) {
          const data = await res.json();
          setTasks(prev => {
            return prev.map(pTask => {
              const serverTask = data.tasks.find(t => t.id === pTask.id);
              if (serverTask) {
                return {
                  ...pTask,
                  status: serverTask.status,
                  progress: serverTask.progress,
                  errorMsg: serverTask.errorMsg,
                  downloadUrl: serverTask.downloadUrl
                };
              }
              return pTask;
            });
          });
        }
      } catch (e) {
        console.error('Erro de conexão ao buscar status:', e);
      }
    }, 1000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Funções de Drag & Drop para vídeos
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFilesSelection(files);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    handleFilesSelection(files);
  };

  const handleFilesSelection = (files) => {
    setErrorMsg(null);
    const videoFiles = files.filter(f => f.type.startsWith('video/'));
    
    if (videoFiles.length === 0) {
      setErrorMsg('Por favor, selecione apenas arquivos de vídeo válidos.');
      return;
    }

    const totalFilesCount = tasks.length + videoFiles.length;
    if (totalFilesCount > 10) {
      setErrorMsg(`Limite de 10 vídeos simultâneos excedido. Você já possui ${tasks.length} carregados.`);
      return;
    }

    uploadFiles(videoFiles);
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    setErrorMsg(null);
    const formData = new FormData();
    files.forEach(file => {
      formData.append('videos', file);
    });

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao fazer upload');
      
      setTasks(prev => [...prev, ...data.tasks]);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Upload da Foto de Introdução Customizada
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, envie um arquivo de imagem válido (JPG/PNG).');
      return;
    }

    setUploadingPhoto(true);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append('introPhoto', file);

    try {
      const res = await fetch(`${API_BASE}/api/upload-intro-photo`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao fazer upload da imagem');
      
      setCustomPhoto({
        photoPath: data.photoPath,
        filename: data.filename
      });
    } catch (e) {
      setErrorMsg(`Erro de foto: ${e.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeCustomPhoto = () => {
    setCustomPhoto({ photoPath: null, filename: null });
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const startProcessingAll = async () => {
    setErrorMsg(null);
    const eligibleTasks = tasks.filter(t => t.status === 'pending' || t.status === 'error');
    if (eligibleTasks.length === 0) return;

    const taskIds = eligibleTasks.map(t => t.id);

    try {
      const res = await fetch(`${API_BASE}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds,
          blackScreenDuration,
          customPhotoPath: customPhoto.photoPath
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar processamento');

      setTasks(prev => prev.map(t => {
        if (taskIds.includes(t.id)) {
          return { ...t, status: 'processing', progress: 0, errorMsg: null };
        }
        return t;
      }));
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await fetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Erro ao deletar no servidor:', e);
    }
  };

  const clearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'error'));
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalCount = tasks.length;
  const processingCount = tasks.filter(t => t.status === 'processing').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  return (
    <div className="app-container">
      {showConfetti && <ConfettiEffect />}

      {/* Cabeçalho Premium CONCLAVE */}
      <header style={{ borderBottom: '1px solid hsl(var(--primary) / 0.15)' }}>
        <div className="logo-container">
          <div className="logo-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #06B6D4)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)' }}>👑</div>
          <div>
            <h1 style={{ letterSpacing: '0.05em', color: '#fff', fontStyle: 'normal' }}>CONCLAVE</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-gray))' }}>Premium Automation Studio</span>
              <span style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary-hover))', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>MVP READY</span>
            </div>
          </div>
        </div>

        {/* Menu de Perfil */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Vitor Dantas</span>
            <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: '500' }}>Plano Creator Premium</span>
          </div>
          <div 
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #F59E0B, #06B6D4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              cursor: 'pointer',
              border: '2px solid hsl(var(--primary) / 0.3)',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.3)'
            }}
          >
            VD
          </div>

          {showUserDropdown && (
            <div style={{
              position: 'absolute',
              top: '50px',
              right: 0,
              background: 'hsl(var(--bg-panel))',
              border: '1px solid hsl(var(--primary) / 0.2)',
              borderRadius: '12px',
              padding: '1rem',
              width: '240px',
              zIndex: 100,
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)'
            }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#F59E0B' }}>Detalhes da Conta</h4>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-gray))', marginBottom: '0.75rem' }}>Faturamento: $49/mês (Ativo)</p>
              
              <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  <span>Vídeos no mês</span>
                  <span>15 / 200</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'hsl(var(--bg-obsidian))', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '7.5%', height: '100%', background: '#F59E0B' }} />
                </div>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ marginTop: '1rem', padding: '0.4rem 0.75rem', fontSize: '0.75rem', borderColor: 'hsl(var(--primary) / 0.3)' }}
                onClick={() => setShowUserDropdown(false)}
              >
                Configurações da Conta
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Grid Principal */}
      <div className="dashboard-grid">
        {/* Lado Esquerdo: Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Zona de Drop */}
          {totalCount < 10 && (
            <div 
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: isDragging ? '2px dashed #F59E0B' : '2px dashed hsl(var(--border-subtle))' }}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden-input" 
                multiple 
                accept="video/*"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {uploading ? (
                <>
                  <div className="upload-icon" style={{ animation: 'spin 1s linear infinite', color: '#F59E0B' }}>
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                    </svg>
                  </div>
                  <div className="upload-text">
                    <h3>Enviando vídeos...</h3>
                    <p>Carregando arquivos de vídeo com segurança para o editor</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="upload-icon" style={{ color: '#F59E0B' }}>
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="upload-text">
                    <h3>Importe seus arquivos de vídeo</h3>
                    <p>Arraste e solte até 10 vídeos simultaneamente (Recomendado mp4/webm até 150MB cada)</p>
                  </div>
                </>
              )}
            </div>
          )}

          {errorMsg && (
            <div style={{ background: 'hsl(var(--accent-rose) / 0.15)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.9rem', border: '1px solid hsl(var(--accent-rose) / 0.3)' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Seção da Fila de Vídeos */}
          <div className="panel" style={{ border: '1px solid hsl(var(--primary) / 0.1)' }}>
            <div className="panel-title" style={{ justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid hsl(var(--primary) / 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📁</span> Workspace ({totalCount}/10 vídeos)
              </div>
              {completedCount > 0 && (
                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', width: 'auto', borderColor: 'hsl(var(--primary) / 0.2)' }} onClick={clearCompleted}>
                  Limpar Concluídos
                </button>
              )}
            </div>

            {totalCount === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon" style={{ opacity: 0.2 }}>📥</div>
                <h3>Fila de processamento vazia</h3>
                <p>Insira seus vídeos de gravação para cortar, adicionar a intro de 0.5s e a tela preta no final.</p>
              </div>
            ) : (
              <div className="videos-grid">
                {tasks.map((task) => (
                  <div key={task.id} className="video-card">
                    {/* Thumbnail */}
                    <div className="video-thumbnail">
                      <span className="video-thumbnail-icon">🎬</span>
                      {task.status === 'processing' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="24" height="24" className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#F59E0B', animation: 'spin 1.5s linear infinite' }}>
                            <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Informações e Progresso */}
                    <div className="video-info">
                      <div className="video-name" title={task.originalName}>
                        {task.originalName}
                      </div>
                      <div className="video-meta">
                        <span>Tamanho: {formatSize(task.size)}</span>
                        <span>•</span>
                        <span>Formato: {platformPreset === 'reels' ? 'Vertical (9:16)' : 'Largo (16:9)'}</span>
                        <span>•</span>
                        {task.status === 'pending' && <span className="badge badge-pending">Pendente</span>}
                        {task.status === 'processing' && <span className="badge badge-processing">Editando</span>}
                        {task.status === 'completed' && <span className="badge badge-completed" style={{ color: '#10B981', background: 'rgba(16, 185, 129, 0.1)' }}>Concluído</span>}
                        {task.status === 'error' && <span className="badge badge-error" title={task.errorMsg}>Erro</span>}
                      </div>
                      
                      {(task.status === 'processing' || task.status === 'completed') && (
                        <div className="progress-container">
                          <div className="progress-text">
                            <span>Processando vídeo + áudio silenciado...</span>
                            <span>{task.progress}%</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div 
                              className="progress-bar-fill" 
                              style={{ width: `${task.progress}%`, background: 'linear-gradient(90deg, #F59E0B, #06B6D4)' }}
                            />
                          </div>
                        </div>
                      )}

                      {task.status === 'error' && (
                        <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          Erro: {task.errorMsg || 'Falha ao processar vídeo'}
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="video-status-actions">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {task.status === 'completed' && (
                          <>
                            <button 
                              className="action-icon preview" 
                              onClick={() => {
                                setPreviewVideoUrl(`${API_BASE}/outputs/processed_${task.id}.mp4`);
                                setPreviewVideoName(task.originalName);
                              }}
                              title="Visualizar Vídeo"
                              style={{ color: '#06B6D4' }}
                            >
                              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            <a 
                              href={`${API_BASE}/api/download/${task.id}`} 
                              download={`${task.originalName.replace(/\.[^/.]+$/, "")}_editado.mp4`}
                              className="action-icon download"
                              title="Baixar Vídeo MP4"
                              style={{ color: '#F59E0B' }}
                            >
                              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          </>
                        )}
                        <button 
                          className="action-icon delete" 
                          onClick={() => deleteTask(task.id)}
                          title="Remover vídeo"
                        >
                          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Ações Inferiores */}
            {totalCount > 0 && (
              <div className="dashboard-actions" style={{ borderTop: '1px solid hsl(var(--primary) / 0.1)' }}>
                <div className="actions-left">
                  <span>Prontos: <strong>{completedCount}</strong> de <strong>{totalCount}</strong> vídeos</span>
                </div>
                <div className="actions-right">
                  {completedCount > 0 && (
                    <a href={`${API_BASE}/api/download-all`} className="btn btn-secondary" style={{ textDecoration: 'none', width: 'auto', borderColor: 'hsl(var(--primary) / 0.2)' }}>
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                      </svg>
                      Baixar Todos (.ZIP)
                    </a>
                  )}
                  {pendingCount > 0 && (
                    <button 
                      className="btn btn-primary" 
                      onClick={startProcessingAll}
                      disabled={processing}
                      style={{ width: 'auto' }}
                    >
                      {processing ? (
                        <>
                          <svg className="spin" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1.5s linear infinite' }}>
                            <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                          </svg>
                          Processando...
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 15.3a2.1 2.1 0 112.8 2.8m-2.8-2.8l-3.6-3.6m3.6 3.6l-3.5 3.5m0-11l3.5 3.5M9 10.5a2.1 2.1 0 11-2.8-2.8" />
                          </svg>
                          Iniciar Edição em Lote
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Lado Direito: Opções de Processamento */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Card de Quota */}
          <div className="panel" style={{ padding: '1.25rem', border: '1px solid hsl(var(--primary) / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--text-gray))', fontWeight: 'bold' }}>Cota da Conta</span>
              <span className="badge badge-completed" style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>ATIVO</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  <span>Armazenamento</span>
                  <span>482.4 MB / 10 GB</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'hsl(var(--bg-obsidian))', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '4.8%', height: '100%', background: '#F59E0B' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  <span>Lote simultâneo</span>
                  <span>{processingCount} / 10 vídeos</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'hsl(var(--bg-obsidian))', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${processingCount * 10}%`, height: '100%', background: '#06B6D4', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Configurações de Edição */}
          <div className="panel" style={{ border: '1px solid hsl(var(--primary) / 0.1)' }}>
            <div className="panel-title" style={{ borderBottom: '1px solid hsl(var(--primary) / 0.1)' }}>
              <span>⚙️</span> Painel de Controle
            </div>

            {/* Presets de Formato */}
            <div className="settings-group">
              <label>Preset da Plataforma</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div 
                  onClick={() => setPlatformPreset('reels')}
                  style={{
                    background: platformPreset === 'reels' ? 'rgba(245, 158, 11, 0.1)' : 'hsl(var(--bg-obsidian))',
                    border: `1px solid ${platformPreset === 'reels' ? '#F59E0B' : 'hsl(var(--border-subtle))'}`,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: platformPreset === 'reels' ? '0 0 10px rgba(245, 158, 11, 0.15)' : 'none'
                  }}
                >
                  <div style={{ fontSize: '1.25rem' }}>📱</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>Reels / TikTok</div>
                  <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-gray))' }}>Portait 9:16</div>
                </div>
                <div 
                  onClick={() => setPlatformPreset('youtube')}
                  style={{
                    background: platformPreset === 'youtube' ? 'rgba(245, 158, 11, 0.1)' : 'hsl(var(--bg-obsidian))',
                    border: `1px solid ${platformPreset === 'youtube' ? '#F59E0B' : 'hsl(var(--border-subtle))'}`,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: platformPreset === 'youtube' ? '0 0 10px rgba(245, 158, 11, 0.15)' : 'none'
                  }}
                >
                  <div style={{ fontSize: '1.25rem' }}>📺</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>Shorts / Shorts</div>
                  <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-gray))' }}>Vertical HD</div>
                </div>
              </div>
            </div>

            {/* Duração da Tela Preta */}
            <div className="settings-group">
              <label>Duração da Tela Preta (Fim)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
                {[60, 120, 180].map((durationOption) => {
                  const label = durationOption === 60 ? '1 Min' : durationOption === 120 ? '2 Min' : '3 Min';
                  const active = blackScreenDuration === durationOption;
                  return (
                    <div 
                      key={durationOption}
                      onClick={() => setBlackScreenDuration(durationOption)}
                      style={{
                        background: active ? 'rgba(6, 182, 212, 0.1)' : 'hsl(var(--bg-obsidian))',
                        border: `1px solid ${active ? '#06B6D4' : 'hsl(var(--border-subtle))'}`,
                        padding: '0.6rem 0.25rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.8rem',
                        transition: 'all 0.2s ease',
                        boxShadow: active ? '0 0 10px rgba(6, 182, 212, 0.15)' : 'none'
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
              <p className="settings-info">Uma tela preta sem áudio com a duração especificada será mesclada ao final do vídeo principal.</p>
            </div>

            {/* Introdução da Foto Customizada / Aleatória */}
            <div className="settings-group" style={{ borderTop: '1px solid hsl(var(--primary) / 0.1)', paddingTop: '1rem' }}>
              <label>Imagem de Introdução (0.5 Segundos)</label>
              <input 
                type="file" 
                ref={photoInputRef}
                style={{ display: 'none' }} 
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
              />

              {customPhoto.filename ? (
                // Preview da Foto Customizada
                <div style={{
                  background: 'hsl(var(--bg-obsidian))',
                  border: '1px solid #F59E0B',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginTop: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: '#000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem'
                    }}>🖼️</div>
                    <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'hsl(var(--text-gray))' }}>
                      Capa Ativa
                    </span>
                  </div>
                  <button 
                    onClick={removeCustomPhoto}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'hsl(var(--accent-rose))',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      padding: '0.25rem 0.5rem'
                    }}
                  >
                    Excluir
                  </button>
                </div>
              ) : (
                // Botão para Upload de Foto Customizada
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="btn btn-secondary"
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.8rem',
                    border: '1px dashed hsl(var(--primary) / 0.3)',
                    background: 'rgba(245, 158, 11, 0.02)'
                  }}
                >
                  {uploadingPhoto ? (
                    <>
                      <svg className="spin" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1.5s linear infinite', marginRight: '0.25rem' }}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="30 10" />
                      </svg>
                      Carregando capa...
                    </>
                  ) : (
                    'Upload de Capa Customizada'
                  )}
                </button>
              )}
              
              <p className="settings-info" style={{ marginTop: '0.5rem' }}>
                {customPhoto.filename 
                  ? 'A sua foto personalizada será exibida por 0.5 segundos no início de cada vídeo.' 
                  : 'Nenhuma foto carregada. Usaremos uma foto aleatória da biblioteca por 0.5s.'}
              </p>
            </div>

          </div>

          {/* Dica rápida */}
          <div className="panel" style={{ background: 'rgba(245, 158, 11, 0.01)', border: '1px solid rgba(245, 158, 11, 0.05)' }}>
            <div className="panel-title" style={{ fontSize: '1rem', color: '#F59E0B', borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
              <span>💡</span> Conclave Studio
            </div>
            <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-gray))', marginTop: '0.5rem' }}>
              Suba o seu logotipo como Capa Customizada para reforçar sua marca nas redes sociais automaticamente antes da reprodução do conteúdo principal.
            </p>
          </div>

        </div>
      </div>

      {/* Modal de Preview do Vídeo */}
      {previewVideoUrl && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }} onClick={() => setPreviewVideoUrl(null)}>
          <div style={{
            background: 'hsl(var(--bg-panel))',
            border: '1px solid hsl(var(--primary) / 0.2)',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid hsl(var(--primary) / 0.1)'
            }}>
              <h3 style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%', color: '#F59E0B' }}>
                ▶️ Preview: {previewVideoName}
              </h3>
              <button style={{
                background: 'none',
                border: 'none',
                color: 'hsl(var(--text-gray))',
                cursor: 'pointer',
                fontSize: '1.25rem'
              }} onClick={() => setPreviewVideoUrl(null)}>
                ✕
              </button>
            </div>
            <div style={{ padding: '1rem', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <video 
                src={previewVideoUrl} 
                controls 
                autoPlay 
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  borderRadius: '8px'
                }}
              />
            </div>
            <div style={{
              padding: '1rem 1.25rem',
              borderTop: '1px solid hsl(var(--primary) / 0.1)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem', borderColor: 'hsl(var(--primary) / 0.2)' }} onClick={() => setPreviewVideoUrl(null)}>
                Fechar
              </button>
              <a 
                href={`${API_BASE}/api/download/${previewVideoUrl.split('processed_')[1].split('.mp4')[0]}`}
                className="btn btn-primary" 
                style={{ width: 'auto', padding: '0.5rem 1.25rem', textDecoration: 'none', fontSize: '0.9rem' }}
              >
                Baixar MP4
              </a>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}
