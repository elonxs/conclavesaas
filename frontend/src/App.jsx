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
  // --- NAVEGAÇÃO & USUÁRIO ---
  const [view, setView] = useState('landing'); // 'landing' | 'app'
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'stats' | 'history' | 'billing' | 'settings' | 'support'
  const [plan, setPlan] = useState('Free'); // 'Free' | 'Pro' | 'Business'
  const [userProfile, setUserProfile] = useState({
    name: 'Victor Dantas',
    email: 'victor.dantas@creator.com',
    avatarInitials: 'VD',
    avatarColor: 'linear-gradient(135deg, #F59E0B, #06B6D4)'
  });

  // --- EDITOR REAL ---
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
  
  // Custom intro photo states
  const [customPhoto, setCustomPhoto] = useState({ photoPath: null, filename: null });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const prevProcessingRef = useRef(false);

  // --- SIMULADORES E INTERATIVOS ---
  const [faqExpanded, setFaqExpanded] = useState({});
  const [checkoutModal, setCheckoutModal] = useState({ show: false, planName: '', price: '' });
  const [checkoutTab, setCheckoutTab] = useState('pix'); // 'pix' | 'card'
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  
  // Ticket de suporte
  const [supportTicket, setSupportTicket] = useState({ subject: '', category: 'technical', message: '' });
  const [supportSuccess, setSupportSuccess] = useState(false);

  // Histórico Simulado (Dados de exemplo)
  const [simulatedHistory, setSimulatedHistory] = useState([
    { id: 'h1', name: 'vlog_viagem_tokyo.mp4', size: '42.5 MB', date: '10/06/2026', preset: 'Reels (9:16)', status: 'completed' },
    { id: 'h2', name: 'tutorial_coding_shorts.mp4', size: '18.2 MB', date: '09/06/2026', preset: 'Shorts (9:16)', status: 'completed' },
    { id: 'h3', name: 'react_hooks_dicas.mp4', size: '29.7 MB', date: '08/06/2026', preset: 'Reels (9:16)', status: 'completed' },
    { id: 'h4', name: 'podcast_cortes_05.mp4', size: '84.1 MB', date: '06/06/2026', preset: 'Shorts (9:16)', status: 'completed' }
  ]);

  // Estatísticas Simuladas
  const [simulatedStats, setSimulatedStats] = useState({
    totalVideos: 14,
    timeSavedMinutes: 420,
    storageUsedGB: 1.4,
    storageLimitGB: 10,
    quotaUsed: 2,
    quotaLimit: 10
  });

  // Ajustar cotas fictícias de acordo com o plano
  useEffect(() => {
    let limit = 10;
    let storage = 10;
    if (plan === 'Pro') {
      limit = 100;
      storage = 100;
    } else if (plan === 'Business') {
      limit = 9999;
      storage = 1000;
    }
    setSimulatedStats(prev => ({
      ...prev,
      quotaLimit: limit,
      storageLimitGB: storage
    }));
  }, [plan]);

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
        // Atualizar estatísticas simuladas
        setSimulatedStats(prev => ({
          ...prev,
          totalVideos: prev.totalVideos + tasks.filter(t => t.status === 'completed').length,
          quotaUsed: prev.quotaUsed + tasks.filter(t => t.status === 'completed').length,
          timeSavedMinutes: prev.timeSavedMinutes + (tasks.filter(t => t.status === 'completed').length * 30)
        }));
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

    if (simulatedStats.quotaUsed + videoFiles.length > simulatedStats.quotaLimit) {
      setErrorMsg(`Você atingiu o limite de vídeos do seu plano (${simulatedStats.quotaLimit}). Faça um upgrade para enviar mais.`);
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

  // --- INTERAÇÕES SIMULADAS ---
  const toggleFaq = (index) => {
    setFaqExpanded(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const openCheckout = (planName, price) => {
    setCheckoutModal({ show: true, planName, price });
    setCheckoutSuccess(false);
    setCheckoutLoading(false);
  };

  const closeCheckout = () => {
    setCheckoutModal({ show: false, planName: '', price: '' });
  };

  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    setCheckoutLoading(true);
    setTimeout(() => {
      setCheckoutLoading(false);
      setCheckoutSuccess(true);
      setTimeout(() => {
        setPlan(checkoutModal.planName);
        closeCheckout();
      }, 1500);
    }, 2000);
  };

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    setSupportSuccess(true);
    setTimeout(() => {
      setSupportSuccess(false);
      setSupportTicket({ subject: '', category: 'technical', message: '' });
    }, 4000);
  };

  // --- ELEMENTOS DE VIEW ---

  // 1. LANDING PAGE
  if (view === 'landing') {
    return (
      <div className="landing-page">
        {/* Confetes opcionais */}
        {showConfetti && <ConfettiEffect />}
        
        {/* Navigation */}
        <nav className="landing-nav">
          <div className="logo-container">
            <div className="logo-icon">C</div>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
              CONCLAVE
            </span>
          </div>
          <div className="landing-nav-links">
            <a href="#features">Recursos</a>
            <a href="#pricing">Preços</a>
            <a href="#faq">FAQ</a>
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.5rem 1.25rem' }} onClick={() => setView('app')}>
              Entrar
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <header className="landing-hero" style={{ borderBottom: 'none', marginBottom: 0 }}>
          <div className="tagline">🔥 Micro SaaS de Automação de Vídeo</div>
          <h1>
            Automatize a edição de seus vídeos para <span className="gradient-text">TikTok, Reels e Shorts</span>
          </h1>
          <p>
            Suba até 10 vídeos simultâneos. Insira capas estáticas de 0.5s de forma inteligente e adicione telas pretas com silêncio ao final. O MVP definitivo para criadores de conteúdo.
          </p>
          <div className="landing-hero-ctas">
            <button className="btn btn-primary" style={{ width: 'auto', padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={() => {
              setView('app');
              setActiveTab('editor');
            }}>
              Começar Agora Grátis
            </button>
            <a href="#pricing" className="btn btn-secondary" style={{ width: 'auto', padding: '0.8rem 2rem', fontSize: '1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              Ver Planos
            </a>
          </div>
        </header>

        {/* Features Grid */}
        <section id="features" className="landing-features">
          <div className="features-header">
            <h2>Por que escolher o CONCLAVE?</h2>
            <p>A edição em lote mais veloz e minimalista do mercado.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <h3>Edição Simultânea (Lote)</h3>
              <p>Envie até 10 arquivos de vídeo ao mesmo tempo. Nosso servidor em segundo plano processa e disponibiliza cada um de forma independente.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <h3>Presets Ideais</h3>
              <p>Gere vídeos perfeitamente alinhados para as maiores plataformas mobile (Reels, TikTok, YouTube Shorts) com apenas um clique.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3>Ganchos & Retenção</h3>
              <p>Adicione uma foto de introdução por 0.5s para captar a atenção imediatamente, e uma tela preta silenciosa de até 3 minutos no final do vídeo.</p>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="landing-pricing" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
          <div className="features-header">
            <h2>Planos Feitos Para O Seu Crescimento</h2>
            <p>Selecione a opção perfeita. Cancele quando quiser.</p>
          </div>
          <div className="pricing-grid">
            {/* Free */}
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Free</h3>
                <p>Ideal para testar e validar.</p>
                <div className="pricing-price">R$ 0 <span>/mês</span></div>
              </div>
              <ul className="pricing-features">
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Até 10 vídeos por lote
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Cota mensal de 10 vídeos
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  10 GB de armazenamento
                </li>
              </ul>
              <button className="btn btn-secondary" onClick={() => {
                setView('app');
                setActiveTab('editor');
              }}>
                Usar Grátis
              </button>
            </div>

            {/* Pro */}
            <div className="pricing-card popular">
              <div className="popular-badge">Mais Popular</div>
              <div className="pricing-header">
                <h3>Pro</h3>
                <p>Para criadores profissionais.</p>
                <div className="pricing-price">R$ 49 <span>/mês</span></div>
              </div>
              <ul className="pricing-features">
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Vídeos simultâneos ilimitados
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Cota mensal de 100 vídeos
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  100 GB de armazenamento
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Suporte Prioritário
                </li>
              </ul>
              <button className="btn btn-primary" onClick={() => openCheckout('Pro', 'R$ 49')}>
                Fazer Upgrade
              </button>
            </div>

            {/* Business */}
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Business</h3>
                <p>Para agências e produtoras.</p>
                <div className="pricing-price">R$ 149 <span>/mês</span></div>
              </div>
              <ul className="pricing-features">
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Tudo do plano PRO
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Cota mensal ilimitada
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  1 TB de armazenamento
                </li>
                <li>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Acesso via API
                </li>
              </ul>
              <button className="btn btn-secondary" onClick={() => openCheckout('Business', 'R$ 149')}>
                Fazer Upgrade
              </button>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="landing-faq" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
          <div className="features-header">
            <h2>Dúvidas Frequentes</h2>
            <p>Tudo o que você precisa saber sobre o CONCLAVE.</p>
          </div>
          <div className="faq-accordion">
            {[
              { q: 'Como funciona o processamento em lote?', a: 'Ao enviar múltiplos vídeos, nosso servidor na nuvem processa cada um deles sequencialmente na fila, aplicando a capa e a tela preta final sem travar o seu navegador. Você pode fechar o site e o processamento continuará normalmente.' },
              { q: 'Quanto tempo dura a foto de introdução?', a: 'A foto inicial é exibida por exatamente 0.5 segundos no início do vídeo, criando uma breve transição de gancho de atenção recomendada para reter usuários no TikTok/Reels.' },
              { q: 'Posso usar minha própria foto de intro?', a: 'Sim! Há uma opção na barra de controle onde você faz upload de uma capa customizada. Se não carregar nenhuma, o sistema sorteia uma imagem aleatória premium da nossa biblioteca.' },
              { q: 'Posso cancelar a assinatura quando quiser?', a: 'Com certeza. Não há contrato de fidelidade. Você pode assinar ou cancelar seu plano Pro/Business diretamente do painel no momento que desejar.' }
            ].map((item, idx) => (
              <div className="faq-item" key={idx}>
                <button className="faq-question" onClick={() => toggleFaq(idx)}>
                  <span>{item.q}</span>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ transform: faqExpanded[idx] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {faqExpanded[idx] && <div className="faq-answer">{item.a}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Landing Footer */}
        <footer style={{ background: 'hsl(var(--bg-panel))', borderTop: '1px solid hsl(var(--border-subtle))', padding: '3rem 2rem', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>
          <p>© 2026 CONCLAVE Automation Studio. Todos os direitos reservados.</p>
        </footer>

        {/* Modal de checkout */}
        {renderCheckoutModal()}
      </div>
    );
  }

  // 2. DASHBOARD PRIVADO COM SIDEBAR
  return (
    <div className="saas-layout">
      {/* Confetes de Sucesso */}
      {showConfetti && <ConfettiEffect />}
      
      {/* Sidebar de Navegação */}
      <aside className="saas-sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Logo */}
          <div className="saas-sidebar-brand" onClick={() => setView('landing')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">C</div>
            <h1>CONCLAVE</h1>
          </div>

          {/* Nav Links */}
          <nav className="saas-sidebar-nav">
            <button className={`saas-nav-link ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Editor de Vídeo
            </button>
            <button className={`saas-nav-link ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Estatísticas
            </button>
            <button className={`saas-nav-link ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Histórico
            </button>
            <button className={`saas-nav-link ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Meu Plano
            </button>
            <button className={`saas-nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurações
            </button>
            <button className={`saas-nav-link ${activeTab === 'support' ? 'active' : ''}`} onClick={() => setActiveTab('support')}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Suporte & FAQ
            </button>
          </nav>
        </div>

        {/* Sidebar Footer (Profile + Quota Indicator) */}
        <div className="saas-sidebar-profile">
          <div className="quota-bar-container" style={{ marginBottom: '0.5rem' }}>
            <div className="quota-bar-header">
              <span>Cota de Vídeos</span>
              <span>{simulatedStats.quotaUsed} / {plan === 'Business' ? '∞' : simulatedStats.quotaLimit}</span>
            </div>
            <div className="quota-bar-track">
              <div 
                className="quota-bar-fill" 
                style={{ width: `${plan === 'Business' ? 10 : Math.min((simulatedStats.quotaUsed / simulatedStats.quotaLimit) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          
          <div className="profile-info">
            <div className="profile-avatar" style={{ background: userProfile.avatarColor }}>
              {userProfile.avatarInitials}
            </div>
            <div className="profile-details">
              <span className="profile-name">{userProfile.name}</span>
              <span className={`profile-badge ${plan.toLowerCase()}`}>{plan} Plan</span>
            </div>
          </div>
          
          <button className="btn btn-secondary" style={{ padding: '0.4rem', fontSize: '0.8rem', width: '100%', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} onClick={() => setView('landing')}>
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <main className="saas-content">
        {/* Renderiza a aba ativa */}
        {renderActiveTabContent()}
      </main>

      {/* Modal de checkout */}
      {renderCheckoutModal()}

      {/* Modal de visualização de vídeo (existente) */}
      {previewVideoUrl && (
        <div className="video-preview-overlay" onClick={() => setPreviewVideoUrl(null)}>
          <div className="video-preview-modal panel" onClick={(e) => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid hsl(var(--border-subtle))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                Prévia: {previewVideoName}
              </h3>
              <button 
                onClick={() => setPreviewVideoUrl(null)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', aspectRatio: '9/16', maxHeight: '60vh', overflow: 'hidden' }}>
              <video 
                src={previewVideoUrl} 
                controls 
                autoPlay 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
    </div>
  );

  // --- COMPONENTES AUXILIARES DE RENDERIZAÇÃO ---

  function renderActiveTabContent() {
    switch (activeTab) {
      // 1. ABA DO EDITOR DE VÍDEO REAL
      case 'editor':
        const pendingCount = tasks.filter(t => t.status === 'pending').length;
        const processingCount = tasks.filter(t => t.status === 'processing').length;
        const completedCount = tasks.filter(t => t.status === 'completed').length;
        const totalCount = tasks.length;
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header Interno */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem' }}>Editor de Vídeo</h1>
                <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Configure os parâmetros e envie seus arquivos para começar a editar.</p>
              </div>
            </div>

            {/* Grid Principal do Editor */}
            <div className="dashboard-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Zona de Upload */}
                <div 
                  className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <svg className="upload-icon" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <div className="upload-text">
                    <h3>Importe seus arquivos de vídeo</h3>
                    <p>Arrastar e soltar até 10 vídeos simultaneamente (Recomendado mp4/webm até 150MB cada)</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden-input" 
                    multiple 
                    accept="video/*" 
                    onChange={handleFileChange} 
                  />
                  {uploading && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', borderRadius: '16px' }}>
                      <div className="spinner"></div>
                      <span>Carregando arquivos de vídeo...</span>
                    </div>
                  )}
                </div>

                {/* Mensagem de erro */}
                {errorMsg && (
                  <div className="error-alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'hsl(var(--accent-rose) / 0.15)', color: 'hsl(var(--accent-rose))', padding: '1rem', borderRadius: '12px', border: '1px solid hsl(var(--accent-rose) / 0.3)' }}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Fila de vídeos */}
                <div className="panel">
                  <h3 className="panel-title">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Workspace ({totalCount}/10 vídeos)
                  </h3>
                  
                  {totalCount === 0 ? (
                    <div className="empty-state">
                      <span className="empty-state-icon">📥</span>
                      <h3>Fila de processamento vazia</h3>
                      <p>Insira seus vídeos de gravação para cortar, adicionar a intro de 0.5s e a tela preta no final.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {tasks.map(task => (
                        <div key={task.id} className={`video-status-card ${task.status}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'hsl(var(--bg-obsidian))', border: '1px solid hsl(var(--border-subtle))', borderRadius: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                            <div className="video-thumbnail" style={{ position: 'relative', width: '40px', height: '40px', background: 'hsl(var(--border-subtle))', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--text-muted))' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                              </svg>
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <h4 style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.originalName}</h4>
                              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                                Tamanho: {formatSize(task.size)} • Formato: Vertical (9:16)
                                {task.status === 'error' && <span style={{ color: 'hsl(var(--accent-rose))', fontWeight: 'bold', marginLeft: '0.5rem' }}>• ERRO</span>}
                              </p>
                              {task.status === 'error' && (
                                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--accent-rose))', marginTop: '0.25rem' }}>
                                  Erro: {task.errorMsg}
                                </p>
                              )}
                              {task.status === 'processing' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                                  <div style={{ flex: 1, height: '4px', background: 'hsl(var(--border-subtle))', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ width: `${task.progress}%`, height: '100%', background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent-cyan)))' }}></div>
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--primary-hover))', fontWeight: 'bold' }}>{task.progress}%</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="video-status-actions" style={{ marginLeft: '1rem' }}>
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
                                    style={{ color: '#06B6D4', background: 'transparent', border: 'none', cursor: 'pointer' }}
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
                                    style={{ color: '#F59E0B', textDecoration: 'none' }}
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
                                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
                              >
                                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" />
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
                    <div className="dashboard-actions" style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="actions-left">
                        <span style={{ fontSize: '0.9rem' }}>Prontos: <strong>{completedCount}</strong> de <strong>{totalCount}</strong> vídeos</span>
                      </div>
                      <div className="actions-right" style={{ display: 'flex', gap: '0.5rem' }}>
                        {completedCount > 0 && (
                          <a href={`${API_BASE}/api/download-all`} className="btn btn-secondary" style={{ textDecoration: 'none', width: 'auto', borderColor: 'hsl(var(--primary) / 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                            </svg>
                            Baixar Todos (.ZIP)
                          </a>
                        )}
                        {pendingCount > 0 && (
                          <button 
                            className="btn btn-primary" 
                            style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            onClick={startProcessingAll}
                            disabled={processing}
                          >
                            {processing ? (
                              <>
                                <div className="spinner"></div>
                                Processando...
                              </>
                            ) : (
                              <>
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Iniciar Processamento
                              </>
                            )}
                          </button>
                        )}
                        {completedCount > 0 && (
                          <button className="btn btn-secondary" style={{ width: 'auto', color: 'hsl(var(--text-muted))' }} onClick={clearCompleted}>
                            Limpar Concluídos
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna Lateral de Controles do Editor */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 className="panel-title" style={{ margin: 0, paddingBottom: '0.75rem' }}>⚙️ Painel de Controle</h3>
                
                {/* Seleção do Preset */}
                <div className="settings-group">
                  <label>Preset da Plataforma</label>
                  <div className="preset-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div 
                      className={`preset-card ${platformPreset === 'reels' ? 'active' : ''}`}
                      onClick={() => setPlatformPreset('reels')}
                      style={{ padding: '0.75rem', border: '1px solid hsl(var(--border-subtle))', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: platformPreset === 'reels' ? 'hsl(var(--primary) / 0.05)' : 'transparent', borderColor: platformPreset === 'reels' ? 'hsl(var(--primary))' : 'hsl(var(--border-subtle))' }}
                    >
                      <span style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.25rem' }}>📱</span>
                      <strong style={{ fontSize: '0.85rem', display: 'block' }}>Reels / TikTok</strong>
                      <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Portait 9:16</span>
                    </div>
                    <div 
                      className={`preset-card ${platformPreset === 'shorts' ? 'active' : ''}`}
                      onClick={() => setPlatformPreset('shorts')}
                      style={{ padding: '0.75rem', border: '1px solid hsl(var(--border-subtle))', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: platformPreset === 'shorts' ? 'hsl(var(--primary) / 0.05)' : 'transparent', borderColor: platformPreset === 'shorts' ? 'hsl(var(--primary))' : 'hsl(var(--border-subtle))' }}
                    >
                      <span style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.25rem' }}>📺</span>
                      <strong style={{ fontSize: '0.85rem', display: 'block' }}>Shorts / Shorts</strong>
                      <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Vertical HD</span>
                    </div>
                  </div>
                </div>

                {/* Seleção do Fim (Tela Preta) */}
                <div className="settings-group">
                  <label>Duração da Tela Preta (Fim)</label>
                  <div className="duration-selector" style={{ display: 'flex', gap: '0.5rem' }}>
                    {[60, 120, 180].map((sec) => (
                      <button 
                        key={sec} 
                        className={`duration-btn ${blackScreenDuration === sec ? 'active' : ''}`}
                        onClick={() => setBlackScreenDuration(sec)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))', background: blackScreenDuration === sec ? 'hsl(var(--accent-cyan) / 0.15)' : 'transparent', color: blackScreenDuration === sec ? 'hsl(var(--accent-cyan))' : 'hsl(var(--text-gray))', borderColor: blackScreenDuration === sec ? 'hsl(var(--accent-cyan))' : 'hsl(var(--border-subtle))', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        {sec / 60} Min
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '0.5rem' }}>
                    Uma tela preta sem áudio com a duração especificada será mesclada ao final do vídeo principal.
                  </p>
                </div>

                {/* Imagem de Introdução Customizada */}
                <div className="settings-group" style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: '1.25rem' }}>
                  <label>Imagem de Introdução (0.5 Segundos)</label>
                  
                  {customPhoto.photoPath ? (
                    <div className="custom-photo-preview" style={{ display: 'flex', alignItems: 'center', justifyBetween: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'hsl(var(--bg-obsidian))', border: '1px solid hsl(var(--border-subtle))', borderRadius: '10px' }}>
                      <span style={{ fontSize: '1.25rem' }}>🖼️</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customPhoto.filename}</p>
                        <p style={{ fontSize: '0.7rem', color: 'hsl(var(--accent-emerald))' }}>Carregada com sucesso</p>
                      </div>
                      <button 
                        onClick={removeCustomPhoto}
                        style={{ background: 'transparent', border: 'none', color: 'hsl(var(--accent-rose))', cursor: 'pointer', padding: '0.2rem' }}
                      >
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        className="btn btn-secondary" 
                        style={{ fontSize: '0.85rem', padding: '0.6rem' }} 
                        onClick={() => photoInputRef.current && photoInputRef.current.click()}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? (
                          <>
                            <div className="spinner"></div>
                            Carregando Foto...
                          </>
                        ) : (
                          'Upload de Capa Customizada'
                        )}
                      </button>
                      <input 
                        type="file" 
                        ref={photoInputRef} 
                        className="hidden-input" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                      />
                      <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '0.5rem' }}>
                        Nenhuma foto carregada. Usaremos uma foto aleatória da biblioteca por 0.5s.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      // 2. ABA DE ESTATÍSTICAS (SIMULADO)
      case 'stats':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Estatísticas da Conta</h1>
              <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Veja dados de engajamento e histórico de uso da sua conta no CONCLAVE.</p>
            </div>

            {/* Quatro Cards Grandes */}
            <div className="stats-large-grid">
              <div className="stat-large-card">
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Total Processado</span>
                <span className="stat-large-value gold">{simulatedStats.totalVideos}</span>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--accent-emerald))' }}>+ {simulatedStats.totalVideos - 12} esta semana</span>
              </div>
              <div className="stat-large-card">
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Tempo Economizado</span>
                <span className="stat-large-value cyan">{simulatedStats.timeSavedMinutes} min</span>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>≈ {(simulatedStats.timeSavedMinutes / 60).toFixed(1)} horas</span>
              </div>
              <div className="stat-large-card">
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Armazenamento</span>
                <span className="stat-large-value emerald">{simulatedStats.storageUsedGB.toFixed(1)} GB</span>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>de {simulatedStats.storageLimitGB} GB contratados</span>
              </div>
              <div className="stat-large-card">
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Fila Concorrente</span>
                <span className="stat-large-value">10 slots</span>
                <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Sem fila de espera</span>
              </div>
            </div>

            {/* Linha de Gráficos CSS */}
            <div className="chart-row">
              <div className="panel">
                <h3 className="panel-title">Uso de Vídeos Mensal</h3>
                <div className="simulated-chart-bar-container">
                  {[
                    { month: 'Janeiro', count: 12, percent: 30 },
                    { month: 'Fevereiro', count: 28, percent: 55 },
                    { month: 'Março', count: 32, percent: 65 },
                    { month: 'Abril', count: 48, percent: 85 },
                    { month: 'Maio (Corrente)', count: simulatedStats.totalVideos, percent: Math.min((simulatedStats.totalVideos / simulatedStats.quotaLimit) * 100, 100) }
                  ].map((bar, idx) => (
                    <div className="chart-bar-item" key={idx}>
                      <div className="chart-bar-labels">
                        <strong>{bar.month}</strong>
                        <span>{bar.count} vídeos</span>
                      </div>
                      <div className="chart-bar-track">
                        <div className="chart-bar-fill" style={{ width: `${bar.percent}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyBetween: 'center' }}>
                <h3 className="panel-title">Distribuição de Presets</h3>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.25rem', padding: '1rem 0' }}>
                  {[
                    { label: 'Reels / TikTok (9:16)', count: 9, color: 'hsl(var(--primary))' },
                    { label: 'YouTube Shorts (9:16)', count: 5, color: 'hsl(var(--accent-cyan))' }
                  ].map((dist, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: dist.color }}></div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dist.label}</span>
                        <div style={{ height: '4px', background: 'hsl(var(--border-subtle))', borderRadius: '2px', marginTop: '0.25rem', overflow: 'hidden' }}>
                          <div style={{ width: `${(dist.count / 14) * 100}%`, height: '100%', backgroundColor: dist.color }}></div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>{Math.round((dist.count / 14) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      // 3. ABA DE HISTÓRICO (SIMULADO)
      case 'history':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Histórico de Exportações</h1>
              <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Todos os seus vídeos editados e disponíveis para baixar de forma rápida.</p>
            </div>

            <div className="panel" style={{ padding: '1rem' }}>
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Arquivo Original</th>
                      <th>Tamanho</th>
                      <th>Data</th>
                      <th>Preset</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedHistory.map(row => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ marginRight: '0.5rem' }}>🎬</span>
                          {row.name}
                        </td>
                        <td>{row.size}</td>
                        <td>{row.date}</td>
                        <td>{row.preset}</td>
                        <td>
                          <span className="status-indicator completed">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }}></span>
                            {row.status === 'completed' ? 'Finalizado' : 'Erro'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {/* Botão de download fictício */}
                          <button 
                            className="btn btn-secondary" 
                            style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderColor: 'hsl(var(--primary) / 0.2)' }}
                            onClick={() => {
                              alert(`Simulando download de: ${row.name}`);
                            }}
                          >
                            Baixar Novamente
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      // 4. ABA DE MEU PLANO (FATURAMENTO)
      case 'billing':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Meu Plano</h1>
              <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Gerencie suas assinaturas, faturas e cota de uso do CONCLAVE.</p>
            </div>

            {/* Plano Atual */}
            <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, hsl(var(--bg-panel)) 0%, hsl(var(--primary) / 0.05) 100%)' }}>
              <div>
                <span className="profile-badge pro" style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>{plan} Plan</span>
                <h2 style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>
                  {plan === 'Free' && 'Você está no plano Gratuito'}
                  {plan === 'Pro' && 'Você está no plano Pro Creator'}
                  {plan === 'Business' && 'Você está no plano Business Agency'}
                </h2>
                <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  {plan === 'Free' && 'Ideal para testes de renderização. Faça upgrade para aumentar o limite mensal.'}
                  {plan === 'Pro' && 'Sua assinatura Pro está ativa. Renovação automática em 10/07/2026.'}
                  {plan === 'Business' && 'Sua agência tem acesso ilimitado ao sistema. Renovação automática em 10/07/2026.'}
                </p>
              </div>
              <div>
                {plan !== 'Free' && (
                  <button className="btn btn-secondary" style={{ width: 'auto', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} onClick={() => {
                    if (confirm('Deseja realmente cancelar a assinatura? Seus benefícios expirarão no final do ciclo.')) {
                      setPlan('Free');
                    }
                  }}>
                    Cancelar Assinatura
                  </button>
                )}
              </div>
            </div>

            {/* Tabela de Preços do Dashboard */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>Alterar meu plano</h3>
              <div className="pricing-grid">
                {/* Free */}
                <div className={`pricing-card ${plan === 'Free' ? 'popular' : ''}`} style={{ borderColor: plan === 'Free' ? 'hsl(var(--primary))' : '' }}>
                  {plan === 'Free' && <div className="popular-badge">Seu Plano</div>}
                  <div className="pricing-header">
                    <h3>Free</h3>
                    <p>Funcionalidades básicas.</p>
                    <div className="pricing-price">R$ 0 <span>/mês</span></div>
                  </div>
                  <ul className="pricing-features">
                    <li>10 vídeos simultâneos</li>
                    <li>Cota mensal de 10 vídeos</li>
                    <li>10 GB de armazenamento</li>
                  </ul>
                  <button className="btn btn-secondary" disabled={plan === 'Free'} onClick={() => setPlan('Free')}>
                    {plan === 'Free' ? 'Plano Ativo' : 'Downgrade'}
                  </button>
                </div>

                {/* Pro */}
                <div className={`pricing-card ${plan === 'Pro' ? 'popular' : ''}`} style={{ borderColor: plan === 'Pro' ? 'hsl(var(--primary))' : '' }}>
                  {plan === 'Pro' && <div className="popular-badge">Seu Plano</div>}
                  <div className="pricing-header">
                    <h3>Pro</h3>
                    <p>Para profissionais e Youtubers.</p>
                    <div className="pricing-price">R$ 49 <span>/mês</span></div>
                  </div>
                  <ul className="pricing-features">
                    <li>Vídeos simultâneos ilimitados</li>
                    <li>Cota mensal de 100 vídeos</li>
                    <li>100 GB de armazenamento</li>
                    <li>Suporte Prioritário</li>
                  </ul>
                  <button className="btn btn-primary" disabled={plan === 'Pro'} onClick={() => openCheckout('Pro', 'R$ 49')}>
                    {plan === 'Pro' ? 'Plano Ativo' : 'Assinar Pro'}
                  </button>
                </div>

                {/* Business */}
                <div className={`pricing-card ${plan === 'Business' ? 'popular' : ''}`} style={{ borderColor: plan === 'Business' ? 'hsl(var(--primary))' : '' }}>
                  {plan === 'Business' && <div className="popular-badge">Seu Plano</div>}
                  <div className="pricing-header">
                    <h3>Business</h3>
                    <p>Para agências de vídeo.</p>
                    <div className="pricing-price">R$ 149 <span>/mês</span></div>
                  </div>
                  <ul className="pricing-features">
                    <li>Tudo do Pro</li>
                    <li>Vídeos mensais ILIMITADOS</li>
                    <li>1 TB de armazenamento</li>
                    <li>Acesso via API do Desenvolvedor</li>
                  </ul>
                  <button className="btn btn-secondary" disabled={plan === 'Business'} onClick={() => openCheckout('Business', 'R$ 149')}>
                    {plan === 'Business' ? 'Plano Ativo' : 'Assinar Business'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      // 5. ABA DE CONFIGURAÇÕES (PERFIL & DEV SETTINGS)
      case 'settings':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Configurações do Sistema</h1>
              <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Ajuste os dados da sua conta e credenciais do CONCLAVE.</p>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {/* Form de Perfil */}
              <div className="panel">
                <h3 className="panel-title">👤 Perfil do Usuário</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  alert('Perfil atualizado com sucesso (Simulado)!');
                }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="settings-group">
                    <label>Nome Completo</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={userProfile.name} 
                      onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })} 
                    />
                  </div>
                  <div className="settings-group">
                    <label>E-mail Corporativo</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      value={userProfile.email} 
                      onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })} 
                    />
                  </div>
                  <div className="settings-group">
                    <label>Avatar e Iniciais</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ width: '80px', textAlign: 'center' }} 
                        value={userProfile.avatarInitials} 
                        maxLength={2} 
                        onChange={(e) => setUserProfile({ ...userProfile, avatarInitials: e.target.value.toUpperCase() })} 
                      />
                      <div className="avatar-grid">
                        {[
                          'linear-gradient(135deg, #F59E0B, #06B6D4)',
                          'linear-gradient(135deg, #10B981, #06B6D4)',
                          'linear-gradient(135deg, #EC4899, #8B5CF6)',
                          'linear-gradient(135deg, #F59E0B, #EC4899)'
                        ].map((grad, i) => (
                          <div 
                            key={i} 
                            className={`avatar-choice ${userProfile.avatarColor === grad ? 'active' : ''}`}
                            style={{ background: grad }}
                            onClick={() => setUserProfile({ ...userProfile, avatarColor: grad })}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Salvar Perfil</button>
                </form>
              </div>

              {/* Dev settings / Chaves de API */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 className="panel-title">🔑 Chaves de Acesso (API)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-gray))', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                    Integre o editor de vídeo em lote do CONCLAVE com seus próprios bots de Telegram ou scripts de automação.
                  </p>
                  
                  {plan === 'Free' ? (
                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid hsl(var(--border-subtle))', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem' }}>🔒</span>
                      <h4 style={{ fontSize: '1rem', marginTop: '0.5rem' }}>Disponível no plano Business</h4>
                      <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '0.25rem' }}>
                        Faça upgrade para ter acesso às chaves de API.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="settings-group">
                        <label>Sua API Key Privada</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            type="password" 
                            className="form-input" 
                            readOnly 
                            value="cc_live_9f8241h892d19d182903e1982dfb" 
                          />
                          <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.75rem' }} onClick={() => alert('Copiado!')}>
                            Copiar
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: '0.75rem', background: 'hsl(var(--accent-emerald) / 0.15)', color: '#34d399', borderRadius: '8px', border: '1px solid hsl(var(--accent-emerald) / 0.3)', fontSize: '0.8rem' }}>
                        API Ativa e operacional
                      </div>
                    </div>
                  )}
                </div>
                
                <div style={{ borderTop: '1px solid hsl(var(--border-subtle))', paddingTop: '1rem', marginTop: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Instruções de segurança</h4>
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                    Nunca compartilhe suas chaves com terceiros. A chave permite acesso completo de edição e downloads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      // 6. ABA DE SUPORTE & FAQ (SIMULADO)
      case 'support':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem' }}>Central de Suporte</h1>
              <p style={{ color: 'hsl(var(--text-gray))', fontSize: '0.9rem' }}>Fale com nossa equipe técnica ou tire suas dúvidas abaixo.</p>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 380px' }}>
              {/* Ticket Form */}
              <div className="panel">
                <h3 className="panel-title">💬 Abrir Chamado de Suporte</h3>
                
                {supportSuccess ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', textAlign: 'center', gap: '1rem' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'hsl(var(--accent-emerald) / 0.15)', color: 'hsl(var(--accent-emerald))', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '2rem' }}>✓</div>
                    <h3>Mensagem Enviada!</h3>
                    <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Nossa equipe responderá no e-mail cadastrado em até 4 horas úteis.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSupportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="settings-group">
                      <label>Assunto do Chamado</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ex: Lentidão no renderizador de vídeos" 
                        required
                        value={supportTicket.subject}
                        onChange={(e) => setSupportTicket({ ...supportTicket, subject: e.target.value })}
                      />
                    </div>
                    <div className="settings-group">
                      <label>Categoria</label>
                      <select 
                        className="form-select"
                        value={supportTicket.category}
                        onChange={(e) => setSupportTicket({ ...supportTicket, category: e.target.value })}
                      >
                        <option value="technical">Problemas de Edição (FFmpeg)</option>
                        <option value="billing">Dúvidas de Assinatura / Faturamento</option>
                        <option value="feature">Sugestões de Novas Funções</option>
                      </select>
                    </div>
                    <div className="settings-group">
                      <label>Mensagem / Detalhes</label>
                      <textarea 
                        className="form-input" 
                        style={{ height: '120px', resize: 'vertical' }}
                        placeholder="Descreva o seu problema ou dúvida com o máximo de detalhes possível..."
                        required
                        value={supportTicket.message}
                        onChange={(e) => setSupportTicket({ ...supportTicket, message: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">Enviar Mensagem</button>
                  </form>
                )}
              </div>

              {/* Resumo do FAQ Rápido */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>📍</span> Status do Sistema
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Servidor Cloud</span>
                      <strong style={{ color: '#10B981' }}>Operacional</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Fila de Edição</span>
                      <strong style={{ color: '#10B981' }}>Sem atrasos</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Tempo médio de render</span>
                      <strong>~1.5x a duração</strong>
                    </div>
                  </div>
                </div>

                <div className="panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Perguntas rápidas</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.825rem', color: 'hsl(var(--text-gray))' }}>
                    <p><strong>Qual a resolução das saídas?</strong><br/>Todas as saídas são padronizadas a 1080x1920 pixels com margens pretas automáticas caso o vídeo original seja horizontal.</p>
                    <p><strong>Posso deletar as tarefas concluídas?</strong><br/>Sim. Ao clicar na lixeira do card do vídeo, ele e o arquivo processado são completamente eliminados do servidor.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  function renderCheckoutModal() {
    if (!checkoutModal.show) return null;
    
    return (
      <div className="checkout-overlay">
        <div className="checkout-modal">
          <div className="checkout-header">
            <h3>Assinar Plano {checkoutModal.planName}</h3>
            <button className="checkout-close-btn" onClick={closeCheckout}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleCheckoutSubmit}>
            <div className="checkout-body">
              {checkoutSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', textAlign: 'center', gap: '1rem' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'hsl(var(--accent-emerald) / 0.15)', color: 'hsl(var(--accent-emerald))', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '2rem' }}>
                    ✓
                  </div>
                  <h3>Assinatura Confirmada!</h3>
                  <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Seu plano foi alterado para {checkoutModal.planName}. Aproveite os novos limites!</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'hsl(var(--bg-obsidian))', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))' }}>
                    <div>
                      <strong>Adesão Mensal</strong>
                      <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Plano {checkoutModal.planName}</p>
                    </div>
                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'hsl(var(--primary-hover))' }}>{checkoutModal.price}/mês</span>
                  </div>

                  <div className="checkout-tabs">
                    <button type="button" className={`checkout-tab ${checkoutTab === 'pix' ? 'active' : ''}`} onClick={() => setCheckoutTab('pix')}>
                      Pix Instantâneo
                    </button>
                    <button type="button" className={`checkout-tab ${checkoutTab === 'card' ? 'active' : ''}`} onClick={() => setCheckoutTab('card')}>
                      Cartão de Crédito
                    </button>
                  </div>

                  {checkoutTab === 'pix' ? (
                    <div className="checkout-pix-container">
                      <div className="checkout-qr-code">
                        {/* Simulador de QR Code */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#f8fafc', color: '#1e293b', fontSize: '0.65rem', fontWeight: 'bold' }}>
                          <span style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>📱</span>
                          Pix QR Code
                        </div>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', maxWidth: '300px' }}>
                        Escaneie o QR Code acima pelo aplicativo do seu banco para ativar a assinatura imediatamente.
                      </p>
                    </div>
                  ) : (
                    <div className="checkout-card-form">
                      <div className="settings-group">
                        <label>Número do Cartão</label>
                        <input type="text" className="form-input" placeholder="4444 4444 4444 4444" required />
                      </div>
                      <div className="settings-group">
                        <label>Nome Impresso</label>
                        <input type="text" className="form-input" placeholder="NOME DO TITULAR" required />
                      </div>
                      <div className="form-row">
                        <div className="settings-group">
                          <label>Validade</label>
                          <input type="text" className="form-input" placeholder="MM/AA" required />
                        </div>
                        <div className="settings-group">
                          <label>CVV</label>
                          <input type="text" className="form-input" placeholder="123" required />
                        </div>
                      </div>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ padding: '0.8rem', fontSize: '0.95rem' }} 
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <div className="spinner"></div>
                        Processando Pagamento...
                      </div>
                    ) : (
                      `Confirmar Assinatura (${checkoutModal.price}/mês)`
                    )}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }
}
