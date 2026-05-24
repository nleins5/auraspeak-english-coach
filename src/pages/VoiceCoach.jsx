import { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, Mic, Square, Settings, Volume2, Play, Pause, Loader2,
  Sparkles, BookOpen, Award, AlertCircle, CheckCircle2, 
  ChevronRight, RefreshCw
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
  const [geminiKey, setGeminiKey] = useState(() => {
    const saved = localStorage.getItem('eng_coach_gemini_key');
    if (saved && saved.trim() !== '') return saved;
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [sttProvider, setSttProvider] = useState(() => localStorage.getItem('eng_coach_stt') || 'cloud');
  const [, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState('practice'); // practice, report, settings
  const [showTopicDrawer, setShowTopicDrawer] = useState(false);

  // Practice States
  const [activePrompt, setActivePrompt] = useState(ENGLISH_PROMPTS[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isUsingCustom, setIsUsingCustom] = useState(false);

  // Voice/Text Recording States
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Ready to practice speaking. Select a topic below or practice freely!');
  
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
    localStorage.setItem('eng_coach_gemini_key', geminiKey);
    localStorage.setItem('eng_coach_stt', sttProvider);
    setShowSettings(false);
    setStatusMsg('Settings saved successfully.');
    setActiveView('practice');
  };

  const [isSTTSupported, setIsSTTSupported] = useState(true);
  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Browser STT Setup (Web Speech API)
  useEffect(() => {
    const hasSTT = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setIsSTTSupported(hasSTT);

    if (!hasSTT) {
      if (sttProvider === 'browser') {
        setSttProvider('cloud');
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(prev => (prev + ' ' + finalTranscript).trim());
      }
    };

    rec.onerror = (e) => {
      console.error('STT Error:', e);
      if (e.error === 'not-allowed') {
        setStatusMsg('Error: Microphone access denied. Please grant microphone permissions in your browser settings to speak.');
      } else if (e.error === 'network') {
        setStatusMsg('Network Error: Unable to reach Google Speech servers. Please check your internet connection.');
      } else if (e.error === 'no-speech') {
        console.warn('No English speech detected...');
      } else {
        setStatusMsg(`Speech recognition error: ${e.error}`);
      }
    };

    rec.onend = () => {
      // Auto-restart if we are still supposed to be recording
      if (isRecordingRef.current) {
        try {
          rec.start();
          console.log('SpeechRecognition auto-restarted.');
        } catch (err) {
          console.error('SpeechRecognition auto-restart failed:', err);
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {
        // Ignore cleanup errors when recognition was never started.
      }
    };
  }, [sttProvider]);

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
        isRecordingRef.current = true;
        // CALL SYNCHRONOUSLY FIRST to guarantee Safari/iOS user interaction gesture is preserved
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Listening... Speak in English to transcribe.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Error activating browser speech recognition. Please grant microphone permissions.');
      }
    } else {
      // Standard audio recorder for API fallback
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMsg('Browser does not support audio recording.');
        return;
      }
      try {
        isRecordingRef.current = true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          if (sttProvider === 'cloud') {
            setStatusMsg('Recording completed. Sending to Cloud Whisper for high-accuracy STT...');
            setIsLoading(true);
            try {
              const formData = new FormData();
              formData.append('file', audioBlob, 'recording.wav');
              formData.append('language', 'en'); // English Speeches
              
              const res = await fetch('/v1/audio/transcriptions', {
                method: 'POST',
                body: formData,
              });
              
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Whisper API failure: ${res.status} - ${errText}`);
              }
              
              const data = await res.json();
              if (data && data.text) {
                setTranscript(data.text.trim());
                setStatusMsg('Cloud Whisper transcription successful. Review transcript below or click Analyze.');
              } else {
                throw new Error('No transcript text returned from server.');
              }
            } catch (err) {
              console.error('Cloud Whisper STT failed:', err);
              setStatusMsg(`Cloud Whisper failed: ${err.message}. Please try again or switch to Browser STT in settings.`);
            } finally {
              setIsLoading(false);
            }
          } else {
            setStatusMsg('Recording completed. Review transcript or click Analyze Speech.');
          }
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        if (sttProvider === 'cloud') {
          setStatusMsg('Listening (Cloud Whisper Mode)... Speak in English.');
        } else {
          setStatusMsg('Listening (Cloud Recording Mode)... Speak in English.');
        }
      } catch (err) {
        console.error(err);
        setStatusMsg('Cannot access microphone. Please grant permission in browser settings.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    isRecordingRef.current = false;
    if (isRecording) {
      if (sttProvider === 'browser' && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore stop errors when recognition is already inactive.
        }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore stop errors when recorder is already inactive.
        }
      }
      setIsRecording(false);
      setStatusMsg('Recording stopped. Click "Analyze Speech" to get feedback.');
    }
  };


  // Call AI Coaching API via Unified Router AI Endpoint
  const analyzeWithGemini = async (textToAnalyze) => {
    setIsLoading(true);
    setStatusMsg('Connecting to AI Coach...');

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      // If client-side geminiKey is available, pass it in headers or use it as fallback
      if (geminiKey.trim()) {
        headers['Authorization'] = `Bearer ${geminiKey}`;
      }

      const response = await fetch(
        '/v1/chat/english',
        {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            query: textToAnalyze,
            task: 'english',
            model_override: 'gemini'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`AI Coach Error: Status ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.answer;
      const parsed = JSON.parse(rawText.trim());
      setAssessment(parsed);
      setStatusMsg('Received feedback from AI Coach.');
    } catch (err) {
      console.error(err);
      setStatusMsg(`AI Coach evaluation failed: ${err.message}.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Dispatch grading
  const handleAnalyze = () => {
    const textToAnalyze = transcript.trim() || textInput.trim();
    if (!textToAnalyze) {
      setStatusMsg('Please input text or record your voice before grading.');
      return;
    }
    
    analyzeWithGemini(textToAnalyze);
  };

  return (
    <div className="min-h-screen w-full bg-[#1A1A1A] flex items-center justify-center font-sans p-0 sm:p-8 relative selection:bg-[#CC5833] selection:text-white overflow-hidden">
      {/* Global CSS noise overlay using inline SVG filter */}
      <div className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.05]" style={{ filter: 'url(#noiseFilter)' }}></div>
      <svg className="hidden">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        </filter>
      </svg>

      {/* Ambient glassmorphic blobs for desktop frame contrast */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#2E4036]/15 blur-[120px] pointer-events-none hidden md:block"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-[#CC5833]/10 blur-[120px] pointer-events-none hidden md:block"></div>

      {/* Main Smartphone device shell mockup container */}
      <div className="w-full h-screen sm:h-[844px] sm:w-[390px] sm:rounded-[3.2rem] sm:border-[10px] sm:border-neutral-900 sm:ring-4 sm:ring-neutral-800 bg-[#FAF9F5] sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] relative flex flex-col overflow-hidden">
        
        {/* iOS-Style Device Notch and Status Bar Components */}
        <div className="h-11 px-6 pt-3 flex justify-between items-center bg-[#FAF9F5]/90 backdrop-blur-md z-30 select-none text-[11px] font-mono text-[#2E4036] font-bold shrink-0">
          <span>9:41</span>
          <div className="w-32 h-5 bg-black rounded-full absolute left-1/2 -translate-x-1/2 top-2.5 hidden sm:block"></div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L18.39 4.97C16.85 3.74 14.9 3 12 3zm6.03 3.39L4.97 18.03C6.51 19.26 8.46 20 12 20c4.97 0 9-4.03 9-9 0-2.12-.74-4.07-1.97-5.61z" />
            </svg>
            <span className="text-[9px]">5G</span>
            <div className="w-5 h-2.5 border border-[#2E4036]/70 rounded-xs p-0.5 flex items-center">
              <div className="h-full w-3.5 bg-[#2E4036] rounded-[1px]"></div>
            </div>
          </div>
        </div>

        {/* Small floating header */}
        <header className="flex justify-between items-center px-5 py-2.5 border-b border-[#E5E3DF]/60 bg-white/60 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#2E4036] flex items-center justify-center text-white shadow-xs">
              <GraduationCap size={16} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-[#1A1A1A]">AuraSpeak</h1>
              <p className="text-[8px] text-[#2E4036] font-mono tracking-widest uppercase font-bold">English Coach</p>
            </div>
          </div>

          <div className="px-2 py-0.5 rounded border border-[#E5E3DF] bg-white text-[8px] text-[#2E4036] font-mono font-bold shadow-2xs">
            GEMINI AI
          </div>
        </header>

        {/* Dynamic View Panels */}
        <div className="flex-1 overflow-hidden relative">
          
          {/* A. PRACTICE PANEL */}
          {activeView === 'practice' && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              
              {/* Active Prompt display box */}
              <div className="bg-[#2E4036] text-[#F2F0E9] p-5 rounded-[2.2rem] shadow-xs relative overflow-hidden shrink-0">
                <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/5 blur-lg"></div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/70 uppercase tracking-widest mb-1.5 font-bold">
                  <BookOpen size={10} /> Active Prompt
                </div>
                <h3 className="text-xs font-extrabold text-[#F2F0E9] mb-1">{isUsingCustom ? 'Free Topic' : activePrompt.topic}</h3>
                <p className="text-xs font-serif italic text-white/95 leading-relaxed">
                  "{isUsingCustom ? (customPrompt || 'Enter your custom question below...') : activePrompt.desc}"
                </p>
                
                <button
                  onClick={() => setShowTopicDrawer(true)}
                  className="mt-3.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[9px] font-bold flex items-center gap-1 border border-white/10 transition-all cursor-pointer"
                >
                  Change Topic <ChevronRight size={10} />
                </button>
              </div>

              {/* Speech transcript output block */}
              <div className="bg-white rounded-[2.2rem] border border-[#E5E3DF] p-5 shadow-2xs flex-1 flex flex-col gap-3 min-h-[140px] relative overflow-hidden">
                <div className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold shrink-0">Live Transcript</div>
                
                <div className="flex-1 overflow-y-auto text-xs text-[#1A1A1A] leading-relaxed pr-1 select-text">
                  {!isSTTSupported && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] leading-normal flex items-start gap-2 shrink-0">
                      <span className="text-amber-600 font-bold shrink-0">⚠️ NOTE:</span>
                      <span>Your current browser doesn't support live speech-to-text (STT). Please open this app directly in standard Safari/Chrome, or switch to <b>"Manual Input"</b> by clicking the gear icon below.</span>
                    </div>
                  )}
                  {transcript ? (
                    <p className="font-semibold">{transcript}</p>
                  ) : textInput && sttProvider !== 'browser' ? (
                    <p className="font-semibold">{textInput}</p>
                  ) : (
                    <p className="text-[#7A7875] italic">Your spoken English will be automatically recognized and displayed here...</p>
                  )}
                </div>

                {sttProvider !== 'browser' && (
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your response directly here to test..."
                    className="w-full h-16 bg-[#FAF9F5] border border-[#E5E3DF] rounded-2xl p-3 text-xs focus:outline-none focus:border-[#2E4036] resize-none shrink-0"
                  />
                )}
              </div>

              {/* Siri Breathing Voice Capture interface widget */}
              <div className="flex flex-col items-center justify-center py-2 shrink-0 relative">
                <div className="relative flex items-center justify-center">
                  {isRecording && (
                    <>
                      <div className="absolute w-24 h-24 rounded-full bg-[#CC5833]/15 animate-ping"></div>
                      <div className="absolute w-20 h-20 rounded-full bg-[#CC5833]/25 animate-pulse"></div>
                    </>
                  )}
                  
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all transform cursor-pointer z-10 ${
                      isRecording 
                        ? 'bg-[#CC5833] text-white hover:scale-95' 
                        : 'bg-[#2E4036] hover:bg-[#1E2D25] text-white hover:scale-105'
                    }`}
                  >
                    {isRecording ? <Square size={18} fill="white" /> : <Mic size={22} />}
                  </button>
                </div>
                
                <p className="text-[9px] font-mono text-[#7A7875] mt-2 tracking-wide font-bold">
                  {isRecording ? `Recording: ${formatTime(recordingTime)}` : 'TAP TO RECORD VOICE'}
                </p>
              </div>

              {/* Action submission buttons */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleAnalyze}
                  disabled={isLoading || isRecording}
                  className="w-full h-11 rounded-xl bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-xs"
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  Analyze Speech
                </button>
              </div>

              {/* Status log widget */}
              <p className="text-[9px] text-[#7A7875] font-mono leading-relaxed bg-[#FAF9F5] p-2.5 rounded-xl border border-[#E5E3DF]/50 shrink-0">
                {statusMsg}
              </p>
            </div>
          )}

          {/* B. REPORT PANEL */}
          {activeView === 'report' && assessment && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              
              {/* High-fidelity summary scores card */}
              <div className="bg-[#2E4036]/5 border border-[#2E4036]/10 p-4 rounded-[2.2rem] flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-[9px] font-mono text-[#2E4036] uppercase tracking-widest font-bold">IELTS Speaking</h3>
                  <p className="text-base font-extrabold text-[#1A1A1A]">AI Score Report</p>
                </div>
                
                <div className="flex gap-2">
                  <div className="text-center bg-white px-3 py-1.5 rounded-xl border border-[#E5E3DF] shadow-2xs">
                    <p className="text-[8px] text-[#7A7875] font-mono uppercase font-bold">Band</p>
                    <p className="text-sm font-extrabold text-[#2E4036]">{assessment.overall_score}</p>
                  </div>
                  <div className="text-center bg-white px-3 py-1.5 rounded-xl border border-[#E5E3DF] shadow-2xs">
                    <p className="text-[8px] text-[#7A7875] font-mono uppercase font-bold">CEFR</p>
                    <p className="text-sm font-extrabold text-[#CC5833]">{assessment.estimated_cefr}</p>
                  </div>
                </div>
              </div>

              {/* Evaluation sub-tabs */}
              <div className="flex border-b border-[#E5E3DF] text-xs shrink-0 font-bold">
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'summary' ? 'border-[#CC5833] text-[#CC5833]' : 'border-transparent text-[#7A7875]'
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'details' ? 'border-[#CC5833] text-[#CC5833]' : 'border-transparent text-[#7A7875]'
                  }`}
                >
                  Criteria
                </button>
                <button
                  onClick={() => setActiveTab('rewrite')}
                  className={`flex-1 pb-2 text-center border-b-2 transition-all ${
                    activeTab === 'rewrite' ? 'border-[#CC5833] text-[#CC5833]' : 'border-transparent text-[#7A7875]'
                  }`}
                >
                  Rewrite
                </button>
              </div>

              {/* Main review details content scrolling area */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'summary' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E5E3DF] text-xs leading-relaxed italic text-[#1A1A1A] font-serif shadow-2xs">
                      "{assessment.brutally_honest_summary}"
                    </div>
                    <SpeakFeedback 
                      text={assessment.brutally_honest_summary} 
                      voiceName="F2" 
                      speed={1.05} 
                      lang="en" 
                      accentColor="#CC5833" 
                    />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border border-[#E5E3DF] bg-white flex items-center gap-2 shadow-2xs">
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                        <div>
                          <p className="text-[8px] text-[#7A7875] font-mono font-bold uppercase">Status</p>
                          <p className="text-[10px] font-bold text-[#1A1A1A]">
                            {assessment.overall_score >= 5.0 ? 'Passed' : 'Needs Effort'}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border border-[#E5E3DF] bg-white flex items-center gap-2 shadow-2xs">
                        <AlertCircle size={16} className="text-amber-600 shrink-0" />
                        <div>
                          <p className="text-[8px] text-[#7A7875] font-mono font-bold uppercase">Filler Words</p>
                          <p className="text-[10px] font-bold text-[#1A1A1A]">
                            {assessment.overall_score >= 7.0 ? 'Well Controlled' : 'Needs Control'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'details' && (
                  <div className="space-y-2.5">
                    {Object.entries(assessment.categories).map(([key, item]) => (
                      <div key={key} className="p-3.5 rounded-2xl border border-[#E5E3DF] bg-white space-y-1 shadow-2xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wide font-bold">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-extrabold text-[#CC5833]">
                            {item.score} / 9.0
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[#1A1A1A]">{item.feedback}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'rewrite' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-[2.2rem] bg-white border border-[#E5E3DF] space-y-2.5 shadow-2xs">
                      <p className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Sparkles size={11} /> Native Rewrite
                      </p>
                      <p className="text-xs leading-relaxed text-[#1A1A1A] font-serif italic bg-[#FAF9F5] p-3 rounded-lg border border-[#E5E3DF]/50">
                        "{assessment.natural_rewritten_answer}"
                      </p>
                      <SpeakFeedback 
                        text={assessment.natural_rewritten_answer} 
                        voiceName="F2" 
                        speed={1.05} 
                        lang="en" 
                        accentColor="#CC5833" 
                      />
                      <p className="text-[8px] text-[#7A7875] leading-relaxed">
                        💡 Try speaking the AI-rewritten version to learn natural phrasings and improve pronunciation.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* C. SETTINGS PANEL */}
          {activeView === 'settings' && (
            <div className="absolute inset-0 px-5 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
              <h3 className="font-extrabold text-sm text-[#1A1A1A] pb-2 border-b border-[#E5E3DF] flex items-center gap-1.5 shrink-0">
                <Settings size={16} className="text-[#2E4036]" /> Coach Settings
              </h3>

              <div className="space-y-4 flex-1">
                {/* Gemini Key */}
                <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                  <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Google Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-white border border-[#E5E3DF] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#2E4036]"
                  />
                  {!geminiKey && (
                    <p className="text-[9px] font-bold text-[#CC5833] animate-pulse">
                      ⚠️ An API Key is required for strict Gemini AI grading.
                    </p>
                  )}
                  <p className="text-[8px] text-[#7A7875] leading-relaxed">
                    🔑 Key is saved directly in your browser's LocalStorage. Never sent to any intermediary server. Absolute privacy guaranteed.
                  </p>
                </div>

                {/* STT Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Speech-to-Text Engine (STT)</label>
                  <select
                    value={sttProvider}
                    onChange={(e) => setSttProvider(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#2E4036]"
                  >
                    <option value="browser">Browser Web Speech API (NATIVE)</option>
                    <option value="cloud">Cloud Whisper API (Highly Accurate)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="w-full h-11 rounded-xl bg-[#2E4036] hover:bg-[#1E2D25] text-white font-bold text-xs transition-all mt-auto shrink-0 shadow-xs"
              >
                Save Settings
              </button>
            </div>
          )}

        </div>

        {/* Global Loading Spinner Splash Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[#FAF9F5]/90 backdrop-blur-xs flex flex-col justify-center items-center gap-4 z-50 animate-in fade-in duration-300">
            <RefreshCw className="animate-spin text-[#2E4036]" size={36} />
            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-sm text-[#1A1A1A]">AI Coach is analyzing...</h3>
              <p className="text-[10px] text-[#7A7875] max-w-[240px] leading-relaxed">Evaluating speech against IELTS/CEFR bands and generating vocabulary enhancements.</p>
            </div>
          </div>
        )}

        {/* Bottom Sheets (Slide-up Topic Selector) */}
        {showTopicDrawer && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs z-40 animate-in fade-in duration-200">
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.2rem] p-6 shadow-2xl border-t border-[#E5E3DF] flex flex-col gap-4 max-h-[82%] overflow-y-auto animate-in slide-in-from-bottom duration-300">
              <div className="flex justify-between items-center pb-2 border-b border-[#E5E3DF] shrink-0">
                <h3 className="font-extrabold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                  <BookOpen size={16} className="text-[#2E4036]" /> Select Practice Topic
                </h3>
                <button 
                  onClick={() => setShowTopicDrawer(false)}
                  className="text-xs font-bold text-[#CC5833] cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2.5 overflow-y-auto pr-1">
                {ENGLISH_PROMPTS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActivePrompt(p);
                      setIsUsingCustom(false);
                      setTranscript('');
                      setAssessment(null);
                      setShowTopicDrawer(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-[1.4rem] border text-xs transition-all cursor-pointer ${
                      activePrompt.id === p.id && !isUsingCustom
                        ? 'border-[#2E4036] bg-[#2E4036]/5 text-[#1A1A1A]'
                        : 'border-[#FAF9F5] hover:border-[#E5E3DF] bg-[#FAF9F5]'
                    }`}
                  >
                    <p className="font-bold text-[#2E4036] mb-0.5">{p.topic}</p>
                    <p className="text-[10px] text-[#7A7875] line-clamp-2 leading-relaxed">{p.desc}</p>
                  </button>
                ))}

                <button
                  onClick={() => {
                    setIsUsingCustom(true);
                    setTranscript('');
                    setAssessment(null);
                    setShowTopicDrawer(false);
                  }}
                  className={`w-full text-left p-3.5 rounded-[1.4rem] border text-xs transition-all cursor-pointer ${
                    isUsingCustom
                      ? 'border-[#2E4036] bg-[#2E4036]/5 text-[#1A1A1A]'
                      : 'border-[#FAF9F5] hover:border-[#E5E3DF] bg-[#FAF9F5]'
                  }`}
                >
                  <p className="font-bold text-[#2E4036] mb-0.5">Free Style Topic</p>
                  <p className="text-[10px] text-[#7A7875]">Practice with your own custom target question or topic.</p>
                </button>
              </div>

              {isUsingCustom && (
                <div className="pt-2 border-t border-[#E5E3DF] flex flex-col gap-2 shrink-0 animate-in fade-in duration-200">
                  <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Custom Topic Description</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter the prompt or topic you want to discuss..."
                    className="w-full text-xs bg-[#FAF9F5] border border-[#E5E3DF] rounded-xl p-3 text-[#1A1A1A] focus:outline-none focus:border-[#2E4036] resize-none h-16"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Bottom Navigation Pill Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-white/85 backdrop-blur-md border-t border-[#E5E3DF]/60 flex items-center justify-around px-6 z-30 pb-2 shrink-0 select-none">
          <button 
            onClick={() => setActiveView('practice')}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'practice' ? 'text-[#CC5833] scale-105' : 'text-[#7A7875] hover:text-[#1A1A1A]'
            }`}
          >
            <Mic size={20} className={activeView === 'practice' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">Practice</span>
          </button>
          
          <button 
            onClick={() => {
              if (assessment) {
                setActiveView('report');
              } else {
                setStatusMsg('Please speak or record and click Analyze to unlock the AI Report!');
              }
            }}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'report' ? 'text-[#CC5833] scale-105' : 'text-[#7A7875] hover:text-[#1A1A1A]'
            } ${!assessment ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Award size={20} className={activeView === 'report' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">AI Report</span>
          </button>

          <button 
            onClick={() => setActiveView('settings')}
            className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
              activeView === 'settings' ? 'text-[#CC5833] scale-105' : 'text-[#7A7875] hover:text-[#1A1A1A]'
            }`}
          >
            <Settings size={20} className={activeView === 'settings' ? 'stroke-[2.5px]' : ''} />
            <span className="text-[9px] font-bold tracking-wide">Settings</span>
          </button>
        </div>

      </div>
    </div>
  );
}

