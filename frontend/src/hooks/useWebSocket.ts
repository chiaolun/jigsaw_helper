import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, MatchResult } from '../types';

interface UseWebSocketOptions {
  puzzleId: string | null;
  onMessage?: (result: MatchResult) => void;
  autoConnect?: boolean;
}

interface UseWebSocketResult {
  status: ConnectionStatus;
  lastResult: MatchResult | null;
  sendFrame: (frame: Blob) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const { puzzleId, onMessage, autoConnect = true } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  const connect = useCallback(() => {
    if (!puzzleId) {
      setStatus('disconnected');
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/match/${puzzleId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const result: MatchResult = JSON.parse(event.data);
        setLastResult(result);
        onMessage?.(result);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
    };
  }, [puzzleId, onMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const sendFrame = useCallback((frame: Blob) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(frame);
    }
  }, []);

  // Auto-connect when puzzleId changes
  useEffect(() => {
    if (autoConnect && puzzleId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [puzzleId, autoConnect, connect, disconnect]);

  return {
    status,
    lastResult,
    sendFrame,
    connect,
    disconnect,
  };
}
