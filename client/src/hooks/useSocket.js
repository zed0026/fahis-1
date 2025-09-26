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
      auth: { token }
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