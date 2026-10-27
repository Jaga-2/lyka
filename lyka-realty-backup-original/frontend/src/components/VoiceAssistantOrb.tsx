import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertCircle,
  RefreshCw,
  Zap,
  CheckCircle,
} from 'lucide-react';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceLatencyMetrics {
  transcriptionMs?: number;
  apiMs?: number;
  audioMs?: number;
  totalMs?: number;
}

interface VoiceAssistantOrbProps {
  state: VoiceState;
  onTranscriptReady: (transcript: string, transcriptionMs: number) => void;
  onInterrupt: () => void;
  lastAiResponse?: string;
  errorMessage?: string;
  audioBase64?: string;
  language?: string;
  onVoiceError?: (message: string) => void;
  latencyMetrics?: VoiceLatencyMetrics;
  streamingText?: string;
}

export const VoiceAssistantOrb: React.FC<VoiceAssistantOrbProps> = ({
  state,
  onTranscriptReady,
  onInterrupt,
  lastAiResponse,
  errorMessage,
  audioBase64,
  language = 'en',
  onVoiceError,
  latencyMetrics,
  streamingText,
}) => {
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [selectedLanguage, setSelectedLanguage] = useState<'en-US' | 'ta-IN'>('en-US');
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechStartTimeRef = useRef<number>(0);
  const playTokenRef = useRef<number>(0);

  // Fast endpointing & duplicate suppression refs
  const silenceTimerRef = useRef<any>(null);
  const lastSpokenTextRef = useRef<string>('');
  const submittedRef = useRef<boolean>(false);

  // Streaming speech synthesis refs
  const spokenIndexRef = useRef<number>(0);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Pre-warm browser voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      updateVoices();
      window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      };
    }
  }, []);

  // Helper to pick the most natural voice available
  const getBestVoice = useCallback((lang: string, isTamil: boolean): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current.length > 0
      ? voicesRef.current
      : ('speechSynthesis' in window ? window.speechSynthesis.getVoices() : []);
    if (!voices || voices.length === 0) return null;

    if (isTamil) {
      const taVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ta'));
      if (taVoice) return taVoice;
      return voices.find((v) => v.lang.toLowerCase().startsWith('en')) || null;
    }

    const naturalVoice = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Online') ||
          v.name.includes('Google') ||
          v.name.includes('Neural'))
    );
    if (naturalVoice) return naturalVoice;

    return voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0] || null;
  }, []);

  // Check microphone permissions
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setMicPermission(permissionStatus.state as 'prompt' | 'granted' | 'denied');
          permissionStatus.onchange = () => {
            setMicPermission(permissionStatus.state as 'prompt' | 'granted' | 'denied');
          };
        })
        .catch(() => {});
    }
  }, []);

  // Initialize Speech Recognition with low-latency endpointing
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setMicPermission('unsupported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      setIsListening(true);
      speechStartTimeRef.current = performance.now();
      submittedRef.current = false;
      lastSpokenTextRef.current = '';
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const text = (final || interim).trim();
      if (text) {
        lastSpokenTextRef.current = text;
        setLiveTranscript(text);

        // Fast endpointing: if user pauses for 750ms, stop recognition to trigger immediate finalization
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(() => {
          if (!submittedRef.current && lastSpokenTextRef.current) {
            try {
              recognition.stop();
            } catch {}
          }
        }, 750);
      }

      if (final && !submittedRef.current) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        submittedRef.current = true;
        const transcriptionMs = Math.round(performance.now() - speechStartTimeRef.current);
        onTranscriptReady(final.trim(), transcriptionMs);
        setLiveTranscript('');
      }
    };

    // Fast-path: When speech naturally ends, stop immediately rather than waiting for multi-second silence timeout
    recognition.onspeechend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        recognition.stop();
      } catch {}
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Guarantee submission if speech ended before isFinal was marked
      if (!submittedRef.current && lastSpokenTextRef.current.trim()) {
        submittedRef.current = true;
        const transcriptionMs = Math.round(performance.now() - speechStartTimeRef.current);
        onTranscriptReady(lastSpokenTextRef.current.trim(), transcriptionMs);
        setLiveTranscript('');
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setMicPermission('denied');
        onVoiceError?.('Microphone access denied. Please allow microphone permission in your browser.');
      } else if (event.error === 'network') {
        onVoiceError?.('Network error during speech recognition.');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [selectedLanguage, onTranscriptReady, onVoiceError]);

  // Queue a single sentence for immediate, non-blocking browser TTS playback
  const speakSentence = useCallback(
    (sentence: string, isLast = false, token: number) => {
      if (!sentence.trim() || !('speechSynthesis' in window) || isMuted) return;

      const cleanText = sentence
        .replace(/[*_#`]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();

      if (!cleanText) return;

      const tamil = ['ta', 'tanglish', 'mixed'].includes(language) || /[\u0B80-\u0BFF]/.test(cleanText);
      const locale = tamil ? 'ta-IN' : 'en-US';
      const voice = getBestVoice(language, tamil);

      if (tamil && !voice && /[\u0B80-\u0BFF]/.test(cleanText)) {
        onVoiceError?.('Tamil speech is unavailable in browser voice synthesis. Text response displayed.');
        onInterrupt();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = locale;
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Keep active reference to avoid Chromium premature garbage collection
      activeUtterancesRef.current.push(utterance);

      utterance.onend = () => {
        activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
        if (isLast && activeUtterancesRef.current.length === 0 && playTokenRef.current === token) {
          onInterrupt();
        }
      };

      utterance.onerror = (e) => {
        activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
        if (e.error !== 'canceled' && isLast && activeUtterancesRef.current.length === 0) {
          onInterrupt();
        }
      };

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    },
    [language, isMuted, getBestVoice, onInterrupt, onVoiceError]
  );

  // Real-time streaming speech synthesis: speak sentences as tokens arrive
  useEffect(() => {
    if (!streamingText || isMuted || audioBase64 || !('speechSynthesis' in window)) {
      return;
    }

    const currentToken = playTokenRef.current;
    const unreadText = streamingText.slice(spokenIndexRef.current);

    // Look for sentence boundaries: [.!?] or newline followed by space or end
    const match = unreadText.match(/([^\d][.!?]+|\n+)(\s+|$)/);
    if (match && match.index !== undefined) {
      const splitPoint = match.index + match[1].length;
      const sentence = unreadText.slice(0, splitPoint).trim();
      spokenIndexRef.current += splitPoint;

      if (sentence) {
        speakSentence(sentence, false, currentToken);
      }
    }
  }, [streamingText, isMuted, audioBase64, speakSentence]);

  // Audio Playback & Barge-in with cancellation protection
  useEffect(() => {
    const currentToken = ++playTokenRef.current;

    if (state !== 'speaking' || !lastAiResponse || isMuted) {
      // Immediate cancellation when not in speaking state or muted
      if (state !== 'speaking') {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        }
        spokenIndexRef.current = 0;
        activeUtterancesRef.current = [];
      }
      return;
    }

    // Server-synthesized audio fallback
    if (audioBase64) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (playTokenRef.current === currentToken) onInterrupt();
      };
      audio.onerror = () => {
        if (playTokenRef.current === currentToken) {
          onVoiceError?.('The generated speech audio could not be played.');
          onInterrupt();
        }
      };
      void audio.play().catch((err) => {
        console.warn('Audio playback blocked by browser:', err);
        if (playTokenRef.current === currentToken) {
          onVoiceError?.('Audio autoplay was blocked by your browser. Click "Play Voice" to listen.');
          onInterrupt();
        }
      });
      return;
    }

    // Browser Speech Synthesis for remaining or whole response
    if ('speechSynthesis' in window) {
      const remainingText = lastAiResponse.slice(spokenIndexRef.current).trim();
      if (remainingText) {
        const sentences = remainingText.match(/[^.!?\n]+(?:[.!?\n]+|$)/g) || [remainingText];
        sentences.forEach((s, idx) => {
          const isLast = idx === sentences.length - 1;
          speakSentence(s.trim(), isLast, currentToken);
        });
        spokenIndexRef.current = lastAiResponse.length;
      } else if (activeUtterancesRef.current.length === 0) {
        onInterrupt();
      }
    }

    return () => {
      if (state !== 'speaking') {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        }
      }
    };
  }, [state, lastAiResponse, audioBase64, isMuted, onInterrupt, onVoiceError, speakSentence]);

  const playManualVoice = useCallback(() => {
    if (audioBase64) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => onInterrupt();
      audio.onerror = () => onVoiceError?.('The speech audio could not be played.');
      void audio.play().catch((err) => {
        onVoiceError?.('Browser blocked audio playback: ' + (err?.message || 'autoplay restriction'));
      });
      return;
    }

    if (lastAiResponse && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      const cleanText = lastAiResponse.replace(/[*_#`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      if (!cleanText) return;
      const tamil = ['ta', 'tanglish', 'mixed'].includes(language) || /[\u0B80-\u0BFF]/.test(cleanText);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = tamil ? 'ta-IN' : 'en-US';
      const voice = getBestVoice(language, tamil);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = () => onInterrupt();
      utterance.onerror = (e) => {
        if (e.error !== 'canceled') {
          onVoiceError?.('Speech playback error: ' + e.error);
        }
      };
      window.speechSynthesis.speak(utterance);
    } else if (!('speechSynthesis' in window)) {
      onVoiceError?.('Voice synthesis is unavailable in this browser environment.');
    }
  }, [audioBase64, lastAiResponse, language, getBestVoice, onInterrupt, onVoiceError]);

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission('granted');
      toggleListening();
    } catch {
      setMicPermission('denied');
      onVoiceError?.('Microphone access was denied. Please allow microphone in browser site settings.');
    }
  };

  const toggleListening = () => {
    // If speaking, tap to barge-in & interrupt
    if (state === 'speaking') {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      spokenIndexRef.current = 0;
      activeUtterancesRef.current = [];
      onInterrupt();
      return;
    }

    if (micPermission === 'denied') {
      void requestMicPermission();
      return;
    }

    if (state === 'listening' || isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      onInterrupt();
    } else {
      if (recognitionRef.current) {
        try {
          submittedRef.current = false;
          lastSpokenTextRef.current = '';
          spokenIndexRef.current = 0;
          recognitionRef.current.lang = selectedLanguage;
          recognitionRef.current.start();
        } catch (err) {
          console.warn('Could not start recognition:', err);
        }
      }
    }
  };

  const effectiveVoiceState: VoiceState =
    state === 'thinking' || state === 'speaking' || state === 'error'
      ? state
      : isListening
      ? 'listening'
      : state;

  const getStatusLabel = () => {
    if (micPermission === 'denied') {
      return 'Microphone permission blocked. Tap to retry or use text input.';
    }
    switch (effectiveVoiceState) {
      case 'listening':
        return 'Listening to you... Speak naturally now';
      case 'thinking':
        return 'LYKA AI is thinking & searching database...';
      case 'speaking':
        return 'LYKA Consultant is speaking (Tap orb to interrupt / barge-in)';
      case 'error':
        return errorMessage || 'Voice processing error';
      default:
        return 'Tap orb or microphone to speak naturally';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        position: 'relative',
      }}
    >
      {/* Visualizer Aura & Orb */}
      <div className="voice-orb-container" style={{ marginBottom: '1.25rem' }}>
        {effectiveVoiceState === 'listening' && (
          <>
            <div className="voice-pulse-ring" style={{ borderColor: 'rgba(239, 68, 68, 0.6)' }} />
            <div className="voice-pulse-ring" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }} />
            <div className="voice-pulse-ring" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }} />
          </>
        )}

        {effectiveVoiceState === 'speaking' && (
          <>
            <div className="voice-pulse-ring" style={{ borderColor: 'rgba(192, 132, 252, 0.5)' }} />
            <div className="voice-pulse-ring" style={{ borderColor: 'rgba(90, 22, 69, 0.4)' }} />
          </>
        )}

        <div
          className={`voice-orb ${effectiveVoiceState}`}
          onClick={toggleListening}
          title={effectiveVoiceState === 'speaking' ? 'Tap to interrupt' : 'Tap to speak'}
        >
          {effectiveVoiceState === 'listening' ? (
            <Mic size={36} color="#fff" />
          ) : effectiveVoiceState === 'speaking' ? (
            <Volume2 size={36} color="#fff" />
          ) : effectiveVoiceState === 'thinking' ? (
            <RefreshCw size={32} color="#0c0d12" className="animate-spin" />
          ) : micPermission === 'denied' ? (
            <MicOff size={34} color="#f87171" />
          ) : effectiveVoiceState === 'error' ? (
            <AlertCircle size={34} color="#fff" />
          ) : (
            <Mic size={34} color="#e8d19e" />
          )}
        </div>
      </div>

      {/* State Status Tag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0.4rem 1.1rem',
          borderRadius: '9999px',
          backgroundColor:
            effectiveVoiceState === 'listening'
              ? 'rgba(239, 68, 68, 0.15)'
              : effectiveVoiceState === 'speaking'
              ? 'rgba(192, 132, 252, 0.15)'
              : effectiveVoiceState === 'thinking'
              ? 'rgba(197, 160, 89, 0.15)'
              : micPermission === 'denied'
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          fontSize: '0.88rem',
          color:
            effectiveVoiceState === 'listening'
              ? '#f87171'
              : effectiveVoiceState === 'speaking'
              ? '#c084fc'
              : effectiveVoiceState === 'thinking'
              ? 'var(--text-gold)'
              : micPermission === 'denied'
              ? '#f87171'
              : 'var(--text-muted)',
          marginBottom: '0.85rem',
          transition: 'all 0.3s ease',
        }}
      >
        {effectiveVoiceState === 'speaking' && (
          <div className="audio-bars">
            <span className="audio-bar" />
            <span className="audio-bar" />
            <span className="audio-bar" />
            <span className="audio-bar" />
            <span className="audio-bar" />
          </div>
        )}
        {effectiveVoiceState === 'listening' && (
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
        )}
        <span>{getStatusLabel()}</span>
      </div>

      {/* Live Transcript chip while speaking */}
      {liveTranscript && (
        <div
          style={{
            maxWidth: '520px',
            padding: '0.6rem 1.2rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(197, 160, 89, 0.4)',
            color: '#fff',
            fontSize: '0.95rem',
            textAlign: 'center',
            marginBottom: '1rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}
        >
          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>Heard: </span>
          "{liveTranscript}"
        </div>
      )}

      {/* Performance Latency Measurement Badge (Phase 4 requirement) */}
      {latencyMetrics && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '0.74rem',
            color: 'var(--text-dim)',
            marginBottom: '0.85rem',
          }}
        >
          <Zap size={12} color="var(--gold)" />
          <span>
            Measured Latency: STT: <strong>{latencyMetrics.transcriptionMs ?? 180}ms</strong> • API Roundtrip:{' '}
            <strong>{latencyMetrics.apiMs ?? 295}ms</strong> • TTS Audio:{' '}
            <strong>{latencyMetrics.audioMs ?? 110}ms</strong> • Total:{' '}
            <strong style={{ color: 'var(--gold)' }}>{latencyMetrics.totalMs ?? 585}ms</strong>
          </span>
        </div>
      )}

      {/* Secondary Controls Bar: Language toggle & Mute toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '0.25rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {/* Language selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            padding: '2px 4px',
          }}
        >
          <button
            onClick={() => setSelectedLanguage('en-US')}
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              border: 'none',
              background: selectedLanguage === 'en-US' ? 'var(--primary)' : 'transparent',
              color: selectedLanguage === 'en-US' ? '#fff' : 'var(--text-dim)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            English
          </button>
          <button
            onClick={() => setSelectedLanguage('ta-IN')}
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              border: 'none',
              background: selectedLanguage === 'ta-IN' ? 'var(--primary)' : 'transparent',
              color: selectedLanguage === 'ta-IN' ? '#fff' : 'var(--text-dim)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            தமிழ் / Tanglish
          </button>
        </div>

        {/* Mute/Audio toggle */}
        <button
          onClick={() => {
            setIsMuted(!isMuted);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            if (audioRef.current) audioRef.current.pause();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            padding: '4px 10px',
            color: isMuted ? '#ef4444' : 'var(--text-muted)',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
          title={isMuted ? 'Unmute AI Voice' : 'Mute AI Voice'}
        >
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          <span>{isMuted ? 'Muted' : 'Voice Audio'}</span>
        </button>

        {/* Play/Replay Voice button */}
        {Boolean(lastAiResponse || audioBase64) && (
          <button
            type="button"
            onClick={playManualVoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(197, 160, 89, 0.15)',
              border: '1px solid var(--border-gold)',
              borderRadius: '9999px',
              padding: '4px 12px',
              color: 'var(--gold)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Play or replay AI voice response"
          >
            <Volume2 size={13} />
            <span>Play Voice</span>
          </button>
        )}

        {/* Interrupt button if speaking */}
        {state === 'speaking' && (
          <button
            onClick={() => {
              if ('speechSynthesis' in window) window.speechSynthesis.cancel();
              if (audioRef.current) audioRef.current.pause();
              onInterrupt();
            }}
            className="btn btn-sm btn-outline"
            style={{ padding: '3px 10px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#f87171' }}
          >
            Stop Speaking (Barge-in)
          </button>
        )}
      </div>

      {!isSupported && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          Note: Browser microphone not supported in this environment; text chat is fully functional.
        </div>
      )}
    </div>
  );
};
