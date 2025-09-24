import { useState, useEffect } from 'react';

export const useClients = (socket) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleClientsList = (clientsList) => {
      setClients(clientsList);
      setLoading(false);
    };

    const handleClientConnected = (client) => {
      setClients(prev => {
        const exists = prev.find(c => c.id === client.id);
        if (exists) {
          return prev.map(c => c.id === client.id ? { ...c, ...client } : c);
        }
        return [...prev, client];
      });
    };

    const handleClientDisconnected = (data) => {
      setClients(prev => 
        prev.map(client => 
          client.id === data.id 
            ? { ...client, active: false }
            : client
        )
      );
    };

    socket.on('clientsList', handleClientsList);
    socket.on('clientConnected', handleClientConnected);
    socket.on('clientDisconnected', handleClientDisconnected);

    // Request initial clients list
    socket.emit('getClients');

    return () => {
      socket.off('clientsList', handleClientsList);
      socket.off('clientConnected', handleClientConnected);
      socket.off('clientDisconnected', handleClientDisconnected);
    };
  }, [socket]);

  const executeCommand = (clientId, command) => {
    if (socket) {
      socket.emit('executeCommand', { clientId, command });
    }
  };

  const uploadFile = (clientId, filename) => {
    if (socket) {
      socket.emit('uploadFile', { clientId, filename });
    }
  };

  const downloadFile = (clientId, filename) => {
    if (socket) {
      socket.emit('downloadFile', { clientId, filename });
    }
  };

  return {
    clients,
    loading,
    error,
    executeCommand,
    uploadFile,
    downloadFile
  };
};
