import React, { useState } from 'react';
import styled from 'styled-components';
import { FiMenu, FiWifi, FiWifiOff, FiMonitor, FiLogOut } from 'react-icons/fi';

const HeaderContainer = styled.header`
  background: rgba(14, 16, 20, 0.88);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #2a3140;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
`;

const MenuButton = styled.button`
  background: #161a22;
  border: 1px solid #2a3140;
  color: #eef1f6;
  font-size: 18px;
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: #c6f23e;
    background: rgba(198, 242, 62, 0.08);
  }
`;

const Brand = styled.div`
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #c6f23e;
  line-height: 1;
`;

const Divider = styled.div`
  width: 1px;
  height: 22px;
  background: #2a3140;
`;

const ViewTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #8b93a7;
  text-transform: capitalize;
  letter-spacing: 0.02em;
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: ${props => props.connected ? 'rgba(93, 222, 160, 0.1)' : 'rgba(255, 107, 122, 0.1)'};
  border: 1px solid ${props => props.connected ? 'rgba(93, 222, 160, 0.35)' : 'rgba(255, 107, 122, 0.35)'};
  border-radius: 8px;
  font-size: 13px;
  color: ${props => props.connected ? '#5ddea0' : '#ff6b7a'};
`;

const ClientInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  background: #161a22;
  border: 1px solid #2a3140;
  border-radius: 8px;
  font-size: 13px;

  .client-icon {
    color: #c6f23e;
  }

  .client-details {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .client-name {
    font-weight: 600;
    color: #eef1f6;
  }

  .client-ip {
    font-size: 11px;
    color: #8b93a7;
  }
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #2a3140;
  background: #161a22;
  color: #eef1f6;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: #ff6b7a;
    color: #ff6b7a;
  }
`;

const Header = ({
  onToggleSidebar,
  currentView,
  selectedClient,
  onLogout
}) => {
  const [connected] = useState(true);

  return (
    <HeaderContainer>
      <LeftSection>
        <MenuButton onClick={onToggleSidebar} aria-label="Toggle navigation">
          <FiMenu />
        </MenuButton>

        <Brand>!0</Brand>

        <Divider />

        <ViewTitle>
          {currentView === 'terminal' && selectedClient
            ? `Terminal — ${selectedClient.hostname}`
            : currentView === 'dashboard'
              ? 'Dashboard'
              : currentView === 'builder'
                ? 'Generate Implant'
                : currentView === 'users'
                  ? 'User Management'
                  : currentView === 'session'
                    ? 'Session'
                    : currentView}
        </ViewTitle>
      </LeftSection>

      <RightSection>
        <StatusIndicator connected={connected}>
          {connected ? <FiWifi /> : <FiWifiOff />}
          {connected ? 'Online' : 'Offline'}
        </StatusIndicator>

        {selectedClient && (
          <ClientInfo>
            <FiMonitor className="client-icon" />
            <div className="client-details">
              <div className="client-name">{selectedClient.hostname}</div>
              <div className="client-ip">{selectedClient.ip}</div>
            </div>
          </ClientInfo>
        )}

        <LogoutButton onClick={onLogout} title="Logout">
          <FiLogOut /> Logout
        </LogoutButton>
      </RightSection>
    </HeaderContainer>
  );
};

export default Header;
