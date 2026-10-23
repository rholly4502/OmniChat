import { useCallback, useEffect, useState } from 'react';
import type { ChatSession, Message } from '../types';

const SESSIONS_STORAGE_KEY = 'omnichat_sessions_v1';
const ACTIVE_SESSION_KEY = 'omnichat_active_session_id';

function createNewSessionObject(messages: Message[] = []): ChatSession {
  const now = Date.now();
  const id = `session_${now}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id,
    title: 'Obrolan Baru',
    messages,
    createdAt: now,
    updatedAt: now,
  };
}

function generateTitle(firstContent: string): string {
  const clean = firstContent.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Obrolan Baru';
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore JSON parse errors and fallback
    }
    return [createNewSessionObject()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedActive = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (savedActive) return savedActive;
    } catch {
      // Ignore
    }
    return '';
  });

  // Ensure activeSessionId points to a valid session
  useEffect(() => {
    if (!sessions.some((s) => s.id === activeSessionId)) {
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      } else {
        const fresh = createNewSessionObject();
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
      }
    }
  }, [sessions, activeSessionId]);

  // Persist sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Storage quota or disabled
    }
  }, [sessions]);

  // Persist activeSessionId to localStorage
  useEffect(() => {
    if (!activeSessionId) return;
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    } catch {
      // Storage quota or disabled
    }
  }, [activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const updateActiveSessionMessages = useCallback((messages: Message[]) => {
    setSessions((prev) => {
      const index = prev.findIndex((s) => s.id === activeSessionId);
      if (index === -1) return prev;
      const current = prev[index];

      let title = current.title;
      if (title === 'Obrolan Baru') {
        const firstUser = messages.find((m) => m.role === 'user');
        if (firstUser && firstUser.content) {
          title = generateTitle(firstUser.content);
        }
      }

      const updated: ChatSession = {
        ...current,
        title,
        messages,
        updatedAt: Date.now(),
      };

      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  }, [activeSessionId]);

  const createSession = useCallback(() => {
    const fresh = createNewSessionObject();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    return fresh;
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const fresh = createNewSessionObject();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      return filtered;
    });
  }, []);

  const exportSessionMarkdown = useCallback((session: ChatSession) => {
    const lines = [
      `# ${session.title}`,
      `*Dibuat: ${new Date(session.createdAt).toLocaleString('id-ID')}*`,
      '',
    ];

    for (const msg of session.messages) {
      const roleLabel = msg.role === 'user' ? '👤 Pengguna' : '🤖 Asisten';
      lines.push(`### ${roleLabel}`, '', msg.content, '');
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    sessions,
    activeSession,
    activeSessionId,
    updateActiveSessionMessages,
    createSession,
    selectSession,
    deleteSession,
    exportSessionMarkdown,
  };
}
