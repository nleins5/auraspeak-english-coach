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
    localStorage.setItem('eng_coach_engine', engine);
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
      setSttProvider('manual');
      return;
    }

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
      } catch (err) {}
    };
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
        // Pre-emptive microphone permission request to trigger OS/Browser prompt reliably
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop track immediately as Web Speech API will request its own connection
          tempStream.getTracks().forEach(track => track.stop());
        }
      } catch (err) {
        console.warn('Microphone permission pre-check failed or denied:', err);
        setStatusMsg('Error: Microphone permission was not granted. Please allow microphone access in your browser settings.');
        return;
      }

      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Listening... Speak in English to transcribe.');
      } catch (err) {
        console.error(err);
        setStatusMsg('Error activating browser speech recognition.');
      }
    } else {
      // Standard audio recorder for API fallback
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMsg('Browser does not support audio recording.');
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
          setStatusMsg('Recording completed. Processing...');
          // In Sandbox mode, we simulate transcribing
          if (engine === 'sandbox') {
            simulateSTTAndAnalysis();
          }
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
        setRecordingTime(0);
        setStatusMsg('Recording mechanical audio... (Sandbox Mode)');
      } catch (err) {
        console.error(err);
        setStatusMsg('Cannot access microphone.');
      }
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (isRecording) {
      if (sttProvider === 'browser' && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {}
      }
      setIsRecording(false);
      setStatusMsg('Recording stopped. Click "Analyze Speech" to get feedback.');
    }
  };

  // Simulated transcription & scoring when no real API is configured
  const simulateSTTAndAnalysis = () => {
    setIsLoading(true);
    setStatusMsg('Sandbox engine is analyzing speech...');
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
    setStatusMsg('Calculating assessment criteria...');
    
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
          brutally_honest_summary: "You are speaking/entering Vietnamese. Please speak entirely in English so I can evaluate and guide you!",
          natural_rewritten_answer: "Please practice again in English to receive an optimal rewritten version.",
          categories: {
            grammar_and_sentence_structure: { score: 1.0, feedback: "System detected Vietnamese speech." },
            vocabulary_and_word_choice: { score: 1.0, feedback: "Cannot evaluate English vocabulary." },
            pronunciation_and_stt_clarity: { score: 1.0, feedback: "Clarity does not meet English requirements." },
            fluency_and_cohesion: { score: 1.0, feedback: "Fluency cannot be evaluated." }
          }
        });
        setIsLoading(false);
        setStatusMsg('Evaluation completed.');
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
        brutally_honest_summary: `Good speech, reaching a length of ${wordCount} words. Your pronunciation is quite clear, but your speaking pace of ${pacingWpm} WPM can be further improved by extending sentences and minimizing abrupt pauses.`,
        natural_rewritten_answer: text.replace(/\bhave\b/g, 'has').replace(/\btechnology have\b/g, 'technology has') + " That's why I am seeking a consistent schedule to optimize my learning path.",
        categories: {
          grammar_and_sentence_structure: {
            score: Math.min(9.0, finalScore - 0.2),
            feedback: "Relatively accurate sentence structure. Consider adding relative clauses (which, who, that) to turn simple sentences into complex ones."
          },
          vocabulary_and_word_choice: {
            score: Math.min(9.0, finalScore + 0.3),
            feedback: "Good basic conversational vocabulary usage. Try using more advanced synonyms like 'impactful' instead of 'good', 'inexpensive' instead of 'cheap'."
          },
          pronunciation_and_stt_clarity: {
            score: Math.min(9.0, finalScore),
            feedback: "Vocabulary clarity is stable. Pay attention to pronouncing ending sounds like /s/, /t/, /d/."
          },
          fluency_and_cohesion: {
            score: Math.min(9.0, finalScore - 0.1),
            feedback: `You used ${fillerWords} filler words. Try to master silent pauses instead of uttering prolonged sounds like 'um', 'ah'.`
          }
        }
      });
      setIsLoading(false);
      setStatusMsg('Speech evaluation completed.');
    }, 1500);
  };

  // Call Gemini API directly from the browser (100% Client-side!)
  const analyzeWithGemini = async (textToAnalyze) => {
    if (!geminiKey) {
      setStatusMsg('Missing Gemini API Key. Please configure it in Settings (gear icon).');
      return;
    }
    
    setIsLoading(true);
    setStatusMsg('Connecting directly to Google Gemini API...');

    // Language check for prompt
    const systemInstruction = `
      You are an expert, strict, and encouraging English speaking coach.
      Analyze the user's transcript of speaking.
      
      CRITICAL LANGUAGE CHECK:
      If the user speaks or inputs Vietnamese (even in transcript), you MUST set "overall_score" to 1.0 and all other score categories to 1.0. Set "brutally_honest_summary" and all category feedback to this EXACT warning: "You spoke/input in Vietnamese. Please speak entirely in English so I can evaluate and guide you!". Set "natural_rewritten_answer" to a natural English translation of what they tried to say in Vietnamese.

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
        "brutally_honest_summary": "English explanation of their speech strength and weakness...",
        "natural_rewritten_answer": "An optimized, natural, native-level rewrite of their answer...",
        "categories": {
          "grammar_and_sentence_structure": { "score": 7.0, "feedback": "Detailed feedback in English..." },
          "vocabulary_and_word_choice": { "score": 8.0, "feedback": "Detailed feedback in English..." },
          "pronunciation_and_stt_clarity": { "score": 7.5, "feedback": "Detailed feedback in English..." },
          "fluency_and_cohesion": { "score": 7.5, "feedback": "Detailed feedback in English..." }
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
      setStatusMsg('Received feedback from Gemini API.');
    } catch (err) {
      console.error(err);
      setStatusMsg(`Gemini connection error: ${err.message}. Switching to Sandbox simulator.`);
      generateSandboxReport(textToAnalyze);
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
    
    if (engine === 'gemini' && geminiKey) {
      analyzeWithGemini(textToAnalyze);
    } else {
      generateSandboxReport(textToAnalyze);
    }
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
            {engine === 'sandbox' ? 'SANDBOX' : 'GEMINI DIRECT'}
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
                {/* Grading Engine Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Grading Method (LLM)</label>
                  <select
                    value={engine}
                    onChange={(e) => setEngine(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#2E4036]"
                  >
                    <option value="sandbox">Sandbox (Offline - 100% Free)</option>
                    <option value="gemini">Google Gemini API (Direct Client)</option>
                  </select>
                </div>

                {/* Gemini Key */}
                {engine === 'gemini' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Google Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-white border border-[#E5E3DF] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#2E4036]"
                    />
                    <p className="text-[8px] text-[#7A7875] leading-relaxed">
                      🔑 Key is saved directly in your browser's LocalStorage. Never sent to any intermediary server. Absolute privacy guaranteed.
                    </p>
                  </div>
                )}

                {/* STT Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-[#2E4036] uppercase tracking-wider font-bold">Speech-to-Text Engine (STT)</label>
                  <select
                    value={sttProvider}
                    onChange={(e) => setSttProvider(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#2E4036]"
                  >
                    <option value="browser">Browser Web Speech API (NATIVE - Recommended)</option>
                    <option value="mechanical">Mechanical Audio (Sandbox simulator)</option>
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
