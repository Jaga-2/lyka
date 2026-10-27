import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  Sparkles,
  CheckCircle,
  SlidersHorizontal,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  X,
  AlertCircle,
  Mic,
  Volume2,
} from 'lucide-react';
import { VoiceAssistantOrb, VoiceState, VoiceLatencyMetrics } from '../components/VoiceAssistantOrb';
import { PropertyCard } from '../components/PropertyCard';
import { HandoffModal } from '../components/HandoffModal';
import { ChatMessage, CustomerRequirements, Property } from '../types';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';

export const AIAssistantPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q');
  const { user } = useAuth();
  const storageSuffix = user?.id ?? 'unavailable';
  const chatStorageKey = `lyka_ai_chat_${storageSuffix}`;
  const requirementsStorageKey = `lyka_ai_requirements_${storageSuffix}`;
  const conversationStorageKey = `lyka_ai_conversation_${storageSuffix}`;
  const { addToCompare, openSiteVisitModal } = useProperty();

  // Clean session by default on each login
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [priorMessageCount, setPriorMessageCount] = useState(0);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  const [inputText, setInputText] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [requirements, setRequirements] = useState<Partial<CustomerRequirements>>(() => {
    try {
      return JSON.parse(localStorage.getItem(requirementsStorageKey) || '{}');
    } catch {
      return {};
    }
  });
  const [showRequirementsDrawer, setShowRequirementsDrawer] = useState(false);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(
    () => localStorage.getItem(conversationStorageKey) || `conv_${Date.now()}`
  );
  const [lastAiResponse, setLastAiResponse] = useState('');
  const [lastAudio, setLastAudio] = useState<string | undefined>();
  const [responseLanguage, setResponseLanguage] = useState('en');
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | undefined>();
  const [voiceError, setVoiceError] = useState('');
  const [latencyMetrics, setLatencyMetrics] = useState<VoiceLatencyMetrics | undefined>();

  // Streaming & Thinking Indicator state
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<{
    content: string;
    properties?: Property[];
  } | null>(null);

  // Voice Interaction & Abort Controller state
  const [isVoiceInteraction, setIsVoiceInteraction] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Composer Voice Dictation state
  const [isComposerListening, setIsComposerListening] = useState(false);
  const composerRecognitionRef = useRef<any>(null);
  const composerBaseTextRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pre-warm browser voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const onVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      };
    }
  }, []);

  // In-Chat Viewing Appointment Form State (Phase 6)
  const [inChatBookingProperty, setInChatBookingProperty] = useState<Property | null>(null);
  const [bookingName, setBookingName] = useState(user?.full_name || '');
  const [bookingEmail, setBookingEmail] = useState(user?.email || '');
  const [bookingPhone, setBookingPhone] = useState(user?.phone || '');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('11:00 AM');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  // Auto-scroll chat stream
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    }
  }, [messages, streamingMessage, isThinking, chatStorageKey]);

  useEffect(() => {
    localStorage.setItem(conversationStorageKey, conversationId);
    localStorage.setItem(requirementsStorageKey, JSON.stringify(requirements));
  }, [conversationId, requirements, conversationStorageKey, requirementsStorageKey]);

  // Session Privacy: Detect existing private conversation and offer explicit option to resume
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPriorMessageCount(parsed.length);
          if (messages.length === 0) {
            setShowResumeBanner(true);
          }
        }
      } catch {}
    }
  }, [user, chatStorageKey, messages.length]);

  const resumePreviousConversation = useCallback(() => {
    const saved = localStorage.getItem(chatStorageKey);
    const savedConvId = localStorage.getItem(conversationStorageKey);
    const savedReqs = localStorage.getItem(requirementsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      } catch {}
    }
    if (savedConvId) setConversationId(savedConvId);
    if (savedReqs) {
      try {
        setRequirements(JSON.parse(savedReqs));
      } catch {}
    }
    setShowResumeBanner(false);
  }, [chatStorageKey, conversationStorageKey, requirementsStorageKey]);

  const dismissResumeBanner = useCallback(() => {
    setShowResumeBanner(false);
  }, []);

  // Audible voice playback on demand
  const handleSpeakMessage = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceError('Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const cleanText = text.replace(/[*_#`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    if (!cleanText) return;
    const isTamil = /[\u0B80-\u0BFF]/.test(cleanText);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = isTamil ? 'ta-IN' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const voice = isTamil
      ? voices.find((v) => v.lang.toLowerCase().startsWith('ta'))
      : voices.find((v) => v.lang.toLowerCase().startsWith('en') && (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Neural'))) || voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        setVoiceError('Speech playback failed: ' + e.error);
      }
    };
    window.speechSynthesis.speak(utterance);
    setVoiceError('');
  }, []);

  // Prepopulate booking form if user logs in or updates
  useEffect(() => {
    if (user) {
      if (!bookingName) setBookingName(user.full_name);
      if (!bookingEmail) setBookingEmail(user.email);
      if (!bookingPhone && user.phone) setBookingPhone(user.phone);
    }
  }, [user]);

  const toggleComposerMic = useCallback(() => {
    if (isComposerListening) {
      if (composerRecognitionRef.current) {
        try {
          composerRecognitionRef.current.stop();
        } catch {}
      }
      setIsComposerListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Speech recognition is not supported in this browser. Please use text input.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = responseLanguage === 'ta' ? 'ta-IN' : 'en-US';

      recognition.onstart = () => {
        composerBaseTextRef.current = inputText.trim();
        setIsComposerListening(true);
        setVoiceError('');
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
        const spoken = (final || interim).trim();
        if (spoken) {
          setInputText(
            composerBaseTextRef.current
              ? `${composerBaseTextRef.current} ${spoken}`
              : spoken
          );
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
          }
        }
      };

      recognition.onspeechend = () => {
        try {
          recognition.stop();
        } catch {}
      };

      recognition.onerror = (event: any) => {
        console.warn('Composer mic recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setVoiceError('Microphone permission denied. Please allow microphone in browser settings.');
        }
        setIsComposerListening(false);
      };

      recognition.onend = () => {
        setIsComposerListening(false);
        textareaRef.current?.focus();
      };

      composerRecognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Could not start composer speech recognition:', err);
      setIsComposerListening(false);
    }
  }, [isComposerListening, responseLanguage, inputText]);

  const handleSendMessage = useCallback(
    async (text: string, fromVoice = false, transcriptionMs?: number) => {
      if (!text.trim()) return;

      // Abort previous in-flight request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Cancel ongoing browser speech synthesis before answering new query
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      setIsVoiceInteraction(fromVoice);

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      setIsThinking(true);
      setStreamingMessage(null);
      setVoiceState(fromVoice ? 'thinking' : 'idle');
      setVoiceError('');

      try {
        const historyPayload = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Avoid requesting slow server audio when high-speed browser speech is supported
        const hasBrowserSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
        const wantServerAudio = fromVoice && !hasBrowserSpeech;

        const apiStart = performance.now();
        let firstTokenTime: number | null = null;
        let streamAccumulated = '';
        let streamProperties: Property[] = [];
        let streamSucceeded = false;

        try {
          const res = await api.chatStream(
            text,
            conversationId,
            [...historyPayload, { role: 'user', content: text }],
            requirements,
            selectedPropertyId,
            wantServerAudio,
            {
              onMeta: (meta) => {
                if (meta.properties && meta.properties.length > 0) {
                  streamProperties = meta.properties;
                  setStreamingMessage((prev) => ({
                    content: prev?.content || '',
                    properties: meta.properties,
                  }));
                }
                if (meta.extracted_requirements) {
                  setRequirements((prev) => ({ ...prev, ...meta.extracted_requirements }));
                }
              },
              onToken: (token) => {
                if (firstTokenTime === null) {
                  firstTokenTime = performance.now();
                }
                setIsThinking(false);
                streamAccumulated += token;
                setStreamingMessage({
                  content: streamAccumulated,
                  properties: streamProperties,
                });
                if (fromVoice) {
                  setVoiceState('speaking');
                }
              },
            },
            abortController.signal
          );

          streamSucceeded = true;
          const ttftMs = firstTokenTime ? Math.round(firstTokenTime - apiStart) : Math.round(performance.now() - apiStart);
          const audioInitMs = hasBrowserSpeech ? 35 : (res.audio_base64 ? 90 : 35);
          const tMs = transcriptionMs ?? (fromVoice ? 150 : 0);

          setLatencyMetrics({
            transcriptionMs: tMs,
            apiMs: ttftMs,
            audioMs: audioInitMs,
            totalMs: tMs + ttftMs + audioInitMs,
          });

          setLastAiResponse(res.response);
          setLastAudio(res.audio_base64);
          setResponseLanguage(res.language || 'en');
          if (fromVoice) {
            setVoiceState('speaking');
          } else {
            setVoiceState('idle');
          }

          if (res.extracted_requirements) {
            setRequirements((prev) => ({ ...prev, ...res.extracted_requirements }));
          }

          if (res.action_type === 'search') setSelectedPropertyId(undefined);

          const aiMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: res.response,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            properties: res.properties,
            extracted_requirements: res.extracted_requirements,
            action_type: res.action_type,
          };

          setMessages((prev) => [...prev, aiMsg]);
          setStreamingMessage(null);
          setIsThinking(false);

          if (res.action_type === 'handoff') {
            setIsHandoffOpen(true);
          }
          if (res.action_type === 'site_visit' && res.properties[0]) {
            setInChatBookingProperty(res.properties[0]);
          }
          if (res.audio_error) setVoiceError(res.audio_error);
        } catch (streamErr: any) {
          if (streamErr?.name === 'AbortError') return;

          if (!streamSucceeded) {
            console.warn('Streaming chat attempt failed, using standard chat API:', streamErr);
            const res = await api.chat(
              text,
              conversationId,
              [...historyPayload, { role: 'user', content: text }],
              requirements,
              selectedPropertyId,
              wantServerAudio
            );
            const apiMs = Math.round(performance.now() - apiStart);
            const audioMs = res.audio_base64 ? 90 : 35;
            const tMs = transcriptionMs ?? (fromVoice ? 150 : 0);

            setLatencyMetrics({
              transcriptionMs: tMs,
              apiMs,
              audioMs,
              totalMs: tMs + apiMs + audioMs,
            });

            setLastAiResponse(res.response);
            setLastAudio(res.audio_base64);
            setResponseLanguage(res.language || 'en');
            if (fromVoice) {
              setVoiceState('speaking');
            } else {
              setVoiceState('idle');
            }

            if (res.extracted_requirements) {
              setRequirements((prev) => ({ ...prev, ...res.extracted_requirements }));
            }

            if (res.action_type === 'search') setSelectedPropertyId(undefined);

            const aiMsg: ChatMessage = {
              id: `msg-${Date.now() + 1}`,
              role: 'assistant',
              content: res.response,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              properties: res.properties,
              extracted_requirements: res.extracted_requirements,
              action_type: res.action_type,
            };

            setMessages((prev) => [...prev, aiMsg]);
            setStreamingMessage(null);
            setIsThinking(false);

            if (res.action_type === 'handoff') {
              setIsHandoffOpen(true);
            }
            if (res.action_type === 'site_visit' && res.properties[0]) {
              setInChatBookingProperty(res.properties[0]);
            }
            if (res.audio_error) setVoiceError(res.audio_error);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('AI chat request failed:', err);
        const message = err instanceof Error ? err.message : 'The consultant is temporarily unavailable.';
        setVoiceError(message);
        setVoiceState('error');
        setIsThinking(false);
        setStreamingMessage(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: `I couldn't reach the LYKA service, so I haven't searched or saved this request. Please try again. (${message})`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    },
    [messages, conversationId, requirements, selectedPropertyId]
  );

  useEffect(() => {
    if (initialQuery && !initialSentRef.current) {
      initialSentRef.current = true;
      void handleSendMessage(initialQuery);
    }
  }, [initialQuery, handleSendMessage]);

  const handleVoiceTranscript = useCallback(
    (transcript: string, transcriptionMs: number) => {
      handleSendMessage(transcript, true, transcriptionMs);
    },
    [handleSendMessage]
  );

  const handleInterrupt = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState('idle');
    setVoiceError('');
    setIsThinking(false);
  }, []);

  const handleVoiceError = useCallback((message: string) => {
    setVoiceError(message);
    setVoiceState('error');
  }, []);

  const clearChat = () => {
    setMessages([]);
    setRequirements({});
    localStorage.removeItem(chatStorageKey);
    localStorage.removeItem(requirementsStorageKey);
    localStorage.removeItem(conversationStorageKey);
    setConversationId(`conv_${Date.now()}`);
    setSelectedPropertyId(undefined);
    setLastAudio(undefined);
    setLastAiResponse('');
    setInChatBookingProperty(null);
    setBookingSuccessMsg('');
    setBookingError('');
  };

  const handleInChatBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inChatBookingProperty) return;

    setBookingSubmitting(true);
    setBookingError('');
    setBookingSuccessMsg('');

    try {
      const scheduledVisit = await api.scheduleSiteVisit({
        property_id: inChatBookingProperty.id,
        customer_name: bookingName.trim(),
        customer_email: bookingEmail.trim(),
        customer_phone: bookingPhone.trim(),
        preferred_date: bookingDate,
        preferred_time: bookingTime,
        notes: bookingNotes.trim() || undefined,
        conversation_id: conversationId,
      });

      const successNotice = `Viewing appointment request submitted for ${inChatBookingProperty.title} on ${scheduledVisit.preferred_date} at ${scheduledVisit.preferred_time}. Initial Status: REQUESTED. Reference #${scheduledVisit.id}. Our broker team will contact you to confirm the appointment.`;
      setBookingSuccessMsg(successNotice);

      // Add system message to the chat confirming request
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `✅ ${successNotice}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      setTimeout(() => {
        setInChatBookingProperty(null);
        setBookingSuccessMsg('');
      }, 4000);
    } catch (err: any) {
      setBookingError(err.message || 'Failed to submit viewing appointment.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="app-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1280px' }}>
        {/* Top Header / Context Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 0',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--gold)',
                  boxShadow: '0 0 10px var(--gold)',
                }}
              />
              <h1 style={{ fontSize: '1.4rem', color: '#fff', margin: 0, fontWeight: 700 }}>
                LYKA AI Real Estate Consultant
              </h1>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Barge-in Voice & Multilingual Advisor • Verified Real Estate Inventory
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowRequirementsDrawer(!showRequirementsDrawer)}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <SlidersHorizontal size={14} color="var(--gold)" />
              <span>Extracted Requirements ({Object.keys(requirements).length})</span>
            </button>

            <button
              onClick={clearChat}
              className="btn btn-ghost btn-sm"
              title="Reset conversation"
              style={{ color: 'var(--text-dim)' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Session Privacy: Resume previous conversation prompt */}
        {showResumeBanner && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.8rem 1.25rem',
              backgroundColor: 'rgba(197, 160, 89, 0.12)',
              border: '1px solid var(--border-gold)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '10px',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '0.9rem' }}>
              <Clock size={16} color="var(--gold)" />
              <span>
                You have a previous private conversation ({priorMessageCount} messages). Would you like to resume it?
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={resumePreviousConversation}
                className="btn btn-gold btn-sm"
              >
                Resume Conversation
              </button>
              <button
                type="button"
                onClick={dismissResumeBanner}
                className="btn btn-outline btn-sm"
              >
                Start Clean Session
              </button>
            </div>
          </div>
        )}

        {/* Requirements Live Drawer */}
        {showRequirementsDrawer && (
          <div
            style={{
              backgroundColor: 'rgba(18, 20, 28, 0.95)',
              border: '1px solid var(--border-plum)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ width: '100%', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Real-Time Customer Preferences Tracked by AI:
            </div>
            {Object.keys(requirements).length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                No requirements recorded yet. Tell LYKA your preferred location, bedroom count, or budget!
              </div>
            ) : (
              Object.entries(requirements).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    backgroundColor: 'rgba(90, 22, 69, 0.2)',
                    border: '1px solid rgba(197, 160, 89, 0.3)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    color: '#fff',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}: </span>
                  <strong style={{ color: 'var(--gold-light)' }}>{String(val)}</strong>
                </div>
              ))
            )}
          </div>
        )}

        {/* Central Voice Centerpiece */}
        <div
          style={{
            backgroundColor: 'rgba(18, 20, 28, 0.7)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(12px)',
          }}
        >
          <VoiceAssistantOrb
            state={voiceState}
            onTranscriptReady={handleVoiceTranscript}
            onInterrupt={handleInterrupt}
            lastAiResponse={lastAiResponse}
            audioBase64={lastAudio}
            language={responseLanguage}
            errorMessage={voiceError}
            onVoiceError={handleVoiceError}
            latencyMetrics={latencyMetrics}
            streamingText={isVoiceInteraction ? streamingMessage?.content : undefined}
          />
        </div>

        {/* Chat Messages Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            padding: '1rem 0',
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: '85%',
                  backgroundColor:
                    msg.role === 'user'
                      ? 'linear-gradient(135deg, #5a1645, #7d1f5f)'
                      : 'rgba(24, 27, 38, 0.9)',
                  background:
                    msg.role === 'user'
                      ? 'linear-gradient(135deg, #5a1645, #7d1f5f)'
                      : 'rgba(24, 27, 38, 0.9)',
                  color: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius:
                    msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  border:
                    msg.role === 'user'
                      ? '1px solid rgba(197, 160, 89, 0.3)'
                      : '1px solid var(--border-color)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  lineHeight: 1.6,
                  fontSize: '0.96rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.role === 'assistant' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      color: 'var(--gold)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} />
                      <span>LYKA REALTY CONSULTANT</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSpeakMessage(msg.content)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(197, 160, 89, 0.4)',
                        borderRadius: '6px',
                        color: 'var(--gold)',
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s',
                      }}
                      title="Listen to audible voice response"
                    >
                      <Volume2 size={12} />
                      <span>Play Voice</span>
                    </button>
                  </div>
                )}
                {msg.content}
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: msg.role === 'user' ? 'rgba(255, 255, 255, 0.6)' : 'var(--text-dim)',
                    textAlign: 'right',
                    marginTop: '6px',
                  }}
                >
                  {msg.timestamp}
                </div>
              </div>

              {/* Inline Property Recommendations */}
              {msg.properties && msg.properties.length > 0 && (
                <div style={{ width: '100%', marginTop: '1rem' }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--gold)',
                      fontWeight: 600,
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle size={15} color="var(--success)" />
                    <span>Verified Real Estate Matches from LYKA Inventory Database:</span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                      gap: '1.25rem',
                    }}
                  >
                    {msg.properties.map((p) => (
                      <div key={p.id}>
                        <PropertyCard property={p} showMatchDetails={true} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setSelectedPropertyId(p.id)}
                          >
                            {selectedPropertyId === p.id ? 'Current property' : 'Ask about this'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-gold btn-sm"
                            onClick={() => {
                              setSelectedPropertyId(p.id);
                              setInChatBookingProperty(p);
                              setBookingError('');
                              setBookingSuccessMsg('');
                            }}
                          >
                            Schedule Viewing
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => addToCompare(p)}
                          >
                            Compare
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Inline Viewing Appointment Form (Phase 6 requirement) */}
          {inChatBookingProperty && (
            <div
              className="card-luxury"
              style={{
                backgroundColor: 'rgba(90, 22, 69, 0.28)',
                border: '1px solid var(--gold)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                margin: '0.5rem 0 1rem 0',
                animation: 'fadeIn 0.25s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} color="var(--gold)" />
                  <h3 style={{ color: '#fff', margin: 0, fontSize: '1.15rem' }}>
                    Schedule Viewing Appointment: {inChatBookingProperty.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInChatBookingProperty(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {bookingError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <AlertCircle size={15} />
                    <span>Submission Notice</span>
                  </div>
                  {bookingError}
                </div>
              )}

              {bookingSuccessMsg ? (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '1rem',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '4px' }}>
                    <CheckCircle size={18} />
                    <span>Viewing Request Registered with status REQUESTED</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#fff' }}>{bookingSuccessMsg}</p>
                </div>
              ) : (
                <form onSubmit={handleInChatBookingSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={bookingName}
                      onChange={(e) => setBookingName(e.target.value)}
                      placeholder="Your Full Name"
                      className="input-luxury"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={bookingEmail}
                      onChange={(e) => setBookingEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="input-luxury"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={bookingPhone}
                      onChange={(e) => setBookingPhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="input-luxury"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Preferred Date *
                    </label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="input-luxury"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Preferred Time *
                    </label>
                    <select
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className="input-luxury"
                      style={{ width: '100%' }}
                    >
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="04:00 PM">04:00 PM</option>
                      <option value="06:00 PM">06:00 PM</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Notes / Viewing Preference
                    </label>
                    <input
                      type="text"
                      placeholder="In-person or virtual video walkthrough"
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value)}
                      className="input-luxury"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                    <button type="button" onClick={() => setInChatBookingProperty(null)} className="btn btn-ghost btn-sm">
                      Cancel
                    </button>
                    <button type="submit" disabled={bookingSubmitting} className="btn btn-gold btn-sm">
                      {bookingSubmitting ? 'Registering...' : 'Submit Viewing Appointment'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Thinking / Searching Indicator */}
          {isThinking && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                animation: 'fadeIn 0.25s ease',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  backgroundColor: 'rgba(24, 27, 38, 0.9)',
                  color: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius: '18px 18px 18px 4px',
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--gold)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  <Sparkles size={14} className="animate-spin" />
                  <span>LYKA REALTY CONSULTANT</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.94rem' }}>
                  <span className="shimmer-text">Analyzing Dubai inventory & formulating response</span>
                  <span className="typing-dots">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Streaming Assistant Bubble */}
          {streamingMessage && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  backgroundColor: 'rgba(24, 27, 38, 0.9)',
                  color: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius: '18px 18px 18px 4px',
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  lineHeight: 1.6,
                  fontSize: '0.96rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--gold)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  <Sparkles size={14} />
                  <span>LYKA REALTY CONSULTANT</span>
                </div>
                {streamingMessage.content}
                <span className="streaming-cursor" />
              </div>

              {streamingMessage.properties && streamingMessage.properties.length > 0 && (
                <div style={{ width: '100%', marginTop: '1rem' }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--gold)',
                      fontWeight: 600,
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle size={15} color="var(--success)" />
                    <span>Verified Real Estate Matches:</span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                      gap: '1.25rem',
                    }}
                  >
                    {streamingMessage.properties.map((p) => (
                      <div key={p.id}>
                        <PropertyCard property={p} showMatchDetails={true} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Follow-up Quick Action Chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '0.75rem 0',
          }}
        >
          {[
            'Show cheaper ones',
            'Which one is better?',
            'Only furnished properties',
            'இந்த property நல்லதா?',
            'இந்த வீட்டை பார்க்கணும்',
            'I want to talk to an agent',
          ].map((pill) => (
            <button
              key={pill}
              onClick={() => handleSendMessage(pill)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '9999px',
                padding: '6px 14px',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              {pill}
            </button>
          ))}
        </div>

        {/* ChatGPT Composer Layout */}
        <div className="chatgpt-composer-wrapper">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputText.trim() && !isThinking && !streamingMessage) {
                void handleSendMessage(inputText);
              }
            }}
            className="chatgpt-composer"
          >
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputText.trim() && !isThinking && !streamingMessage) {
                    void handleSendMessage(inputText);
                  }
                }
              }}
              placeholder="Ask LYKA about properties, pricing, locations, or speak in English, தமிழ் or Tanglish..."
              rows={1}
              className="composer-textarea"
              disabled={isThinking || !!streamingMessage}
            />
            <div className="composer-actions-right">
              <button
                type="button"
                onClick={toggleComposerMic}
                className={`composer-btn composer-mic-btn ${isComposerListening ? 'listening' : ''}`}
                title={isComposerListening ? 'Listening... click to stop' : 'Voice input (English / தமிழ்)'}
                aria-label="Voice input"
              >
                <Mic size={18} />
              </button>
              <button
                type="submit"
                disabled={!inputText.trim() || isThinking || !!streamingMessage}
                className={`composer-btn composer-send-btn ${inputText.trim() && !isThinking && !streamingMessage ? 'active' : ''}`}
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Human Handoff Modal */}
      <HandoffModal
        key={`${conversationId}-${isHandoffOpen ? 'open' : 'closed'}`}
        isOpen={isHandoffOpen}
        onClose={() => setIsHandoffOpen(false)}
        conversationId={conversationId}
        interestedPropertyId={selectedPropertyId}
        preferredLanguage={responseLanguage}
        requirements={requirements}
        requirementSummary={
          Object.keys(requirements).length > 0
            ? JSON.stringify(requirements, null, 2)
            : 'Client requested human real estate agent consultation.'
        }
      />
    </div>
  );
};
