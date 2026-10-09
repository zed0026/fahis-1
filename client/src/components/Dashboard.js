import React, { useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { FiEdit3, FiTrash2, FiTerminal, FiChevronRight } from 'react-icons/fi';
import { FaWindows, FaLinux } from 'react-icons/fa';
import { toast } from 'react-toastify';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Page = styled.div`
  animation: ${fadeIn} 0.4s ease-out;
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-height: calc(100vh - 120px);
`;

const TopBar = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding-bottom: 20px;
  border-bottom: 1px solid #2a3140;
`;

const Intro = styled.div`
  .brand {
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.05em;
    color: #c6f23e;
    line-height: 1;
    margin-bottom: 8px;
  }
  .hint {
    color: #8b93a7;
    font-size: 14px;
  }
`;

const Metrics = styled.div`
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
`;

const Metric = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: ${props => props.$active ? '#c6f23e' : '#eef1f6'};
  opacity: ${props => props.$active ? 1 : 0.72};
  transition: opacity 0.15s, color 0.15s;

  &:hover {
    opacity: 1;
    color: #c6f23e;
  }

  .num {
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    margin-bottom: 4px;
  }
  .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8b93a7;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 28px;
  flex: 1;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const FilterCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FilterBtn = styled.button`
  background: ${props => props.$active ? 'rgba(198, 242, 62, 0.12)' : 'transparent'};
  border: 1px solid ${props => props.$active ? 'rgba(198, 242, 62, 0.3)' : 'transparent'};
  color: ${props => props.$active ? '#c6f23e' : '#aeb6c7'};
  border-radius: 10px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover {
    color: #c6f23e;
    background: rgba(198, 242, 62, 0.08);
  }

  .count {
    font-size: 12px;
    color: #8b93a7;
    font-weight: 500;
  }
`;

const MainCol = styled.div`
  min-width: 0;
`;

const TableHead = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 0.8fr 1.1fr 140px;
  gap: 12px;
  padding: 0 4px 12px;
  border-bottom: 1px solid #2a3140;
  color: #5c657a;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;

  @media (max-width: 980px) {
    display: none;
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 0.8fr 1.1fr 140px;
  gap: 12px;
  align-items: center;
  padding: 16px 4px;
  border-bottom: 1px solid #1e2430;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(198, 242, 62, 0.04);
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 16px 0;
  }
`;

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  .os {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: ${props => props.$os === 'windows' ? 'rgba(0, 120, 212, 0.2)' : 'rgba(255, 107, 53, 0.18)'};
    color: ${props => props.$os === 'windows' ? '#4da3ff' : '#ff8f5c'};
  }

  .meta {
    min-width: 0;
  }

  .name {
    font-weight: 600;
    color: #eef1f6;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .host {
    font-size: 12px;
    color: #8b93a7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Cell = styled.div`
  color: #c5cad6;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.$on ? '#5ddea0' : '#ff6b7a'};

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
`;

const IconBtn = styled.button`
  background: #161a22;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: #c6f23e;
    color: #c6f23e;
  }

  &.danger:hover {
    border-color: #ff6b7a;
    color: #ff6b7a;
  }
`;

const Empty = styled.div`
  padding: 64px 12px;
  color: #8b93a7;
  text-align: left;

  h3 {
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #eef1f6;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }

  p {
    font-size: 14px;
    max-width: 420px;
    line-height: 1.55;
  }
`;

const EditModal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const EditModalContent = styled.div`
  background: #161a22;
  border: 1px solid #2a3140;
  border-radius: 14px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;

  h3 {
    color: #c6f23e;
    margin: 0 0 14px;
    font-family: 'Syne', system-ui, sans-serif;
  }
`;

const EditInput = styled.input`
  width: 100%;
  background: #0e1014;
  border: 1px solid #2a3140;
  color: #fff;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 14px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: #c6f23e;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
`;

const ModalBtn = styled.button`
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid ${props => props.$primary ? '#c6f23e' : '#2a3140'};
  background: ${props => props.$primary ? '#c6f23e' : 'transparent'};
  color: ${props => props.$primary ? '#0e1014' : '#c5cad6'};
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
`;

const Dashboard = ({ clients, onSessionSelect, onDeleteSession }) => {
  const [filter, setFilter] = useState('all');
  const [editingSession, setEditingSession] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [sessionNames, setSessionNames] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sessionNames') || '{}');
    } catch {
      return {};
    }
  });

  const getOSType = (client) => {
    const os = String(client?.os || '').toLowerCase().trim();
    if (os.includes('linux') || os === 'darwin') return 'linux';
    return 'windows';
  };

  const windowsClients = useMemo(
    () => clients.filter((c) => getOSType(c) === 'windows'),
    [clients]
  );
  const linuxClients = useMemo(
    () => clients.filter((c) => getOSType(c) === 'linux'),
    [clients]
  );
  const activeCount = clients.filter((c) => c.active).length;

  const visible = useMemo(() => {
    if (filter === 'windows') return windowsClients;
    if (filter === 'linux') return linuxClients;
    if (filter === 'online') return clients.filter((c) => c.active);
    return clients;
  }, [clients, filter, windowsClients, linuxClients]);

  const getSessionName = (client) => sessionNames[client.id] || client.hostname;

  const updateSessionName = (sessionId, name) => {
    const next = { ...sessionNames, [sessionId]: name };
    setSessionNames(next);
    localStorage.setItem('sessionNames', JSON.stringify(next));
    setEditingSession(null);
  };

  return (
    <Page>
      <TopBar>
        <Intro>
          <div className="brand">!0</div>
          <div className="hint">Sessions connect here automatically when implants come online.</div>
        </Intro>
        <Metrics>
          <Metric $active={filter === 'all'} onClick={() => setFilter('all')}>
            <div className="num">{clients.length}</div>
            <div className="lbl">Total</div>
          </Metric>
          <Metric $active={filter === 'online'} onClick={() => setFilter('online')}>
            <div className="num">{activeCount}</div>
            <div className="lbl">Online</div>
          </Metric>
          <Metric $active={filter === 'windows'} onClick={() => setFilter('windows')}>
            <div className="num">{windowsClients.length}</div>
            <div className="lbl">Windows</div>
          </Metric>
          <Metric $active={filter === 'linux'} onClick={() => setFilter('linux')}>
            <div className="num">{linuxClients.length}</div>
            <div className="lbl">Linux</div>
          </Metric>
        </Metrics>
      </TopBar>

      <Layout>
        <FilterCol>
          <FilterBtn $active={filter === 'all'} onClick={() => setFilter('all')}>
            All sessions <span className="count">{clients.length}</span>
          </FilterBtn>
          <FilterBtn $active={filter === 'online'} onClick={() => setFilter('online')}>
            Online <span className="count">{activeCount}</span>
          </FilterBtn>
          <FilterBtn $active={filter === 'windows'} onClick={() => setFilter('windows')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FaWindows /> Windows</span>
            <span className="count">{windowsClients.length}</span>
          </FilterBtn>
          <FilterBtn $active={filter === 'linux'} onClick={() => setFilter('linux')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FaLinux /> Linux</span>
            <span className="count">{linuxClients.length}</span>
          </FilterBtn>
        </FilterCol>

        <MainCol>
          {visible.length === 0 ? (
            <Empty>
              <h3>No sessions yet</h3>
              <p>Run an implant against this host. When it connects, it will show up in this list.</p>
            </Empty>
          ) : (
            <>
              <TableHead>
                <div>Session</div>
                <div>IP</div>
                <div>User</div>
                <div>Status</div>
                <div>Last seen</div>
                <div />
              </TableHead>
              {visible.map((client) => {
                const osType = getOSType(client);
                const OSIcon = osType === 'windows' ? FaWindows : FaLinux;
                return (
                  <Row key={client.id} onClick={() => onSessionSelect(client)}>
                    <NameCell $os={osType}>
                      <div className="os"><OSIcon /></div>
                      <div className="meta">
                        <div className="name">
                          {getSessionName(client)}
                          <FiChevronRight size={14} color="#5c657a" />
                        </div>
                        <div className="host">{client.hostname}</div>
                      </div>
                    </NameCell>
                    <Cell>{client.ip}</Cell>
                    <Cell>{client.username}</Cell>
                    <Cell>
                      <Status $on={!!client.active}>
                        {client.active ? 'Connected' : 'Offline'}
                      </Status>
                    </Cell>
                    <Cell>
                      {new Date(client.lastSeen || client.connectedAt).toLocaleString()}
                    </Cell>
                    <RowActions onClick={(e) => e.stopPropagation()}>
                      <IconBtn title="Open" onClick={() => onSessionSelect(client)}>
                        <FiTerminal size={15} />
                      </IconBtn>
                      <IconBtn
                        title="Rename"
                        onClick={() => {
                          setEditingSession(client.id);
                          setEditValue(getSessionName(client));
                        }}
                      >
                        <FiEdit3 size={15} />
                      </IconBtn>
                      <IconBtn
                        className="danger"
                        title="Delete"
                        onClick={() => {
                          if (!window.confirm(`Delete session "${getSessionName(client)}"?`)) return;
                          if (typeof onDeleteSession === 'function') {
                            onDeleteSession(client);
                            toast.success('Session deleted');
                          }
                        }}
                      >
                        <FiTrash2 size={15} />
                      </IconBtn>
                    </RowActions>
                  </Row>
                );
              })}
            </>
          )}
        </MainCol>
      </Layout>

      {editingSession && (
        <EditModal onClick={() => setEditingSession(null)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h3>Rename session</h3>
            <EditInput
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Session name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateSessionName(editingSession, editValue);
              }}
            />
            <ModalActions>
              <ModalBtn $primary onClick={() => updateSessionName(editingSession, editValue)}>
                Save
              </ModalBtn>
              <ModalBtn onClick={() => setEditingSession(null)}>Cancel</ModalBtn>
            </ModalActions>
          </EditModalContent>
        </EditModal>
      )}
    </Page>
  );
};

export default Dashboard;