function SpeakFeedback({ text, voiceName, speed = 1.05, lang = "en", accentColor = "#CC5833" }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (isOffline) {
        window.speechSynthesis.cancel();
      }
    };
  }, [audioUrl, isOffline]);

  const handleSpeech = async () => {
    if (isPlaying) {
      if (isOffline) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
      } else if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (audioRef.current && !isOffline) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      return;
    }

    setIsLoading(true);
    setIsOffline(false);

    try {
      const backendUrl = import.meta.env.VITE_AI_TO_VOICE_URL || 'http://localhost:8002';
      const response = await fetch(`${backendUrl}/v1/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_name: voiceName, lang, speed }),
      });

      if (!response.ok) {
        throw new Error('Backend synthesis failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      setIsLoading(false);
      setIsPlaying(true);
      audio.play().catch(() => {
        setIsPlaying(false);
      });

    } catch (err) {
      console.warn("Speech synthesis backend failed, falling back to local speech synthesis:", err);
      setIsOffline(true);
      setIsLoading(false);
      setIsPlaying(true);

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'en' ? 'en-US' : 'vi-VN';
      utterance.rate = speed;

      const voices = window.speechSynthesis.getVoices();
      const isFemale = voiceName && voiceName.startsWith('F');
      const matchingVoice = voices.find(v => {
        const nameLower = v.name.toLowerCase();
        if (isFemale) {
          return nameLower.includes('female') || nameLower.includes('google us english') || nameLower.includes('samantha') || nameLower.includes('zira');
        } else {
          return nameLower.includes('male') || nameLower.includes('google uk english male') || nameLower.includes('daniel') || nameLower.includes('david');
        }
      });
      if (matchingVoice) utterance.voice = matchingVoice;

      utterance.onend = () => {
        setIsPlaying(false);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleScrub = (e) => {
    if (audioRef.current && !isOffline) {
      const val = parseFloat(e.target.value);
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatTime = (timeInSec) => {
    if (isNaN(timeInSec)) return "00:00";
    const mins = Math.floor(timeInSec / 60);
    const secs = Math.floor(timeInSec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-white/40 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 p-3 flex flex-col gap-2 mt-2 transition-all">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleSpeech}
          disabled={isLoading}
          style={{ '--accent-color': accentColor }}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--accent-color)] text-white hover:scale-105 active:scale-95 transition-all shadow-md shrink-0 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          )}
        </button>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-wider text-black/60 dark:text-white/60 font-bold uppercase">
              {isOffline ? 'Local Speech Synthesis' : 'AI Voice Synthesis'}
            </span>
            {isOffline && (
              <span className="text-[8px] font-mono bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                Offline Mode
              </span>
            )}
          </div>
          <p className="text-[11px] truncate text-black/80 dark:text-white/80 mt-0.5">
            {isPlaying ? 'Playing coach feedback narration...' : 'Click to hear professional audio feedback.'}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-lg border border-black/5 dark:border-white/5">
          <Volume2 className="w-3.5 h-3.5 text-black/60 dark:text-white/60" />
          <span className="text-[9px] font-mono font-bold text-black/70 dark:text-white/70">
            {voiceName}
          </span>
        </div>
      </div>

      {(isPlaying || duration > 0) && (
        <div className="flex items-center gap-3 mt-1 px-1 animate-in fade-in duration-200">
          <span className="text-[9px] font-mono text-black/50 dark:text-white/50 w-7 shrink-0 text-left">
            {formatTime(currentTime)}
          </span>

          {isOffline ? (
            <div className="flex-1 h-1.5 flex items-center gap-0.5 justify-center">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  style={{
                    backgroundColor: accentColor,
                    animationDelay: `${i * 0.08}s`,
                    height: isPlaying ? '100%' : '20%'
                  }}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlaying ? 'animate-pulse' : ''
                  }`}
                />
              ))}
            </div>
          ) : (
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={handleScrub}
              style={{ accentColor: accentColor }}
              className="flex-1 h-1 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer range-xs"
            />
          )}

          <span className="text-[9px] font-mono text-black/50 dark:text-white/50 w-7 shrink-0 text-right">
            {isOffline ? '--:--' : formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
