// src/lib/sessionManager.ts

class SessionManager {
  private static instance: SessionManager;
  private sessionId: string | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      // Only access sessionStorage in the browser
      this.sessionId = sessionStorage.getItem('userSessionId') || this.generateSessionId();
      if (!sessionStorage.getItem('userSessionId')) {
        sessionStorage.setItem('userSessionId', this.sessionId);
      }
    }
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  private generateSessionId(): string {
    return `user-${crypto.randomUUID()}`;
  }

  getUserId(): string {
    // If we're on the server, return a temporary ID
    if (typeof window === 'undefined') {
      return 'server-side';
    }
    // Initialize session ID if it doesn't exist (e.g., after SSR hydration)
    if (!this.sessionId) {
      this.sessionId = sessionStorage.getItem('userSessionId') || this.generateSessionId();
      sessionStorage.setItem('userSessionId', this.sessionId);
    }
    return this.sessionId;
  }

  // Check if the current user is the creator of a stream
  isStreamCreator(creatorId: string): boolean {
    // On server-side, always return false
    if (typeof window === 'undefined') {
      return false;
    }
    return this.getUserId() === creatorId;
  }
}

export const sessionManager = SessionManager.getInstance();
