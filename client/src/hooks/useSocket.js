import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export const useSocket = (token) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // If no token, ensure any prior socket is closed and don't connect yet
    if (!token) {
      if (socket) {
        try { socket.close(); } catch (e) {}
        setSocket(null);
      }
      return;
    }

    const origin = window.location.origin || 'http://localhost:5000';
    const newSocket = io(origin, {
      auth: { token },
      withCredentials: true,
      transports: ['polling'], // avoid WS issues on some hosts/proxies
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      // Must match server maxHttpBufferSize so multi‑MiB base64 uploads are not rejected (~1 MiB default).
      maxHttpBufferSize: 128 * 1024 * 1024
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      try { newSocket.close(); } catch (e) {}
    };
  }, [token]);

  return socket;
};