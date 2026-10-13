import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trophy, 
  UserPlus, 
  Scale, 
  Activity, 
  X, 
  Edit2, 
  Trash2, 
  Info,
  Weight,
  Share2,
  Target,
  Check
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // Estado para autenticação do usuário
  const [user, setUser] = useState(null);
  
  // Estado para armazenar os competidores
  const [participants, setParticipants] = useState([]);

  // Estados de controle de Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Estados de formulário
  const [formData, setFormData] = useState({
    name: '', gender: 'female', age: '', height: '', initialWeight: '', targetWeight: ''
  });
  const [weightInput, setWeightInput] = useState('');

  // Autenticação na nuvem
  useEffect(() => {
    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
        setUser(auth.currentUser);
      } catch (error) {
        console.error("Erro de autenticação:", error);
      }
    };
    authenticate();
  }, []);

  // Sincronização em tempo real com o Firestore (Nuvem)
  useEffect(() => {
    if (!user) return;
    
    const participantsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    
    const unsubscribe = onSnapshot(
      participantsRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setParticipants(data);
      }, 
      (error) => {
        console.error("Erro ao buscar dados:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Calcula as métricas
  const calculateMetrics = (p) => {
    const heightM = p.height / 100;
    
    // Garante compatibilidade com dados antigos salvos antes da atualização
    let history = p.weightHistory || [];
    if (history.length === 0) {
      history.push({ date: new Date(2024, 0, 1).toISOString(), weight: p.initialWeight });
      if (p.finalWeight) {
        history.push({ date: new Date().toISOString(), weight: p.finalWeight });
      }
    }
    
    const currentWeight = history[history.length - 1].weight;
    const initialWeight = history[0].weight;
    
    const bmi = initialWeight / (heightM * heightM);
    const finalBmi = currentWeight / (heightM * heightM);
    
    const idealWeight = 25 * (heightM * heightM); 
    const realExcessWeight = Math.max(0, initialWeight - idealWeight);

    // Amortecedor de excesso mínimo (15% do peso inicial)
    const safeExcessWeight = Math.max(realExcessWeight, initialWeight * 0.15);

    const weightLost = initialWeight - currentWeight;
    const score = (weightLost / safeExcessWeight) * 100;

    // Formatação de histórico para o gráfico visual
    const chartData = history.map(entry => {
      const d = new Date(entry.date);
      return {
        name: `${d.getDate()}/${d.getMonth() + 1}`,
        weight: entry.weight,
        fullDate: entry.date
      };
    });

    // Análise de Conquistas (Badges) base individuais
    const badges = [];
    if (history.length >= 3) {
      if (history[history.length-1].weight < history[history.length-2].weight &&
          history[history.length-2].weight < history[history.length-3].weight) {
        badges.push({ icon: '🐢', color: 'bg-emerald-100 text-emerald-600 border-emerald-200', title: 'Consistente', desc: 'Perdeu peso nas 3 últimas pesagens sem interrupção' });
      }
    }
    if (score >= 50) badges.push({ icon: '🌟', color: 'bg-yellow-100 text-yellow-600 border-yellow-200', title: 'Estrela', desc: 'Eliminou 50% do excesso de peso' });
    else if (score >= 20) badges.push({ icon: '⭐', color: 'bg-blue-100 text-blue-600 border-blue-200', title: 'Focado', desc: 'Eliminou 20% do excesso de peso' });
    
    if (p.targetWeight && currentWeight <= p.targetWeight) {
      badges.push({ icon: '🎯', color: 'bg-purple-100 text-purple-600 border-purple-200', title: 'Meta Batida', desc: 'Atingiu a meta pessoal estabelecida!' });
    }

    // Calculo do Progresso da Meta Pessoal (independente da competição justa)
    let targetProgress = 0;
    if (p.targetWeight && initialWeight > p.targetWeight) {
       const totalToLose = initialWeight - p.targetWeight;
       targetProgress = Math.max(0, Math.min(100, (weightLost / totalToLose) * 100));
    }

    return { 
      ...p, 
      weightHistory: history,
      chartData,
      badges,
      initialWeight,
      currentWeight,
      targetProgress,
      bmi, 
      finalBmi,
      idealWeight, 
      excessWeight: realExcessWeight, 
      weightLost, 
      score 
    };
  };

  const rankedParticipants = useMemo(() => {
    const processed = participants.map(calculateMetrics);
    
    // Lógica para a conquista cobiçada "On Fire" (maior perda absoluta recente)
    let maxRecentLoss = 0;
    let onFireId = null;
    
    processed.forEach(p => {
      if (p.weightHistory.length >= 2) {
        const loss = p.weightHistory[p.weightHistory.length - 2].weight - p.currentWeight;
        if (loss > maxRecentLoss && loss > 0) {
          maxRecentLoss = loss;
          onFireId = p.id;
        }
      }
    });

    if (onFireId) {
      const onFireUser = processed.find(p => p.id === onFireId);
      if (onFireUser) {
        onFireUser.badges.unshift({ icon: '🔥', color: 'bg-orange-100 text-orange-600 border-orange-200', title: 'On Fire', desc: `Maior perda na última pesagem (-${maxRecentLoss.toFixed(1)}kg)` });
      }
    }

    return processed.sort((a, b) => b.score - a.score);
  }, [participants]);

  const shareRanking = () => {
    let text = "🏆 *FairFit Challenge - Ranking*\n\n";
    rankedParticipants.forEach((p, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👏';
      text += `${emoji} *${p.name}*: ${p.score.toFixed(1)}% (Perdeu ${(p.weightLost > 0 ? '-' : '+')}${Math.abs(p.weightLost).toFixed(1)}kg)\n`;
    });
    
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleOpenModal = (participant = null) => {
    if (participant) {
      setEditingId(participant.id);
      setFormData({
        name: participant.name,
        gender: participant.gender,
        age: participant.age,
        height: participant.height,
        targetWeight: participant.targetWeight || '',
        initialWeight: participant.weightHistory?.[0]?.weight || participant.initialWeight,
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', gender: 'female', age: '', height: '', targetWeight: '', initialWeight: '' });
    }
    setIsModalOpen(true);
  };

  const handleOpenWeightModal = (participant) => {
    setEditingId(participant.id);
    setWeightInput(participant.currentWeight || '');
    setIsWeightModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsWeightModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

    const baseData = {
      name: formData.name,
      gender: formData.gender,
      age: Number(formData.age),
      height: Number(formData.height),
      targetWeight: formData.targetWeight ? Number(formData.targetWeight) : null,
    };

    try {
      if (editingId) {
        // Atualiza os dados, mas mantem o histórico salvo intocado
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', editingId), baseData);
      } else {
        // Novo participante gera seu primeiro dado de histórico
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'participants'), {
          ...baseData,
          initialWeight: Number(formData.initialWeight),
          weightHistory: [{
            date: new Date().toISOString(),
            weight: Number(formData.initialWeight)
          }]
        });
      }
      handleCloseModal();
    } catch (err) {
      console.error("Erro ao salvar participante", err);
    }
  };

  const handleSaveWeight = async (e) => {
    e.preventDefault();
    if (!user || !editingId) return;

    const participant = participants.find(p => p.id === editingId);
    if (!participant) return;

    // Constrói ou recupera o histórico
    let currentHistory = participant.weightHistory || [
      { date: new Date(2024, 0, 1).toISOString(), weight: participant.initialWeight }
    ];

    const newHistory = [
      ...currentHistory,
      { date: new Date().toISOString(), weight: Number(weightInput) }
    ];

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', editingId), {
        weightHistory: newHistory,
        finalWeight: Number(weightInput) // Mantido por retrocompatibilidade temporária
      });
      handleCloseModal();
    } catch (err) {
      console.error("Erro ao atualizar peso", err);
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    if(window.confirm("Tem certeza que deseja excluir este participante?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', id));
      } catch (err) {
        console.error("Erro ao excluir", err);
      }
    }
  };

  return (
    <div className="min-h-screen font-sans text-gray-800 bg-gray-50 relative overflow-hidden selection:bg-blue-300">
      
      {/* Background Animated Blobs para o efeito Liquid */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-400/30 blur-[100px] mix-blend-multiply animate-blob pointer-events-none"></div>
      <div className="absolute top-[20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-400/30 blur-[120px] mix-blend-multiply animate-blob animation-delay-2000 pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-pink-400/30 blur-[100px] mix-blend-multiply animate-blob animation-delay-4000 pointer-events-none"></div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        
        {/* Cabeçalho */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6 bg-white/40 backdrop-blur-xl border border-white/50 p-6 rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 flex items-center gap-3">
              <Trophy className="text-blue-500 w-10 h-10" />
              FairFit Challenge
            </h1>
            <p className="text-gray-600 mt-2 font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-500"/>
              Dados salvos automaticamente na nuvem
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={shareRanking}
              className={`flex items-center justify-center gap-2 px-6 py-3 font-semibold rounded-2xl shadow-lg transition-all transform hover:-translate-y-1 ${copySuccess ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}`}
            >
              {copySuccess ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
              {copySuccess ? 'Copiado!' : 'Ranking'}
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              <UserPlus className="w-5 h-5" />
              Novo Competidor
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rankedParticipants.map((p, index) => (
            <div 
              key={p.id} 
              className="group relative bg-white/40 backdrop-blur-xl border border-white/50 p-6 rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] hover:shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] transition-all duration-300 flex flex-col"
            >
              {/* Badge de Posição (Leaderboard) */}
              {p.score > 0 && (
                <div className={`absolute -top-4 -left-4 w-10 h-10 flex items-center justify-center rounded-full text-white font-bold shadow-lg border-2 border-white/50 backdrop-blur-md z-20
                  ${index === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-xl w-12 h-12 -top-5 -left-5' : 
                    index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : 
                    index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-700' : 'bg-blue-500/80'}`}>
                  {index + 1}º
                </div>
              )}

              {/* Botões de Ação */}
              <div className="absolute top-4 right-4 flex gap-2 z-20">
                <button 
                  onClick={() => handleOpenWeightModal(p)} 
                  className="p-2 bg-blue-100 hover:bg-blue-200 rounded-xl shadow-sm backdrop-blur-sm text-blue-600 transition-colors"
                  title="Atualizar Peso Atual"
                >
                  <Weight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleOpenModal(p)} 
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl shadow-sm backdrop-blur-sm text-gray-600 transition-colors"
                  title="Editar Participante"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(p.id)} 
                  className="p-2 bg-red-100 hover:bg-red-200 rounded-xl shadow-sm backdrop-blur-sm text-red-500 transition-colors"
                  title="Excluir Participante"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1 pr-32 truncate">{p.name}</h2>
              <p className="text-sm text-gray-500 mb-3 flex gap-3">
                <span>{p.age} anos</span>
                <span>•</span>
                <span>{p.height} cm</span>
              </p>

              {/* Badges / Conquistas */}
              <div className="flex flex-wrap gap-2 mb-4 h-6 items-center">
                {p.badges.map((badge, i) => (
                  <span key={i} title={badge.desc} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.color} border cursor-help shadow-sm`}>
                    {badge.icon} {badge.title}
                  </span>
                ))}
              </div>

              {/* Grid de Estatísticas */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/50 rounded-2xl p-3 border border-white/40 shadow-inner">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Scale className="w-3 h-3"/> Inicial</p>
                  <p className="text-lg font-bold text-gray-700">{p.initialWeight.toFixed(1)} <span className="text-sm font-normal text-gray-500">kg</span></p>
                  <p className="text-xs text-gray-500 mt-1">IMC: {p.bmi.toFixed(1)}</p>
                </div>
                <div className="bg-white/50 rounded-2xl p-3 border border-white/40 shadow-inner flex flex-col justify-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Activity className="w-3 h-3"/> Atual</p>
                  <p className="text-lg font-bold text-blue-600">
                    {p.weightHistory.length > 1 ? `${p.currentWeight.toFixed(1)} ` : '-- '} 
                    <span className="text-sm font-normal text-gray-500">kg</span>
                  </p>
                  <div className="text-xs mt-1 h-5">
                    {p.weightHistory.length > 1 && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border ${p.finalBmi < p.bmi ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                        IMC: {p.finalBmi.toFixed(1)} 
                        <span className={`text-[10px] ml-0.5 font-bold ${p.finalBmi < p.bmi ? 'text-emerald-500' : 'text-red-500'}`}>
                          ({p.finalBmi < p.bmi ? '-' : '+'}{Math.abs(p.bmi - p.finalBmi).toFixed(1)})
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Gráfico de Evolução (Exibido apenas quando há mais de 1 pesagem) */}
              {p.chartData.length > 1 && (
                <div className="w-full h-16 mb-4 mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={p.chartData}>
                      <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', padding: '4px 8px' }}
                        itemStyle={{ color: '#6366f1', fontWeight: 'bold', fontSize: '14px' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(value) => [`${value} kg`, '']}
                      />
                      <Line type="monotone" dataKey="weight" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Área de Pontuação e Metas */}
              <div className="space-y-3 mt-auto">
                <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 rounded-2xl p-4 border border-blue-100/50 relative overflow-hidden">
                  <div className="relative z-10 flex justify-between items-end">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pontuação Justa</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                          {p.score > 0 ? p.score.toFixed(1) : '0.0'}
                        </span>
                        <span className="text-sm font-bold text-purple-500">%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-500">Perda Total</p>
                      <p className={`text-lg font-bold ${p.weightLost > 0 ? 'text-emerald-600' : p.weightLost < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {p.weightLost > 0 ? `-${p.weightLost.toFixed(1)}` : p.weightLost < 0 ? `+${Math.abs(p.weightLost).toFixed(1)}` : '0.0'} kg
                      </p>
                    </div>
                  </div>
                  
                  {/* Barra de Progresso visual da pontuação */}
                  <div className="w-full bg-white/60 h-2 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, p.score))}%` }}
                    ></div>
                  </div>
                </div>

                {/* Barra da Meta Pessoal (Condicional) */}
                {p.targetWeight && (
                  <div className="bg-white/50 rounded-xl p-3 border border-pink-100/50 shadow-inner">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Target className="w-3 h-3 text-pink-500"/> Meta Pessoal: {p.targetWeight}kg</p>
                      <p className="text-[11px] font-bold text-pink-500">{p.targetProgress.toFixed(0)}%</p>
                    </div>
                    <div className="w-full bg-gray-200/50 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${p.targetProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {participants.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white/30 backdrop-blur-xl border border-white/50 rounded-3xl">
              <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-500">Nenhum competidor cadastrado</h3>
              <p className="text-gray-400 mt-2">Clique em "Novo Competidor" para começar o desafio.</p>
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm transition-opacity" onClick={handleCloseModal}></div>
            
            <div className="relative bg-white/70 backdrop-blur-2xl border border-white/60 shadow-2xl rounded-3xl w-full max-w-md p-8 transform transition-all">
              <button onClick={handleCloseModal} className="absolute top-4 right-4 p-2 bg-white/50 hover:bg-white rounded-full text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-2xl font-bold text-gray-800 mb-6">
                {editingId ? 'Editar Competidor' : 'Novo Competidor'}
              </h3>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nome</label>
                  <input 
                    type="text" required
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all shadow-inner"
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Idade</label>
                    <input 
                      type="number" required min="1"
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all shadow-inner"
                      value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Sexo</label>
                    <select 
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all shadow-inner"
                      value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}
                    >
                      <option value="female">Feminino</option>
                      <option value="male">Masculino</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Altura (cm)</label>
                    <input 
                      type="number" required min="50" max="250"
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all shadow-inner"
                      value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Peso Inic. (kg)</label>
                    <input 
                      type="number" required step="0.1" min="10"
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-purple-400 focus:outline-none transition-all shadow-inner disabled:opacity-50"
                      value={formData.initialWeight} onChange={e => setFormData({...formData, initialWeight: e.target.value})}
                      disabled={editingId !== null} // Impede alterar o peso inicial raiz depois de criado
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                    <Target className="w-4 h-4 text-pink-500" />
                    Meta de Peso Final (kg) <span className="text-gray-400 font-normal">- Opcional</span>
                  </label>
                  <input 
                    type="number" step="0.1" min="10" placeholder="Ex: 65.0"
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-pink-400 focus:outline-none transition-all shadow-inner"
                    value={formData.targetWeight} onChange={e => setFormData({...formData, targetWeight: e.target.value})}
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                  >
                    Salvar Competidor
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isWeightModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm transition-opacity" onClick={handleCloseModal}></div>
            
            <div className="relative bg-white/70 backdrop-blur-2xl border border-white/60 shadow-2xl rounded-3xl w-full max-w-sm p-8 transform transition-all">
              <button onClick={handleCloseModal} className="absolute top-4 right-4 p-2 bg-white/50 hover:bg-white rounded-full text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Weight className="text-blue-500 w-6 h-6"/>
                Atualizar Peso
              </h3>

              <form onSubmit={handleSaveWeight} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Novo Peso Final (kg)</label>
                  <input 
                    type="number" step="0.1" min="10" placeholder="Ex: 75.5" required
                    className="w-full px-4 py-4 text-xl font-bold bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all shadow-inner placeholder-gray-400"
                    value={weightInput} onChange={e => setWeightInput(e.target.value)}
                  />
                </div>
                <div className="pt-2">
                  <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5">
                    Salvar Peso
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}} />
    </div>
  );
}