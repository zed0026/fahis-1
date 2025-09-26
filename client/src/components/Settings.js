import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiSettings, 
  FiServer, 
  FiShield, 
  FiMonitor,
  FiSave,
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const SettingsContainer = styled.div`
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

const SaveButton = styled.button`
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
`;

const Content = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
`;

const SettingsCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #333;
`;

const CardTitle = styled.h3`
  color: #fff;
  font-size: 18px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SettingItem = styled.div`
  margin-bottom: 20px;
`;

const SettingLabel = styled.label`
  display: block;
  color: #ccc;
  font-size: 14px;
  margin-bottom: 8px;
  font-weight: 500;
`;

const SettingInput = styled.input`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const SettingSelect = styled.select`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  option {
    background: #0a0a0a;
    color: #fff;
  }
`;

const SettingTextarea = styled.textarea`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
  min-height: 100px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const SettingDescription = styled.p`
  color: #888;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${props => props.status === 'online' ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'};
  border: 1px solid ${props => props.status === 'online' ? '#28a745' : '#dc3545'};
  border-radius: 6px;
  font-size: 14px;
  color: ${props => props.status === 'online' ? '#28a745' : '#dc3545'};
  margin-bottom: 16px;
`;

const InfoCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
  margin-bottom: 20px;
`;

const InfoTitle = styled.h3`
  color: #fff;
  font-size: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InfoText = styled.p`
  color: #888;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 12px;
`;

const InfoList = styled.ul`
  color: #ccc;
  font-size: 14px;
  padding-left: 20px;
  margin: 0;

  li {
    margin-bottom: 6px;
  }
`;

