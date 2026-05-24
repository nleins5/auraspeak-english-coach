import { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Mic, Square, Settings, Volume2, 
  Sparkles, BookOpen, Award, AlertCircle, CheckCircle2, 
  ChevronRight, RefreshCw, Layers, ShieldCheck, HelpCircle
} from 'lucide-react';
import gsap from 'gsap';

// Pre-defined practice prompts for English Speaking
const ENGLISH_PROMPTS = [
  { id: 1, topic: "Daily Routine", desc: "Describe your typical day. What's your favorite part of the day and why?" },
  { id: 2, topic: "Future Aspirations", desc: "Where do you see yourself in five years? What skills are you currently working on?" },
  { id: 3, topic: "Memorable Journey", desc: "Tell a story about a trip that changed your perspective. What made it special?" },
  { id: 4, topic: "Technology Influence", desc: "How has social media or technology impacted your daily focus and human relationships?" }
];

export default function VoiceCoach() {
  // App Config & Settings
  const [engine, setEngine] = useState(() => localStorage.getItem('eng_coach_engine') || 'sandbox');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('eng_coach_gemini_key') || '');
  const [sttProvider, setSttProvider] = useState(() => localStorage.getItem('eng_coach_stt') || 'browser');
  const [showSettings, setShowSettings] = useState(false);

  // Practice States
  const [activePrompt, setActivePrompt] = useState(ENGLISH_PROMPTS[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isUsingCustom, setIsUsingCustom] = useState(false);

  // Voice/Text Recording States
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Sẵn sàng luyện nói. Chọn một chủ đề bên dưới hoặc nói tự do!');
  
  // Analytics States
  const [isLoading, setIsLoading] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // summary, details, rewrite
  const [textInput, setTextInput] = useState('');

  // Refs for audio / speech
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  // Save Settings to LocalStorage
  const saveSettings = () => {
    localStorage.setItem('eng_coach_engine', engine);
    localStorage.setItem('eng_coach_gemini_key', geminiKey);
    localStorage.setItem('eng_coach_stt', sttProvider);
    setShowSettings(false);
    setStatusMsg('Cấu hình đã được lưu thành công.');
  };

  // Browser STT Setup (Web Speech API)
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(prev => (prev + ' ' + finalTranscript).trim());
        }
      };

      rec.onerror = (e) => {
        console.error('STT Error:', e);
        if (e.error === 'not-allowed') {
          setStatusMsg('Không được cấp quyền Micro. Vui lòng kiểm tra cài đặt trình duyệt.');
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Entrance animations using GSAP
  useEffect(() => {
    gsap.fromTo('.fade-in-element', 
      { opacity: 0, y: 15 }, 
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' }
    );
  }, []);

  // Format Time
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Start Voice Recording
  const startRecording = async () => {
    setTranscript('');
    setAssessment(null);
    audioChunksRef.current = [];
    
    if (sttProvider === 'browser' && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Đang lắng nghe... Nói bằng tiếng Anh để tôi chuyển ngữ.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Lỗi khi kích hoạt nhận diện giọng nói trình duyệt.');
      }
    } else {
      // Standard audio recorder for API fallback
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMsg('Trình duyệt không hỗ trợ ghi âm.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          setStatusMsg('Đã ghi âm xong. Đang xử lý...');
          // In Sandbox mode, we simulate transcribing
          if (engine === 'sandbox') {
            simulateSTTAndAnalysis();
          }
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Đang ghi âm audio cơ học... (Sandbox Mode)');
      } catch (err) {
        console.error(err);
        setStatusMsg('Không thể truy cập Microphone.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (isRecording) {
      if (sttProvider === 'browser' && recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setStatusMsg('Đã dừng ghi âm. Bấm "Phân tích bài nói" để bắt đầu nhận đánh giá.');
    }
  };

  // Simulated transcription & scoring when no real API is configured
  const simulateSTTAndAnalysis = () => {
    setIsLoading(true);
    setStatusMsg('Hệ thống Sandbox đang phân tích giọng nói...');
    setTimeout(() => {
      const dummyTranscripts = [
        "I wake up at seven and I go to work by bus. It is normal and I like it because it is cheap.",
        "To be honest, I think technology have a big impact in our life. People use phone too much and they don't talk together.",
        "Well, my goal is to be a senior developer because I want to make complex system and write clean code."
      ];
      const selectedText = dummyTranscripts[Math.floor(Math.random() * dummyTranscripts.length)];
      setTranscript(selectedText);
      generateSandboxReport(selectedText);
    }, 1500);
  };

  // Local Sandbox Grading Intelligence
  const generateSandboxReport = (text) => {
    setIsLoading(true);
    setStatusMsg('Đang tính toán tiêu chí đánh giá...');
    
    setTimeout(() => {
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      
      // Look for Vietnamese patterns (if they spoke Vietnamese)
      const vietnamesePattern = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
      const containsVietnamese = vietnamesePattern.test(text);

      if (containsVietnamese) {
        setAssessment({
          overall_score: 1.0,
          estimated_cefr: "A1",
          estimated_ielts_speaking_band: "1.0",
          brutally_honest_summary: "Bạn đang nói/nhập tiếng Việt. Vui lòng nói hoàn toàn bằng tiếng Anh để tôi có thể đánh giá và hướng dẫn bạn!",
          natural_rewritten_answer: "Vui lòng luyện tập lại bằng tiếng Anh để nhận bản dịch viết lại tối ưu.",
          categories: {
            grammar_and_sentence_structure: { score: 1.0, feedback: "Hệ thống phát hiện câu nói chứa tiếng Việt." },
            vocabulary_and_word_choice: { score: 1.0, feedback: "Không thể chấm từ vựng tiếng Anh." },
            pronunciation_and_stt_clarity: { score: 1.0, feedback: "Độ rõ nét không đạt yêu cầu tiếng Anh." },
            fluency_and_cohesion: { score: 1.0, feedback: "Trôi chảy không thể đánh giá." }
          }
        });
        setIsLoading(false);
        setStatusMsg('Đã hoàn tất đánh giá.');
        return;
      }

      // Simple metric math
      const fillerWords = (text.match(/\b(like|um|ah|you know|basically|so|well)\b/ig) || []).length;
      const pacingWpm = recordingTime > 0 ? Math.round((wordCount / recordingTime) * 60) : 135;

      let baseScore = 6.0;
      if (wordCount > 15) baseScore += 0.5;
      if (wordCount > 30) baseScore += 0.5;
      if (fillerWords < 2) baseScore += 0.5;
      if (pacingWpm >= 110 && pacingWpm <= 150) baseScore += 0.5;

      const finalScore = Math.min(9.0, Math.max(4.0, parseFloat(baseScore.toFixed(1))));
      
      let cefr = "B1";
      if (finalScore >= 7.5) cefr = "C1";
      else if (finalScore >= 6.5) cefr = "B2";
      else if (finalScore < 5.0) cefr = "A2";

      setAssessment({
        overall_score: finalScore,
        estimated_cefr: cefr,
        estimated_ielts_speaking_band: finalScore.toString(),
        brutally_honest_summary: `Bài nói tốt, độ dài đạt ${wordCount} từ. Bạn phát âm khá rõ ràng, tuy nhiên nhịp điệu nói đạt ${pacingWpm} WPM có thể cải thiện thêm bằng cách kéo dài câu và hạn chế ngắt nghỉ đột ngột.`,
        natural_rewritten_answer: text.replace(/\bhave\b/g, 'has').replace(/\btechnology have\b/g, 'technology has') + " That's why I am seeking a consistent schedule to optimize my learning path.",
        categories: {
          grammar_and_sentence_structure: {
            score: Math.min(9.0, finalScore - 0.2),
            feedback: "Cấu trúc câu tương đối chính xác. Nên bổ sung thêm các mệnh đề quan hệ (which, who, that) để biến câu đơn thành câu phức tạp."
          },
          vocabulary_and_word_choice: {
            score: Math.min(9.0, finalScore + 0.3),
            feedback: "Sử dụng từ vựng ở mức đàm thoại cơ bản tốt. Thử sử dụng các từ đồng nghĩa cao cấp hơn như 'impactful' thay vì 'good', 'inexpensive' thay vì 'cheap'."
          },
          pronunciation_and_stt_clarity: {
            score: Math.min(9.0, finalScore),
            feedback: "Độ rõ từ vựng được nhận diện ổn định. Chú ý phát âm rõ âm cuối (ending sounds) như /s/, /t/, /d/."
          },
          fluency_and_cohesion: {
            score: Math.min(9.0, finalScore - 0.1),
            feedback: `Bạn sử dụng ${fillerWords} từ thừa (filler words). Hãy cố gắng làm chủ các khoảng dừng im lặng thay vì phát âm âm kéo dài như 'um', 'ah'.`
          }
        }
      });
      setIsLoading(false);
      setStatusMsg('Đã hoàn tất đánh giá bài nói.');
    }, 1500);
  };

  // Call Gemini API directly from the browser (100% Client-side!)
  const analyzeWithGemini = async (textToAnalyze) => {
    if (!geminiKey) {
      setStatusMsg('Thiếu Gemini API Key. Hãy cấu hình trong Cài Đặt (icon bánh răng).');
      return;
    }
    
    setIsLoading(true);
    setStatusMsg('Đang kết nối trực tiếp tới Google Gemini API...');

    // Language check for prompt
    const systemInstruction = `
      You are an expert, strict, and encouraging English speaking coach.
      Analyze the user's transcript of speaking.
      
      CRITICAL LANGUAGE CHECK:
      If the user speaks or inputs Vietnamese (even in transcript), you MUST set "overall_score" to 1.0 and all other score categories to 1.0. Set "brutally_honest_summary" and all category feedback to this EXACT Vietnamese warning: "Bạn đang nói/nhập tiếng Việt. Vui lòng nói hoàn toàn bằng tiếng Anh để tôi có thể đánh giá và hướng dẫn bạn!". Set "natural_rewritten_answer" to a natural English translation of what they tried to say in Vietnamese.

      For normal English speech:
      Evaluate on four IELTS-aligned categories:
      1. grammar_and_sentence_structure
      2. vocabulary_and_word_choice
      3. pronunciation_and_stt_clarity
      4. fluency_and_cohesion

      Provide the response in raw JSON format strictly matching this structure:
      {
        "overall_score": 7.5,
        "estimated_cefr": "B2",
        "estimated_ielts_speaking_band": "7.5",
        "brutally_honest_summary": "Vietnamese explanation of their speech strength and weakness...",
        "natural_rewritten_answer": "An optimized, natural, native-level rewrite of their answer...",
        "categories": {
          "grammar_and_sentence_structure": { "score": 7.0, "feedback": "Detailed feedback in Vietnamese..." },
          "vocabulary_and_word_choice": { "score": 8.0, "feedback": "Detailed feedback in Vietnamese..." },
          "pronunciation_and_stt_clarity": { "score": 7.5, "feedback": "Detailed feedback in Vietnamese..." },
          "fluency_and_cohesion": { "score": 7.5, "feedback": "Detailed feedback in Vietnamese..." }
        }
      }
    `;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemInstruction}\n\nHere is the user's transcript to analyze: "${textToAnalyze}"` }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API Error: Status ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(rawText.trim());
      setAssessment(parsed);
      setStatusMsg('Đã nhận phản hồi từ Gemini API.');
    } catch (err) {
      console.error(err);
      setStatusMsg(`Lỗi kết nối Gemini: ${err.message}. Đang chuyển về Sandbox mô phỏng.`);
      generateSandboxReport(textToAnalyze);
    } finally {
      setIsLoading(false);
    }
  };

  // Dispatch grading
  const handleAnalyze = () => {
    const textToAnalyze = transcript.trim() || textInput.trim();
    if (!textToAnalyze) {
      setStatusMsg('Vui lòng nhập văn bản hoặc ghi âm trước khi chấm điểm.');
      return;
    }
    
    if (engine === 'gemini' && geminiKey) {
      analyzeWithGemini(textToAnalyze);
    } else {
      generateSandboxReport(textToAnalyze);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#2C2A29] font-sans selection:bg-[#C05C46] selection:text-white px-6 py-8 relative">
      
      {/* Top Navbar */}
      <header className="max-w-6xl mx-auto flex justify-between items-center mb-10 fade-in-element">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#556B2F] flex items-center justify-center text-white">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#2C2A29]">AuraSpeak</h1>
            <p className="text-xs text-[#556B2F] font-mono tracking-widest uppercase">English Speaking Coach</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="w-10 h-10 rounded-xl border border-[#E5E3DF] bg-white flex items-center justify-center text-[#2C2A29] hover:bg-[#FAF9F5] transition-colors"
          >
            <Settings size={18} />
          </button>
          
          <div className="px-3 py-1.5 rounded-lg border border-[#E5E3DF] bg-white text-xs text-[#556B2F] font-mono flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${engine === 'sandbox' ? 'bg-amber-400' : 'bg-green-500'} animate-pulse`}></span>
            {engine === 'sandbox' ? 'Sandbox Mode' : 'Gemini Direct'}
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Input and Topics */}
        <section className="lg:col-span-5 space-y-6 fade-in-element">
          
          {/* Topic Selector */}
          <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-6 shadow-sm">
            <h2 className="text-sm font-mono text-[#556B2F] uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen size={16} /> Chọn chủ đề luyện tập
            </h2>
            <div className="space-y-3">
              {ENGLISH_PROMPTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePrompt(p);
                    setIsUsingCustom(false);
                    setTranscript('');
                    setAssessment(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border text-sm transition-all duration-200 ${
                    activePrompt.id === p.id && !isUsingCustom
                      ? 'border-[#556B2F] bg-[#556B2F]/5 text-[#2C2A29]'
                      : 'border-[#FAF9F5] hover:border-[#E5E3DF] bg-[#FAF9F5]/40'
                  }`}
                >
                  <p className="font-semibold text-xs text-[#556B2F] mb-1">{p.topic}</p>
                  <p className="text-xs text-[#7A7875] line-clamp-1">{p.desc}</p>
                </button>
              ))}
              
              {/* Optional Custom Input */}
              <button
                onClick={() => {
                  setIsUsingCustom(true);
                  setTranscript('');
                  setAssessment(null);
                }}
                className={`w-full text-left p-3.5 rounded-2xl border text-sm transition-all duration-200 ${
                  isUsingCustom
                    ? 'border-[#556B2F] bg-[#556B2F]/5'
                    : 'border-[#FAF9F5] hover:border-[#E5E3DF] bg-[#FAF9F5]/40'
                }`}
              >
                <p className="font-semibold text-xs text-[#556B2F] mb-1">Chủ đề tự do</p>
                <p className="text-xs text-[#7A7875]">Tự nhập văn bản hoặc câu hỏi bạn muốn thực hành.</p>
              </button>
            </div>

            {/* Prompt Display */}
            <div className="mt-6 pt-5 border-t border-[#E5E3DF]">
              <p className="text-xs font-semibold text-[#556B2F] uppercase mb-1">Câu hỏi thực hành:</p>
              {isUsingCustom ? (
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Nhập câu hỏi hoặc chủ đề tự do của riêng bạn..."
                  className="w-full text-sm bg-[#FAF9F5] border border-[#E5E3DF] rounded-xl p-3 text-[#2C2A29] focus:outline-none focus:border-[#556B2F] resize-none h-20"
                />
              ) : (
                <p className="text-sm font-serif italic text-[#2C2A29]">"{activePrompt.desc}"</p>
              )}
            </div>
          </div>

          {/* Recording & Input Area */}
          <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-mono text-[#556B2F] uppercase tracking-wider flex justify-between items-center">
              <span>Nói hoặc Nhập câu trả lời</span>
              {isRecording && <span className="text-[#C05C46] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C05C46] animate-ping"></span>
                Ghi âm: {formatTime(recordingTime)}
              </span>}
            </h2>

            {/* Record / Text Area Toggle */}
            <div className="space-y-4">
              {sttProvider === 'browser' ? (
                <div className="min-h-36 bg-[#FAF9F5] rounded-2xl border border-[#E5E3DF] p-4 text-sm text-[#2C2A29] relative overflow-y-auto max-h-48">
                  {transcript ? (
                    <p className="leading-relaxed">{transcript}</p>
                  ) : (
                    <span className="text-[#7A7875] italic">Văn bản chuyển đổi từ giọng nói sẽ hiển thị trực tiếp tại đây...</span>
                  )}
                </div>
              ) : (
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Gõ trực tiếp câu nói tiếng Anh của bạn tại đây để kiểm tra ngữ pháp..."
                  className="w-full min-h-36 bg-[#FAF9F5] border border-[#E5E3DF] rounded-2xl p-4 text-sm focus:outline-none focus:border-[#556B2F]"
                />
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex-1 h-14 rounded-2xl bg-[#C05C46] text-white font-bold flex items-center justify-center gap-2 hover:bg-[#A94C38] transition-colors"
                  >
                    <Square size={16} /> Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="flex-1 h-14 rounded-2xl bg-[#556B2F] text-white font-bold flex items-center justify-center gap-2 hover:bg-[#3E5022] transition-colors"
                  >
                    <Mic size={18} /> Start Speaking
                  </button>
                )}

                <button
                  onClick={handleAnalyze}
                  disabled={isLoading || isRecording}
                  className="px-6 h-14 rounded-2xl bg-[#2C2A29] text-white font-semibold flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-40"
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  Phân tích
                </button>
              </div>
            </div>

            {/* Status / Log message */}
            <p className="text-xs text-[#7A7875] font-mono leading-relaxed bg-[#FAF9F5] p-3 rounded-xl border border-[#E5E3DF]/60">
              {statusMsg}
            </p>
          </div>

        </section>

        {/* Right Column: AI Feedback Dashboard */}
        <section className="lg:col-span-7 space-y-6 fade-in-element">
          
          {isLoading ? (
            <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-12 text-center shadow-sm space-y-4">
              <RefreshCw className="animate-spin text-[#556B2F] mx-auto" size={40} />
              <h3 className="font-bold text-lg">Đang chấm điểm bài nói của bạn...</h3>
              <p className="text-sm text-[#7A7875] max-w-sm mx-auto">Hệ thống AI đang đối soát cấu trúc ngữ pháp, từ vựng chuẩn IELTS và tính toán thang điểm tương ứng.</p>
            </div>
          ) : assessment ? (
            <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-6 shadow-sm space-y-6">
              
              {/* Score Dashboard Header */}
              <div className="flex flex-wrap justify-between items-center gap-4 bg-[#556B2F]/5 p-5 rounded-2xl border border-[#556B2F]/10">
                <div className="space-y-1">
                  <h3 className="text-sm font-mono text-[#556B2F] uppercase tracking-wider">Đánh Giá Tổng Quan</h3>
                  <p className="text-2xl font-extrabold text-[#2C2A29]">English Assessment</p>
                </div>
                
                <div className="flex gap-4">
                  <div className="text-center bg-white px-4 py-2.5 rounded-xl border border-[#E5E3DF]">
                    <p className="text-[10px] text-[#7A7875] font-mono uppercase tracking-wider">Overall Band</p>
                    <p className="text-2xl font-extrabold text-[#556B2F]">{assessment.overall_score}</p>
                  </div>
                  
                  <div className="text-center bg-white px-4 py-2.5 rounded-xl border border-[#E5E3DF]">
                    <p className="text-[10px] text-[#7A7875] font-mono uppercase tracking-wider">CEFR LEVEL</p>
                    <p className="text-2xl font-extrabold text-[#C05C46]">{assessment.estimated_cefr}</p>
                  </div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-[#E5E3DF]">
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'summary' ? 'border-[#556B2F] text-[#556B2F]' : 'border-transparent text-[#7A7875] hover:text-[#2C2A29]'
                  }`}
                >
                  Nhận xét
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'details' ? 'border-[#556B2F] text-[#556B2F]' : 'border-transparent text-[#7A7875] hover:text-[#2C2A29]'
                  }`}
                >
                  Chi tiết tiêu chí
                </button>
                <button
                  onClick={() => setActiveTab('rewrite')}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                    activeTab === 'rewrite' ? 'border-[#556B2F] text-[#556B2F]' : 'border-transparent text-[#7A7875] hover:text-[#2C2A29]'
                  }`}
                >
                  Bản dịch tối ưu
                </button>
              </div>

              {/* Tab Contents */}
              <div className="space-y-4 min-h-64">
                
                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E3DF] space-y-2">
                      <p className="text-xs font-mono text-[#556B2F] uppercase tracking-wider flex items-center gap-1.5">
                        <Award size={14} /> Nhận xét tổng quan của Coach:
                      </p>
                      <p className="text-sm leading-relaxed font-serif text-[#2C2A29] italic">
                        "{assessment.brutally_honest_summary}"
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-[#E5E3DF] flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-[#7A7875]">Độ hoàn thành</p>
                          <p className="text-sm font-semibold text-[#2C2A29]">
                            {assessment.overall_score >= 5.0 ? 'Đạt yêu cầu đàm thoại' : 'Cần bổ sung ý tưởng'}
                          </p>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-[#E5E3DF] flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-[#7A7875]">Từ lặp / Lỗi từ vựng</p>
                          <p className="text-sm font-semibold text-[#2C2A29]">
                            {assessment.overall_score >= 7.0 ? 'Hạn chế, từ vựng tốt' : 'Nhiều từ trùng lặp'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Details Tab */}
                {activeTab === 'details' && (
                  <div className="space-y-4">
                    {Object.entries(assessment.categories).map(([key, item]) => (
                      <div key={key} className="p-4 rounded-xl border border-[#E5E3DF] space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-mono text-[#556B2F] uppercase tracking-wider">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="px-2 py-1 rounded bg-[#556B2F]/5 text-xs font-extrabold text-[#556B2F] border border-[#556B2F]/10">
                            {item.score} / 9.0
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-[#2C2A29]">
                          {item.feedback}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rewrite Tab */}
                {activeTab === 'rewrite' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white border border-[#E5E3DF] space-y-2">
                      <p className="text-xs font-mono text-[#556B2F] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles size={14} /> Cách diễn đạt chuẩn bản xứ (Native Rewrite):
                      </p>
                      <p className="text-base leading-relaxed text-[#2C2A29] font-serif italic bg-[#FAF9F5] p-4 rounded-lg border border-[#E5E3DF]/60">
                        "{assessment.natural_rewritten_answer}"
                      </p>
                      <p className="text-xs text-[#7A7875] pt-2">
                        💡 Thử đọc to câu nói viết lại ở trên để cải thiện tông giọng và bổ sung vốn cấu trúc cao cấp vào trí nhớ ngắn hạn!
                      </p>
                    </div>
                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#FAF9F5] border border-[#E5E3DF] flex items-center justify-center mx-auto text-[#7A7875]">
                <Volume2 size={24} />
              </div>
              <h3 className="font-bold text-lg">Chưa có dữ liệu bài nói</h3>
              <p className="text-sm text-[#7A7875] max-w-sm mx-auto">Chọn một chủ đề thực hành, bấm ghi âm hoặc tự nhập bài viết của bạn rồi bấm nút "Phân tích" để xem bảng điểm chi tiết tại đây.</p>
            </div>
          )}

        </section>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-[#E5E3DF] p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <Settings size={20} className="text-[#556B2F]" /> Cấu hình Coach
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-xs uppercase tracking-wider text-[#7A7875] hover:text-black font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-4">
              {/* Grading Engine Selection */}
              <div>
                <label className="block text-xs font-mono text-[#556B2F] uppercase tracking-wider mb-2">Phương thức chấm điểm (LLM)</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="w-full bg-[#FAF9F5] border border-[#E5E3DF] rounded-xl p-3 text-sm focus:outline-none focus:border-[#556B2F]"
                >
                  <option value="sandbox">Sandbox (Mô phỏng offline - 100% Free)</option>
                  <option value="gemini">Google Gemini API (Direct Client-side)</option>
                </select>
              </div>

              {/* Gemini Key */}
              {engine === 'gemini' && (
                <div>
                  <label className="block text-xs font-mono text-[#556B2F] uppercase tracking-wider mb-2">Google Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-[#FAF9F5] border border-[#E5E3DF] rounded-xl p-3 text-sm focus:outline-none focus:border-[#556B2F]"
                  />
                  <p className="text-[10px] text-[#7A7875] mt-1.5 leading-relaxed">
                    🔑 Key được lưu trực tiếp trên trình duyệt cá nhân của bạn, không gửi qua bất kỳ máy chủ trung gian nào. Bảo mật 100%.
                  </p>
                </div>
              )}

              {/* STT Selection */}
              <div>
                <label className="block text-xs font-mono text-[#556B2F] uppercase tracking-wider mb-2">Bộ chuyển đổi giọng nói (STT)</label>
                <select
                  value={sttProvider}
                  onChange={(e) => setSttProvider(e.target.value)}
                  className="w-full bg-[#FAF9F5] border border-[#E5E3DF] rounded-xl p-3 text-sm focus:outline-none focus:border-[#556B2F]"
                >
                  <option value="browser">Browser Web Speech API (NATIVE - Khuyên dùng)</option>
                  <option value="mechanical">Audio cơ học (Sandbox simulator)</option>
                </select>
              </div>
            </div>

            <button
              onClick={saveSettings}
              className="w-full h-12 rounded-xl bg-[#556B2F] text-white font-bold text-sm hover:bg-[#3E5022] transition-colors"
            >
              Lưu cấu hình
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