const Settings = () => {
  const [settings, setSettings] = useState({
    serverPort: 2026,
    serverHost: '0.0.0.0',
    maxClients: 100,
    heartbeatInterval: 60,
    logLevel: 'info',
    autoReconnect: true,
    encryptionEnabled: true,
    stealthMode: true,
    logFile: './logs/c2.log',
    backupInterval: 24
  });

  // Load settings from server
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, []);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    .then(r => {
      if (!r.ok) throw new Error('Failed');
      toast.success('Settings saved successfully!');
    })
    .catch(() => toast.error('Failed to save settings'));
  };

  const handleReset = () => {
    // Reset to default settings
    const defaults = {
      serverPort: 2026,
      serverHost: '0.0.0.0',
      maxClients: 100,
      heartbeatInterval: 60,
      logLevel: 'info',
      autoReconnect: true,
      encryptionEnabled: true,
      stealthMode: true,
      logFile: './logs/c2.log',
      backupInterval: 24
    };
    setSettings(defaults);
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaults)
    }).catch(() => {});
    toast.success('Settings reset to defaults');
  };

  return (
    <SettingsContainer>
      <Header>
        <Title>
          <FiSettings />
          Settings
        </Title>
        <SaveButton onClick={handleSave}>
          <FiSave />
          Save Settings
        </SaveButton>
      </Header>

      <Content>
        <InfoCard>
          <InfoTitle>
            <FiAlertCircle />
            System Information
          </InfoTitle>
          <StatusIndicator status="online">
            <FiCheckCircle />
            Server Online - Port {settings.serverPort}
          </StatusIndicator>
          <InfoText>
            FAHIS C2 Server is running and accepting connections. 
            All settings are applied in real-time.
          </InfoText>
        </InfoCard>

        <SettingsGrid>
          <SettingsCard>
            <CardTitle>
              <FiServer />
              Server Configuration
            </CardTitle>
            
            <SettingItem>
              <SettingLabel>Server Host</SettingLabel>
              <SettingInput
                type="text"
                value={settings.serverHost}
                onChange={(e) => handleSettingChange('serverHost', e.target.value)}
                placeholder="0.0.0.0"
              />
              <SettingDescription>
                IP address to bind the server to. Use 0.0.0.0 for all interfaces.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Server Port</SettingLabel>
              <SettingInput
                type="number"
                value={settings.serverPort}
                onChange={(e) => handleSettingChange('serverPort', parseInt(e.target.value))}
                placeholder="2026"
              />
              <SettingDescription>
                Port number for client connections. Default is 2026.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Max Clients</SettingLabel>
              <SettingInput
                type="number"
                value={settings.maxClients}
                onChange={(e) => handleSettingChange('maxClients', parseInt(e.target.value))}
                placeholder="100"
              />
              <SettingDescription>
                Maximum number of concurrent client connections.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Heartbeat Interval (seconds)</SettingLabel>
              <SettingInput
                type="number"
                value={settings.heartbeatInterval}
                onChange={(e) => handleSettingChange('heartbeatInterval', parseInt(e.target.value))}
                placeholder="60"
              />
              <SettingDescription>
                How often to send heartbeat packets to clients.
              </SettingDescription>
            </SettingItem>
          </SettingsCard>

          <SettingsCard>
            <CardTitle>
              <FiShield />
              Security Settings
            </CardTitle>
            
            <SettingItem>
              <SettingLabel>Encryption Enabled</SettingLabel>
              <SettingSelect
                value={settings.encryptionEnabled}
                onChange={(e) => handleSettingChange('encryptionEnabled', e.target.value === 'true')}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </SettingSelect>
              <SettingDescription>
                Enable AES-256 encryption for all communications.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Stealth Mode</SettingLabel>
              <SettingSelect
                value={settings.stealthMode}
                onChange={(e) => handleSettingChange('stealthMode', e.target.value === 'true')}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </SettingSelect>
              <SettingDescription>
                Enable stealth mode for client operations.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Auto Reconnect</SettingLabel>
              <SettingSelect
                value={settings.autoReconnect}
                onChange={(e) => handleSettingChange('autoReconnect', e.target.value === 'true')}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </SettingSelect>
              <SettingDescription>
                Automatically attempt to reconnect dropped clients.
              </SettingDescription>
            </SettingItem>
          </SettingsCard>

          <SettingsCard>
            <CardTitle>
              <FiMonitor />
              Logging & Monitoring
            </CardTitle>
            
            <SettingItem>
              <SettingLabel>Log Level</SettingLabel>
              <SettingSelect
                value={settings.logLevel}
                onChange={(e) => handleSettingChange('logLevel', e.target.value)}
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </SettingSelect>
              <SettingDescription>
                Minimum log level to record.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Log File Path</SettingLabel>
              <SettingInput
                type="text"
                value={settings.logFile}
                onChange={(e) => handleSettingChange('logFile', e.target.value)}
                placeholder="./logs/c2.log"
              />
              <SettingDescription>
                Path to the log file for server operations.
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Backup Interval (hours)</SettingLabel>
              <SettingInput
                type="number"
                value={settings.backupInterval}
                onChange={(e) => handleSettingChange('backupInterval', parseInt(e.target.value))}
                placeholder="24"
              />
              <SettingDescription>
                How often to create backup of client data.
              </SettingDescription>
            </SettingItem>
          </SettingsCard>

          <SettingsCard>
            <CardTitle>
              <FiRefreshCw />
              Advanced Settings
            </CardTitle>
            
            <SettingItem>
              <SettingLabel>Custom Commands</SettingLabel>
              <SettingTextarea
                value=""
                placeholder="Add custom commands here..."
                readOnly
              />
              <SettingDescription>
                Custom command definitions (coming soon).
              </SettingDescription>
            </SettingItem>

            <SettingItem>
              <SettingLabel>Client Timeout (seconds)</SettingLabel>
              <SettingInput
                type="number"
                value="300"
                placeholder="300"
                readOnly
              />
              <SettingDescription>
                Timeout for client operations in seconds.
              </SettingDescription>
            </SettingItem>
          </SettingsCard>
        </SettingsGrid>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <SaveButton onClick={handleReset} style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107', border: '1px solid #ffc107' }}>
            <FiRefreshCw />
            Reset to Defaults
          </SaveButton>
        </div>
      </Content>
    </SettingsContainer>
  );
};

export default Settings;